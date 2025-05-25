// path: ai-prompt-system.ts

import { LineTrackingEditor, EditOperation } from "./line-tracker-editor";
import { AnthropicService } from "./anthropic-service";
import { ConfigManager } from "./config-manager";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { DependencyExtractor } from "./dependancy-tree";
import colors from "./colors";

interface AIEditResponse {
  file: string;
  analysis: string;
  createFile?: boolean;
  edits: {
    startIndex: number;
    endIndex: number;
    newContent: string[];
    description: string;
  }[];
}

interface CompilationError {
  file: string;
  line: number;
  message: string;
  code: number;
}

class AIPromptSystem {
  private dependencyExtractor: DependencyExtractor;
  private editor: LineTrackingEditor;
  private projectRoot: string;
  private anthropicService: AnthropicService;
  private configManager: ConfigManager;
  private debug: boolean;

  constructor(projectRoot: string, debug = false) {
    this.projectRoot = path.resolve(projectRoot);
    this.debug = debug;

    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] AIPromptSystem constructor"));
      console.log(colors.gray(`  Project root: ${this.projectRoot}`));
      console.log(colors.gray(`  Debug mode: ${debug}`));
    }

    this.dependencyExtractor = new DependencyExtractor({
      rootDir: this.projectRoot,
      debug,
    });
    this.editor = new LineTrackingEditor(debug);

    this.configManager = ConfigManager.createFromEnv();

    const apiKey = this.configManager.getAnthropicApiKey();
    if (!apiKey) {
      throw new Error("Anthropic API key is required for AI prompt system");
    }

    this.anthropicService = new AnthropicService({
      apiKey,
      model: this.configManager.getModel(),
      maxTokens: this.configManager.getMaxTokens(),
      temperature: this.configManager.getTemperature(),
      debug: this.debug,
    });

    if (this.debug) {
      console.log(colors.green("✅ AIPromptSystem constructor completed"));
    }
  }

  /**
   * Enhanced prompt for both file creation and modification
   */
  createCodeEditPrompt(
    userRequest: string,
    targetFiles: string[],
    includeContext = true
  ): string {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] createCodeEditPrompt() starting"));
      console.log(colors.gray(`  User request: "${userRequest}"`));
      console.log(colors.gray(`  Target files: ${targetFiles.length}`));
      console.log(colors.gray(`  Include context: ${includeContext}`));
    }

    const contextData = includeContext
      ? this.buildEditingContext(targetFiles, userRequest)
      : this.getDirectFileContent(targetFiles);

    const prompt = `You are a code editor AI that can create new files and modify existing files.

USER REQUEST: ${userRequest}

${contextData}

Your task is to analyze the request and provide precise instructions for file creation/modification.

Respond ONLY in this JSON format:

{
  "analysis": "Brief explanation of what needs to be done",
  "edits": [
    {
      "file": "relative/path/to/file",
      "analysis": "Specific analysis for this file",
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
}

RULES FOR FILE CREATION:
- Set createFile: true for new files
- Use startIndex: 0, endIndex: -1 for complete file content
- Include proper imports, exports, and TypeScript types
- Follow project structure conventions (src/, components/, services/, etc.)
- Use appropriate file extensions (.ts, .tsx, .js, .jsx)

RULES FOR FILE MODIFICATION:
- Set createFile: false for existing files
- Use exact line numbers from the indexed content
- Preserve existing formatting and indentation
- Make minimal changes to achieve the goal

EXAMPLE - New File Creation:
{
  "analysis": "Creating new UserService with CRUD operations",
  "edits": [
    {
      "file": "src/services/user.service.ts",
      "analysis": "Creating complete UserService class with TypeScript types",
      "createFile": true,
      "edits": [
        {
          "startIndex": 0,
          "endIndex": -1,
          "newContent": [
            "import { User, CreateUserDto, UpdateUserDto } from '../types/user.types';",
            "",
            "export class UserService {",
            "  private users: User[] = [];",
            "",
            "  async createUser(userData: CreateUserDto): Promise<User> {",
            "    const user: User = {",
            "      id: Date.now().toString(),",
            "      ...userData,",
            "      createdAt: new Date().toISOString()",
            "    };",
            "    this.users.push(user);",
            "    return user;",
            "  }",
            "",
            "  async getUserById(id: string): Promise<User | null> {",
            "    return this.users.find(user => user.id === id) || null;",
            "  }",
            "",
            "  async updateUser(id: string, updates: UpdateUserDto): Promise<User | null> {",
            "    const userIndex = this.users.findIndex(user => user.id === id);",
            "    if (userIndex === -1) return null;",
            "",
            "    this.users[userIndex] = { ...this.users[userIndex], ...updates };",
            "    return this.users[userIndex];",
            "  }",
            "",
            "  async deleteUser(id: string): Promise<boolean> {",
            "    const userIndex = this.users.findIndex(user => user.id === id);",
            "    if (userIndex === -1) return false;",
            "",
            "    this.users.splice(userIndex, 1);",
            "    return true;",
            "  }",
            "",
            "  async getAllUsers(): Promise<User[]> {",
            "    return [...this.users];",
            "  }",
            "}"
          ],
          "description": "Create complete UserService with CRUD operations"
        }
      ]
    }
  ]
}

Now analyze the request and provide your instructions.`;

    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Generated prompt"));
      console.log(colors.gray(`  Prompt length: ${prompt.length} characters`));
    }

    return prompt;
  }

  /**
   * Build enhanced context for both existing and new files
   */
  private buildEditingContext(
    targetFiles: string[],
    userRequest: string
  ): Promise<string> {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] buildEditingContext() starting"));
    }
    return this.buildEnhancedContext(targetFiles, userRequest);
  }

  private async buildEnhancedContext(
    targetFiles: string[],
    userRequest: string
  ): Promise<string> {
    let context = "CODE CONTEXT:\n\n";

    if (this.debug) {
      console.log(
        colors.cyan("🔧 [DEBUG] buildEnhancedContext() processing files")
      );
    }

    for (const filePath of targetFiles) {
      const relativePath = path.relative(this.projectRoot, filePath);

      if (this.debug) {
        console.log(colors.gray(`  Processing: ${relativePath}`));
      }

      if (fs.existsSync(filePath)) {
        // Existing file
        context += `=== EXISTING FILE: ${relativePath} ===\n`;

        if (this.debug) {
          console.log(
            colors.gray(`    File exists, analyzing dependencies...`)
          );
        }

        try {
          const tree = await this.dependencyExtractor.analyze(filePath);
          const relatedFiles = this.extractFilesFromTree(tree);

          if (this.debug) {
            console.log(
              colors.gray(`    Found ${relatedFiles.length} related files`)
            );
          }

          for (const file of relatedFiles.slice(0, 5)) {
            const lines = (file.content || "").split("\n");
            const indexedLines = lines.map(
              (line, index) => `${index}: ${line}`
            );
            context += `\n--- ${file.path} ---\n${indexedLines.join("\n")}\n\n`;
          }
        } catch (error) {
          if (this.debug) {
            console.log(
              colors.yellow(
                `    Dependency analysis failed: ${error.message}, using direct content`
              )
            );
          }

          // Fallback to direct file content
          const content = fs.readFileSync(filePath, "utf-8");
          const lines = content.split("\n");
          const indexedLines = lines.map((line, index) => `${index}: ${line}`);
          context += `${indexedLines.join("\n")}\n\n`;
        }
      } else {
        // New file to be created
        context += `=== NEW FILE TO CREATE: ${relativePath} ===\n`;
        context += `// This file does not exist and should be created\n`;
        context += `// Purpose: Based on user request "${userRequest}"\n`;
        context += `// Directory: ${path.dirname(filePath)}\n\n`;

        if (this.debug) {
          console.log(colors.gray(`    File doesn't exist, will be created`));
        }

        // Add context from similar files in the same directory
        const dir = path.dirname(filePath);
        if (fs.existsSync(dir)) {
          const siblingFiles = fs
            .readdirSync(dir)
            .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f))
            .slice(0, 2);

          if (this.debug) {
            console.log(
              colors.gray(
                `    Found ${siblingFiles.length} sibling files for context`
              )
            );
          }

          for (const sibling of siblingFiles) {
            const siblingPath = path.join(dir, sibling);
            try {
              const content = fs.readFileSync(siblingPath, "utf-8");
              const lines = content.split("\n").slice(0, 15);
              context += `--- REFERENCE FILE: ${path.relative(
                this.projectRoot,
                siblingPath
              )} ---\n`;
              context += lines.join("\n") + "\n\n";

              if (this.debug) {
                console.log(
                  colors.gray(
                    `      Added reference: ${path.relative(
                      this.projectRoot,
                      siblingPath
                    )}`
                  )
                );
              }
            } catch (error) {
              if (this.debug) {
                console.log(
                  colors.gray(
                    `      Could not read ${sibling}: ${error.message}`
                  )
                );
              }
            }
          }
        }
      }
    }

    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] buildEnhancedContext() completed"));
      console.log(
        colors.gray(`  Final context length: ${context.length} characters`)
      );
    }

    return context;
  }

  /**
   * Apply AI edits with file creation support
   */
  async applyAIEdits(aiResponse: {
    analysis: string;
    edits: AIEditResponse[];
  }): Promise<{
    success: boolean;
    changes: string[];
    errors: string[];
  }> {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] applyAIEdits() starting"));
      console.log(colors.gray(`  Analysis: ${aiResponse.analysis}`));
      console.log(colors.gray(`  File edits: ${aiResponse.edits.length}`));
    }

    const allChanges: string[] = [];
    const errors: string[] = [];

    console.log(`🤖 AI Analysis: ${aiResponse.analysis}`);

    for (const fileEdit of aiResponse.edits) {
      if (this.debug) {
        console.log(
          colors.cyan(`🔧 [DEBUG] Processing file edit: ${fileEdit.file}`)
        );
        console.log(colors.gray(`  Create file: ${fileEdit.createFile}`));
        console.log(colors.gray(`  Edit operations: ${fileEdit.edits.length}`));
      }

      try {
        const fullPath = path.resolve(this.projectRoot, fileEdit.file);

        if (fileEdit.createFile) {
          // Create new file
          const result = await this.createNewFile(fullPath, fileEdit);
          allChanges.push(result);
        } else {
          // Modify existing file
          console.log(`\n📁 Modifying ${fileEdit.file}`);
          console.log(`   Analysis: ${fileEdit.analysis}`);

          if (this.debug) {
            console.log(colors.gray(`  Loading file into editor: ${fullPath}`));
          }

          this.editor.loadFile(fullPath);

          for (const edit of fileEdit.edits) {
            if (this.debug) {
              console.log(
                colors.gray(
                  `    Queueing edit: lines ${edit.startIndex}-${edit.endIndex}`
                )
              );
              console.log(colors.gray(`    Description: ${edit.description}`));
            }

            this.editor.queueEdit(fullPath, {
              startIndex: edit.startIndex,
              endIndex: edit.endIndex,
              newContent: edit.newContent,
              description: edit.description,
            });
          }

          const result = this.editor.applyEdits(fullPath);
          if (result.success) {
            allChanges.push(...result.changes);
            console.log(
              `   ✅ Applied ${fileEdit.edits.length} edits successfully`
            );

            if (this.debug) {
              console.log(colors.gray(`    Changes: ${result.changes.length}`));
              result.changes.forEach((change) =>
                console.log(colors.gray(`      - ${change}`))
              );
            }
          } else {
            errors.push(`Failed to apply edits to ${fileEdit.file}`);
            console.log(`   ❌ Failed to apply edits`);

            if (this.debug) {
              console.log(
                colors.red(`    Edit failure details available in line tracker`)
              );
            }
          }

          this.editor.unloadFile(fullPath);
        }
      } catch (error) {
        const errorMsg = `Error processing ${fileEdit.file}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`   ❌ ${errorMsg}`);

        if (this.debug) {
          console.log(colors.red(`🔧 [DEBUG] File processing error:`));
          console.log(colors.red(`  File: ${fileEdit.file}`));
          console.log(colors.red(`  Error: ${error.message}`));
          console.log(colors.red(`  Stack: ${error.stack}`));
        }
      }
    }

    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] applyAIEdits() completed"));
      console.log(colors.gray(`  Success: ${errors.length === 0}`));
      console.log(colors.gray(`  Total changes: ${allChanges.length}`));
      console.log(colors.gray(`  Total errors: ${errors.length}`));
    }

    return {
      success: errors.length === 0,
      changes: allChanges,
      errors,
    };
  }

  /**
   * Create a new file
   */
  private async createNewFile(
    filePath: string,
    fileEdit: AIEditResponse
  ): Promise<string> {
    console.log(`\n📄 Creating ${path.relative(this.projectRoot, filePath)}`);
    console.log(`   Analysis: ${fileEdit.analysis}`);

    if (this.debug) {
      console.log(colors.cyan(`🔧 [DEBUG] createNewFile() starting`));
      console.log(colors.gray(`  Full path: ${filePath}`));
      console.log(colors.gray(`  Edit operations: ${fileEdit.edits.length}`));
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      if (this.debug) {
        console.log(colors.gray(`  Creating directory: ${dir}`));
      }
      fs.mkdirSync(dir, { recursive: true });
      console.log(
        `   📁 Created directory: ${path.relative(this.projectRoot, dir)}`
      );
    }

    // Get content from the edit (should be the complete file)
    const edit = fileEdit.edits[0];
    const content = edit.newContent.join("\n");

    if (this.debug) {
      console.log(
        colors.gray(`  Content length: ${content.length} characters`)
      );
      console.log(colors.gray(`  Content lines: ${edit.newContent.length}`));
      console.log(colors.gray(`  First few lines:`));
      edit.newContent.slice(0, 5).forEach((line, i) => {
        console.log(colors.gray(`    ${i}: ${line}`));
      });
    }

    // Write the file
    fs.writeFileSync(filePath, content);

    const changeDescription = `📄 Created ${path.relative(
      this.projectRoot,
      filePath
    )}: ${fileEdit.analysis}`;
    console.log(`   ✅ ${changeDescription}`);

    if (this.debug) {
      console.log(colors.green("🔧 [DEBUG] File created successfully"));
      console.log(
        colors.gray(`  File size: ${fs.statSync(filePath).size} bytes`)
      );
    }

    return changeDescription;
  }

  /**
   * Enhanced file identification that can suggest new files
   */
  async identifyTargetFiles(
    request: string,
    fileDescriptions: Array<{ path: string; description: string }>
  ): Promise<{
    success: boolean;
    existingFiles?: string[];
    newFiles?: string[];
    reasoning?: string;
    error?: string;
  }> {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] identifyTargetFiles() starting"));
      console.log(colors.gray(`  Request: "${request}"`));
      console.log(colors.gray(`  Available files: ${fileDescriptions.length}`));
    }

    const prompt = `
Analyze this request and identify files to modify or create:

USER REQUEST: ${request}

EXISTING FILES:
${fileDescriptions.map((f) => `${f.path}: ${f.description}`).join("\n")}

Respond with JSON:
{
  "existingFiles": ["path1", "path2"],
  "newFiles": ["new/path1", "new/path2"],
  "reasoning": "Brief explanation"
}

Guidelines for new files:
- Use proper extensions (.ts, .tsx, .js, .jsx)
- Follow project structure (src/, components/, services/, types/, utils/)
- Use descriptive names (kebab-case or camelCase)
- Consider where imports/dependencies should be placed
    `;

    try {
      const response = await this.anthropicService.generateCodeEdits(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);

        if (this.debug) {
          console.log(colors.cyan("🔧 [DEBUG] File identification successful"));
          console.log(
            colors.gray(
              `  Existing files: ${result.existingFiles?.length || 0}`
            )
          );
          console.log(
            colors.gray(`  New files: ${result.newFiles?.length || 0}`)
          );
          console.log(colors.gray(`  Reasoning: ${result.reasoning}`));
        }

        return {
          success: true,
          existingFiles: result.existingFiles || [],
          newFiles: result.newFiles || [],
          reasoning: result.reasoning,
        };
      }

      if (this.debug) {
        console.log(
          colors.red("🔧 [DEBUG] Could not extract JSON from response")
        );
      }

      return { success: false, error: "Could not parse AI response" };
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] File identification failed: ${error.message}`)
        );
      }
      return {
        success: false,
        error: `File identification failed: ${error.message}`,
      };
    }
  }

  /**
   * Complete workflow with file creation support
   */
  async processUserRequest(
    userRequest: string,
    targetFiles: string[]
  ): Promise<{
    success: boolean;
    changes: string[];
    errors: string[];
    analysis?: string;
  }> {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] processUserRequest() starting"));
      console.log(colors.gray(`  Request: "${userRequest}"`));
      console.log(colors.gray(`  Target files: ${targetFiles.length}`));
    }

    try {
      const editResult = await this.generateCodeEdits(userRequest, targetFiles);

      if (!editResult.success) {
        if (this.debug) {
          console.log(
            colors.red(`🔧 [DEBUG] Code generation failed: ${editResult.error}`)
          );
        }
        return {
          success: false,
          changes: [],
          errors: [editResult.error || "Unknown error generating edits"],
        };
      }

      const applyResult = await this.applyAIEdits(editResult.data!);

      if (this.debug) {
        console.log(colors.cyan("🔧 [DEBUG] processUserRequest() completed"));
        console.log(colors.gray(`  Final success: ${applyResult.success}`));
      }

      return {
        ...applyResult,
        analysis: editResult.data!.analysis,
      };
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] processUserRequest() failed: ${error.message}`)
        );
      }
      return {
        success: false,
        changes: [],
        errors: [`Failed to process request: ${error.message}`],
      };
    }
  }

  async generateCodeEdits(
    userRequest: string,
    targetFiles: string[],
    includeContext = true
  ): Promise<{
    success: boolean;
    data?: { analysis: string; edits: AIEditResponse[] };
    error?: string;
  }> {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] generateCodeEdits() starting"));
    }

    try {
      const prompt = this.createCodeEditPrompt(
        userRequest,
        targetFiles,
        includeContext
      );
      const response = await this.anthropicService.generateCodeEdits(prompt);
      const result = this.parseAIResponse(response);

      if (this.debug) {
        console.log(colors.cyan("🔧 [DEBUG] generateCodeEdits() completed"));
        console.log(colors.gray(`  Success: ${result.success}`));
      }

      return result;
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] generateCodeEdits() failed: ${error.message}`)
        );
      }
      return {
        success: false,
        error: `AI code generation failed: ${error.message}`,
      };
    }
  }

  // Helper methods with debug logging
  private extractFilesFromTree(
    tree: any
  ): Array<{ path: string; content: string; depth: number }> {
    const files: Array<{ path: string; content: string; depth: number }> = [];

    const traverse = (node: any, depth = 0) => {
      if (node.path && node.content && node.exists && !node.external) {
        files.push({ path: node.path, content: node.content, depth });
      }

      if (node.dependencies && depth < 3) {
        node.dependencies.forEach((dep: any) => traverse(dep, depth + 1));
      }
    };

    traverse(tree);

    if (this.debug) {
      console.log(
        colors.gray(`    Extracted ${files.length} files from dependency tree`)
      );
    }

    return files;
  }

  parseAIResponse(response: string): {
    success: boolean;
    data?: { analysis: string; edits: AIEditResponse[] };
    error?: string;
  } {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] parseAIResponse() starting"));
      console.log(
        colors.gray(`  Response length: ${response.length} characters`)
      );
    }

    try {
      let jsonStr = response.trim();
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        jsonStr = jsonMatch[0];
        if (this.debug) {
          console.log(
            colors.gray(
              `  Extracted JSON from response (${jsonStr.length} chars)`
            )
          );
        }
      }

      const parsed = JSON.parse(jsonStr);

      if (!parsed.analysis || !Array.isArray(parsed.edits)) {
        if (this.debug) {
          console.log(colors.red("🔧 [DEBUG] Invalid response structure"));
          console.log(colors.gray(`  Has analysis: ${!!parsed.analysis}`));
          console.log(
            colors.gray(`  Has edits array: ${Array.isArray(parsed.edits)}`)
          );
        }
        return {
          success: false,
          error: "Invalid response format: missing analysis or edits array",
        };
      }

      if (this.debug) {
        console.log(colors.green("🔧 [DEBUG] Successfully parsed AI response"));
        console.log(colors.gray(`  Analysis: ${parsed.analysis}`));
        console.log(colors.gray(`  Edit files: ${parsed.edits.length}`));
        parsed.edits.forEach((edit, i) => {
          console.log(
            colors.gray(
              `    ${i + 1}. ${edit.file} (${
                edit.createFile ? "CREATE" : "MODIFY"
              })`
            )
          );
        });
      }

      return { success: true, data: parsed };
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] JSON parsing failed: ${error.message}`)
        );
        console.log(
          colors.gray(`  Response preview: ${response.substring(0, 200)}...`)
        );
      }
      return {
        success: false,
        error: `JSON parse error: ${error.message}`,
      };
    }
  }

  public getDirectFileContent(targetFiles: string[]): string {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] getDirectFileContent() starting"));
      console.log(colors.gray(`  Files: ${targetFiles.length}`));
    }

    let context = "CODE CONTEXT:\n\n";

    for (const filePath of targetFiles) {
      if (fs.existsSync(filePath)) {
        if (this.debug) {
          console.log(
            colors.gray(
              `  Reading existing file: ${path.relative(
                this.projectRoot,
                filePath
              )}`
            )
          );
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const indexedLines = lines.map((line, index) => `${index}: ${line}`);
        const relativePath = path.relative(this.projectRoot, filePath);
        context += `--- ${relativePath} ---\n${indexedLines.join("\n")}\n\n`;
      } else {
        if (this.debug) {
          console.log(
            colors.gray(
              `  File doesn't exist (will create): ${path.relative(
                this.projectRoot,
                filePath
              )}`
            )
          );
        }

        const relativePath = path.relative(this.projectRoot, filePath);
        context += `--- NEW FILE: ${relativePath} ---\n// File to be created\n\n`;
      }
    }

    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] getDirectFileContent() completed"));
      console.log(
        colors.gray(`  Context length: ${context.length} characters`)
      );
    }

    return context;
  }

  async testConnection(): Promise<boolean> {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] Testing AI connection..."));
    }

    const result = await this.anthropicService.testConnection();

    if (this.debug) {
      console.log(colors.cyan(`🔧 [DEBUG] Connection test result: ${result}`));
    }

    return result;
  }

  compileTypeScript(): { success: boolean; errors: CompilationError[] } {
    if (this.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] compileTypeScript() starting"));
    }

    try {
      const configPath = path.join(this.projectRoot, "tsconfig.json");

      if (!fs.existsSync(configPath)) {
        if (this.debug) {
          console.log(colors.yellow("🔧 [DEBUG] No tsconfig.json found"));
        }
        return {
          success: false,
          errors: [
            {
              file: "tsconfig.json",
              line: 0,
              message: "tsconfig.json not found",
              code: 0,
            },
          ],
        };
      }

      if (this.debug) {
        console.log(colors.gray(`  Reading TypeScript config: ${configPath}`));
      }

      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      const compilerOptions = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath)
      );

      if (this.debug) {
        console.log(
          colors.gray(
            `  Compiler options target: ${compilerOptions.options.target}`
          )
        );
        console.log(
          colors.gray(`  Input files: ${compilerOptions.fileNames.length}`)
        );
      }

      const program = ts.createProgram(
        compilerOptions.fileNames,
        compilerOptions.options
      );
      const diagnostics = ts.getPreEmitDiagnostics(program);
      const errors = diagnostics
        .filter((d) => d.category === ts.DiagnosticCategory.Error)
        .map((d) => ({
          file: d.file
            ? path.relative(this.projectRoot, d.file.fileName)
            : "unknown",
          line:
            d.file && d.start
              ? d.file.getLineAndCharacterOfPosition(d.start).line
              : 0,
          message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
          code: d.code,
        }));

      if (this.debug) {
        console.log(colors.cyan("🔧 [DEBUG] TypeScript compilation completed"));
        console.log(colors.gray(`  Total diagnostics: ${diagnostics.length}`));
        console.log(colors.gray(`  Errors: ${errors.length}`));

        if (errors.length > 0) {
          console.log(colors.red("  Error details:"));
          errors.forEach((error, i) => {
            console.log(
              colors.red(
                `    ${i + 1}. ${error.file}:${error.line} - TS${error.code}: ${
                  error.message
                }`
              )
            );
          });
        }
      }

      return { success: errors.length === 0, errors };
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(
            `🔧 [DEBUG] TypeScript compilation failed: ${error.message}`
          )
        );
      }
      return {
        success: false,
        errors: [
          { file: "compiler", line: 0, message: error.message, code: 0 },
        ],
      };
    }
  }
}

export { AIPromptSystem, AIEditResponse, CompilationError };
