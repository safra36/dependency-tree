// path: systematic-ai-agent.ts

import * as fs from "fs";
import * as path from "path";
import { DependencyExtractor } from "../dependancy-tree";
import { AnthropicService } from "../anthropic-service";
import { ConfigManager } from "../config-manager";
import { SmartFileEditor } from "./smart-file-editor";
import { SyntaxChecker } from "./syntax-checker";
import colors from "../colors";

interface ActionItem {
	id: string;
	type: "edit" | "create" | "validate" | "compile";
	file: string;
	description: string;
	details: any;
	status: "pending" | "in-progress" | "completed" | "failed";
	dependencies: string[]; // Other action IDs this depends on
	attempts: number;
	maxAttempts: number;
}

interface ProjectContext {
	tree: any;
	relevantFiles: string[];
	fileContents: Map<string, string>;
	relationships: Map<string, string[]>;
	userRequest: string;
	currentFocus: string;
}

interface PromptTemplates {
	analyzeProjectTree: string;
	findRelevantFiles: string;
	buildContextAwareness: string;
	planFileEdits: string;
	generateEdit: string;
	validateEdit: string;
	compileCheck: string;
}

class SystematicAIAgent {
	private dependencyExtractor: DependencyExtractor;
	private anthropicService: AnthropicService;
	private smartEditor: SmartFileEditor;
	private syntaxChecker: SyntaxChecker;
	private configManager: ConfigManager;

	private projectRoot: string;
	private debug: boolean;

	// State management
	private actionPlan: ActionItem[] = [];
	private actionHistory: ActionItem[] = [];
	private projectContext: ProjectContext;
	private promptTemplates: PromptTemplates;

	constructor(projectRoot: string, options: { debug?: boolean } = {}) {
		this.projectRoot = path.resolve(projectRoot);
		this.debug = options.debug || false;

		// Initialize services
		this.dependencyExtractor = new DependencyExtractor({
			rootDir: this.projectRoot,
			debug: this.debug,
			maxDepth: 3,
		});

		this.configManager = ConfigManager.createFromEnv();
		this.smartEditor = new SmartFileEditor(this.debug);
		this.syntaxChecker = new SyntaxChecker(this.projectRoot, this.debug);

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

		this.initializePromptTemplates();

		if (this.debug) {
			console.log(
				colors.cyan("🔧 [DEBUG] SystematicAIAgent initialized")
			);
		}
	}

	private initializePromptTemplates(): void {
		this.promptTemplates = {
			analyzeProjectTree: `
Analyze this project dependency tree and provide insights:

PROJECT TREE:
{tree}

USER REQUEST: {userRequest}

Provide analysis in JSON format:
{
  "projectType": "nestjs|react|vue|etc",
  "architecture": "description of architecture",
  "keyModules": ["module1", "module2"],
  "entryPoints": ["file1", "file2"],
  "patterns": ["pattern1", "pattern2"]
}`,

			findRelevantFiles: `
Based on this user request and project analysis, identify the most relevant files:

USER REQUEST: {userRequest}
PROJECT ANALYSIS: {projectAnalysis}
AVAILABLE FILES: {fileList}

Return JSON array of files in order of relevance:
{
  "primaryFiles": ["file1", "file2"], // Files that will be directly modified
  "contextFiles": ["file3", "file4"], // Files needed for understanding
  "relatedFiles": ["file5", "file6"]  // Files that might be affected
}`,

			buildContextAwareness: `
Build comprehensive context awareness for this coding task:

USER REQUEST: {userRequest}
PRIMARY FILES: {primaryFiles}
CONTEXT FILES: {contextFiles}
FILE CONTENTS: {fileContents}

Analyze and provide:
{
  "understanding": "What the user wants to accomplish",
  "currentState": "Current state of relevant code",
  "requiredChanges": "What needs to be changed",
  "potentialIssues": ["issue1", "issue2"],
  "dependencies": "How files relate to each other"
}`,

			planFileEdits: `
Create a detailed plan for editing files based on this context:

CONTEXT: {context}
TARGET FILES: {targetFiles}

Create a step-by-step plan:
{
  "editPlan": [
    {
      "file": "path/to/file",
      "action": "create|modify|update",
      "description": "What to do",
      "changes": "Specific changes needed",
      "dependencies": ["other files that must be done first"],
      "priority": 1-10
    }
  ],
  "executionOrder": ["file1", "file2", "file3"]
}`,

			generateEdit: `
Generate the specific edit for this file:

FILE: {file}
CURRENT CONTENT: {currentContent}
REQUIRED CHANGES: {requiredChanges}
CONTEXT: {context}

Provide the exact content that should replace the file:
[CONTENT ONLY - NO EXPLANATIONS]`,

			validateEdit: `
Validate this edit and suggest improvements:

FILE: {file}
ORIGINAL CONTENT: {originalContent}
NEW CONTENT: {newContent}
CONTEXT: {context}

Analyze and respond:
{
  "isValid": true/false,
  "issues": ["issue1", "issue2"],
  "improvements": ["suggestion1", "suggestion2"],
  "correctedContent": "improved content if needed"
}`,

			compileCheck: `
Analyze these compilation errors and suggest fixes:

FILE: {file}
ERRORS: {errors}
CONTENT: {content}
CONTEXT: {context}

Provide fix strategy:
{
  "analysis": "What's wrong",
  "fixStrategy": "How to fix it",
  "correctedContent": "Fixed content"
}`,
		};
	}

	async processUserRequest(userRequest: string): Promise<{
		success: boolean;
		summary: string;
		actions: ActionItem[];
	}> {
		try {
			console.log(colors.blue("\n" + "=".repeat(80)));
			console.log(
				colors.blue("🚀 SYSTEMATIC AI AGENT - PROCESSING REQUEST")
			);
			console.log(colors.blue("=".repeat(80)));
			console.log(`📝 Request: ${colors.yellow(userRequest)}`);

			// Initialize context
			this.projectContext = {
				tree: null,
				relevantFiles: [],
				fileContents: new Map(),
				relationships: new Map(),
				userRequest,
				currentFocus: "",
			};

			// Clear previous state
			this.actionPlan = [];
			this.actionHistory = [];

			// Execute the systematic process
			await this.phase1_AnalyzeProject();
			await this.phase2_FindRelevantFiles();
			await this.phase3_BuildContextAwareness();
			await this.phase4_PlanActions();
			await this.phase5_ExecuteActions();

			return {
				success: true,
				summary: this.generateSummary(),
				actions: this.actionHistory,
			};
		} catch (error) {
			console.log(colors.red(`❌ Process failed: ${error.message}`));
			return {
				success: false,
				summary: `Failed: ${error.message}`,
				actions: this.actionHistory,
			};
		}
	}

	private async phase1_AnalyzeProject(): Promise<void> {
		console.log(colors.cyan("\n📊 PHASE 1: PROJECT ANALYSIS"));
		console.log("─".repeat(50));

		console.log("🌳 Building dependency tree...");

		// Find the most relevant file as entry point
		const entryPoints = this.findProjectEntryPoints();
		let projectTree = null;

		for (const entryPoint of entryPoints) {
			try {
				console.log(`   Analyzing from: ${colors.gray(entryPoint)}`);
				const result = await this.dependencyExtractor.analyze(
					entryPoint
				);
				projectTree = result;
				break;
			} catch (error) {
				console.log(
					`   ❌ Failed to analyze ${entryPoint}: ${error.message}`
				);
			}
		}

		if (!projectTree) {
			throw new Error("Could not analyze project structure");
		}

		this.projectContext.tree = projectTree;
		console.log(
			`✅ Project tree built with ${this.countFilesInTree(
				projectTree
			)} files`
		);

		// Analyze the tree with AI
		console.log("🤖 Analyzing project architecture...");
		const treeAnalysis = await this.analyzeTreeWithAI(projectTree);
		console.log(
			`📋 Project type: ${colors.green(treeAnalysis.projectType)}`
		);
		console.log(
			`🏗️  Architecture: ${colors.gray(treeAnalysis.architecture)}`
		);

		this.pause();
	}

	private async phase2_FindRelevantFiles(): Promise<void> {
		console.log(colors.cyan("\n🎯 PHASE 2: RELEVANCE ANALYSIS"));
		console.log("─".repeat(50));

		console.log("🔍 Identifying relevant files...");

		const allFiles = this.extractAllFilesFromTree(this.projectContext.tree);
		console.log(`   Found ${allFiles.length} total files in project`);

		const relevantFiles = await this.findRelevantFilesWithAI(allFiles);
		this.projectContext.relevantFiles = relevantFiles.primaryFiles.concat(
			relevantFiles.contextFiles
		);

		console.log(`📁 Primary files (${relevantFiles.primaryFiles.length}):`);
		relevantFiles.primaryFiles.forEach((file) => {
			console.log(`   📄 ${colors.yellow(file)}`);
		});

		console.log(`📁 Context files (${relevantFiles.contextFiles.length}):`);
		relevantFiles.contextFiles.forEach((file) => {
			console.log(`   📖 ${colors.gray(file)}`);
		});

		this.pause();
	}

	private async phase3_BuildContextAwareness(): Promise<void> {
		console.log(colors.cyan("\n🧠 PHASE 3: CONTEXT BUILDING"));
		console.log("─".repeat(50));

		console.log("📚 Loading file contents...");

		for (const file of this.projectContext.relevantFiles) {
			const fullPath = path.resolve(this.projectRoot, file);
			try {
				if (fs.existsSync(fullPath)) {
					const content = fs.readFileSync(fullPath, "utf-8");
					this.projectContext.fileContents.set(file, content);
					console.log(
						`   ✅ Loaded: ${colors.gray(file)} (${
							content.length
						} chars)`
					);
				}
			} catch (error) {
				console.log(`   ❌ Failed to load: ${file}`);
			}
		}

		console.log("🤖 Building context awareness...");
		const contextAnalysis = await this.buildContextWithAI();

		console.log(
			`💡 Understanding: ${colors.green(contextAnalysis.understanding)}`
		);
		console.log(
			`📊 Current state: ${colors.gray(contextAnalysis.currentState)}`
		);
		console.log(
			`🔄 Required changes: ${colors.yellow(
				contextAnalysis.requiredChanges
			)}`
		);

		if (contextAnalysis.potentialIssues.length > 0) {
			console.log(`⚠️  Potential issues:`);
			contextAnalysis.potentialIssues.forEach((issue) => {
				console.log(`   - ${colors.red(issue)}`);
			});
		}

		this.pause();
	}

	private async phase4_PlanActions(): Promise<void> {
		console.log(colors.cyan("\n📋 PHASE 4: ACTION PLANNING"));
		console.log("─".repeat(50));

		console.log("🤖 Generating action plan...");

		const editPlan = await this.planActionsWithAI();

		// Convert plan to action items
		editPlan.editPlan.forEach((item, index) => {
			this.actionPlan.push({
				id: `action_${index + 1}`,
				type: item.action === "create" ? "create" : "edit",
				file: item.file,
				description: item.description,
				details: item,
				status: "pending",
				dependencies: item.dependencies || [],
				attempts: 0,
				maxAttempts: 3,
			});
		});

		console.log(`📝 Generated ${this.actionPlan.length} actions:`);
		this.actionPlan.forEach((action, index) => {
			const icon = action.type === "create" ? "📄" : "✏️";
			console.log(
				`   ${index + 1}. ${icon} ${colors.yellow(action.file)}: ${
					action.description
				}`
			);
			if (action.dependencies.length > 0) {
				console.log(
					`      🔗 Depends on: ${action.dependencies.join(", ")}`
				);
			}
		});

		this.pause();
	}

	private async phase5_ExecuteActions(): Promise<void> {
		console.log(colors.cyan("\n⚡ PHASE 5: EXECUTION"));
		console.log("─".repeat(50));

		console.log(
			`🚀 Executing ${this.actionPlan.length} actions sequentially...`
		);

		for (let i = 0; i < this.actionPlan.length; i++) {
			const action = this.actionPlan[i];
			console.log(
				`\n${i + 1}/${this.actionPlan.length}: ${colors.yellow(
					action.description
				)}`
			);
			console.log(`📁 File: ${action.file}`);

			action.status = "in-progress";

			try {
				const success = await this.executeAction(action);
				if (success) {
					action.status = "completed";
					console.log(
						`   ✅ ${colors.green("Completed successfully")}`
					);
				} else {
					action.status = "failed";
					console.log(`   ❌ ${colors.red("Failed after retries")}`);
				}
			} catch (error) {
				action.status = "failed";
				console.log(`   ❌ ${colors.red("Error: " + error.message)}`);
			}

			this.actionHistory.push({ ...action });
			this.pause();
		}
	}

	private async executeAction(action: ActionItem): Promise<boolean> {
		for (let attempt = 1; attempt <= action.maxAttempts; attempt++) {
			console.log(`   🔄 Attempt ${attempt}/${action.maxAttempts}`);

			try {
				if (action.type === "create") {
					await this.executeCreateAction(action);
				} else if (action.type === "edit") {
					await this.executeEditAction(action);
				}

				// Validate the result
				const isValid = await this.validateAction(action);
				if (isValid) {
					return true;
				}

				console.log(`   ⚠️  Validation failed, retrying...`);
			} catch (error) {
				console.log(
					`   ❌ Attempt ${attempt} failed: ${error.message}`
				);
			}

			action.attempts = attempt;
		}

		return false;
	}

	private async executeCreateAction(action: ActionItem): Promise<void> {
		const filePath = path.resolve(this.projectRoot, action.file);
		const dir = path.dirname(filePath);

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		const content = await this.generateFileContent(action);
		fs.writeFileSync(filePath, content);

		console.log(`   📄 Created file: ${action.file}`);
	}

	private async executeEditAction(action: ActionItem): Promise<void> {
		const filePath = path.resolve(this.projectRoot, action.file);

		if (!fs.existsSync(filePath)) {
			throw new Error(`File does not exist: ${action.file}`);
		}

		const currentContent = fs.readFileSync(filePath, "utf-8");
		const newContent = await this.generateEditContent(
			action,
			currentContent
		);

		const result = await this.smartEditor.editFile(
			filePath,
			{
				type: "full-replace",
				content: newContent,
			},
			action.description
		);

		if (!result.success) {
			throw new Error(result.errors.join(", "));
		}

		console.log(`   ✏️ Modified file: ${action.file}`);
	}

	private async validateAction(action: ActionItem): Promise<boolean> {
		const filePath = path.resolve(this.projectRoot, action.file);

		// Syntax check
		const syntaxErrors = await this.syntaxChecker.checkFile(filePath);
		if (syntaxErrors.length > 0) {
			console.log(`   ⚠️  Syntax errors: ${syntaxErrors.length}`);
			return false;
		}

		console.log(`   ✅ Syntax validation passed`);
		return true;
	}

	// Helper methods for AI interactions
	private async analyzeTreeWithAI(tree: any): Promise<any> {
		const prompt = this.promptTemplates.analyzeProjectTree
			.replace("{tree}", JSON.stringify(tree, null, 2))
			.replace("{userRequest}", this.projectContext.userRequest);

		const response = await this.anthropicService.generateCodeEdits(prompt);
		return JSON.parse(this.extractJsonFromResponse(response));
	}

	private async findRelevantFilesWithAI(allFiles: string[]): Promise<any> {
		const prompt = this.promptTemplates.findRelevantFiles
			.replace("{userRequest}", this.projectContext.userRequest)
			.replace("{projectAnalysis}", "Project analysis data")
			.replace("{fileList}", allFiles.join("\n"));

		const response = await this.anthropicService.generateCodeEdits(prompt);
		return JSON.parse(this.extractJsonFromResponse(response));
	}

	private async buildContextWithAI(): Promise<any> {
		const fileContentsStr = Array.from(
			this.projectContext.fileContents.entries()
		)
			.map(([file, content]) => `=== ${file} ===\n${content}`)
			.join("\n\n");

		const prompt = this.promptTemplates.buildContextAwareness
			.replace("{userRequest}", this.projectContext.userRequest)
			.replace(
				"{primaryFiles}",
				this.projectContext.relevantFiles.join(", ")
			)
			.replace("{contextFiles}", "")
			.replace("{fileContents}", fileContentsStr);

		const response = await this.anthropicService.generateCodeEdits(prompt);
		return JSON.parse(this.extractJsonFromResponse(response));
	}

	private async planActionsWithAI(): Promise<any> {
		const prompt = this.promptTemplates.planFileEdits
			.replace("{context}", "Context data")
			.replace(
				"{targetFiles}",
				this.projectContext.relevantFiles.join(", ")
			);

		const response = await this.anthropicService.generateCodeEdits(prompt);
		return JSON.parse(this.extractJsonFromResponse(response));
	}

	private async generateEditContent(
		action: ActionItem,
		currentContent: string
	): Promise<string> {
		const prompt = this.promptTemplates.generateEdit
			.replace("{file}", action.file)
			.replace("{currentContent}", currentContent)
			.replace(
				"{requiredChanges}",
				action.details.changes || action.description
			)
			.replace("{context}", this.projectContext.userRequest);

		return await this.anthropicService.generateCodeEdits(prompt);
	}

	private async generateFileContent(action: ActionItem): Promise<string> {
		const prompt = `Create a new file: ${action.file}

Requirements: ${action.description}
Context: ${this.projectContext.userRequest}
Details: ${JSON.stringify(action.details)}

Generate the complete file content:`;

		return await this.anthropicService.generateCodeEdits(prompt);
	}

	// Utility methods
	private findProjectEntryPoints(): string[] {
		const candidates = [
			"src/main.ts",
			"src/app.module.ts",
			"src/index.ts",
			"src/app.ts",
			"main.ts",
			"index.ts",
			"app.ts",
		];

		return candidates
			.map((file) => path.resolve(this.projectRoot, file))
			.filter((file) => fs.existsSync(file));
	}

	private countFilesInTree(tree: any): number {
		let count = 1;
		if (tree.dependencies) {
			tree.dependencies.forEach((dep) => {
				count += this.countFilesInTree(dep);
			});
		}
		return count;
	}

	private extractAllFilesFromTree(tree: any): string[] {
		const files: string[] = [];
		const extract = (node: any) => {
			if (node.path && node.exists) {
				files.push(
					path.relative(
						this.projectRoot,
						node.absolutePath || node.path
					)
				);
			}
			if (node.dependencies) {
				node.dependencies.forEach(extract);
			}
		};
		extract(tree);
		return files;
	}

	private extractJsonFromResponse(response: string): string {
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		return jsonMatch ? jsonMatch[0] : response;
	}

	private generateSummary(): string {
		const completed = this.actionHistory.filter(
			(a) => a.status === "completed"
		).length;
		const failed = this.actionHistory.filter(
			(a) => a.status === "failed"
		).length;

		return `Completed ${completed}/${this.actionHistory.length} actions. ${failed} failed.`;
	}

	private pause(): void {
		if (!this.debug) return;

		console.log(
			colors.gray("\n⏸️  Pausing for review... (press Enter to continue)")
		);
		// In a real implementation, you might want to wait for user input
		// For now, just add a small delay
		// process.stdin.once('data', () => {});
	}
}

export { SystematicAIAgent };
