// path: enhanced-ai-agent-fixed.ts

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { AnthropicService } from "./anthropic-service";
import { ConfigManager } from "./config-manager";
import { SyntaxChecker } from "./syntax-checker";
import colors from "./colors";

interface PlanStep {
	id: string;
	phase: "plan" | "discover" | "select" | "load" | "execute" | "validate";
	description: string;
	status: "pending" | "in-progress" | "completed" | "failed";
	details?: any;
}

interface FileContext {
	path: string;
	content: string;
	relevance: "high" | "medium" | "low";
	purpose: string;
}

export class EnhancedSequentialAIAgent {
	private projectRoot: string;
	private anthropicService: AnthropicService;
	private syntaxChecker: SyntaxChecker;
	private configManager: ConfigManager;
	private debug: boolean;

	// State management
	private executionPlan: PlanStep[] = [];
	private fileTree: any = null;
	private selectedFiles: string[] = [];
	private fileContexts: Map<string, FileContext> = new Map();
	private userRequest: string = "";

	constructor(projectRoot: string, options: { debug?: boolean } = {}) {
		this.projectRoot = path.resolve(projectRoot);
		this.debug = options.debug || false;

		this.configManager = ConfigManager.createFromEnv();
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

		console.log(
			colors.green("🤖 Enhanced Sequential AI Agent initialized")
		);
	}

	async processUserRequest(request: string): Promise<{
		success: boolean;
		summary: string;
		steps: PlanStep[];
	}> {
		this.userRequest = request;
		console.log(colors.blue("\n" + "=".repeat(80)));
		console.log(colors.blue("🚀 ENHANCED SEQUENTIAL AI AGENT"));
		console.log(colors.blue("=".repeat(80)));
		console.log(`📝 Request: ${colors.yellow(request)}\n`);

		try {
			// Execute all phases sequentially
			await this.phase1_CreateExecutionPlan();
			await this.phase2_DiscoverProjectStructure();
			await this.phase3_SelectRelevantFiles();
			await this.phase4_LoadFileContexts();
			await this.phase5_ExecuteChanges();
			await this.phase6_ValidateResults();

			const summary = this.generateExecutionSummary();
			console.log(
				colors.green("\n✅ All phases completed successfully!")
			);
			console.log(colors.gray(summary));

			return {
				success: true,
				summary,
				steps: this.executionPlan,
			};
		} catch (error) {
			console.log(colors.red(`\n❌ Process failed: ${error.message}`));
			return {
				success: false,
				summary: `Failed during execution: ${error.message}`,
				steps: this.executionPlan,
			};
		}
	}

	private async phase1_CreateExecutionPlan(): Promise<void> {
		console.log(colors.cyan("📋 PHASE 1: EXECUTION PLANNING"));
		console.log("─".repeat(50));

		const step: PlanStep = {
			id: "plan-1",
			phase: "plan",
			description: "Create detailed execution plan",
			status: "in-progress",
		};
		this.executionPlan.push(step);

		console.log("🤖 AI is analyzing the request and creating a plan...");

		const planPrompt = `You are a systematic coding assistant. Analyze this request and create a detailed execution plan.

USER REQUEST: "${this.userRequest}"

CRITICAL DECISION RULES:
1. FOR SIMPLE WEB FILES (HTML/CSS/JS): If the request is for basic web content that can be self-contained, prefer SINGLE FILE solutions
   - "create HTML login form with CSS" → SINGLE index.html file with embedded <style>
   - "create simple webpage" → SINGLE index.html file  
   - "create basic calculator" → SINGLE index.html with embedded CSS/JS

2. FOR COMPLEX APPLICATIONS: Use multiple files only when genuinely needed
   - "create React component with styling" → separate .tsx and .css files
   - "create Node.js API with routes" → multiple .ts files
   - "refactor existing large file" → multiple smaller files

3. FILE COORDINATION: When creating multiple files, they MUST work together
   - HTML must include <link> tags for CSS files
   - CSS class names must match HTML exactly
   - Import/export statements must be correct

RESPONSE FORMAT - RESPOND WITH ONLY THIS JSON STRUCTURE:
{
  "understanding": "What the user wants to accomplish",
  "fileStrategy": "single-file" | "multi-file",
  "reasoning": "Why single-file or multi-file approach was chosen",
  "likelyFilesToCreate": ["file1.html"] OR ["file1.html", "file2.css"],
  "contextFilesNeeded": [],
  "executionSequence": [
    {
      "step": 1,
      "action": "create",
      "file": "filename.html",
      "purpose": "What this accomplishes",
      "dependencies": [],
      "coordination": "How this file works with others (if multi-file)"
    }
  ],
  "potentialChallenges": ["challenge1", "challenge2"]
}

CRITICAL: Respond with ONLY valid JSON. No explanations before or after.`;

		try {
			const response = await this.anthropicService.generateCodeEdits(
				planPrompt
			);
			const plan = JSON.parse(this.cleanJsonResponse(response));

			step.details = plan;
			step.status = "completed";

			console.log(
				`💡 Understanding: ${colors.green(plan.understanding)}`
			);
			console.log(
				`🎯 Strategy: ${colors.yellow(plan.fileStrategy)} (${
					plan.reasoning
				})`
			);
			console.log(
				`📄 Files to create: ${colors.yellow(
					plan.likelyFilesToCreate?.join(", ") || "None"
				)}`
			);

			if (plan.potentialChallenges?.length > 0) {
				console.log(`⚠️  Potential challenges:`);
				plan.potentialChallenges.forEach((challenge: string) => {
					console.log(`   - ${colors.red(challenge)}`);
				});
			}

			await this.pause("Plan created. Continue with file discovery?");
		} catch (error) {
			step.status = "failed";
			throw new Error(`Planning failed: ${error.message}`);
		}
	}

	private async phase2_DiscoverProjectStructure(): Promise<void> {
		console.log(colors.cyan("\n🌳 PHASE 2: PROJECT STRUCTURE DISCOVERY"));
		console.log("─".repeat(50));

		const step: PlanStep = {
			id: "discover-1",
			phase: "discover",
			description: "Discover project structure using dependency tree",
			status: "in-progress",
		};
		this.executionPlan.push(step);

		// Check if this is a simple standalone file creation request
		const executionPlan = this.executionPlan[0]?.details;
		const isStandaloneFileCreation =
			this.isStandaloneFileCreation(executionPlan);

		if (isStandaloneFileCreation) {
			console.log(
				"🎯 Detected standalone file creation - skipping dependency analysis"
			);
			console.log("📁 Creating files without existing project structure");

			step.details = {
				standalone: true,
				reason: "Simple file creation doesn't require project analysis",
				fileNames: [],
			};
			step.status = "completed";

			this.fileTree = { standalone: true, files: [] };
			await this.pause(
				"Standalone file creation detected. Continue with file selection?"
			);
			return;
		}

		console.log(
			"🔍 Using dependency-tree.js to analyze project structure..."
		);

		try {
			// Find project entry points
			const entryPoints = this.findProjectEntryPoints();
			console.log(`📍 Found entry points: ${entryPoints.join(", ")}`);

			let bestEntryPoint = entryPoints[0];
			if (!bestEntryPoint) {
				// For bare projects, create a minimal structure
				console.log(
					"🆕 No existing entry points found - treating as new project"
				);

				step.details = {
					bareProject: true,
					reason: "No existing TypeScript/JavaScript files found",
					fileNames: [],
				};
				step.status = "completed";

				this.fileTree = { bareProject: true, files: [] };
				await this.pause(
					"New project detected. Continue with file selection?"
				);
				return;
			}

			console.log(`🎯 Analyzing from: ${colors.yellow(bestEntryPoint)}`);

			// Run dependency-tree.js to get file structure (without content)
			const treeOutput = await this.runDependencyTree(
				bestEntryPoint,
				"tree"
			);

			// Parse the tree output to extract file names
			const fileNames = this.extractFileNamesFromTreeOutput(treeOutput);

			step.details = {
				entryPoint: bestEntryPoint,
				totalFiles: fileNames.length,
				fileNames: fileNames,
			};
			step.status = "completed";

			console.log(
				`📊 Discovered ${colors.green(
					fileNames.length.toString()
				)} files in project`
			);
			console.log("📁 Key project files found:");

			// Show first 10 files as preview
			fileNames.slice(0, 10).forEach((file) => {
				console.log(`   📄 ${colors.gray(file)}`);
			});

			if (fileNames.length > 10) {
				console.log(`   ... and ${fileNames.length - 10} more files`);
			}

			this.fileTree = { entryPoint: bestEntryPoint, files: fileNames };
			await this.pause(
				"Project structure discovered. Continue with file selection?"
			);
		} catch (error) {
			// Don't fail completely - treat as bare project
			console.log(`⚠️  Project analysis failed: ${error.message}`);
			console.log("🆕 Treating as new/bare project");

			step.details = {
				bareProject: true,
				reason: `Analysis failed: ${error.message}`,
				fileNames: [],
			};
			step.status = "completed";

			this.fileTree = { bareProject: true, files: [] };
			await this.pause(
				"Bare project detected. Continue with file selection?"
			);
		}
	}

	private async phase3_SelectRelevantFiles(): Promise<void> {
		console.log(colors.cyan("\n🎯 PHASE 3: RELEVANT FILE SELECTION"));
		console.log("─".repeat(50));

		const step: PlanStep = {
			id: "select-1",
			phase: "select",
			description: "Select files relevant to the user request",
			status: "in-progress",
		};
		this.executionPlan.push(step);

		// Handle standalone file creation or bare projects
		if (this.fileTree.standalone || this.fileTree.bareProject) {
			console.log(
				"🎯 Standalone/bare project - no existing files to select for context"
			);

			const executionPlan = this.executionPlan[0]?.details;
			const filesToCreate = executionPlan?.likelyFilesToCreate || [];

			step.details = {
				primaryFiles: filesToCreate,
				contextFiles: [],
				reasoning: {
					primaryFiles:
						"Files to be created as specified in execution plan",
					contextFiles: "No existing files available for context",
				},
			};
			step.status = "completed";

			this.selectedFiles = filesToCreate;

			console.log(`📄 Files to create (${filesToCreate.length}):`);
			filesToCreate.forEach((file: string) => {
				console.log(`   ✏️ ${colors.yellow(file)}`);
			});

			await this.pause(
				"Files identified for creation. Continue with execution?"
			);
			return;
		}

		console.log(
			"🤖 AI is selecting the most relevant files for this task..."
		);

		const selectionPrompt = `Based on the execution plan and discovered project files, select which files are most relevant for this task.

ORIGINAL REQUEST: "${this.userRequest}"

EXECUTION PLAN: ${JSON.stringify(this.executionPlan[0]?.details, null, 2)}

AVAILABLE PROJECT FILES:
${this.fileTree.files.join("\n")}

Select files that are most relevant. Remember:
- Keep context manageable - select only truly necessary files
- Prioritize files that will be modified or are essential for understanding
- Each file should be maximum 100 lines when implemented

RESPOND WITH ONLY THIS JSON:
{
  "primaryFiles": ["files that will be directly modified"],
  "contextFiles": ["files needed for understanding the codebase"],
  "reasoning": {
    "primaryFiles": "Why these files were selected for modification",
    "contextFiles": "Why these files are needed for context"
  }
}`;

		try {
			const response = await this.anthropicService.generateCodeEdits(
				selectionPrompt
			);
			const selection = JSON.parse(this.cleanJsonResponse(response));

			this.selectedFiles = [
				...(selection.primaryFiles || []),
				...(selection.contextFiles || []),
			];

			step.details = selection;
			step.status = "completed";

			console.log(
				`📁 Primary files (${selection.primaryFiles?.length || 0}):`
			);
			(selection.primaryFiles || []).forEach((file: string) => {
				console.log(`   ✏️ ${colors.yellow(file)}`);
			});

			console.log(
				`📚 Context files (${selection.contextFiles?.length || 0}):`
			);
			(selection.contextFiles || []).forEach((file: string) => {
				console.log(`   📖 ${colors.gray(file)}`);
			});

			console.log(`💡 Reasoning:`);
			console.log(
				`   Primary: ${colors.gray(
					selection.reasoning?.primaryFiles || "Not provided"
				)}`
			);
			console.log(
				`   Context: ${colors.gray(
					selection.reasoning?.contextFiles || "Not provided"
				)}`
			);

			await this.pause(
				"Files selected. Continue with loading file contents?"
			);
		} catch (error) {
			step.status = "failed";
			throw new Error(`File selection failed: ${error.message}`);
		}
	}

	private async phase4_LoadFileContexts(): Promise<void> {
		console.log(colors.cyan("\n📚 PHASE 4: LOADING FILE CONTEXTS"));
		console.log("─".repeat(50));

		const step: PlanStep = {
			id: "load-1",
			phase: "load",
			description: "Load selected file contents using dependency tree",
			status: "in-progress",
		};
		this.executionPlan.push(step);

		// Handle standalone/bare projects
		if (this.fileTree.standalone || this.fileTree.bareProject) {
			console.log(
				"📝 Standalone/bare project - no existing files to load"
			);
			console.log("🎯 Ready to create new files from scratch");

			step.details = {
				requestedFiles: 0,
				loadedFiles: 0,
				errors: [],
				message:
					"No existing files to load for standalone/bare project",
			};
			step.status = "completed";

			await this.pause(
				"No existing context needed. Continue with executing changes?"
			);
			return;
		}

		console.log(
			"📖 Loading file contents using dependency-tree.js --format content..."
		);

		try {
			let loadedCount = 0;
			const errors: string[] = [];

			for (const file of this.selectedFiles) {
				try {
					console.log(`   📄 Loading: ${colors.gray(file)}`);

					const filePath = path.resolve(this.projectRoot, file);
					if (fs.existsSync(filePath)) {
						// Use dependency-tree.js to get file content with proper formatting
						const contentOutput = await this.runDependencyTree(
							filePath,
							"content"
						);
						const content = this.extractContentFromOutput(
							contentOutput,
							file
						);

						this.fileContexts.set(file, {
							path: file,
							content: content,
							relevance: "high", // We can enhance this later
							purpose: "Selected for task context",
						});

						loadedCount++;
						console.log(
							`   ✅ Loaded: ${colors.green(file)} (${
								content.length
							} chars)`
						);
					} else {
						console.log(
							`   ⚠️  File not found: ${colors.yellow(file)}`
						);
						errors.push(`File not found: ${file}`);
					}
				} catch (error) {
					console.log(
						`   ❌ Failed to load: ${colors.red(file)} - ${
							error.message
						}`
					);
					errors.push(`Failed to load ${file}: ${error.message}`);
				}
			}

			step.details = {
				requestedFiles: this.selectedFiles.length,
				loadedFiles: loadedCount,
				errors: errors,
			};
			step.status = "completed";

			console.log(
				`📊 Successfully loaded ${colors.green(
					loadedCount.toString()
				)}/${this.selectedFiles.length} files`
			);

			if (errors.length > 0) {
				console.log(`⚠️  Encountered ${errors.length} errors:`);
				errors.forEach((error) =>
					console.log(`   - ${colors.red(error)}`)
				);
			}

			await this.pause(
				"File contents loaded. Continue with executing changes?"
			);
		} catch (error) {
			step.status = "failed";
			throw new Error(`File loading failed: ${error.message}`);
		}
	}

	private async phase5_ExecuteChanges(): Promise<void> {
		console.log(colors.cyan("\n⚡ PHASE 5: EXECUTING CHANGES"));
		console.log("─".repeat(50));

		const step: PlanStep = {
			id: "execute-1",
			phase: "execute",
			description: "Execute file modifications and creations",
			status: "in-progress",
		};
		this.executionPlan.push(step);

		const executionPlan =
			this.executionPlan[0]?.details?.executionSequence || [];
		console.log(
			`🚀 Executing ${executionPlan.length} planned changes sequentially...`
		);

		const results: any[] = [];
		let successCount = 0;

		// Build coordination context for multi-file scenarios
		const coordinationContext =
			this.buildCoordinationContext(executionPlan);

		for (let i = 0; i < executionPlan.length; i++) {
			const change = executionPlan[i];
			console.log(
				`\n${i + 1}/${executionPlan.length}: ${colors.yellow(
					change.purpose
				)}`
			);
			console.log(`📁 File: ${change.file}`);
			console.log(`🔧 Action: ${change.action}`);

			try {
				const result = await this.executeFileChange(
					change,
					coordinationContext
				);
				results.push({ ...change, result, status: "success" });
				successCount++;
				console.log(`   ✅ ${colors.green("Completed successfully")}`);

				await this.pause(
					`Change ${i + 1} completed. Continue with next change?`
				);
			} catch (error) {
				console.log(`   ❌ ${colors.red("Failed: " + error.message)}`);
				results.push({
					...change,
					result: null,
					status: "failed",
					error: error.message,
				});
			}
		}

		step.details = {
			totalChanges: executionPlan.length,
			successfulChanges: successCount,
			results: results,
		};
		step.status = successCount > 0 ? "completed" : "failed";

		console.log(
			`\n📊 Execution Summary: ${colors.green(successCount.toString())}/${
				executionPlan.length
			} changes completed successfully`
		);
	}

	private async phase6_ValidateResults(): Promise<void> {
		console.log(colors.cyan("\n🔍 PHASE 6: VALIDATION"));
		console.log("─".repeat(50));

		const step: PlanStep = {
			id: "validate-1",
			phase: "validate",
			description: "Validate syntax and compilation",
			status: "in-progress",
		};
		this.executionPlan.push(step);

		console.log("🔧 Checking syntax and compilation of modified files...");

		try {
			const modifiedFiles = this.getModifiedFiles();
			let syntaxErrors = 0;
			let validFiles = 0;

			for (const file of modifiedFiles) {
				console.log(`   🔍 Validating: ${colors.gray(file)}`);

				const errors = await this.syntaxChecker.checkFile(
					path.resolve(this.projectRoot, file)
				);

				if (errors.length === 0) {
					validFiles++;
					console.log(`   ✅ ${colors.green("Valid")}`);
				} else {
					syntaxErrors += errors.length;
					console.log(
						`   ❌ ${colors.red(`${errors.length} syntax errors`)}`
					);
					// Show first few errors
					errors.slice(0, 3).forEach((error) => {
						console.log(
							`      - Line ${error.line}: ${error.message}`
						);
					});
				}
			}

			step.details = {
				totalFiles: modifiedFiles.length,
				validFiles: validFiles,
				totalSyntaxErrors: syntaxErrors,
			};
			step.status = syntaxErrors === 0 ? "completed" : "failed";

			console.log(`\n📊 Validation Summary:`);
			console.log(
				`   ✅ Valid files: ${colors.green(validFiles.toString())}/${
					modifiedFiles.length
				}`
			);
			console.log(
				`   ❌ Syntax errors: ${colors.red(syntaxErrors.toString())}`
			);

			if (syntaxErrors === 0) {
				console.log(colors.green("🎉 All files passed validation!"));
			}
		} catch (error) {
			step.status = "failed";
			throw new Error(`Validation failed: ${error.message}`);
		}
	}

	private buildCoordinationContext(executionPlan: any[]): any {
		const context = {
			fileStrategy:
				this.executionPlan[0]?.details?.fileStrategy || "single-file",
			allFiles: executionPlan.map((item) => item.file),
			coordination: {},
		};

		// Build coordination map
		executionPlan.forEach((item) => {
			if (item.coordination) {
				context.coordination[item.file] = item.coordination;
			}
		});

		return context;
	}

	private async executeFileChange(
		change: any,
		coordinationContext: any
	): Promise<string> {
		const filePath = path.resolve(this.projectRoot, change.file);

		// Build context for AI (handle empty context gracefully)
		let contextStr = "";
		if (this.fileContexts.size > 0) {
			contextStr = Array.from(this.fileContexts.entries())
				.map(([file, context]) => `=== ${file} ===\n${context.content}`)
				.join("\n\n");
		} else {
			contextStr =
				"// No existing project context - creating standalone file";
		}

		// Enhanced prompt with coordination information
		const filePrompt = `You are implementing a file change as part of a systematic coding task.

ORIGINAL REQUEST: "${this.userRequest}"

CHANGE DETAILS:
- File: ${change.file}
- Action: ${change.action}
- Purpose: ${change.purpose}
- Dependencies: ${change.dependencies?.join(", ") || "None"}

FILE COORDINATION STRATEGY: ${coordinationContext.fileStrategy}
${
	coordinationContext.fileStrategy === "multi-file"
		? `
COORDINATION REQUIREMENTS:
- All files being created: ${coordinationContext.allFiles.join(", ")}
- This file coordination: ${
				coordinationContext.coordination[change.file] ||
				"None specified"
		  }

CRITICAL MULTI-FILE RULES:
- If creating HTML + CSS: HTML MUST include <link rel="stylesheet" href="filename.css">
- CSS class names MUST exactly match HTML class names
- If creating multiple JS/TS files: imports/exports must be correct
- File names must be consistent across references
`
		: `
SINGLE-FILE STRATEGY:
- Create ONE complete, self-contained file
- Embed CSS in <style> tags for HTML files
- Include all necessary code in this single file
`
}

CURRENT PROJECT CONTEXT:
${contextStr}

EXISTING FILE CONTENT (if modifying):
${
	fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf-8")
		: "// File does not exist - will be created"
}

CRITICAL OUTPUT REQUIREMENTS:
- Respond with ONLY the raw file content
- NO JSON wrapping like {"content": "..."} 
- NO markdown code blocks like \`\`\`html
- NO explanatory text before or after
- Start directly with the file content
- For HTML: Start with <!DOCTYPE html>
- For CSS: Start with the first CSS rule
- For JS/TS: Start with imports or first line of code

Generate the COMPLETE file content for ${change.file}:`;

		const response = await this.anthropicService.generateCodeEdits(
			filePrompt
		);
		const cleanContent = this.cleanGeneratedContent(response);

		// Ensure directory exists
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		// Write the complete file
		fs.writeFileSync(filePath, cleanContent);

		return `${change.action === "create" ? "Created" : "Modified"} ${
			change.file
		}`;
	}

	// Helper methods
	private findProjectEntryPoints(): string[] {
		const candidates = [
			// TypeScript/Node.js entry points
			"src/main.ts",
			"src/app.module.ts",
			"src/index.ts",
			"src/app.ts",
			"main.ts",
			"index.ts",
			"app.ts",
			"server.ts",
			// JavaScript entry points
			"src/index.js",
			"src/app.js",
			"index.js",
			"app.js",
			"server.js",
			// Frontend entry points
			"src/main.jsx",
			"src/App.jsx",
			"src/main.tsx",
			"src/App.tsx",
			// Configuration files that can provide insight
			"package.json",
			"tsconfig.json",
		];

		const foundFiles = candidates
			.map((file) => path.resolve(this.projectRoot, file))
			.filter((file) => fs.existsSync(file))
			.map((file) => path.relative(this.projectRoot, file));

		// If we found actual entry point files, prioritize them
		const actualEntryPoints = foundFiles.filter(
			(file) =>
				!file.endsWith(".json") &&
				(file.includes("main") ||
					file.includes("index") ||
					file.includes("app"))
		);

		if (actualEntryPoints.length > 0) {
			return actualEntryPoints;
		}

		// If no entry points found, look for any TypeScript/JavaScript files
		const anyTsJsFiles = this.findAnySourceFiles();
		if (anyTsJsFiles.length > 0) {
			return anyTsJsFiles.slice(0, 3); // Return first 3 as potential entry points
		}

		return foundFiles; // Return config files if that's all we have
	}

	private findAnySourceFiles(): string[] {
		const files: string[] = [];
		const extensions = [".ts", ".tsx", ".js", ".jsx"];

		const scanDir = (dir: string, depth: number = 0) => {
			if (depth > 2 || !fs.existsSync(dir)) return; // Limit search depth

			const items = fs.readdirSync(dir);
			for (const item of items) {
				const fullPath = path.join(dir, item);
				const stat = fs.statSync(fullPath);

				if (
					stat.isDirectory() &&
					!item.startsWith(".") &&
					!["node_modules", "dist", "build", "coverage"].includes(
						item
					)
				) {
					scanDir(fullPath, depth + 1);
				} else if (extensions.some((ext) => item.endsWith(ext))) {
					files.push(path.relative(this.projectRoot, fullPath));
					if (files.length >= 5) return; // Limit to first 5 files found
				}
			}
		};

		scanDir(this.projectRoot);
		return files;
	}

	private async runDependencyTree(
		filePath: string,
		format: string
	): Promise<string> {
		return new Promise((resolve, reject) => {
			const args = [
				path.join(__dirname, "dependancy-tree.js"),
				filePath,
				"--format",
				format,
				"--root",
				this.projectRoot,
			];

			const child = spawn("node", args, { cwd: this.projectRoot });
			let output = "";
			let error = "";

			child.stdout.on("data", (data) => {
				output += data.toString();
			});

			child.stderr.on("data", (data) => {
				error += data.toString();
			});

			child.on("close", (code) => {
				if (code === 0) {
					resolve(output);
				} else {
					reject(new Error(`Dependency tree failed: ${error}`));
				}
			});
		});
	}

	private extractFileNamesFromTreeOutput(treeOutput: string): string[] {
		const lines = treeOutput.split("\n");
		const fileNames: string[] = [];

		for (const line of lines) {
			// Look for lines that contain file paths (simple pattern matching)
			if (
				line.includes(".ts") ||
				line.includes(".js") ||
				line.includes(".json")
			) {
				const match = line.match(/([^\s]+\.(ts|js|json|tsx|jsx))/);
				if (match && match[1]) {
					const fileName = match[1].replace(/^[├└│\s\-]+/, "");
					if (!fileNames.includes(fileName)) {
						fileNames.push(fileName);
					}
				}
			}
		}

		return fileNames;
	}

	private extractContentFromOutput(output: string, fileName: string): string {
		// Extract content from dependency-tree.js --format content output
		const sections = output.split("===");
		for (const section of sections) {
			if (section.includes(fileName)) {
				// Extract content between code blocks
				const codeBlockMatch = section.match(
					/```[\w]*\n([\s\S]*?)\n```/
				);
				if (codeBlockMatch && codeBlockMatch[1]) {
					return codeBlockMatch[1];
				}
			}
		}

		// Fallback: read file directly
		const filePath = path.resolve(this.projectRoot, fileName);
		if (fs.existsSync(filePath)) {
			return fs.readFileSync(filePath, "utf-8");
		}

		return "";
	}

	private cleanGeneratedContent(response: string): string {
		if (this.debug) {
			console.log(
				colors.cyan("🔧 [DEBUG] Cleaning generated content...")
			);
			console.log(
				colors.gray(
					`  Response preview: ${response.substring(0, 100)}...`
				)
			);
		}

		let content = response.trim();

		// First, try to extract content from JSON response (but this should be rare now)
		try {
			const jsonMatch = content.match(/^\s*\{[\s\S]*\}\s*$/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);

				// Check for common content fields
				const contentFields = [
					"content",
					"fileContent",
					"code",
					"implementation",
				];
				for (const field of contentFields) {
					if (parsed[field] && typeof parsed[field] === "string") {
						if (this.debug) {
							console.log(
								colors.gray(
									`  ✅ Extracted content from JSON.${field} field`
								)
							);
						}
						return this.unescapeContent(parsed[field]);
					}
				}
			}
		} catch (error) {
			if (this.debug) {
				console.log(
					colors.gray(
						"  ⚠️  Not a JSON response, treating as raw content..."
					)
				);
			}
		}

		// Remove markdown code blocks if present
		content = content.replace(/```[\w]*\n?/g, "").replace(/```\n?/g, "");

		// Look for HTML content patterns
		if (content.includes("<!DOCTYPE html>") || content.includes("<html")) {
			const htmlMatch = content.match(
				/(<!DOCTYPE html>[\s\S]*?<\/html>)/i
			);
			if (htmlMatch) {
				if (this.debug) {
					console.log(
						colors.gray("  ✅ Extracted complete HTML document")
					);
				}
				return htmlMatch[1].trim();
			}
		}

		// Look for CSS content patterns
		if (
			content.includes("{") &&
			content.includes("}") &&
			(content.includes("margin") ||
				content.includes("padding") ||
				content.includes("color"))
		) {
			// This looks like CSS content
			const lines = content.split("\n");
			let startIndex = 0;
			let endIndex = lines.length - 1;

			// Find first line with CSS
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim();
				if (
					line.includes("{") ||
					line.includes(":") ||
					line.match(/^[a-zA-Z.*#].*\{?\s*$/)
				) {
					startIndex = i;
					break;
				}
			}

			// Find last line with CSS
			for (let i = lines.length - 1; i >= 0; i--) {
				const line = lines[i].trim();
				if (line.includes("}") || line.includes(";")) {
					endIndex = i;
					break;
				}
			}

			const extractedContent = lines
				.slice(startIndex, endIndex + 1)
				.join("\n")
				.trim();

			if (this.debug) {
				console.log(
					colors.gray(
						`  ✅ Extracted CSS content (${extractedContent.length} chars)`
					)
				);
			}

			return extractedContent;
		}

		// For other content, remove explanatory text around actual code
		const lines = content.split("\n");
		let startIndex = 0;
		let endIndex = lines.length - 1;

		// Find the first line that looks like actual code content
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();

			// Skip empty lines and common explanatory patterns
			if (
				!line ||
				line.toLowerCase().includes("here") ||
				line.toLowerCase().includes("this") ||
				line.toLowerCase().includes("below") ||
				line.toLowerCase().startsWith("note:") ||
				line.toLowerCase().startsWith("the ")
			) {
				continue;
			}

			// Code patterns
			if (
				line.startsWith("//") ||
				line.startsWith("/*") ||
				line.startsWith("import") ||
				line.startsWith("export") ||
				line.startsWith("const") ||
				line.startsWith("let") ||
				line.startsWith("var") ||
				line.startsWith("class") ||
				line.startsWith("interface") ||
				line.startsWith("function") ||
				line.startsWith("<!DOCTYPE") ||
				line.startsWith("<html") ||
				line.startsWith("<head")
			) {
				startIndex = i;
				break;
			}
		}

		// Find the last line that looks like actual content
		for (let i = lines.length - 1; i >= 0; i--) {
			const line = lines[i].trim();

			if (
				line === "" ||
				line.toLowerCase().includes("note:") ||
				line.toLowerCase().includes("remember") ||
				line.toLowerCase().includes("this will") ||
				line.toLowerCase().includes("make sure")
			) {
				continue;
			}

			endIndex = i;
			break;
		}

		const extractedContent = lines
			.slice(startIndex, endIndex + 1)
			.join("\n")
			.trim();

		if (this.debug) {
			console.log(
				colors.gray(
					`  ✅ Extracted content (${extractedContent.length} chars)`
				)
			);
			console.log(
				colors.gray(`  First line: ${extractedContent.split("\n")[0]}`)
			);
		}

		return extractedContent;
	}

	private cleanJsonResponse(response: string): string {
		// Remove markdown code blocks if present
		let cleaned = response
			.replace(/```json\s*/g, "")
			.replace(/```\s*/g, "");

		// Find JSON boundaries
		const jsonStart = Math.min(
			cleaned.indexOf("{") === -1 ? Infinity : cleaned.indexOf("{"),
			cleaned.indexOf("[") === -1 ? Infinity : cleaned.indexOf("[")
		);

		if (jsonStart !== Infinity && jsonStart > 0) {
			cleaned = cleaned.substring(jsonStart);
		}

		const lastBrace = cleaned.lastIndexOf("}");
		const lastBracket = cleaned.lastIndexOf("]");
		const jsonEnd = Math.max(lastBrace, lastBracket);

		if (jsonEnd !== -1 && jsonEnd < cleaned.length - 1) {
			cleaned = cleaned.substring(0, jsonEnd + 1);
		}

		// Remove trailing commas
		cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

		return cleaned.trim();
	}

	private unescapeContent(content: string): string {
		if (typeof content !== "string") return "";

		// Unescape common JSON escape sequences
		return content
			.replace(/\\n/g, "\n")
			.replace(/\\r/g, "\r")
			.replace(/\\t/g, "\t")
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");
	}

	private getModifiedFiles(): string[] {
		const executionResults =
			this.executionPlan.find((step) => step.phase === "execute")?.details
				?.results || [];
		return executionResults
			.filter((result: any) => result.status === "success")
			.map((result: any) => result.file);
	}

	private generateExecutionSummary(): string {
		const completed = this.executionPlan.filter(
			(step) => step.status === "completed"
		).length;
		const failed = this.executionPlan.filter(
			(step) => step.status === "failed"
		).length;
		const total = this.executionPlan.length;

		return `Execution Summary: ${completed}/${total} phases completed successfully. ${failed} phases failed.`;
	}

	private async pause(message: string): Promise<void> {
		console.log(colors.gray(`\n⏸️  ${message}`));
		console.log(
			colors.gray("⏳ Pausing for 5 seconds to let you catch up...")
		);

		// 5 second pause
		await new Promise((resolve) => setTimeout(resolve, 5000));

		console.log(colors.gray("▶️  Continuing...\n"));
	}

	private isStandaloneFileCreation(executionPlan: any): boolean {
		if (!executionPlan) return false;

		// Check the fileStrategy first
		if (executionPlan.fileStrategy === "single-file") {
			return true;
		}

		// Legacy check for backward compatibility
		const filesToCreate = executionPlan.likelyFilesToCreate || [];
		const filesToModify = executionPlan.likelyFilesToModify || [];
		const contextFilesNeeded = executionPlan.contextFilesNeeded || [];

		// If we're only creating files and need no context, it's standalone
		const isCreationOnly =
			filesToCreate.length > 0 && filesToModify.length === 0;
		const needsNoContext = contextFilesNeeded.length === 0;

		// Check if the files are simple standalone types
		const standaloneExtensions = [
			".html",
			".css",
			".js",
			".md",
			".txt",
			".json",
		];
		const isStandaloneType = filesToCreate.some((file: string) =>
			standaloneExtensions.some((ext) => file.toLowerCase().endsWith(ext))
		);

		return isCreationOnly && needsNoContext && isStandaloneType;
	}
}
