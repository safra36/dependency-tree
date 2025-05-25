// path: ai-coding-agent.ts

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { DependencyExtractor } from "./dependancy-tree";
import { AnthropicService } from "./anthropic-service";
import { ConfigManager } from "./config-manager";
import colors from "./colors";

interface FileContext {
  path: string;
  content: string;
  description: string;
  lastModified: number;
  dependencies: string[];
  exists: boolean;
}

interface EditInstruction {
  file: string;
  analysis: string;
  createFile?: boolean;
  edits: Array<{
    startIndex: number;
    endIndex: number;
    newContent: string[];
    description: string;
  }>;
}

interface CompilationResult {
  success: boolean;
  errors: ts.Diagnostic[];
  warnings: ts.Diagnostic[];
}

class AICodeAgent {
  private projectRoot: string;
  private dependencyExtractor: DependencyExtractor;
  private fileContextMap: Map<string, FileContext> = new Map();
  private tsConfigPath: string;
  private tsProgram: ts.Program | null = null;
  private anthropicService: AnthropicService;
  private configManager: ConfigManager;
  private debug: boolean;

  constructor(
    projectRoot: string,
    options: {
      maxDepth?: number;
      includeExternal?: boolean;
      debug?: boolean;
    } = {}
  ) {
    this.projectRoot = path.resolve(projectRoot);
    this.debug = options.debug || false;

    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] AICodeAgent constructor"));
      console.log(colors.gray(`  Project root: ${this.projectRoot}`));
      console.log(colors.gray(`  Options: ${JSON.stringify(options)}`));
    }

    this.dependencyExtractor = new DependencyExtractor({
      rootDir: this.projectRoot,
      ...options,
    });
    this.tsConfigPath = this.findTsConfig();
    this.configManager = ConfigManager.createFromEnv();

    if (this.debug) {
      console.log(
        colors.gray(`  TypeScript config: ${this.tsConfigPath || "not found"}`)
      );
      console.log(colors.gray(`  Config manager initialized`));
    }

    const apiKey = this.configManager.getAnthropicApiKey();
    if (!apiKey) {
      throw new Error(
        "Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or configure it via /config command"
      );
    }

    this.anthropicService = new AnthropicService({
      apiKey,
      model: this.configManager.getModel(),
      maxTokens: this.configManager.getMaxTokens(),
      temperature: this.configManager.getTemperature(),
      debug: this.debug,
    });

    if (this.debug) {
      console.log(colors.green("✅ AICodeAgent constructor completed"));
    }
  }

  async initialize(): Promise<void> {
    if (this.debug) {
      console.log(
        colors.cyan("\n🔧 [DEBUG] AICodeAgent.initialize() starting")
      );
    }

    console.log("🤖 Initializing AI Code Agent...");

    console.log("🔗 Testing AI connection...");
    const connected = await this.anthropicService.testConnection();
    if (!connected) {
      throw new Error(
        "Failed to connect to Anthropic API. Check your API key."
      );
    }
    console.log("✅ AI connection established");

    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Starting project scan..."));
    }
    await this.scanProject();

    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Building TypeScript program..."));
    }
    this.buildTSProgram();

    console.log(`✅ Agent initialized with ${this.fileContextMap.size} files`);

    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] File context map contents:"));
      for (const [filePath, context] of this.fileContextMap) {
        console.log(
          colors.gray(
            `  ${path.relative(this.projectRoot, filePath)}: ${
              context.description
            }`
          )
        );
      }
    }
  }

  async handleUserRequest(request: string): Promise<{
    success: boolean;
    changes: string[];
    errors?: string[];
  }> {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] handleUserRequest() starting"));
      console.log(colors.gray(`  Request: "${request}"`));
    }

    console.log(`📝 Processing request: ${request}`);

    try {
      // 1. Analyze request and identify target files
      if (this.debug) {
        console.log(
          colors.cyan("🔧 [DEBUG] Step 1: Identifying target files...")
        );
      }
      const targetFiles = await this.identifyTargetFiles(request);
      console.log(`🎯 Target files: ${targetFiles.join(", ")}`);

      // 2. Build context
      if (this.debug) {
        console.log(
          colors.cyan("🔧 [DEBUG] Step 2: Building editing context...")
        );
      }
      const context = await this.buildEditingContext(targetFiles, request);

      // 3. Get AI suggestions
      if (this.debug) {
        console.log(
          colors.cyan("🔧 [DEBUG] Step 3: Getting AI edit instructions...")
        );
      }
      const editInstructions = await this.getAIEditInstructions(
        request,
        context
      );

      // 4. Apply edits
      if (this.debug) {
        console.log(colors.cyan("🔧 [DEBUG] Step 4: Applying edits..."));
      }
      const changes = await this.applyEdits(editInstructions);

      // 5. Update project scan
      if (this.debug) {
        console.log(colors.cyan("🔧 [DEBUG] Step 5: Rescanning project..."));
      }
      await this.scanProject();

      // 6. Compile and check errors
      if (this.debug) {
        console.log(colors.cyan("🔧 [DEBUG] Step 6: Compiling TypeScript..."));
      }
      const compilationResult = this.compileTypeScript();

      if (!compilationResult.success) {
        console.log("🔧 Compilation errors detected, attempting fixes...");
        if (this.debug) {
          console.log(colors.cyan("🔧 [DEBUG] Starting error fix process..."));
        }
        const fixResult = await this.fixCompilationErrors(
          compilationResult.errors
        );
        return fixResult;
      }

      if (this.debug) {
        console.log(colors.green("✅ Request completed successfully"));
      }

      return { success: true, changes };
    } catch (error) {
      if (this.debug) {
        console.log(colors.red(`🔧 [DEBUG] Request failed: ${error.message}`));
        console.log(colors.red(`  Stack: ${error.stack}`));
      }
      return {
        success: false,
        changes: [],
        errors: [error.message],
      };
    }
  }

  private async scanProject(): Promise<void> {
    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] scanProject() starting"));
    }

    const tsFiles = this.findTypeScriptFiles(this.projectRoot);

    if (this.debug) {
      console.log(colors.gray(`  Found ${tsFiles.length} TypeScript files:`));
      tsFiles.forEach((file) => {
        console.log(
          colors.gray(`    ${path.relative(this.projectRoot, file)}`)
        );
      });
    }

    // Clear existing context and rebuild
    this.fileContextMap.clear();

    for (const filePath of tsFiles) {
      if (this.debug) {
        console.log(
          colors.gray(
            `  Processing: ${path.relative(this.projectRoot, filePath)}`
          )
        );
      }

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const description = this.generateFileDescription(content);
        const dependencies = await this.extractFileDependencies(filePath);

        this.fileContextMap.set(filePath, {
          path: filePath,
          content,
          description,
          lastModified: fs.statSync(filePath).mtime.getTime(),
          dependencies,
          exists: true,
        });

        if (this.debug) {
          console.log(colors.gray(`    Description: ${description}`));
          console.log(colors.gray(`    Dependencies: ${dependencies.length}`));
        }
      } catch (error) {
        const errorMsg = `⚠️ Could not process file ${filePath}: ${error.message}`;
        console.warn(errorMsg);
        if (this.debug) {
          console.log(colors.red(`🔧 [DEBUG] ${errorMsg}`));
        }
      }
    }

    if (this.debug) {
      console.log(
        colors.cyan(
          `🔧 [DEBUG] scanProject() completed, ${this.fileContextMap.size} files in context`
        )
      );
    }
  }

  private async identifyTargetFiles(request: string): Promise<string[]> {
    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] identifyTargetFiles() starting"));
    }

    const fileDescriptions = Array.from(this.fileContextMap.entries()).map(
      ([path, context]) => ({
        path: path.replace(this.projectRoot, ""),
        description: context.description,
      })
    );

    if (this.debug) {
      console.log(
        colors.gray(`  File descriptions count: ${fileDescriptions.length}`)
      );
    }

    const prompt = `
Analyze this user request and identify which files should be modified or created:

USER REQUEST: ${request}

EXISTING FILES:
${fileDescriptions.map((f) => `${f.path}: ${f.description}`).join("\n")}

PROJECT ROOT: ${this.projectRoot}

Respond with a JSON object containing:
{
  "existingFiles": ["relative/path/to/existing/file1", "relative/path/to/existing/file2"],
  "newFiles": ["relative/path/to/new/file1", "relative/path/to/new/file2"],
  "reasoning": "Brief explanation of file choices"
}

Rules for new files:
- Use appropriate TypeScript/JavaScript extensions (.ts, .tsx, .js, .jsx)
- Follow project structure conventions (src/, components/, services/, etc.)
- Use descriptive, kebab-case or camelCase naming
- Consider imports and dependencies

Examples:
- "Create UserService" → newFiles: ["src/services/user.service.ts"]
- "Add user component" → newFiles: ["src/components/User.tsx"]
- "Create API types" → newFiles: ["src/types/api.types.ts"]
    `;

    try {
      const response = await this.anthropicService.generateCodeEdits(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        const allFiles = [
          ...(result.existingFiles || []).map((p) =>
            path.join(this.projectRoot, p)
          ),
          ...(result.newFiles || []).map((p) => path.join(this.projectRoot, p)),
        ];

        console.log(`💭 AI reasoning: ${result.reasoning}`);

        if (this.debug) {
          console.log(colors.cyan("🔧 [DEBUG] File identification result:"));
          console.log(
            colors.gray(
              `  Existing files: ${result.existingFiles?.length || 0}`
            )
          );
          console.log(
            colors.gray(`  New files: ${result.newFiles?.length || 0}`)
          );
          console.log(colors.gray(`  Total target files: ${allFiles.length}`));
          allFiles.forEach((file, i) => {
            console.log(colors.gray(`    ${i + 1}. ${file}`));
          });
        }

        return allFiles;
      }
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(
            `🔧 [DEBUG] AI file identification failed: ${error.message}`
          )
        );
      }
      console.warn(`⚠️ AI file identification failed: ${error.message}`);
    }

    // Fallback
    const fallbackFiles = this.extractFilePathsFromRequest(request);
    if (this.debug) {
      console.log(
        colors.yellow(
          `🔧 [DEBUG] Using fallback file extraction: ${fallbackFiles.length} files`
        )
      );
    }
    return fallbackFiles;
  }

  private async buildEditingContext(
    targetFiles: string[],
    request: string
  ): Promise<string> {
    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] buildEditingContext() starting"));
      console.log(colors.gray(`  Target files: ${targetFiles.length}`));
    }

    let context = "";

    for (const filePath of targetFiles) {
      const relativePath = path.relative(this.projectRoot, filePath);

      if (this.debug) {
        console.log(colors.gray(`  Processing: ${relativePath}`));
      }

      if (fs.existsSync(filePath)) {
        // Existing file
        if (this.debug) {
          console.log(
            colors.gray(`    File exists, analyzing dependencies...`)
          );
        }

        try {
          const tree = await this.dependencyExtractor.analyze(filePath);
          const relatedFiles = this.extractFilesFromTree(tree);

          context += `\n=== EXISTING FILE: ${relativePath} ===\n`;
          for (const file of relatedFiles.slice(0, 5)) {
            const lines = file.content.split("\n");
            const indexedLines = lines.map(
              (line, index) => `${index}: ${line}`
            );
            context += `\n--- ${file.path} ---\n${indexedLines.join("\n")}\n`;
          }

          if (this.debug) {
            console.log(
              colors.gray(
                `    Added ${relatedFiles.length} related files to context`
              )
            );
          }
        } catch (error) {
          if (this.debug) {
            console.log(
              colors.yellow(
                `    Dependency analysis failed, using direct content: ${error.message}`
              )
            );
          }

          // Fallback to direct file content
          const content = fs.readFileSync(filePath, "utf-8");
          const lines = content.split("\n");
          const indexedLines = lines.map((line, index) => `${index}: ${line}`);
          context += `\n=== EXISTING FILE: ${relativePath} ===\n${indexedLines.join(
            "\n"
          )}\n`;
        }
      } else {
        // New file
        if (this.debug) {
          console.log(colors.gray(`    File doesn't exist, will be created`));
        }

        context += `\n=== NEW FILE TO CREATE: ${relativePath} ===\n`;
        context += `// This file does not exist yet and should be created\n`;
        context += `// Directory: ${path.dirname(filePath)}\n`;
        context += `// File purpose: Based on user request "${request}"\n`;

        // Add nearby existing files for context
        const dir = path.dirname(filePath);
        if (fs.existsSync(dir)) {
          const siblings = fs
            .readdirSync(dir)
            .filter(
              (f) =>
                f.endsWith(".ts") ||
                f.endsWith(".tsx") ||
                f.endsWith(".js") ||
                f.endsWith(".jsx")
            )
            .slice(0, 2);

          if (this.debug) {
            console.log(
              colors.gray(
                `    Found ${siblings.length} sibling files for context`
              )
            );
          }

          for (const sibling of siblings) {
            const siblingPath = path.join(dir, sibling);
            try {
              const content = fs.readFileSync(siblingPath, "utf-8");
              const lines = content.split("\n").slice(0, 20);
              context += `\n--- NEARBY FILE: ${path.relative(
                this.projectRoot,
                siblingPath
              )} ---\n`;
              context +=
                lines.map((line, index) => `${index}: ${line}`).join("\n") +
                "\n";
            } catch (error) {
              if (this.debug) {
                console.log(
                  colors.gray(
                    `      Could not read sibling ${sibling}: ${error.message}`
                  )
                );
              }
            }
          }
        }
      }
    }

    if (this.debug) {
      console.log(colors.cyan(`🔧 [DEBUG] buildEditingContext() completed`));
      console.log(
        colors.gray(`  Context length: ${context.length} characters`)
      );
    }

    return context;
  }

  private async getAIEditInstructions(
    request: string,
    context: string
  ): Promise<EditInstruction[]> {
    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] getAIEditInstructions() starting"));
      console.log(
        colors.gray(`  Context length: ${context.length} characters`)
      );
    }

    const prompt = `
You are a code editor AI that can both modify existing files and create new files.

USER REQUEST: ${request}

CODE CONTEXT:
${context}

Instructions:
1. For EXISTING files: Provide line-by-line edits using startIndex/endIndex
2. For NEW files: Use startIndex: 0, endIndex: -1, and provide complete file content
3. Always include proper imports, exports, and TypeScript types
4. Follow project conventions and best practices

Respond with JSON array of edit instructions:

[
  {
    "file": "relative/path/to/file",
    "analysis": "What changes/creation are needed",
    "createFile": true/false,
    "edits": [
      {
        "startIndex": <number>,
        "endIndex": <number>, 
        "newContent": ["line 1", "line 2", "..."],
        "description": "What this accomplishes"
      }
    ]
  }
]

Rules:
- For new files: createFile: true, startIndex: 0, endIndex: -1
- For existing files: createFile: false, use actual line numbers
- Include complete, functional code
- Add proper TypeScript types and interfaces
- Consider imports and dependencies
- Follow naming conventions

Example new file:
{
  "file": "src/services/user.service.ts",
  "analysis": "Creating new UserService with CRUD operations",
  "createFile": true,
  "edits": [{
    "startIndex": 0,
    "endIndex": -1,
    "newContent": [
      "import { User } from '../types/user.types';",
      "",
      "export class UserService {",
      "  async getUser(id: string): Promise<User> {",
      "    // Implementation",
      "  }",
      "}"
    ],
    "description": "Create complete UserService class"
  }]
}
    `;

    const response = await this.anthropicService.generateCodeEdits(prompt);

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      let instructions: EditInstruction[];

      if (jsonMatch) {
        instructions = JSON.parse(jsonMatch[0]);
      } else {
        instructions = JSON.parse(response);
      }

      if (this.debug) {
        console.log(
          colors.cyan("🔧 [DEBUG] AI edit instructions parsed successfully")
        );
        console.log(
          colors.gray(`  Instructions count: ${instructions.length}`)
        );
        instructions.forEach((instr, i) => {
          console.log(
            colors.gray(
              `    ${i + 1}. ${instr.file} (${
                instr.createFile ? "CREATE" : "MODIFY"
              }): ${instr.analysis}`
            )
          );
          console.log(colors.gray(`       Edits: ${instr.edits.length}`));
        });
      }

      return instructions;
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(
            `🔧 [DEBUG] Failed to parse AI edit instructions: ${error.message}`
          )
        );
        console.log(
          colors.red(`  Response preview: ${response.substring(0, 200)}...`)
        );
      }
      throw new Error(`Failed to parse AI edit instructions: ${error.message}`);
    }
  }

  private async applyEdits(instructions: EditInstruction[]): Promise<string[]> {
    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] applyEdits() starting"));
      console.log(colors.gray(`  Instructions: ${instructions.length}`));
    }

    const changes: string[] = [];

    for (const instruction of instructions) {
      const filePath = path.resolve(this.projectRoot, instruction.file);

      if (this.debug) {
        console.log(colors.gray(`  Processing: ${instruction.file}`));
        console.log(
          colors.gray(
            `    Type: ${instruction.createFile ? "CREATE" : "MODIFY"}`
          )
        );
        console.log(colors.gray(`    Analysis: ${instruction.analysis}`));
      }

      if (instruction.createFile) {
        const result = await this.createFile(filePath, instruction);
        changes.push(result);
      } else {
        for (const edit of instruction.edits.reverse()) {
          const result = await this.applyEdit(filePath, edit);
          changes.push(result);
        }
      }
    }

    if (this.debug) {
      console.log(
        colors.cyan(
          `🔧 [DEBUG] applyEdits() completed, ${changes.length} changes made`
        )
      );
    }

    return changes;
  }

  private async createFile(
    filePath: string,
    instruction: EditInstruction
  ): Promise<string> {
    if (this.debug) {
      console.log(colors.cyan(`🔧 [DEBUG] createFile() starting: ${filePath}`));
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        if (this.debug) {
          console.log(colors.gray(`  Creating directory: ${dir}`));
        }
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }

      // Get file content from edits
      const edit = instruction.edits[0];
      const content = edit.newContent.join("\n");

      if (this.debug) {
        console.log(
          colors.gray(`  Content length: ${content.length} characters`)
        );
        console.log(
          colors.gray(
            `  Content preview:\n${content
              .split("\n")
              .slice(0, 5)
              .join("\n")}...`
          )
        );
      }

      // Write file
      fs.writeFileSync(filePath, content);

      // Add to context map
      this.fileContextMap.set(filePath, {
        path: filePath,
        content,
        description: this.generateFileDescription(content),
        lastModified: Date.now(),
        dependencies: [],
        exists: true,
      });

      const changeDescription = `📄 Created ${filePath}: ${instruction.analysis}`;
      console.log(`✏️ ${changeDescription}`);

      if (this.debug) {
        console.log(colors.green(`✅ File created successfully`));
      }

      return changeDescription;
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] createFile() failed: ${error.message}`)
        );
      }
      throw new Error(`Failed to create file ${filePath}: ${error.message}`);
    }
  }

  private async applyEdit(
    filePath: string,
    edit: {
      startIndex: number;
      endIndex: number;
      newContent: string[];
      description: string;
    }
  ): Promise<string> {
    if (this.debug) {
      console.log(colors.cyan(`🔧 [DEBUG] applyEdit() starting: ${filePath}`));
      console.log(
        colors.gray(
          `  Lines ${edit.startIndex}-${edit.endIndex}: ${edit.description}`
        )
      );
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File ${filePath} does not exist`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    if (this.debug) {
      console.log(colors.gray(`  Original file has ${lines.length} lines`));
      console.log(
        colors.gray(
          `  Replacing ${edit.endIndex - edit.startIndex + 1} lines with ${
            edit.newContent.length
          } lines`
        )
      );
    }

    // Apply the edit
    const newLines = [
      ...lines.slice(0, edit.startIndex),
      ...edit.newContent,
      ...lines.slice(edit.endIndex + 1),
    ];

    // Write file
    fs.writeFileSync(filePath, newLines.join("\n"));

    // Update file context
    const fileContext = this.fileContextMap.get(filePath);
    if (fileContext) {
      fileContext.content = newLines.join("\n");
      fileContext.lastModified = Date.now();
    }

    const changeDescription = `📝 Modified ${filePath}: ${edit.description} (lines ${edit.startIndex}-${edit.endIndex})`;
    console.log(`✏️ ${changeDescription}`);

    if (this.debug) {
      console.log(colors.gray(`  New file has ${newLines.length} lines`));
    }

    return changeDescription;
  }

  private compileTypeScript(): CompilationResult {
    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] compileTypeScript() starting"));
    }

    try {
      this.buildTSProgram();

      if (!this.tsProgram) {
        if (this.debug) {
          console.log(
            colors.yellow("🔧 [DEBUG] No TypeScript program available")
          );
        }
        return { success: false, errors: [], warnings: [] };
      }

      const diagnostics = ts.getPreEmitDiagnostics(this.tsProgram);
      const errors = diagnostics.filter(
        (d) => d.category === ts.DiagnosticCategory.Error
      );
      const warnings = diagnostics.filter(
        (d) => d.category === ts.DiagnosticCategory.Warning
      );

      if (this.debug) {
        console.log(colors.cyan("🔧 [DEBUG] TypeScript compilation results:"));
        console.log(colors.gray(`  Total diagnostics: ${diagnostics.length}`));
        console.log(colors.gray(`  Errors: ${errors.length}`));
        console.log(colors.gray(`  Warnings: ${warnings.length}`));

        if (errors.length > 0) {
          console.log(colors.red("  Error details:"));
          errors.forEach((error, i) => {
            const file = error.file
              ? path.relative(this.projectRoot, error.file.fileName)
              : "unknown";
            const line =
              error.file && error.start
                ? error.file.getLineAndCharacterOfPosition(error.start).line
                : 0;
            const message = ts.flattenDiagnosticMessageText(
              error.messageText,
              "\n"
            );
            console.log(
              colors.red(
                `    ${i + 1}. ${file}:${line} - TS${error.code}: ${message}`
              )
            );
          });
        }
      }

      return {
        success: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(
            `🔧 [DEBUG] TypeScript compilation failed: ${error.message}`
          )
        );
      }
      return { success: false, errors: [], warnings: [] };
    }
  }

  private async fixCompilationErrors(errors: ts.Diagnostic[]): Promise<{
    success: boolean;
    changes: string[];
    errors?: string[];
  }> {
    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] fixCompilationErrors() starting"));
      console.log(colors.gray(`  Errors to fix: ${errors.length}`));
    }

    const maxAttempts = 3;
    const changes: string[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`🔧 Fix attempt ${attempt + 1}/${maxAttempts}`);

      if (this.debug) {
        console.log(colors.cyan(`🔧 [DEBUG] Fix attempt ${attempt + 1}`));
      }

      const formattedErrors = errors.map((error) => ({
        file: error.file
          ? path.relative(this.projectRoot, error.file.fileName)
          : "unknown",
        line:
          error.file && error.start
            ? error.file.getLineAndCharacterOfPosition(error.start).line
            : 0,
        message: ts.flattenDiagnosticMessageText(error.messageText, "\n"),
        code: error.code,
      }));

      const errorFiles = [
        ...new Set(
          formattedErrors.map((e) => path.join(this.projectRoot, e.file))
        ),
      ];
      const context = await this.buildEditingContext(
        errorFiles,
        "Fix compilation errors"
      );

      try {
        const fixResult = await this.anthropicService.generateErrorFixes(
          formattedErrors,
          context
        );
        const fixChanges = await this.applyEdits(fixResult.edits);
        changes.push(...fixChanges);

        const result = this.compileTypeScript();
        if (result.success) {
          console.log("✅ All compilation errors fixed!");
          if (this.debug) {
            console.log(
              colors.green("🔧 [DEBUG] All compilation errors resolved")
            );
          }
          return { success: true, changes };
        }

        errors = result.errors;
      } catch (error) {
        const errorMsg = `⚠️ Fix attempt ${attempt + 1} failed: ${
          error.message
        }`;
        console.warn(errorMsg);
        if (this.debug) {
          console.log(colors.red(`🔧 [DEBUG] ${errorMsg}`));
        }
      }
    }

    if (this.debug) {
      console.log(
        colors.red("🔧 [DEBUG] Failed to fix all compilation errors")
      );
    }

    return {
      success: false,
      changes,
      errors: errors.map((e) =>
        ts.flattenDiagnosticMessageText(e.messageText, "\n")
      ),
    };
  }

  // Helper methods with debug logging
  private findTsConfig(): string {
    const configPath = path.join(this.projectRoot, "tsconfig.json");
    const exists = fs.existsSync(configPath);

    if (this.debug) {
      console.log(
        colors.gray(
          `  TypeScript config check: ${configPath} ${
            exists ? "found" : "not found"
          }`
        )
      );
    }

    return exists ? configPath : "";
  }

  private buildTSProgram(): void {
    if (!this.tsConfigPath) {
      if (this.debug) {
        console.log(
          colors.gray(
            "  No tsconfig.json found, skipping TypeScript program build"
          )
        );
      }
      return;
    }

    if (this.debug) {
      console.log(
        colors.gray(`  Building TypeScript program from ${this.tsConfigPath}`)
      );
    }

    const configFile = ts.readConfigFile(this.tsConfigPath, ts.sys.readFile);
    const compilerOptions = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(this.tsConfigPath)
    );

    this.tsProgram = ts.createProgram(
      compilerOptions.fileNames,
      compilerOptions.options
    );

    if (this.debug) {
      console.log(
        colors.gray(
          `  TypeScript program created with ${compilerOptions.fileNames.length} files`
        )
      );
    }
  }

  private findTypeScriptFiles(dir: string): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dir)) {
      if (this.debug) {
        console.log(colors.yellow(`  Directory doesn't exist: ${dir}`));
      }
      return files;
    }

    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (
        stat.isDirectory() &&
        !item.startsWith(".") &&
        item !== "node_modules"
      ) {
        files.push(...this.findTypeScriptFiles(fullPath));
      } else if (item.endsWith(".ts") || item.endsWith(".tsx")) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private generateFileDescription(content: string): string {
    const classMatches = content.match(/class\s+(\w+)/g) || [];
    const functionMatches =
      content.match(/(?:function|const|let)\s+(\w+)/g) || [];
    const exportMatches =
      content.match(
        /export\s+(?:class|function|const|interface|type)\s+(\w+)/g
      ) || [];

    const features = [
      ...classMatches.map((m) => m.replace("class ", "Class: ")),
      ...functionMatches
        .slice(0, 3)
        .map((m) => m.replace(/(?:function|const|let)\s+/, "Function: ")),
      ...exportMatches.map((m) =>
        m.replace(
          /export\s+(?:class|function|const|interface|type)\s+/,
          "Exports: "
        )
      ),
    ];

    return features.slice(0, 5).join(", ") || "TypeScript file";
  }

  private async extractFileDependencies(filePath: string): Promise<string[]> {
    try {
      const tree = await this.dependencyExtractor.analyze(filePath);
      return this.extractFilePathsFromTree(tree);
    } catch {
      return [];
    }
  }

  private extractFilePathsFromTree(tree: any): string[] {
    const paths: string[] = [];

    const traverse = (node: any) => {
      if (node.path && node.exists) {
        paths.push(node.absolutePath);
      }
      if (node.dependencies) {
        node.dependencies.forEach(traverse);
      }
    };

    traverse(tree);
    return paths;
  }

  private extractFilesFromTree(
    tree: any
  ): Array<{ path: string; content: string }> {
    const files: Array<{ path: string; content: string }> = [];

    const traverse = (node: any) => {
      if (node.path && node.content && node.exists) {
        files.push({ path: node.path, content: node.content });
      }
      if (node.dependencies) {
        node.dependencies.forEach(traverse);
      }
    };

    traverse(tree);
    return files;
  }

  private extractFilePathsFromRequest(request: string): string[] {
    const patterns = [/[\w\/\-\.]+\.tsx?/g, /src\/[\w\/\-\.]+/g];
    const matches: string[] = [];

    for (const pattern of patterns) {
      const found = request.match(pattern) || [];
      matches.push(...found);
    }

    return matches.map((p) => path.resolve(this.projectRoot, p));
  }
}

export { AICodeAgent };
