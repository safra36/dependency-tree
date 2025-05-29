// path: robust-ai-agent.ts

import * as fs from "fs";
import * as path from "path";
import { AnthropicService } from "./anthropic-service";
import { ConfigManager } from "./config-manager";
import { XMLContentParser } from "./xml-content-parser";
import { FileOperationsManager } from "./file-operations-manager";
import { ShellExecutor } from "./shell-executor";
import colors from "./colors";
import { SyntaxChecker } from "./syntax-checker";
import { XMLPromptTemplates } from "./xml-prompt-templates";

interface AgentOptions {
	debug?: boolean;
	maxTokens?: number;
	temperature?: number;
}

interface OperationResult {
	success: boolean;
	summary?: string;
	details?: string[];
	changes?: string[];
	errors?: any[];
	error?: string;
	stdout?: string;
	stderr?: string;
}

interface ProjectContext {
	files: Map<string, string>;
	structure: string[];
	dependencies: string[];
	errors: any[];
}

interface ParsedAction {
	type: "create" | "modify" | "delete" | "execute";
	target: string;
	description: string;
	priority: number;
	command?: string;
}

export class RobustAIAgent {
	private anthropicService: AnthropicService;
	private xmlParser: XMLContentParser;
	private fileManager: FileOperationsManager;
	private shellExecutor: ShellExecutor;
	private syntaxChecker: SyntaxChecker;

	private projectRoot: string;
	private debug: boolean;
	private context: ProjectContext;

	constructor(projectRoot: string, options: AgentOptions = {}) {
		this.projectRoot = path.resolve(projectRoot);
		this.debug = options.debug || false;

		const configManager = ConfigManager.createFromEnv();
		const apiKey = configManager.getAnthropicApiKey();

		if (!apiKey) {
			throw new Error("Anthropic API key is required");
		}

		this.anthropicService = new AnthropicService({
			apiKey,
			model: configManager.getModel(),
			maxTokens: options.maxTokens || configManager.getMaxTokens(),
			temperature: options.temperature || configManager.getTemperature(),
			debug: this.debug,
		});

		this.xmlParser = new XMLContentParser({ debug: this.debug });
		this.fileManager = new FileOperationsManager(this.projectRoot, {
			debug: this.debug,
		});
		this.shellExecutor = new ShellExecutor(this.projectRoot, {
			debug: this.debug,
		});
		this.syntaxChecker = new SyntaxChecker(this.projectRoot, this.debug);

		this.context = {
			files: new Map(),
			structure: [],
			dependencies: [],
			errors: [],
		};

		if (this.debug) {
			console.log(colors.cyan("🤖 RobustAIAgent initialized"));
		}
	}

	async initialize(): Promise<void> {
		console.log("🔄 Initializing agent...");

		// Test AI connection
		const connected = await this.anthropicService.testConnection();
		if (!connected) {
			throw new Error("Failed to connect to AI service");
		}

		// Scan project structure
		await this.scanProjectStructure();

		// Check for initial syntax errors
		const errors = await this.syntaxChecker.checkProject();
		this.context.errors = errors;

		if (this.debug) {
			console.log(`📁 Found ${this.context.structure.length} files`);
			console.log(`❌ Found ${errors.length} syntax errors`);
		}
	}

	async processRequest(request: string): Promise<OperationResult> {
		try {
			// Analyze the request to determine actions needed
			const analysis = await this.analyzeRequest(request);

			if (!analysis.success) {
				return { success: false, error: "Failed to analyze request" };
			}

			if (this.debug) {
				console.log(
					colors.cyan(
						`🔍 Parsed ${analysis.actions.length} actions to execute`
					)
				);
				analysis.actions.forEach((action, i) => {
					console.log(
						colors.gray(
							`  ${i + 1}. ${action.type}: ${
								action.target
							} (priority: ${action.priority})`
						)
					);
				});
			}

			// Execute the planned actions
			const results = await this.executeActions(analysis.actions);

			const successCount = results.filter((r) => r.success).length;
			const totalCount = results.length;

			return {
				success: successCount > 0,
				summary: `Completed ${successCount}/${totalCount} operations`,
				details: results.map(
					(r) => r.summary || r.error || "Unknown result"
				),
				changes: results.flatMap((r) => r.changes || []),
				errors: results.filter((r) => !r.success).map((r) => r.error),
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	async createFile(
		filename: string,
		description: string
	): Promise<OperationResult> {
		try {
			const filePath = path.resolve(this.projectRoot, filename);

			if (fs.existsSync(filePath)) {
				return {
					success: false,
					error: `File ${filename} already exists`,
				};
			}

			// Generate file content using AI
			const content = await this.generateFileContent(
				filename,
				description
			);

			// Create the file
			const result = await this.fileManager.createFile(filename, content);

			if (result.success) {
				// Update context
				this.context.files.set(filename, content);
				this.context.structure.push(filename);

				return {
					success: true,
					summary: `Created ${filename}`,
					details: [
						`Generated ${content.length} characters of content`,
					],
				};
			}

			return result;
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	async modifyFile(
		filename: string,
		description: string
	): Promise<OperationResult> {
		try {
			const filePath = path.resolve(this.projectRoot, filename);

			if (!fs.existsSync(filePath)) {
				return {
					success: false,
					error: `File ${filename} does not exist`,
				};
			}

			const currentContent = fs.readFileSync(filePath, "utf-8");

			// Generate modifications using AI
			const newContent = await this.generateFileModification(
				filename,
				currentContent,
				description
			);

			// Apply modifications
			const result = await this.fileManager.modifyFile(
				filename,
				newContent
			);

			if (result.success) {
				// Update context
				this.context.files.set(filename, newContent);

				return {
					success: true,
					summary: `Modified ${filename}`,
					details: [
						`Changed from ${currentContent.length} to ${newContent.length} characters`,
						`Modification: ${description}`,
					],
				};
			}

			return result;
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	async deleteFile(filename: string): Promise<OperationResult> {
		try {
			const result = await this.fileManager.deleteFile(filename);

			if (result.success) {
				// Update context
				this.context.files.delete(filename);
				this.context.structure = this.context.structure.filter(
					(f) => f !== filename
				);

				return {
					success: true,
					summary: `Deleted ${filename}`,
				};
			}

			return result;
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	async executeShellCommand(command: string): Promise<OperationResult> {
		try {
			if (this.debug) {
				console.log(
					colors.cyan(`🔧 Executing shell command: ${command}`)
				);
			}

			const result = await this.shellExecutor.executeCommand(command);

			return {
				success: result.success,
				summary: result.success
					? `Executed: ${command}`
					: `Failed: ${command}`,
				stdout: result.stdout,
				stderr: result.stderr,
				error: result.success
					? undefined
					: result.stderr ||
					  `Command failed with exit code ${result.exitCode}`,
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	async checkTypes(): Promise<OperationResult> {
		try {
			const errors = await this.syntaxChecker.checkProject();
			this.context.errors = errors;

			return {
				success: errors.length === 0,
				summary:
					errors.length === 0
						? "No type errors found"
						: `Found ${errors.length} type errors`,
				errors: errors,
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	async testConnection(): Promise<boolean> {
		return await this.anthropicService.testConnection();
	}

	setDebug(debug: boolean): void {
		this.debug = debug;
		this.anthropicService.setDebug?.(debug);
	}

	private async analyzeRequest(request: string): Promise<{
		success: boolean;
		actions: ParsedAction[];
	}> {
		try {
			const template = XMLPromptTemplates.getTemplate("request-analysis");
			const context = {
				userRequest: request,
				projectRoot: this.projectRoot,
				existingFiles: this.context.structure.join("\n"),
				currentErrors: this.context.errors
					.map((e) => `${e.file}:${e.line} - ${e.message}`)
					.join("\n"),
				projectType: await this.detectProjectType(),
			};

			const processedPrompt = XMLPromptTemplates.processTemplate(
				template,
				context
			);
			const expectedTags =
				XMLPromptTemplates.getExpectedResponseTags("request-analysis");

			const response = await this.anthropicService.generateWithXMLPrompt(
				processedPrompt,
				context,
				expectedTags
			);

			const analysisResult = this.xmlParser.parseResponse(
				response,
				expectedTags
			);

			if (!analysisResult.success) {
				if (this.debug) {
					console.log(colors.red("❌ Failed to parse XML response"));
					console.log(colors.gray("Response content:"));
					console.log(response);
				}
				return { success: false, actions: [] };
			}

			// Extract actions from the parsed response
			const actions = this.parseActionsFromAnalysis(
				analysisResult.content.actions || "",
				analysisResult.content.analysis || ""
			);

			return {
				success: true,
				actions: actions.sort((a, b) => a.priority - b.priority),
			};
		} catch (error) {
			if (this.debug) {
				console.log(colors.red(`❌ Analysis failed: ${error.message}`));
			}
			return { success: false, actions: [] };
		}
	}

	private parseActionsFromAnalysis(
		actionsText: string,
		analysisText: string
	): ParsedAction[] {
		const actions: ParsedAction[] = [];

		if (this.debug) {
			console.log(colors.cyan("🔍 Parsing actions from AI response"));
			console.log(colors.gray("Actions text:"));
			console.log(actionsText);
		}

		// Split actions by numbered list items or line breaks
		const actionLines = actionsText
			.split(/\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		let priority = 1;

		for (const line of actionLines) {
			// Skip empty lines and section headers
			if (!line || line.toLowerCase().includes("action")) {
				continue;
			}

			// Remove numbering and clean up the line
			const cleanLine = line.replace(/^\d+\.\s*/, "").trim();

			if (cleanLine.length === 0) {
				continue;
			}

			// Skip section headers (lines ending with colon but no command)
			if (cleanLine.endsWith(":") && !this.isActualCommand(cleanLine)) {
				continue;
			}

			// Skip bullet points that are just descriptions
			if (
				cleanLine.startsWith("- ") &&
				!this.isActualCommand(cleanLine)
			) {
				continue;
			}

			// Determine action type based on keywords
			let actionType: ParsedAction["type"] = "execute";
			let target = "";
			let description = cleanLine;
			let command = "";

			if (this.isShellCommand(cleanLine)) {
				actionType = "execute";
				command = cleanLine;
				target = command;
				description = `Execute: ${command}`;
			} else if (this.isFileCreation(cleanLine)) {
				actionType = "create";
				// Extract filename if possible
				const fileMatch = cleanLine.match(/(\S+\.\w+)/);
				target = fileMatch ? fileMatch[1] : "new-file";
				description = cleanLine;
			} else if (this.isFileModification(cleanLine)) {
				actionType = "modify";
				// Extract filename if possible
				const fileMatch = cleanLine.match(/(\S+\.\w+|\S+\.json)/);
				target = fileMatch ? fileMatch[1] : "existing-file";
				description = cleanLine;
			} else {
				// Skip non-actionable lines
				continue;
			}

			actions.push({
				type: actionType,
				target: target,
				description: description,
				priority: priority++,
				command: command || undefined,
			});

			if (this.debug) {
				console.log(
					colors.gray(
						`  Parsed: ${actionType} - ${target} (${description})`
					)
				);
			}
		}

		if (this.debug) {
			console.log(colors.green(`✅ Parsed ${actions.length} actions`));
		}

		return actions;
	}

	private isActualCommand(line: string): boolean {
		const commandKeywords = [
			"npm",
			"yarn",
			"pnpm",
			"bun",
			"git",
			"node",
			"npx",
			"nest",
			"mkdir",
			"touch",
			"cd",
			"ls",
			"pwd",
			"echo",
			"cp",
			"mv",
		];

		return commandKeywords.some(
			(cmd) =>
				line.toLowerCase().includes(cmd + " ") ||
				line.toLowerCase().startsWith(cmd + " ") ||
				line.toLowerCase() === cmd
		);
	}

	private isShellCommand(line: string): boolean {
		const shellCommands = [
			"npm",
			"yarn",
			"pnpm",
			"bun",
			"git",
			"node",
			"npx",
			"nest",
			"mkdir",
			"touch",
			"cd",
			"ls",
			"pwd",
			"echo",
			"cp",
			"mv",
		];

		return shellCommands.some(
			(cmd) =>
				line.toLowerCase().startsWith(cmd + " ") ||
				line.toLowerCase() === cmd
		);
	}

	private isFileCreation(line: string): boolean {
		const creationKeywords = ["create", "touch", "new"];
		const hasCreationKeyword = creationKeywords.some((keyword) =>
			line.toLowerCase().includes(keyword)
		);

		// Check if it mentions a file with extension
		const hasFileExtension = /\S+\.\w+/.test(line);

		return (
			hasCreationKeyword && hasFileExtension && !this.isShellCommand(line)
		);
	}

	private isFileModification(line: string): boolean {
		const modificationKeywords = ["update", "modify", "configure", "edit"];
		const hasModificationKeyword = modificationKeywords.some((keyword) =>
			line.toLowerCase().includes(keyword)
		);

		// Check if it mentions a file with extension
		const hasFileExtension = /\S+\.\w+/.test(line);

		return (
			hasModificationKeyword &&
			hasFileExtension &&
			!this.isShellCommand(line)
		);
	}

	private async generateFileContent(
		filename: string,
		description: string
	): Promise<string> {
		const fileType = path.extname(filename).slice(1) || "text";

		try {
			const template = XMLPromptTemplates.getTemplate("file-creation");
			const context = {
				fileName: filename,
				fileType: fileType,
				fileExtension: path.extname(filename),
				targetDirectory: path.dirname(filename),
				filePurpose: description,
				requiredFunctionality: description,
				fileDependencies: "To be determined based on requirements",
				integrationPoints:
					"Integration with existing project structure",
				projectStructure: this.context.structure.join("\n"),
				existingPatterns: await this.getExistingPatterns(),
				codingStandards: await this.getCodingStandards(),
				frameworkConventions: await this.getFrameworkConventions(),
			};

			const processedPrompt = XMLPromptTemplates.processTemplate(
				template,
				context
			);
			const expectedTags =
				XMLPromptTemplates.getExpectedResponseTags("file-creation");

			const response = await this.anthropicService.generateWithXMLPrompt(
				processedPrompt,
				context,
				expectedTags
			);

			const result = this.xmlParser.parseResponse(response, expectedTags);

			if (!result.success || !result.content.content) {
				throw new Error("Failed to generate file content");
			}

			return result.content.content.trim();
		} catch (error) {
			if (this.debug) {
				console.log(`File content generation failed: ${error.message}`);
			}
			throw error;
		}
	}

	private async generateFileModification(
		filename: string,
		currentContent: string,
		description: string
	): Promise<string> {
		const fileType = path.extname(filename).slice(1) || "text";

		try {
			const template =
				XMLPromptTemplates.getTemplate("file-modification");
			const context = {
				fileName: filename,
				fileType: fileType,
				currentContent: currentContent,
				fileSize: currentContent.length.toString(),
				modificationDescription: description,
				specificChanges: description,
				preserveFunctionality:
					"Preserve all existing functionality unless explicitly asked to change",
				affectedSections:
					"To be determined based on the modification request",
				existingFunctions: this.extractFunctionNames(currentContent),
				currentImports: this.extractImports(currentContent),
				existingTypes: this.extractTypes(currentContent),
				fileDependencies: "Current file dependencies",
			};

			const processedPrompt = XMLPromptTemplates.processTemplate(
				template,
				context
			);
			const expectedTags =
				XMLPromptTemplates.getExpectedResponseTags("file-modification");

			const response = await this.anthropicService.generateWithXMLPrompt(
				processedPrompt,
				context,
				expectedTags
			);

			const result = this.xmlParser.parseResponse(response, expectedTags);

			if (!result.success || !result.content.content) {
				throw new Error("Failed to generate file modifications");
			}

			return result.content.content.trim();
		} catch (error) {
			if (this.debug) {
				console.log(
					`File modification generation failed: ${error.message}`
				);
			}
			throw error;
		}
	}

	private async executeActions(
		actions: ParsedAction[]
	): Promise<OperationResult[]> {
		const results: OperationResult[] = [];
		let currentWorkingDir = this.projectRoot; // Track the current working directory

		for (const action of actions) {
			if (this.debug) {
				console.log(
					colors.cyan(`🔧 Executing: ${action.type} ${action.target}`)
				);
			}

			let result: OperationResult;

			switch (action.type) {
				case "create":
					result = await this.createFile(
						action.target,
						action.description
					);
					break;
				case "modify":
					result = await this.modifyFile(
						action.target,
						action.description
					);
					break;
				case "delete":
					result = await this.deleteFile(action.target);
					break;
				case "execute":
					// Use the command if available, otherwise use target
					const commandToExecute = action.command || action.target;

					// Update working directory context if this is a cd command
					if (commandToExecute.startsWith("cd ")) {
						const targetDir = commandToExecute.substring(3).trim();
						const newWorkingDir = path.resolve(
							currentWorkingDir,
							targetDir
						);

						// Validate the directory exists or will be created
						if (
							fs.existsSync(newWorkingDir) ||
							targetDir.includes("agent-watch")
						) {
							currentWorkingDir = newWorkingDir;
							if (this.debug) {
								console.log(
									colors.yellow(
										`📁 Working directory changed to: ${currentWorkingDir}`
									)
								);
							}
						}
					}

					// Execute the command with the current working directory
					result = await this.executeShellCommandInDirectory(
						commandToExecute,
						currentWorkingDir
					);
					break;
				default:
					result = {
						success: false,
						error: `Unknown action type: ${action.type}`,
					};
			}

			results.push(result);

			if (this.debug) {
				if (result.success) {
					console.log(colors.green(`✅ ${result.summary}`));
					if (result.stdout) {
						console.log(
							colors.gray(
								`Output: ${result.stdout.substring(0, 200)}...`
							)
						);
					}
				} else {
					console.log(colors.red(`❌ ${result.error}`));
					if (result.stderr) {
						console.log(
							colors.red(
								`Error: ${result.stderr.substring(0, 200)}...`
							)
						);
					}
				}
			}

			// Continue with remaining actions even if one fails (unless it's critical)
			if (!result.success && action.priority <= 3) {
				if (this.debug) {
					console.log(
						colors.yellow(
							`⚠️ Critical action failed, continuing with remaining actions`
						)
					);
				}
			}
		}

		return results;
	}

	async executeShellCommandInDirectory(
		command: string,
		workingDir: string
	): Promise<OperationResult> {
		try {
			if (this.debug) {
				console.log(
					colors.cyan(
						`🔧 Executing shell command in ${workingDir}: ${command}`
					)
				);
			}

			// Create a new shell executor instance with the specific working directory
			const shellExecutor = new ShellExecutor(workingDir, {
				debug: this.debug,
			});

			const result = await shellExecutor.executeCommand(command);

			return {
				success: result.success,
				summary: result.success
					? `Executed: ${command}`
					: `Failed: ${command}`,
				stdout: result.stdout,
				stderr: result.stderr,
				error: result.success
					? undefined
					: result.stderr ||
					  `Command failed with exit code ${result.exitCode}`,
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	private async scanProjectStructure(): Promise<void> {
		try {
			const files = this.findSourceFiles(this.projectRoot);
			this.context.structure = files.map((f) =>
				path.relative(this.projectRoot, f)
			);

			// Load content for small files
			for (const file of files.slice(0, 10)) {
				// Limit to avoid overwhelming context
				try {
					const relativePath = path.relative(this.projectRoot, file);
					const content = fs.readFileSync(file, "utf-8");
					if (content.length < 10000) {
						// Only store small files
						this.context.files.set(relativePath, content);
					}
				} catch (error) {
					// Skip files that can't be read
				}
			}
		} catch (error) {
			if (this.debug) {
				console.log(`Project scan failed: ${error.message}`);
			}
		}
	}

	private findSourceFiles(dir: string): string[] {
		const files: string[] = [];
		const extensions = [
			".ts",
			".tsx",
			".js",
			".jsx",
			".json",
			".md",
			".html",
			".css",
		];

		if (!fs.existsSync(dir)) return files;

		const items = fs.readdirSync(dir);
		for (const item of items) {
			const fullPath = path.join(dir, item);
			const stat = fs.statSync(fullPath);

			if (stat.isDirectory() && !this.shouldSkipDirectory(item)) {
				files.push(...this.findSourceFiles(fullPath));
			} else if (
				stat.isFile() &&
				extensions.some((ext) => item.endsWith(ext))
			) {
				files.push(fullPath);
			}
		}

		return files;
	}

	private shouldSkipDirectory(name: string): boolean {
		const skipDirs = [
			"node_modules",
			".git",
			"dist",
			"build",
			"coverage",
			".next",
			".vscode",
		];
		return skipDirs.includes(name) || name.startsWith(".");
	}

	private generateSummary(results: OperationResult[]): string {
		const successful = results.filter((r) => r.success).length;
		const total = results.length;
		const failed = total - successful;

		if (failed === 0) {
			return `Successfully completed ${successful} operations`;
		} else {
			return `Completed ${successful}/${total} operations (${failed} failed)`;
		}
	}

	// Helper methods for code analysis and project understanding

	private async detectProjectType(): Promise<string> {
		try {
			const packageJsonPath = path.join(this.projectRoot, "package.json");
			if (fs.existsSync(packageJsonPath)) {
				const packageJson = JSON.parse(
					fs.readFileSync(packageJsonPath, "utf-8")
				);
				const dependencies = {
					...packageJson.dependencies,
					...packageJson.devDependencies,
				};

				if (dependencies.react) return "React";
				if (dependencies.vue) return "Vue";
				if (dependencies.angular) return "Angular";
				if (dependencies.next) return "Next.js";
				if (dependencies["@nestjs/core"]) return "NestJS";
				if (dependencies.express) return "Express";
				if (dependencies.svelte) return "Svelte";

				return "Node.js";
			}
			return "Unknown";
		} catch {
			return "Unknown";
		}
	}

	private async getExistingPatterns(): Promise<string> {
		// Analyze existing files to identify common patterns
		const patterns: string[] = [];

		for (const [filename, content] of this.context.files.entries()) {
			if (content.includes("export class"))
				patterns.push("Class-based exports");
			if (content.includes("export const"))
				patterns.push("Const exports");
			if (content.includes("import {")) patterns.push("Named imports");
			if (content.includes("async/await"))
				patterns.push("Async/await pattern");
			if (content.includes("@")) patterns.push("Decorator pattern");
		}

		return [...new Set(patterns)].join(", ");
	}

	private async getCodingStandards(): Promise<string> {
		// Check for common coding standard indicators
		const standards: string[] = [];

		const eslintConfig =
			fs.existsSync(path.join(this.projectRoot, ".eslintrc.js")) ||
			fs.existsSync(path.join(this.projectRoot, ".eslintrc.json"));
		if (eslintConfig) standards.push("ESLint");

		const prettierConfig = fs.existsSync(
			path.join(this.projectRoot, ".prettierrc")
		);
		if (prettierConfig) standards.push("Prettier");

		const tsconfigExists = fs.existsSync(
			path.join(this.projectRoot, "tsconfig.json")
		);
		if (tsconfigExists) standards.push("TypeScript strict mode");

		return standards.length > 0
			? standards.join(", ")
			: "Standard best practices";
	}

	private async getFrameworkConventions(): Promise<string> {
		const projectType = await this.detectProjectType();

		const conventions = {
			React: "Functional components, hooks, JSX",
			Vue: "Single file components, composition API",
			Angular:
				"Component-based architecture, services, dependency injection",
			"Next.js":
				"Pages directory, API routes, getStaticProps/getServerSideProps",
			NestJS: "Modules, controllers, services, decorators",
			Express: "Middleware pattern, route handlers",
			Svelte: "Single file components, reactive statements",
			"Node.js": "CommonJS/ES modules, npm scripts",
		};

		return (
			conventions[projectType] ||
			"Standard JavaScript/TypeScript conventions"
		);
	}

	private extractFunctionNames(content: string): string {
		const functionRegex =
			/(?:function|const|let|var)\s+(\w+)|(\w+)\s*(?:=|:)\s*(?:async\s+)?(?:function|\()/g;
		const matches = [...content.matchAll(functionRegex)];
		const functionNames = matches
			.map((match) => match[1] || match[2])
			.filter(Boolean);
		return [...new Set(functionNames)].join(", ");
	}

	private extractImports(content: string): string {
		const importRegex =
			/import\s+(?:{[^}]+}|[^{]+)\s+from\s+['"`]([^'"`]+)['"`]/g;
		const matches = [...content.matchAll(importRegex)];
		const imports = matches.map((match) => match[1]);
		return [...new Set(imports)].join(", ");
	}

	private extractTypes(content: string): string {
		const typeRegex = /(?:interface|type|class)\s+(\w+)/g;
		const matches = [...content.matchAll(typeRegex)];
		const types = matches.map((match) => match[1]);
		return [...new Set(types)].join(", ");
	}
}
