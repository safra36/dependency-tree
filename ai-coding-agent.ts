// path: ai-coding-agent.ts

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { DependencyExtractor } from "./dependancy-tree";
import { AnthropicService } from "./anthropic-service";
import { ConfigManager } from "./config-manager";
import { ShellExecutor } from "./shell-executor";
import { ProjectAnalyzer } from "./project-analyzer";
import { SyntaxChecker } from "./syntax-checker";
import { SmartFileEditor } from "./smart-file-editor";
import colors from "./colors";

interface FileContext {
  path: string;
  content: string;
  description: string;
  lastModified: number;
  dependencies: string[];
  exists: boolean;
}

interface ActionInstruction {
  type: "file" | "command";
  description: string;
  // File operations
  file?: string;
  createFile?: boolean;
  edits?: Array<{
    startIndex: number;
    endIndex: number;
    newContent: string[] | string;
    description: string;
  }>;
  // Command operations
  command?: string;
  workingDir?: string;
  continueOnError?: boolean;
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
  private shellExecutor: ShellExecutor;
  private projectAnalyzer: ProjectAnalyzer;
  private syntaxChecker: SyntaxChecker;
  private smartEditor: SmartFileEditor;
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
      console.log(colors.cyan("\n🔧 [DEBUG] Enhanced AICodeAgent constructor"));
      console.log(colors.gray(`  Project root: ${this.projectRoot}`));
    }

    this.dependencyExtractor = new DependencyExtractor({
      rootDir: this.projectRoot,
      ...options,
    });
    this.tsConfigPath = this.findTsConfig();
    this.configManager = ConfigManager.createFromEnv();
    this.shellExecutor = new ShellExecutor(this.projectRoot, {
      debug: this.debug,
    });
    this.projectAnalyzer = new ProjectAnalyzer(this.projectRoot, this.debug);
    this.syntaxChecker = new SyntaxChecker(this.projectRoot, this.debug);
    this.smartEditor = new SmartFileEditor(this.debug);

    const apiKey = this.configManager.getAnthropicApiKey();
    if (!apiKey) {
      throw new Error("Anthropic API key is required");
    }

    this.anthropicService = new AnthropicService({
      apiKey,
      model: this.configManager.getModel(),
      maxTokens: this.configManager.getMaxTokens(),
      temperature: this.configManager.getTemperature(),
      debug: this.debug,
    });

    if (this.debug) {
      console.log(
        colors.green("✅ Enhanced AICodeAgent constructor completed")
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.debug) {
      console.log(
        colors.cyan("\n🔧 [DEBUG] Enhanced AICodeAgent.initialize() starting")
      );
    }

    console.log("🤖 Initializing Enhanced AI Code Agent...");

    // Test AI connection
    console.log("🔗 Testing AI connection...");
    const connected = await this.anthropicService.testConnection();
    if (!connected) {
      throw new Error(
        "Failed to connect to Anthropic API. Check your API key."
      );
    }
    console.log("✅ AI connection established");

    // Analyze project
    console.log("🔍 Analyzing project structure...");
    const projectInfo = await this.projectAnalyzer.analyzeProject();

    console.log(`📦 Project type: ${projectInfo.type}`);
    if (projectInfo.framework) {
      console.log(`🚀 Framework: ${projectInfo.framework}`);
    }
    console.log(`📋 Package manager: ${projectInfo.packageManager}`);

    // Auto-setup if needed
    if (projectInfo.needsInit || projectInfo.missingPackages.length > 0) {
      console.log(
        "⚙️  Project needs setup. Use 'setup project' to initialize."
      );
    }

    await this.scanProject();
    this.buildTSProgram();

    console.log(
      `✅ Enhanced agent initialized with ${this.fileContextMap.size} files`
    );
  }

  async handleUserRequest(request: string): Promise<{
    success: boolean;
    changes: string[];
    errors?: string[];
  }> {
    if (this.debug) {
      console.log(
        colors.cyan("\n🔧 [DEBUG] Enhanced handleUserRequest() starting")
      );
      console.log(colors.gray(`  Request: "${request}"`));
    }

    console.log(`📝 Processing request: ${request}`);

    try {
      // Check for setup/project initialization requests
      if (this.isSetupRequest(request)) {
        return await this.handleProjectSetup(request);
      }

      // 1. Get project structure using dependency tree
      console.log("🌳 Analyzing project structure...");
      const projectTree = await this.getProjectStructure();

      // 2. Ask AI to identify relevant files
      console.log("🎯 Identifying relevant files...");
      const relevantFiles = await this.identifyRelevantFiles(
        request,
        projectTree
      );

      // 3. Build enhanced context with relevant files
      console.log("📚 Building enhanced context...");
      const enhancedContext = await this.buildEnhancedContext(
        request,
        relevantFiles
      );

      // 4. Get AI action plan with full context
      const actionPlan = await this.getAIActionPlan(request, enhancedContext);

      // 5. Execute action plan
      const changes = await this.executeActionPlan(actionPlan);

      // 6. Check syntax errors immediately
      console.log("🔍 Checking syntax...");
      await this.checkSyntaxErrors();

      // 7. Post-execution validation
      await this.scanProject();
      const compilationResult = this.compileTypeScript();

      if (!compilationResult.success && compilationResult.errors.length > 0) {
        console.log("🔧 Compilation errors detected, attempting fixes...");
        const fixResult = await this.fixCompilationErrors(
          compilationResult.errors
        );
        return fixResult;
      }

      return { success: true, changes };
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] Enhanced request failed: ${error.message}`)
        );
      }
      return {
        success: false,
        changes: [],
        errors: [error.message],
      };
    }
  }

  private isSetupRequest(request: string): boolean {
    const setupKeywords = [
      "setup",
      "initialize",
      "init",
      "install packages",
      "create project",
      "bootstrap",
      "scaffold",
      "configure",
    ];
    return setupKeywords.some((keyword) =>
      request.toLowerCase().includes(keyword)
    );
  }

  private async handleProjectSetup(request: string): Promise<{
    success: boolean;
    changes: string[];
    errors?: string[];
  }> {
    console.log("🛠️  Handling project setup...");

    const setupPlan = await this.projectAnalyzer.generateProjectSetupPlan();
    const changes: string[] = [];

    for (const step of setupPlan.setupSteps) {
      try {
        if (step.type === "command") {
          console.log(`🔨 Executing: ${step.command}`);
          const result = await this.shellExecutor.executeCommand(step.command!);

          if (result.success) {
            changes.push(`✅ ${step.description}`);
            if (result.stdout) {
              console.log(
                colors.gray(result.stdout.split("\n").slice(0, 3).join("\n"))
              );
            }
          } else {
            console.log(colors.red(`❌ Command failed: ${result.stderr}`));
            changes.push(`❌ ${step.description}: ${result.stderr}`);
          }
        } else if (step.type === "file") {
          console.log(`📄 Creating: ${step.filePath}`);
          const filePath = path.join(this.projectRoot, step.filePath!);

          // Ensure directory exists
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.writeFileSync(filePath, step.content!);
          changes.push(`📄 Created ${step.filePath}`);
        }
      } catch (error) {
        console.log(colors.red(`❌ Setup step failed: ${error.message}`));
        changes.push(`❌ ${step.description}: ${error.message}`);
      }
    }

    // Update package.json scripts
    if (Object.keys(setupPlan.analysis.recommendedScripts).length > 0) {
      try {
        const updated = await this.shellExecutor.updatePackageJson({
          scripts: setupPlan.analysis.recommendedScripts,
        });
        if (updated) {
          changes.push("📝 Updated package.json scripts");
        }
      } catch (error) {
        console.log(
          colors.red(`⚠️  Could not update package.json: ${error.message}`)
        );
      }
    }

    return { success: true, changes };
  }

  private async getProjectStructure(): Promise<any> {
    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Getting project structure..."));
    }

    try {
      // Get all TypeScript/JavaScript files
      const allFiles = this.findAllSourceFiles(this.projectRoot);
      const projectStructure = {
        root: this.projectRoot,
        files: [],
        directories: new Set(),
      };

      for (const filePath of allFiles) {
        const relativePath = path.relative(this.projectRoot, filePath);
        const dir = path.dirname(relativePath);

        if (dir !== ".") {
          projectStructure.directories.add(dir);
        }

        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const description = this.generateFileDescription(content);

          projectStructure.files.push({
            path: relativePath,
            absolutePath: filePath,
            description,
            size: fs.statSync(filePath).size,
            extension: path.extname(filePath),
          });
        } catch (error) {
          if (this.debug) {
            console.log(
              colors.gray(`  Could not read ${relativePath}: ${error.message}`)
            );
          }
        }
      }

      if (this.debug) {
        console.log(
          colors.gray(
            `  Found ${projectStructure.files.length} source files in ${projectStructure.directories.size} directories`
          )
        );
      }

      return projectStructure;
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(
            `🔧 [DEBUG] Project structure analysis failed: ${error.message}`
          )
        );
      }
      return { root: this.projectRoot, files: [], directories: [] };
    }
  }

  private async identifyRelevantFiles(
    request: string,
    projectStructure: any
  ): Promise<string[]> {
    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Identifying relevant files..."));
    }

    const fileList = projectStructure.files
      .map((f) => `${f.path} - ${f.description} (${f.extension})`)
      .join("\n");

    const prompt = `Analyze this user request and identify the most relevant existing files that should be included in the context for understanding and implementation.

USER REQUEST: ${request}

PROJECT FILES:
${fileList}

DIRECTORIES:
${Array.from(projectStructure.directories).join(", ")}

Respond with a JSON array of relative file paths that are most relevant to the request:
["path1", "path2", "path3"]

Guidelines:
- Include files that would be modified or referenced
- Include related components, services, or utilities
- Include configuration files if relevant
- Limit to 10 most relevant files
- Focus on files that provide context for the implementation

CRITICAL: Respond ONLY with valid JSON array. No explanatory text.`;

    try {
      const response = await this.anthropicService.generateCodeEdits(prompt);
      const jsonMatch = response.match(/\[[\s\S]*?\]/);

      if (jsonMatch) {
        const relevantPaths = JSON.parse(jsonMatch[0]);
        const fullPaths = relevantPaths.map((p) =>
          path.join(this.projectRoot, p)
        );

        if (this.debug) {
          console.log(
            colors.gray(`  Selected ${fullPaths.length} relevant files:`)
          );
          relevantPaths.forEach((p) => console.log(colors.gray(`    ${p}`)));
        }

        return fullPaths;
      }
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] File identification failed: ${error.message}`)
        );
      }
    }

    // Fallback: return recent files or files mentioned in request
    return this.extractFilePathsFromRequest(request).slice(0, 5);
  }

  private async buildEnhancedContext(
    request: string,
    relevantFiles: string[]
  ): Promise<string> {
    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Building enhanced context..."));
    }

    // Get project info
    const projectInfo = await this.projectAnalyzer.analyzeProject();

    let context = `PROJECT CONTEXT:
Type: ${projectInfo.type}
Framework: ${projectInfo.framework || "none"}
Package Manager: ${projectInfo.packageManager}

USER REQUEST: ${request}

`;

    // Add relevant file contents
    if (relevantFiles.length > 0) {
      context += `RELEVANT FILES:\n`;

      for (const filePath of relevantFiles) {
        const relativePath = path.relative(this.projectRoot, filePath);

        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split("\n");
            const indexedLines = lines.map(
              (line, index) => `${index}: ${line}`
            );

            context += `\n=== ${relativePath} ===\n`;
            context += indexedLines.join("\n") + "\n";
          } catch (error) {
            context += `\n=== ${relativePath} ===\n// Error reading file: ${error.message}\n`;
          }
        }
      }
    }

    // Add project structure summary
    context += `\nPROJECT STRUCTURE:\n`;
    const allFiles = Array.from(this.fileContextMap.keys()).map((f) =>
      path.relative(this.projectRoot, f)
    );
    context += allFiles.slice(0, 20).join("\n");

    if (allFiles.length > 20) {
      context += `\n... and ${allFiles.length - 20} more files`;
    }

    if (this.debug) {
      console.log(
        colors.gray(`  Enhanced context length: ${context.length} characters`)
      );
      console.log(
        colors.gray(`  Included ${relevantFiles.length} relevant files`)
      );
    }

    return context;
  }

  private async getAIActionPlan(
    request: string,
    projectContext: string
  ): Promise<ActionInstruction[]> {
    const prompt = `You are an autonomous coding agent that can create files and execute shell commands.

USER REQUEST: ${request}

${projectContext}

Analyze the request and provide a comprehensive action plan. You can:
1. Execute shell commands (npm install, npm init, etc.)
2. Create/modify files
3. Install packages
4. Initialize projects

Respond with JSON array of actions:

[
  {
    "type": "command",
    "description": "Install React dependencies",
    "command": "npm install react react-dom",
    "workingDir": ".",
    "continueOnError": false
  },
  {
    "type": "file",
    "description": "Create main App component",
    "file": "src/App.tsx",
    "createFile": true,
    "edits": [
      {
        "startIndex": 0,
        "endIndex": -1,
        "newContent": ["import React from 'react';", "", "export default function App() {", "  return <div>Hello World</div>;", "}"],
        "description": "Create React App component"
      }
    ]
  }
]

CRITICAL JSON ESCAPING RULES:
- Escape ALL double quotes in code/strings as \"
- Escape backslashes as \\
- Example: "import React from \"react\";" becomes "import React from \\\"react\\\";"

COMMAND GUIDELINES:
- Use npm, yarn, pnpm, or detected package manager
- Install packages before creating files that use them
- Create directories if needed (mkdir)
- Run build/compile commands to verify setup

FILE GUIDELINES:
- Create proper TypeScript/React/Vue/Svelte files
- Include proper imports and exports
- Follow project conventions
- Add type definitions`;

    const response = await this.anthropicService.generateCodeEdits(prompt);

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch (error) {
      throw new Error(`Failed to parse AI action plan: ${error.message}`);
    }
  }

  private async executeActionPlan(
    actions: ActionInstruction[]
  ): Promise<string[]> {
    const changes: string[] = [];

    if (this.debug) {
      console.log(
        colors.cyan(`🔧 [DEBUG] Executing ${actions.length} actions`)
      );
    }

    // Group actions by file to prevent conflicts
    const fileActions = new Map<string, ActionInstruction[]>();
    const otherActions: ActionInstruction[] = [];

    for (const action of actions) {
      if (action.type === "file" && action.file) {
        if (!fileActions.has(action.file)) {
          fileActions.set(action.file, []);
        }
        fileActions.get(action.file)!.push(action);
      } else {
        otherActions.push(action);
      }
    }

    // Execute command actions first
    for (const action of otherActions) {
      try {
        if (action.type === "command") {
          console.log(`🔨 ${action.description}`);
          const result = await this.shellExecutor.executeCommand(
            action.command!,
            { cwd: action.workingDir }
          );

          if (result.success) {
            changes.push(`✅ ${action.description}`);
            if (result.stdout && this.debug) {
              console.log(
                colors.gray(result.stdout.split("\n").slice(0, 5).join("\n"))
              );
            }
          } else {
            const errorMsg = `❌ ${action.description}: ${result.stderr}`;
            console.log(colors.red(errorMsg));

            if (!action.continueOnError) {
              throw new Error(errorMsg);
            }
            changes.push(errorMsg);
          }
        }
      } catch (error) {
        const errorMsg = `❌ Action failed: ${error.message}`;
        console.log(colors.red(errorMsg));
        changes.push(errorMsg);

        if (!action.continueOnError) {
          break;
        }
      }
    }

    // Execute file actions, consolidating multiple edits per file
    for (const [filePath, fileActionsList] of fileActions) {
      try {
        // For files with multiple actions, only use the last one (most complete)
        const action = fileActionsList[fileActionsList.length - 1];

        console.log(`📄 ${action.description}`);

        if (action.createFile) {
          const result = await this.createFile(action);
          changes.push(result);
        } else {
          const result = await this.modifyFile(action);
          changes.push(result);
        }
      } catch (error) {
        const errorMsg = `❌ File action failed: ${error.message}`;
        console.log(colors.red(errorMsg));
        changes.push(errorMsg);

        if (!fileActionsList[0].continueOnError) {
          break;
        }
      }
    }

    return changes;
  }

  private async createFile(action: ActionInstruction): Promise<string> {
    const filePath = path.resolve(this.projectRoot, action.file!);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const edit = action.edits![0];
    // Handle both string and array formats
    const content = Array.isArray(edit.newContent)
      ? edit.newContent.join("\n")
      : edit.newContent;

    fs.writeFileSync(filePath, content);

    // Check syntax immediately after creation
    await this.checkFileSyntax(filePath);

    // Add to context map
    this.fileContextMap.set(filePath, {
      path: filePath,
      content,
      description: this.generateFileDescription(content),
      lastModified: Date.now(),
      dependencies: [],
      exists: true,
    });

    return `📄 Created ${action.file}: ${action.description}`;
  }

  private async modifyFile(action: ActionInstruction): Promise<string> {
    const filePath = path.resolve(this.projectRoot, action.file!);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File ${filePath} does not exist`);
    }

    const ext = path.extname(filePath);
    const fileName = path.basename(filePath);

    // Use smart editing for JSON files
    if (ext === ".json") {
      try {
        // Try to detect if this is a simple property addition/merge
        const edit = action.edits![0];
        const newContent = Array.isArray(edit.newContent)
          ? edit.newContent.join("\n")
          : edit.newContent;

        // Parse the new content to see if it's a JSON fragment we can merge
        let jsonToMerge: any = null;
        try {
          jsonToMerge = JSON.parse(newContent);
        } catch {
          // Not valid JSON, fall back to full replacement
          const result = await this.smartEditor.editFile(
            filePath,
            {
              type: "full-replace",
              content: newContent,
            },
            action.description
          );

          if (result.success) {
            await this.checkFileSyntax(filePath);
            this.updateFileContext(filePath, newContent);
            return `📝 Replaced ${action.file}: ${action.description}`;
          } else {
            throw new Error(result.errors.join(", "));
          }
        }

        // Special handling for common JSON files
        if (fileName === "tsconfig.json" && jsonToMerge.compilerOptions) {
          const result = await this.smartEditor.updateTsConfig(
            filePath,
            jsonToMerge.compilerOptions,
            Object.fromEntries(
              Object.entries(jsonToMerge).filter(
                ([key]) => key !== "compilerOptions"
              )
            )
          );

          if (result.success) {
            await this.checkFileSyntax(filePath);
            const newContent = fs.readFileSync(filePath, "utf-8");
            this.updateFileContext(filePath, newContent);
            return `📝 Updated tsconfig.json: ${action.description}`;
          } else {
            throw new Error(result.errors.join(", "));
          }
        }

        if (fileName === "package.json") {
          const result = await this.smartEditor.updatePackageJson(
            filePath,
            jsonToMerge
          );

          if (result.success) {
            await this.checkFileSyntax(filePath);
            const newContent = fs.readFileSync(filePath, "utf-8");
            this.updateFileContext(filePath, newContent);
            return `📝 Updated package.json: ${action.description}`;
          } else {
            throw new Error(result.errors.join(", "));
          }
        }

        // Generic JSON merge
        const operations = Object.entries(jsonToMerge).map(([key, value]) => ({
          path: key,
          value: value,
          operation: "merge" as const,
        }));

        const result = await this.smartEditor.editFile(
          filePath,
          {
            type: "json-merge",
            jsonOperations: operations,
          },
          action.description
        );

        if (result.success) {
          await this.checkFileSyntax(filePath);
          const newContent = fs.readFileSync(filePath, "utf-8");
          this.updateFileContext(filePath, newContent);
          return `📝 Updated ${action.file}: ${action.description}`;
        } else {
          throw new Error(result.errors.join(", "));
        }
      } catch (error) {
        if (this.debug) {
          console.log(
            colors.yellow(
              `⚠️ Smart edit failed, falling back to direct replacement: ${error.message}`
            )
          );
        }
        // Fallback to direct replacement
        const edit = action.edits![0];
        const content = Array.isArray(edit.newContent)
          ? edit.newContent.join("\n")
          : edit.newContent;

        fs.writeFileSync(filePath, content);
        await this.checkFileSyntax(filePath);
        this.updateFileContext(filePath, content);
        return `📝 Replaced ${action.file}: ${action.description}`;
      }
    }

    // For full file replacements or non-JSON files
    if (
      action.edits!.length === 1 &&
      action.edits![0].startIndex === 0 &&
      action.edits![0].endIndex === -1
    ) {
      const edit = action.edits![0];
      const content = Array.isArray(edit.newContent)
        ? edit.newContent.join("\n")
        : edit.newContent;

      fs.writeFileSync(filePath, content);
      await this.checkFileSyntax(filePath);
      this.updateFileContext(filePath, content);
      return `📝 Replaced ${action.file}: ${action.description}`;
    }

    // Line-based editing for other files
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Sort edits in reverse order to avoid index shifting
    const sortedEdits = [...action.edits!].sort(
      (a, b) => b.startIndex - a.startIndex
    );

    for (const edit of sortedEdits) {
      const editContent = Array.isArray(edit.newContent)
        ? edit.newContent
        : [edit.newContent];

      // Validate indices
      const startIndex = Math.max(0, edit.startIndex);
      const endIndex =
        edit.endIndex === -1
          ? lines.length - 1
          : Math.min(lines.length - 1, edit.endIndex);

      const newLines = [
        ...lines.slice(0, startIndex),
        ...editContent,
        ...lines.slice(endIndex + 1),
      ];
      lines.splice(0, lines.length, ...newLines);
    }

    const finalContent = lines.join("\n");
    fs.writeFileSync(filePath, finalContent);
    await this.checkFileSyntax(filePath);
    this.updateFileContext(filePath, finalContent);

    return `📝 Modified ${action.file}: ${action.description}`;
  }

  private updateFileContext(filePath: string, content: string): void {
    const fileContext = this.fileContextMap.get(filePath);
    if (fileContext) {
      fileContext.content = content;
      fileContext.lastModified = Date.now();
    }
  }

  private async checkSyntaxErrors(): Promise<void> {
    const errors = await this.syntaxChecker.checkProject();

    if (errors.length > 0) {
      console.log(colors.red(`⚠️  Found ${errors.length} syntax errors:`));
      this.syntaxChecker.printErrors(errors);

      // Show summary for large error counts
      if (errors.length > 10) {
        const summary = this.syntaxChecker.getErrorSummary(errors);
        console.log(colors.yellow("\n📊 Error Summary:"));
        console.log(colors.gray(`  Files affected: ${summary.fileCount}`));
        console.log(
          colors.gray(
            `  Errors: ${summary.errorCount}, Warnings: ${summary.warningCount}`
          )
        );

        if (summary.mostCommonErrors.length > 0) {
          console.log(colors.gray("  Most common issues:"));
          summary.mostCommonErrors.forEach((e) =>
            console.log(colors.gray(`    ${e.message} (${e.count}x)`))
          );
        }
      }
    } else {
      console.log(colors.green("✅ No syntax errors found"));
    }
  }

  async checkFileSyntax(filePath: string): Promise<boolean> {
    const errors = await this.syntaxChecker.checkFile(filePath);
    if (errors.length > 0) {
      console.log(
        colors.yellow(
          `⚠️  Syntax issues in ${path.relative(this.projectRoot, filePath)}:`
        )
      );
      this.syntaxChecker.printErrors(errors);
      return false;
    }
    return true;
  }

  private findAllSourceFiles(dir: string): string[] {
    const files: string[] = [];
    const extensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".vue",
      ".svelte",
      ".json",
    ];

    if (!fs.existsSync(dir)) return files;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (
        stat.isDirectory() &&
        !item.startsWith(".") &&
        item !== "node_modules" &&
        item !== "dist"
      ) {
        files.push(...this.findAllSourceFiles(fullPath));
      } else if (extensions.some((ext) => item.endsWith(ext))) {
        files.push(fullPath);
      }
    }
    return files;
  }

  private extractFilePathsFromRequest(request: string): string[] {
    // Extract file paths mentioned in the request
    const patterns = [
      /[\w\/\-\.]+\.tsx?/g,
      /[\w\/\-\.]+\.jsx?/g,
      /src\/[\w\/\-\.]+/g,
    ];
    const matches: string[] = [];

    for (const pattern of patterns) {
      const found = request.match(pattern) || [];
      matches.push(...found);
    }

    return matches
      .map((p) => path.resolve(this.projectRoot, p))
      .filter((p) => fs.existsSync(p));
  }

  // Rest of the helper methods
  private async scanProject(): Promise<void> {
    const tsFiles = this.findTypeScriptFiles(this.projectRoot);
    this.fileContextMap.clear();

    for (const filePath of tsFiles) {
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
      } catch (error) {
        console.warn(`⚠️ Could not process file ${filePath}: ${error.message}`);
      }
    }
  }

  private compileTypeScript(): CompilationResult {
    try {
      this.buildTSProgram();
      if (!this.tsProgram) {
        return { success: false, errors: [], warnings: [] };
      }

      const diagnostics = ts.getPreEmitDiagnostics(this.tsProgram);
      const errors = diagnostics.filter(
        (d) => d.category === ts.DiagnosticCategory.Error
      );
      const warnings = diagnostics.filter(
        (d) => d.category === ts.DiagnosticCategory.Warning
      );

      return { success: errors.length === 0, errors, warnings };
    } catch (error) {
      return { success: false, errors: [], warnings: [] };
    }
  }

  private async fixCompilationErrors(errors: ts.Diagnostic[]): Promise<{
    success: boolean;
    changes: string[];
    errors?: string[];
  }> {
    const maxAttempts = 2;
    const changes: string[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`🔧 Fix attempt ${attempt + 1}/${maxAttempts}`);

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

      try {
        const errorFiles = [
          ...new Set(
            formattedErrors.map((e) => path.join(this.projectRoot, e.file))
          ),
        ];
        const context = await this.buildEditingContext(
          errorFiles,
          "Fix compilation errors"
        );
        const fixResult = await this.anthropicService.generateErrorFixes(
          formattedErrors,
          context
        );
        const fixActions: ActionInstruction[] = fixResult.edits.map((edit) => ({
          type: "file",
          description: edit.analysis,
          file: edit.file,
          createFile: false,
          edits: edit.edits,
        }));

        const fixChanges = await this.executeActionPlan(fixActions);
        changes.push(...fixChanges);

        const result = this.compileTypeScript();
        if (result.success) {
          console.log("✅ All compilation errors fixed!");
          return { success: true, changes };
        }
        errors = result.errors;
      } catch (error) {
        console.warn(`⚠️ Fix attempt ${attempt + 1} failed: ${error.message}`);
      }
    }

    return {
      success: false,
      changes,
      errors: errors.map((e) =>
        ts.flattenDiagnosticMessageText(e.messageText, "\n")
      ),
    };
  }

  private async buildEditingContext(
    targetFiles: string[],
    request: string
  ): Promise<string> {
    let context = "";
    for (const filePath of targetFiles) {
      const relativePath = path.relative(this.projectRoot, filePath);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const indexedLines = lines.map((line, index) => `${index}: ${line}`);
        context += `\n=== ${relativePath} ===\n${indexedLines.join("\n")}\n`;
      }
    }
    return context;
  }

  private findTsConfig(): string {
    const configPath = path.join(this.projectRoot, "tsconfig.json");
    return fs.existsSync(configPath) ? configPath : "";
  }

  private buildTSProgram(): void {
    if (!this.tsConfigPath) return;

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
  }

  private findTypeScriptFiles(dir: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;

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
}

export { AICodeAgent };
