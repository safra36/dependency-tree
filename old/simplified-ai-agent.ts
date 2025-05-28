// path: simplified-ai-agent.ts

import * as fs from "fs";
import * as path from "path";
import { AnthropicService } from "../anthropic-service";
import { ConfigManager } from "../config-manager";
import { SeparatorContentParser } from "./separator-content-parser";
import colors from "../colors";

interface FileTask {
	file: string;
	action: "create" | "modify";
	description: string;
	expectedType:
		| "html"
		| "css"
		| "js"
		| "javascript"
		| "json"
		| "typescript"
		| "auto";
	reason?: string;
	relatedFiles?: string[];
}

interface ProcessResult {
	success: boolean;
	summary: string;
	changes: string[];
	errors: string[];
}

export class SimplifiedAIAgent {
	private anthropicService: AnthropicService;
	private separatorParser: SeparatorContentParser;
	private projectRoot: string;
	private debug: boolean;

	constructor(projectRoot: string, debug = false) {
		this.projectRoot = path.resolve(projectRoot);
		this.debug = debug;

		const configManager = ConfigManager.createFromEnv();
		const apiKey = configManager.getAnthropicApiKey();

		if (!apiKey) {
			throw new Error("Anthropic API key is required");
		}

		this.anthropicService = new AnthropicService({
			apiKey,
			model: configManager.getModel(),
			maxTokens: configManager.getMaxTokens(),
			temperature: configManager.getTemperature(),
			debug: this.debug,
		});

		// Initialize separator-based parser
		this.separatorParser = new SeparatorContentParser({
			debug: this.debug,
			fallbackToMarkdown: true,
		});

		if (this.debug) {
			console.log(
				colors.cyan(
					"🤖 SimplifiedAIAgent initialized with SeparatorParser"
				)
			);
			console.log(
				colors.gray(
					`  Available separators: ${Object.keys(
						this.separatorParser.getAvailableSeparators()
					).join(", ")}`
				)
			);
		}
	}

	async processRequest(userRequest: string): Promise<ProcessResult> {
		console.log(colors.blue(`\n🎯 Processing: ${userRequest}`));

		try {
			// Step 1: Analyze request and identify files (using separators)
			const tasks = await this.identifyTasks(userRequest);
			console.log(`📋 Identified ${tasks.length} tasks`);

			// Step 2: Execute tasks
			const changes: string[] = [];
			const errors: string[] = [];

			for (const task of tasks) {
				console.log(
					`\n📄 ${
						task.action === "create" ? "Creating" : "Modifying"
					}: ${task.file}`
				);

				try {
					const result = await this.executeTask(task, userRequest);
					changes.push(result);
					console.log(colors.green(`✅ ${result}`));
				} catch (error) {
					const errorMsg = `❌ ${task.file}: ${error.message}`;
					errors.push(errorMsg);
					console.log(colors.red(errorMsg));
				}
			}

			return {
				success: errors.length === 0,
				summary: `Completed ${changes.length}/${tasks.length} tasks`,
				changes,
				errors,
			};
		} catch (error) {
			return {
				success: false,
				summary: `Failed: ${error.message}`,
				changes: [],
				errors: [error.message],
			};
		}
	}

	private async identifyTasks(userRequest: string): Promise<FileTask[]> {
		// Check what files exist and analyze their relationships
		const existingFiles = this.scanExistingFiles();
		const fileRelationships = await this.analyzeFileRelationships(
			existingFiles
		);

		const prompt = `Analyze this request and identify ALL files that need to be created or modified, including interdependent updates.

USER REQUEST: "${userRequest}"

EXISTING FILES:
${
	existingFiles.length === 0
		? "No files found"
		: existingFiles.map((f) => `${f.path} (${f.type})`).join("\n")
}

FILE RELATIONSHIPS:
${fileRelationships}

PROJECT ROOT: ${this.projectRoot}

CRITICAL PLANNING RULES:
- When creating new pages, identify existing pages that need navigation updates
- When adding new sections, check if other files reference or link to them
- Consider both forward and backward relationships between files
- Plan modifications to maintain consistency across all related files

Please provide your analysis and then list the required tasks.

<tasks>
[
  {
    "file": "relative/path/to/file.ext",
    "action": "create" or "modify",
    "description": "What to do with this file",
    "expectedType": "html" or "css" or "js" or "json" or "typescript" or "auto",
    "reason": "Why this file needs to be changed",
    "relatedFiles": ["files that this change affects or depends on"]
  }
]
</tasks>

EXAMPLE: If creating "contact.html", also plan to modify "index.html" to add navigation link to contact page.`;

		const response = await this.anthropicService.generateCodeEdits(prompt);
		return this.parseTasksFromResponse(response);
	}

	private parseTasksFromResponse(response: string): FileTask[] {
		try {
			// Use separator parser to extract tasks
			const parseResult = this.separatorParser.parseForFile(
				"tasks.json",
				response
			);

			if (!parseResult.success) {
				throw new Error(
					`Failed to parse tasks: ${parseResult.errors.join(", ")}`
				);
			}

			const tasks = JSON.parse(parseResult.content);

			// Validate and normalize tasks
			return tasks
				.filter(
					(task: any) =>
						task.file &&
						task.action &&
						task.description &&
						task.expectedType
				)
				.map((task: any) => ({
					file: task.file,
					action: task.action,
					description: task.description,
					expectedType: task.expectedType,
					reason: task.reason || task.description,
					relatedFiles: task.relatedFiles || [],
				}));
		} catch (error) {
			console.log(
				colors.yellow("⚠️ Could not parse tasks, using fallback")
			);

			// Fallback: basic task detection
			return [
				{
					file: "index.html",
					action: "modify",
					description: "Fix HTML structure and content issues",
					expectedType: "html",
				},
			];
		}
	}

	private async analyzeFileRelationships(
		existingFiles: Array<{ path: string; type: string }>
	): Promise<string> {
		const relationships: string[] = [];

		for (const file of existingFiles) {
			if (file.type === "HTML page") {
				try {
					const filePath = path.join(this.projectRoot, file.path);
					const content = fs.readFileSync(filePath, "utf-8");

					// Find links to other files
					const links = this.extractLinksFromHtml(content);
					if (links.length > 0) {
						relationships.push(
							`${file.path} links to: ${links.join(", ")}`
						);
					}

					// Find navigation patterns
					const hasNav =
						content.includes("<nav") ||
						content.includes('class="nav');
					if (hasNav) {
						relationships.push(
							`${file.path} contains navigation elements`
						);
					}
				} catch (error) {
					// Skip if can't read file
				}
			}
		}

		return relationships.length > 0
			? relationships.join("\n")
			: "No significant relationships detected";
	}

	private extractLinksFromHtml(content: string): string[] {
		const links: string[] = [];
		const linkRegex = /href\s*=\s*["']([^"']*\.html)["']/gi;
		let match;

		while ((match = linkRegex.exec(content)) !== null) {
			const link = match[1];
			if (!link.startsWith("http") && !links.includes(link)) {
				links.push(link);
			}
		}

		return links;
	}

	private async executeTask(
		task: FileTask,
		userRequest: string
	): Promise<string> {
		if (task.action === "create") {
			return await this.createFile(task, userRequest);
		} else {
			return await this.modifyFile(task, userRequest);
		}
	}

	private async createFile(
		task: FileTask,
		userRequest: string
	): Promise<string> {
		const filePath = path.resolve(this.projectRoot, task.file);

		// Ensure directory exists
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		const rawContent = await this.generateFileContent(
			task,
			"",
			userRequest
		);
		const content = await this.parseAndValidateContent(
			task.file,
			rawContent
		);

		fs.writeFileSync(filePath, content);
		return `Created ${task.file}`;
	}

	private async modifyFile(
		task: FileTask,
		userRequest: string
	): Promise<string> {
		const filePath = path.resolve(this.projectRoot, task.file);

		if (!fs.existsSync(filePath)) {
			throw new Error(`File does not exist: ${task.file}`);
		}

		const currentContent = fs.readFileSync(filePath, "utf-8");
		const rawContent = await this.generateFileContent(
			task,
			currentContent,
			userRequest
		);

		const content = await this.parseAndValidateContent(
			task.file,
			rawContent
		);
		fs.writeFileSync(filePath, content);

		return `Modified ${task.file}`;
	}

	private async parseAndValidateContent(
		filePath: string,
		rawContent: string
	): Promise<string> {
		if (this.debug) {
			console.log(colors.cyan(`   🔧 Parsing content for ${filePath}`));
		}

		const parseResult = this.separatorParser.parseForFile(
			filePath,
			rawContent
		);

		if (parseResult.warnings.length > 0) {
			console.log(colors.yellow(`   ⚠️  Parsing warnings:`));
			parseResult.warnings.forEach((warning) => {
				console.log(colors.yellow(`      - ${warning}`));
			});
		}

		if (!parseResult.success) {
			console.log(colors.red(`   ❌ Parsing errors:`));
			parseResult.errors.forEach((error) => {
				console.log(colors.red(`      - ${error}`));
			});
			throw new Error(
				`Content parsing failed: ${parseResult.errors.join(", ")}`
			);
		}

		if (this.debug) {
			console.log(
				colors.green(
					`   ✅ Content parsed successfully using: ${parseResult.extractedFrom}`
				)
			);
		}

		return parseResult.content;
	}

	private async generateFileContent(
		task: FileTask,
		currentContent: string,
		userRequest: string
	): Promise<string> {
		const isCreating = !currentContent;

		// Get prompt instructions for using separators
		const separatorInstructions =
			this.separatorParser.generatePromptInstructions(task.expectedType);

		let prompt = `${
			isCreating ? "Create new" : "Update existing"
		} ${task.expectedType.toUpperCase()} content for this file:

FILE: ${task.file}
TASK: ${task.description}
ORIGINAL REQUEST: ${userRequest}
EXPECTED TYPE: ${task.expectedType.toUpperCase()}

${currentContent ? `CURRENT CONTENT:\n${currentContent}\n\n` : ""}`;

		// Add specific instructions based on file type
		if (task.expectedType === "html") {
			prompt += `
Requirements:
- Complete HTML document with proper structure
- Include DOCTYPE, html, head, and body tags
- Proper meta tags and viewport
- Fix any broken HTML structure or malformed content
- Ensure proper CSS placement in <style> tags
- Ensure proper JavaScript placement in <script> tags

${separatorInstructions}

Generate a complete, functional HTML document.`;
		} else if (task.expectedType === "css") {
			prompt += `
Requirements:
- Complete CSS with proper selectors
- Valid CSS syntax and structure
- Focus on the styling requirements

${separatorInstructions}

Generate complete CSS code.`;
		} else if (
			task.expectedType === "js" ||
			task.expectedType === "javascript"
		) {
			prompt += `
Requirements:
- Complete, functional JavaScript
- Proper error handling
- Modern ES6+ syntax where appropriate

${separatorInstructions}

Generate complete JavaScript code.`;
		} else if (task.expectedType === "typescript") {
			prompt += `
Requirements:
- Complete, functional TypeScript
- Proper typing and interfaces
- Modern TypeScript features

${separatorInstructions}

Generate complete TypeScript code.`;
		} else if (task.expectedType === "json") {
			prompt += `
Requirements:
- Valid JSON format
- Proper structure for intended use

${separatorInstructions}

Generate valid JSON.`;
		}

		return await this.anthropicService.generateCodeEdits(prompt);
	}

	private scanExistingFiles(): Array<{ path: string; type: string }> {
		const files: Array<{ path: string; type: string }> = [];

		try {
			const items = fs.readdirSync(this.projectRoot);

			for (const item of items) {
				const itemPath = path.join(this.projectRoot, item);
				const stat = fs.statSync(itemPath);

				if (stat.isFile()) {
					const ext = path.extname(item).toLowerCase();
					let type = "file";

					switch (ext) {
						case ".html":
							type = "HTML page";
							break;
						case ".css":
							type = "Stylesheet";
							break;
						case ".js":
							type = "JavaScript";
							break;
						case ".ts":
							type = "TypeScript";
							break;
						case ".json":
							type = "JSON config";
							break;
						case ".md":
							type = "Markdown";
							break;
					}

					files.push({ path: item, type });
				}
			}
		} catch (error) {
			// Ignore scanning errors
		}

		return files;
	}

	async testConnection(): Promise<boolean> {
		return await this.anthropicService.testConnection();
	}

	// Test separator parsing
	testSeparatorParsing(content: string): { [key: string]: string | null } {
		return this.separatorParser.testSeparators(content);
	}
}
