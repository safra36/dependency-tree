// path: robust-ai-agent.ts

import { AnthropicService } from "anthropic-service";
import colors from "colors";
import { ConfigManager } from "config-manager";
import { FileOperationsManager } from "file-operations-manager";
import * as fs from "fs";
import { SyntaxChecker } from "old/syntax-checker";
import * as path from "path";
import { ShellExecutor } from "shell-executor";
import { XMLContentParser } from "xml-content-parser";


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

			// Execute the planned actions
			const results = await this.executeActions(analysis.actions);

			return {
				success: results.every((r) => r.success),
				summary: this.generateSummary(results),
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
			const result = await this.shellExecutor.executeCommand(command);

			return {
				success: result.success,
				summary: result.success
					? `Executed: ${command}`
					: `Failed: ${command}`,
				stdout: result.stdout,
				stderr: result.stderr,
				error: result.success ? undefined : result.stderr,
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
		actions: Array<{
			type: "create" | "modify" | "delete" | "execute";
			target: string;
			description: string;
			priority: number;
		}>;
	}> {
		const prompt = `Analyze this user request and determine what actions need to be taken.

<context>
<request>${request}</request>
<projectStructure>
${this.context.structure.join("\n")}
</projectStructure>
<currentErrors>
${this.context.errors
	.map((e) => `${e.file}:${e.line} - ${e.message}`)
	.join("\n")}
</currentErrors>
</context>

<instructions>
Analyze the request and determine what file operations and commands are needed.
Consider the current project structure and any existing errors.
Plan actions in logical order with priorities.

Respond with your analysis enclosed in XML tags:
</instructions>

<analysis>
[Your analysis of what needs to be done]
</analysis>

<actions>
<action type="create|modify|delete|execute" target="filename or command" priority="1-10">
[Description of what this action accomplishes]
</action>
</actions>`;

		try {
			const response = await this.anthropicService.generateCodeEdits(
				prompt
			);
			const analysisResult = this.xmlParser.parseResponse(response, [
				"analysis",
				"actions",
			]);

			if (!analysisResult.success) {
				return { success: false, actions: [] };
			}

			const actions = this.parseActionsFromXML(
				analysisResult.content.actions || ""
			);

			return {
				success: true,
				actions: actions.sort((a, b) => a.priority - b.priority),
			};
		} catch (error) {
			if (this.debug) {
				console.log(`Analysis failed: ${error.message}`);
			}
			return { success: false, actions: [] };
		}
	}

	private async generateFileContent(
		filename: string,
		description: string
	): Promise<string> {
		const fileType = path.extname(filename).slice(1) || "text";

		const prompt = `Generate content for a new file based on this description.

<context>
<filename>${filename}</filename>
<fileType>${fileType}</fileType>
<description>${description}</description>
<projectStructure>
${this.context.structure.join("\n")}
</projectStructure>
</context>

<instructions>
Create complete, production-ready content for this file.
Follow best practices for the file type.
Include proper imports, types, and error handling where appropriate.
Make the code complete and functional.

Provide only the file content within the content tags:
</instructions>

<content>
[Complete file content here]
</content>`;

		const response = await this.anthropicService.generateCodeEdits(prompt);
		const result = this.xmlParser.parseResponse(response, ["content"]);

		if (!result.success || !result.content.content) {
			throw new Error("Failed to generate file content");
		}

		return result.content.content.trim();
	}

	private async generateFileModification(
		filename: string,
		currentContent: string,
		description: string
	): Promise<string> {
		const fileType = path.extname(filename).slice(1) || "text";

		const prompt = `Modify the existing file content based on the description.

<context>
<filename>${filename}</filename>
<fileType>${fileType}</fileType>
<description>${description}</description>
<currentContent>
${currentContent}
</currentContent>
</context>

<instructions>
Modify the file content according to the description.
Preserve existing functionality unless specifically asked to change it.
Follow best practices and maintain code quality.
Ensure the modified code is complete and functional.

Provide the complete modified file content:
</instructions>

<content>
[Complete modified file content here]
</content>`;

		const response = await this.anthropicService.generateCodeEdits(prompt);
		const result = this.xmlParser.parseResponse(response, ["content"]);

		if (!result.success || !result.content.content) {
			throw new Error("Failed to generate file modifications");
		}

		return result.content.content.trim();
	}

	private async executeActions(
		actions: Array<{
			type: "create" | "modify" | "delete" | "execute";
			target: string;
			description: string;
			priority: number;
		}>
	): Promise<OperationResult[]> {
		const results: OperationResult[] = [];

		for (const action of actions) {
			if (this.debug) {
				console.log(`Executing: ${action.type} ${action.target}`);
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
					result = await this.executeShellCommand(action.target);
					break;
				default:
					result = {
						success: false,
						error: `Unknown action type: ${action.type}`,
					};
			}

			results.push(result);

			// Stop on critical failures
			if (!result.success && action.priority <= 3) {
				break;
			}
		}

		return results;
	}

	private parseActionsFromXML(actionsXML: string): Array<{
		type: "create" | "modify" | "delete" | "execute";
		target: string;
		description: string;
		priority: number;
	}> {
		const actions: any[] = [];

		// Simple XML parsing for actions
		const actionRegex =
			/<action\s+type="([^"]+)"\s+target="([^"]+)"\s+priority="(\d+)"[^>]*>(.*?)<\/action>/gs;
		let match;

		while ((match = actionRegex.exec(actionsXML)) !== null) {
			actions.push({
				type: match[1] as any,
				target: match[2],
				priority: parseInt(match[3]),
				description: match[4].trim(),
			});
		}

		return actions;
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
}
