// ai-coding-agent.ts

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { DependencyExtractor } from "./dependancy-tree";

interface FileContext {
	path: string;
	content: string;
	description: string;
	lastModified: number;
	dependencies: string[];
}

interface EditInstruction {
	file: string;
	analysis: string;
	edits: Array<{
		startIndex: number;
		endIndex: number;
		newContent: string[];
		description: string;
	}>;
}

interface LineTracker {
	originalIndex: number;
	currentIndex: number;
	file: string;
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
	private lineTrackers: Map<string, LineTracker[]> = new Map();
	private tsConfigPath: string;
	private tsProgram: ts.Program | null = null;

	constructor(
		projectRoot: string,
		options: {
			maxDepth?: number;
			includeExternal?: boolean;
			debug?: boolean;
		} = {}
	) {
		this.projectRoot = path.resolve(projectRoot);
		this.dependencyExtractor = new DependencyExtractor({
			rootDir: this.projectRoot,
			...options,
		});
		this.tsConfigPath = this.findTsConfig();
	}

	/**
	 * Initialize the agent by scanning the project and building context
	 */
	async initialize(): Promise<void> {
		console.log("🤖 Initializing AI Code Agent...");

		// Scan project structure
		await this.scanProject();

		// Build TypeScript program
		this.buildTSProgram();

		console.log(
			`✅ Agent initialized with ${this.fileContextMap.size} files`
		);
	}

	/**
	 * Main entry point: User asks for something
	 */
	async handleUserRequest(request: string): Promise<{
		success: boolean;
		changes: string[];
		errors?: string[];
	}> {
		console.log(`📝 Processing request: ${request}`);

		try {
			// 1. Analyze request and identify target files
			const targetFiles = await this.identifyTargetFiles(request);
			console.log(
				`🎯 Identified target files: ${targetFiles.join(", ")}`
			);

			// 2. Get dependency context for target files
			const context = await this.buildEditingContext(targetFiles);

			// 3. Get AI suggestions
			const editInstructions = await this.getAIEditInstructions(
				request,
				context
			);

			// 4. Apply edits with line tracking
			const changes = await this.applyEdits(editInstructions);

			// 5. Compile and check for errors
			const compilationResult = this.compileTypeScript();

			// 6. Fix bugs if needed
			if (!compilationResult.success) {
				console.log(
					"🔧 Compilation errors detected, attempting fixes..."
				);
				const fixResult = await this.fixCompilationErrors(
					compilationResult.errors
				);
				return fixResult;
			}

			return {
				success: true,
				changes,
			};
		} catch (error) {
			return {
				success: false,
				changes: [],
				errors: [error.message],
			};
		}
	}

	/**
	 * Scan project and build file context map
	 */
	private async scanProject(): Promise<void> {
		const tsFiles = this.findTypeScriptFiles(this.projectRoot);

		for (const filePath of tsFiles) {
			try {
				const content = fs.readFileSync(filePath, "utf-8");
				const description = this.generateFileDescription(content);
				const dependencies = await this.extractFileDependencies(
					filePath
				);

				this.fileContextMap.set(filePath, {
					path: filePath,
					content,
					description,
					lastModified: fs.statSync(filePath).mtime.getTime(),
					dependencies,
				});
			} catch (error) {
				console.warn(
					`⚠️ Could not process file ${filePath}: ${error.message}`
				);
			}
		}
	}

	/**
	 * Identify which files to target based on user request
	 */
	private async identifyTargetFiles(request: string): Promise<string[]> {
		// Build context for AI to understand which files to target
		const fileDescriptions = Array.from(this.fileContextMap.entries()).map(
			([path, context]) => ({
				path: path.replace(this.projectRoot, ""),
				description: context.description,
			})
		);

		const prompt = `
Analyze this user request and identify which files should be modified:

USER REQUEST: ${request}

AVAILABLE FILES:
${fileDescriptions.map((f) => `${f.path}: ${f.description}`).join("\n")}

Respond with a JSON array of file paths that need to be modified:
["path1", "path2", ...]
    `;

		// This would call your AI service
		const response = await this.callAI(prompt);

		try {
			const paths = JSON.parse(response);
			return paths.map((p) => path.join(this.projectRoot, p));
		} catch {
			// Fallback: try to extract file mentions from request
			return this.extractFilePathsFromRequest(request);
		}
	}

	/**
	 * Build comprehensive editing context
	 */
	private async buildEditingContext(targetFiles: string[]): Promise<string> {
		let context = "";

		for (const filePath of targetFiles) {
			// Get dependency tree for this file
			const tree = await this.dependencyExtractor.analyze(filePath);

			// Extract all related files with content
			const relatedFiles = this.extractFilesFromTree(tree);

			context += `\n=== EDITING CONTEXT FOR ${filePath} ===\n`;

			for (const file of relatedFiles) {
				const lines = file.content.split("\n");
				const indexedLines = lines.map(
					(line, index) => `${index}: ${line}`
				);

				context += `\n--- ${file.path} ---\n`;
				context += indexedLines.join("\n");
				context += "\n";
			}
		}

		return context;
	}

	/**
	 * Get AI edit instructions
	 */
	private async getAIEditInstructions(
		request: string,
		context: string
	): Promise<EditInstruction[]> {
		const prompt = `
You are a code editor AI. You will receive code as indexed lines where each line has a corresponding index number (0, 1, 2, etc.).

USER REQUEST: ${request}

CODE CONTEXT:
${context}

Your task is to analyze the code and provide precise editing instructions. You must respond with a JSON array of edit instructions:

[
  {
    "file": "path/to/file",
    "analysis": "Brief explanation of what changes are needed and why",
    "edits": [
      {
        "startIndex": <number>,
        "endIndex": <number>,
        "newContent": ["line 1", "line 2", "line 3"],
        "description": "What this edit accomplishes"
      }
    ]
  }
]

RULES:
- startIndex and endIndex are inclusive (both lines will be replaced)
- For single line edits, startIndex equals endIndex
- newContent array contains the exact replacement lines with original formatting preserved
- Always preserve existing indentation and formatting style
- Consider TypeScript types and compilation requirements
    `;

		const response = await this.callAI(prompt);
		return JSON.parse(response);
	}

	/**
	 * Apply edits while tracking line changes
	 */
	private async applyEdits(
		instructions: EditInstruction[]
	): Promise<string[]> {
		const changes: string[] = [];

		for (const instruction of instructions) {
			const filePath = path.resolve(this.projectRoot, instruction.file);

			// Initialize line tracker for this file
			if (!this.lineTrackers.has(filePath)) {
				const content = fs.readFileSync(filePath, "utf-8");
				const lines = content.split("\n");
				this.lineTrackers.set(
					filePath,
					lines.map((_, index) => ({
						originalIndex: index,
						currentIndex: index,
						file: filePath,
					}))
				);
			}

			// Apply edits in reverse order to avoid index shifting issues
			const sortedEdits = instruction.edits.sort(
				(a, b) => b.startIndex - a.startIndex
			);

			for (const edit of sortedEdits) {
				const result = await this.applyEdit(filePath, edit);
				changes.push(result);
			}
		}

		return changes;
	}

	/**
	 * Apply single edit with line tracking
	 */
	private async applyEdit(
		filePath: string,
		edit: {
			startIndex: number;
			endIndex: number;
			newContent: string[];
			description: string;
		}
	): Promise<string> {
		const content = fs.readFileSync(filePath, "utf-8");
		const lines = content.split("\n");

		// Get current line positions
		const trackers = this.lineTrackers.get(filePath) || [];
		const startTracker = trackers.find(
			(t) => t.originalIndex === edit.startIndex
		);
		const endTracker = trackers.find(
			(t) => t.originalIndex === edit.endIndex
		);

		if (!startTracker || !endTracker) {
			throw new Error(
				`Line tracking lost for ${filePath} at lines ${edit.startIndex}-${edit.endIndex}`
			);
		}

		const currentStart = startTracker.currentIndex;
		const currentEnd = endTracker.currentIndex;

		// Apply the edit
		const newLines = [
			...lines.slice(0, currentStart),
			...edit.newContent,
			...lines.slice(currentEnd + 1),
		];

		// Update line trackers
		const linesDiff =
			edit.newContent.length - (currentEnd - currentStart + 1);
		trackers.forEach((tracker) => {
			if (tracker.currentIndex > currentEnd) {
				tracker.currentIndex += linesDiff;
			}
		});

		// Write file
		fs.writeFileSync(filePath, newLines.join("\n"));

		// Update file context
		const fileContext = this.fileContextMap.get(filePath);
		if (fileContext) {
			fileContext.content = newLines.join("\n");
			fileContext.lastModified = Date.now();
		}

		const changeDescription = `${filePath}: ${edit.description} (lines ${edit.startIndex}-${edit.endIndex})`;
		console.log(`✏️ ${changeDescription}`);

		return changeDescription;
	}

	/**
	 * Compile TypeScript and check for errors
	 */
	private compileTypeScript(): CompilationResult {
		try {
			this.buildTSProgram();

			if (!this.tsProgram) {
				return {
					success: false,
					errors: [],
					warnings: [],
				};
			}

			const diagnostics = ts.getPreEmitDiagnostics(this.tsProgram);
			const errors = diagnostics.filter(
				(d) => d.category === ts.DiagnosticCategory.Error
			);
			const warnings = diagnostics.filter(
				(d) => d.category === ts.DiagnosticCategory.Warning
			);

			return {
				success: errors.length === 0,
				errors,
				warnings,
			};
		} catch (error) {
			return {
				success: false,
				errors: [],
				warnings: [],
			};
		}
	}

	/**
	 * Fix compilation errors iteratively
	 */
	private async fixCompilationErrors(errors: ts.Diagnostic[]): Promise<{
		success: boolean;
		changes: string[];
		errors?: string[];
	}> {
		const maxAttempts = 3;
		const changes: string[] = [];

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			console.log(`🔧 Fix attempt ${attempt + 1}/${maxAttempts}`);

			// Format errors for AI
			const errorContext = this.formatCompilationErrors(errors);

			// Get fix suggestions from AI
			const fixInstructions = await this.getErrorFixInstructions(
				errorContext
			);

			// Apply fixes
			const fixChanges = await this.applyEdits(fixInstructions);
			changes.push(...fixChanges);

			// Recompile
			const result = this.compileTypeScript();

			if (result.success) {
				console.log("✅ All compilation errors fixed!");
				return {
					success: true,
					changes,
				};
			}

			errors = result.errors;
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

		const configFile = ts.readConfigFile(
			this.tsConfigPath,
			ts.sys.readFile
		);
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
		// Extract class names, function names, exports, etc.
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
				.map((m) =>
					m.replace(/(?:function|const|let)\s+/, "Function: ")
				),
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
				files.push({
					path: node.path,
					content: node.content,
				});
			}
			if (node.dependencies) {
				node.dependencies.forEach(traverse);
			}
		};

		traverse(tree);
		return files;
	}

	private extractFilePathsFromRequest(request: string): string[] {
		// Simple pattern matching for file paths in request
		const patterns = [/[\w\/\-\.]+\.tsx?/g, /src\/[\w\/\-\.]+/g];

		const matches: string[] = [];
		for (const pattern of patterns) {
			const found = request.match(pattern) || [];
			matches.push(...found);
		}

		return matches.map((p) => path.resolve(this.projectRoot, p));
	}

	private formatCompilationErrors(errors: ts.Diagnostic[]): string {
		return errors
			.map((error) => {
				const file = error.file
					? path.relative(this.projectRoot, error.file.fileName)
					: "unknown";
				const line =
					error.file && error.start
						? error.file.getLineAndCharacterOfPosition(error.start)
								.line
						: 0;
				const message = ts.flattenDiagnosticMessageText(
					error.messageText,
					"\n"
				);

				return `${file}:${line} - ${message}`;
			})
			.join("\n");
	}

	private async getErrorFixInstructions(
		errorContext: string
	): Promise<EditInstruction[]> {
		const prompt = `
You are a TypeScript error fixing specialist. Fix the following compilation errors:

ERRORS:
${errorContext}

Respond with JSON edit instructions to fix these errors:
[
  {
    "file": "path/to/file",
    "analysis": "Explanation of the fix",
    "edits": [
      {
        "startIndex": <number>,
        "endIndex": <number>,
        "newContent": ["fixed line 1", "fixed line 2"],
        "description": "What error this fixes"
      }
    ]
  }
]
    `;

		const response = await this.callAI(prompt);
		return JSON.parse(response);
	}

	private async callAI(prompt: string): Promise<string> {
		// This would integrate with your AI service (OpenAI, Claude, etc.)
		// For now, returning a placeholder
		console.log("🤖 Calling AI with prompt...");
		return "[]"; // Placeholder
	}
}

// Usage example
export { AICodeAgent };

// Example usage:
/*
const agent = new AICodeAgent('./my-project', {
  debug: true,
  maxDepth: 3
});

await agent.initialize();

const result = await agent.handleUserRequest(
  "Add a new method to the UserService class that validates email addresses"
);

console.log(result);
*/
