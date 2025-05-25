// path: ai-coding-agent.ts

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { DependencyExtractor } from "./dependancy-tree";
import { AnthropicService } from "./anthropic-service";
import { ConfigManager } from "./config-manager";
import { ShellExecutor } from "./shell-executor";
import { ProjectAnalyzer } from "./project-analyzer";
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
    newContent: string[];
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

      // 1. Analyze project state and build context
      const projectInfo = await this.projectAnalyzer.analyzeProject();
      const projectContext = this.buildProjectContext(projectInfo);

      // 2. Get AI action plan
      const actionPlan = await this.getAIActionPlan(request, projectContext);

      // 3. Execute action plan
      const changes = await this.executeActionPlan(actionPlan);

      // 4. Post-execution validation
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

  private buildProjectContext(projectInfo: any): string {
    let context = `PROJECT CONTEXT:
Type: ${projectInfo.type}
Framework: ${projectInfo.framework || "none"}
Package Manager: ${projectInfo.packageManager}
Has package.json: ${projectInfo.hasPackageJson}

`;

    if (projectInfo.missingPackages.length > 0) {
      context += `Missing packages: ${projectInfo.missingPackages.join(
        ", "
      )}\n`;
    }

    if (projectInfo.missingDevPackages.length > 0) {
      context += `Missing dev packages: ${projectInfo.missingDevPackages.join(
        ", "
      )}\n`;
    }

    // Add file structure
    const files = Array.from(this.fileContextMap.entries()).map(
      ([path, context]) => ({
        path: path.replace(this.projectRoot, ""),
        description: context.description,
      })
    );

    context += `\nEXISTING FILES:\n`;
    files.forEach((f) => {
      context += `${f.path}: ${f.description}\n`;
    });

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

    for (const action of actions) {
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
        } else if (action.type === "file") {
          console.log(`📄 ${action.description}`);

          if (action.createFile) {
            const result = await this.createFile(action);
            changes.push(result);
          } else {
            const result = await this.modifyFile(action);
            changes.push(result);
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

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (const edit of action.edits!.reverse()) {
      const newLines = [
        ...lines.slice(0, edit.startIndex),
        ...edit.newContent,
        ...lines.slice(edit.endIndex + 1),
      ];
      lines.splice(0, lines.length, ...newLines);
    }

    fs.writeFileSync(filePath, lines.join("\n"));

    // Update context map
    const fileContext = this.fileContextMap.get(filePath);
    if (fileContext) {
      fileContext.content = lines.join("\n");
      fileContext.lastModified = Date.now();
    }

    return `📝 Modified ${action.file}: ${action.description}`;
  }

  // Rest of the methods remain the same as the previous version
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

  // Helper methods
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
}

export { AICodeAgent };
