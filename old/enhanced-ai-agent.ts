// path: enhanced-ai-agent-complete.ts

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { AnthropicService } from "../anthropic-service";
import { ConfigManager } from "../config-manager";
import { SyntaxChecker } from "./syntax-checker";
import colors from "../colors";

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

interface LogEntry {
	timestamp: string;
	level: "DEBUG" | "INFO" | "WARN" | "ERROR";
	phase?: string;
	requestId?: string;
	message: string;
	data?: any;
}

class FileLogger {
	private logPath: string;
	private logStream: fs.WriteStream | null = null;
	private requestId: string = "";

	constructor(projectRoot: string, requestId: string = "") {
		this.requestId = requestId;
		const logsDir = path.join(projectRoot, "ai-agent-logs");
		if (!fs.existsSync(logsDir)) {
			fs.mkdirSync(logsDir, { recursive: true });
		}

		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const logFileName = `ai-agent-${timestamp}-${requestId}.log`;
		this.logPath = path.join(logsDir, logFileName);

		this.initializeLogFile();
	}

	private initializeLogFile(): void {
		try {
			this.logStream = fs.createWriteStream(this.logPath, { flags: "a" });
			this.log("INFO", "FileLogger initialized", {
				logPath: this.logPath,
			});
		} catch (error) {
			console.error(`Failed to initialize log file: ${error.message}`);
		}
	}

	log(
		level: LogEntry["level"],
		message: string,
		data?: any,
		phase?: string
	): void {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			phase,
			requestId: this.requestId,
			message,
			data,
		};

		const logLine = JSON.stringify(entry) + "\n";

		if (this.logStream) {
			this.logStream.write(logLine);
		}

		// Also log to console in debug mode
		const colorFn = this.getColorFunction(level);
		const phasePrefix = phase ? `[${phase}] ` : "";
		console.log(colorFn(`🔧 [${level}] ${phasePrefix}${message}`));

		if (data && typeof data === "object") {
			console.log(
				colors.gray(`  Data: ${JSON.stringify(data, null, 2)}`)
			);
		}
	}

	private getColorFunction(level: LogEntry["level"]) {
		switch (level) {
			case "ERROR":
				return colors.red;
			case "WARN":
				return colors.yellow;
			case "INFO":
				return colors.blue;
			case "DEBUG":
				return colors.cyan;
			default:
				return colors.gray;
		}
	}

	close(): void {
		if (this.logStream) {
			this.log("INFO", "Closing log file");
			this.logStream.end();
			this.logStream = null;
		}
	}

	getLogPath(): string {
		return this.logPath;
	}
}

class ContentCleaner {
	private logger: FileLogger;

	constructor(logger: FileLogger) {
		this.logger = logger;
	}

	cleanGeneratedContent(
		response: string,
		expectedType: "html" | "css" | "js" | "json" | "auto" = "auto"
	): string {
		this.logger.log("DEBUG", "Starting content cleaning", {
			responseLength: response.length,
			expectedType,
			preview: response.substring(0, 200) + "...",
		});

		let content = response.trim();

		// Auto-detect content type if not specified
		if (expectedType === "auto") {
			expectedType = this.detectContentType(content);
			this.logger.log("DEBUG", "Auto-detected content type", {
				detectedType: expectedType,
			});
		}

		// Handle different content types
		switch (expectedType) {
			case "html":
				return this.cleanHtmlContent(content);
			case "css":
				return this.cleanCssContent(content);
			case "js":
				return this.cleanJsContent(content);
			case "json":
				return this.cleanJsonContent(content);
			default:
				return this.cleanGenericContent(content);
		}
	}

	private detectContentType(
		content: string
	): "html" | "css" | "js" | "json" | "auto" {
		const trimmed = content.trim();

		if (
			trimmed.startsWith("<!DOCTYPE html>") ||
			trimmed.startsWith("<html")
		) {
			return "html";
		}

		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			try {
				JSON.parse(trimmed);
				return "json";
			} catch {
				// Check if it's CSS starting with a selector
				if (this.looksLikeCss(trimmed)) {
					return "css";
				}
			}
		}

		// Check for CSS patterns
		if (this.looksLikeCss(trimmed)) {
			return "css";
		}

		// Check for JavaScript patterns
		if (this.looksLikeJs(trimmed)) {
			return "js";
		}

		return "auto";
	}

	private looksLikeCss(content: string): boolean {
		const cssPatterns = [
			/^[^{]*\{[^}]*\}/m, // Basic CSS rule pattern
			/^@[a-zA-Z-]+/m, // CSS at-rules
			/(margin|padding|color|background|font|border):/m,
			/^\s*body\s*{/m, // body selector
			/^\s*\.[\w-]+\s*{/m, // class selector
			/^\s*#[\w-]+\s*{/m, // id selector
		];

		return cssPatterns.some((pattern) => pattern.test(content));
	}

	private looksLikeJs(content: string): boolean {
		const jsPatterns = [
			/^(function|const|let|var|class|import|export)/m,
			/^\s*(\/\/|\/\*)/m, // Comments
			/[{}();]/, // Common JS syntax
		];

		return jsPatterns.some((pattern) => pattern.test(content));
	}

	private cleanHtmlContent(content: string): string {
		this.logger.log("DEBUG", "Cleaning HTML content");

		// Remove any JSON wrapper attempts
		if (content.includes('{"content":') || content.includes('"content":')) {
			try {
				const jsonMatch = content.match(
					/\{[\s\S]*"content":\s*"([\s\S]*?)"\s*[\s\S]*\}/
				);
				if (jsonMatch) {
					content = jsonMatch[1]
						.replace(/\\n/g, "\n")
						.replace(/\\"/g, '"')
						.replace(/\\\\/g, "\\");
					this.logger.log(
						"DEBUG",
						"Extracted HTML from JSON wrapper"
					);
				}
			} catch (error) {
				this.logger.log(
					"WARN",
					"Failed to extract HTML from JSON wrapper",
					{ error: error.message }
				);
			}
		}

		// Remove markdown code blocks
		content = content.replace(/```html\s*/g, "").replace(/```\s*/g, "");

		// Find complete HTML document
		const htmlMatch = content.match(/(<!DOCTYPE html>[\s\S]*?<\/html>)/i);
		if (htmlMatch) {
			this.logger.log("DEBUG", "Found complete HTML document");
			return htmlMatch[1].trim();
		}

		// Check if this looks like CSS that was mistakenly expected to be HTML
		if (this.looksLikeCss(content)) {
			this.logger.log(
				"WARN",
				"Content appears to be CSS, not HTML - attempting to reconstruct HTML"
			);
			return this.reconstructHtmlFromCss(content);
		}

		// If no complete document, look for HTML fragment
		if (content.includes("<html") || content.includes("<!DOCTYPE")) {
			// Try to fix incomplete HTML
			let fixed = content;
			if (!fixed.includes("</html>") && fixed.includes("<html")) {
				fixed += "\n</html>";
				this.logger.log("DEBUG", "Added missing closing </html> tag");
			}
			return fixed.trim();
		}

		this.logger.log(
			"WARN",
			"No HTML structure detected, attempting to reconstruct"
		);
		return this.reconstructBasicHtml(content);
	}

	private reconstructHtmlFromCss(cssContent: string): string {
		this.logger.log("DEBUG", "Reconstructing HTML from CSS content");

		// This is a fallback when AI returns CSS instead of HTML
		const basicHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Page</title>
    <style>
${cssContent}
    </style>
</head>
<body>
    <div class="content">
        <h1>Content</h1>
        <p>This page was generated with embedded styles.</p>
    </div>
</body>
</html>`;

		this.logger.log("DEBUG", "Reconstructed basic HTML with embedded CSS");
		return basicHtml;
	}

	private reconstructBasicHtml(content: string): string {
		this.logger.log("DEBUG", "Reconstructing basic HTML structure");

		// Try to preserve any existing content
		const bodyContent = content.includes("<")
			? content
			: `<p>${content}</p>`;

		const basicHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Page</title>
</head>
<body>
    ${bodyContent}
</body>
</html>`;

		this.logger.log("DEBUG", "Reconstructed basic HTML structure");
		return basicHtml;
	}

	private cleanCssContent(content: string): string {
		this.logger.log("DEBUG", "Cleaning CSS content");

		// Remove markdown code blocks
		content = content.replace(/```css\s*/g, "").replace(/```\s*/g, "");

		// Find CSS rules
		const lines = content.split("\n");
		let startIndex = 0;
		let endIndex = lines.length - 1;

		// Find first line that looks like CSS
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (
				line.includes("{") ||
				line.includes(":") ||
				this.looksLikeCss(line)
			) {
				startIndex = i;
				break;
			}
		}

		// Find last line with CSS content
		for (let i = lines.length - 1; i >= 0; i--) {
			const line = lines[i].trim();
			if (line.includes("}") || line.includes(";")) {
				endIndex = i;
				break;
			}
		}

		const result = lines
			.slice(startIndex, endIndex + 1)
			.join("\n")
			.trim();
		this.logger.log("DEBUG", "Cleaned CSS content", {
			originalLines: lines.length,
			cleanedLines: endIndex - startIndex + 1,
		});

		return result;
	}

	private cleanJsContent(content: string): string {
		this.logger.log("DEBUG", "Cleaning JavaScript content");

		// Remove markdown code blocks
		content = content
			.replace(/```(?:javascript|js)\s*/g, "")
			.replace(/```\s*/g, "");

		// Remove explanatory text before/after code
		const lines = content.split("\n");
		let startIndex = 0;
		let endIndex = lines.length - 1;

		// Find first line that looks like JS code
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (this.looksLikeJs(line)) {
				startIndex = i;
				break;
			}
		}

		const result = lines
			.slice(startIndex, endIndex + 1)
			.join("\n")
			.trim();
		this.logger.log("DEBUG", "Cleaned JavaScript content");

		return result;
	}

	private cleanJsonContent(content: string): string {
		this.logger.log("DEBUG", "Cleaning JSON content");

		// Remove markdown code blocks
		content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");

		// Find JSON boundaries
		const jsonStart = Math.min(
			content.indexOf("{") === -1 ? Infinity : content.indexOf("{"),
			content.indexOf("[") === -1 ? Infinity : content.indexOf("[")
		);

		if (jsonStart !== Infinity && jsonStart > 0) {
			content = content.substring(jsonStart);
		}

		const lastBrace = content.lastIndexOf("}");
		const lastBracket = content.lastIndexOf("]");
		const jsonEnd = Math.max(lastBrace, lastBracket);

		if (jsonEnd !== -1 && jsonEnd < content.length - 1) {
			content = content.substring(0, jsonEnd + 1);
		}

		// Remove trailing commas
		content = content.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

		// Validate JSON
		try {
			JSON.parse(content);
			this.logger.log("DEBUG", "JSON validation successful");
		} catch (error) {
			this.logger.log("WARN", "JSON validation failed", {
				error: error.message,
			});
		}

		return content.trim();
	}

	private cleanGenericContent(content: string): string {
		this.logger.log("DEBUG", "Cleaning generic content");

		// Remove common markdown patterns
		content = content.replace(/```[\w]*\n?/g, "").replace(/```\n?/g, "");

		// Remove leading/trailing explanatory text
		const lines = content.split("\n");
		let cleaned = lines
			.filter((line) => {
				const trimmed = line.trim();
				return (
					trimmed &&
					!trimmed.toLowerCase().startsWith("here") &&
					!trimmed.toLowerCase().startsWith("this")
				);
			})
			.join("\n")
			.trim();

		return cleaned || content.trim();
	}
}

export class EnhancedSequentialAIAgent {
	private projectRoot: string;
	private anthropicService: AnthropicService;
	private syntaxChecker: SyntaxChecker;
	private configManager: ConfigManager;
	private debug: boolean;
	private logger: FileLogger;
	private contentCleaner: ContentCleaner;
	private requestId: string;

	// State management
	private executionPlan: PlanStep[] = [];
	private fileTree: any = null;
	private selectedFiles: string[] = [];
	private fileContexts: Map<string, FileContext> = new Map();
	private userRequest: string = "";

	constructor(projectRoot: string, options: { debug?: boolean } = {}) {
		this.projectRoot = path.resolve(projectRoot);
		this.debug = options.debug || false;
		this.requestId = this.generateRequestId();

		// Initialize logging first
		this.logger = new FileLogger(this.projectRoot, this.requestId);
		this.contentCleaner = new ContentCleaner(this.logger);

		this.logger.log("INFO", "EnhancedSequentialAIAgent initializing", {
			projectRoot: this.projectRoot,
			debug: this.debug,
			requestId: this.requestId,
		});

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

		this.logger.log(
			"INFO",
			"EnhancedSequentialAIAgent initialized successfully"
		);
		console.log(
			colors.green("🤖 Enhanced Sequential AI Agent initialized")
		);
		console.log(
			colors.gray(`📝 Logs will be saved to: ${this.logger.getLogPath()}`)
		);
	}

	private generateRequestId(): string {
		return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	async processUserRequest(request: string): Promise<{
		success: boolean;
		summary: string;
		steps: PlanStep[];
		logPath: string;
	}> {
		this.userRequest = request;
		this.logger.log("INFO", "Processing user request", { request });

		console.log(colors.blue("\n" + "=".repeat(80)));
		console.log(colors.blue("🚀 ENHANCED SEQUENTIAL AI AGENT"));
		console.log(colors.blue("=".repeat(80)));
		console.log(`📝 Request: ${colors.yellow(request)}`);
		console.log(`📋 Request ID: ${colors.gray(this.requestId)}`);
		console.log(`📝 Logs: ${colors.gray(this.logger.getLogPath())}\n`);

		try {
			// Execute all phases sequentially
			await this.phase1_CreateExecutionPlan();
			await this.phase2_DiscoverProjectStructure();
			await this.phase3_SelectRelevantFiles();
			await this.phase4_LoadFileContexts();
			await this.phase5_ExecuteChanges();
			await this.phase6_ValidateResults();

			const summary = this.generateExecutionSummary();

			this.logger.log("INFO", "Request completed successfully", {
				summary,
				totalSteps: this.executionPlan.length,
			});

			console.log(
				colors.green("\n✅ All phases completed successfully!")
			);
			console.log(colors.gray(summary));

			return {
				success: true,
				summary,
				steps: this.executionPlan,
				logPath: this.logger.getLogPath(),
			};
		} catch (error) {
			this.logger.log("ERROR", "Process failed", {
				error: error.message,
				stack: error.stack,
			});

			console.log(colors.red(`\n❌ Process failed: ${error.message}`));
			return {
				success: false,
				summary: `Failed during execution: ${error.message}`,
				steps: this.executionPlan,
				logPath: this.logger.getLogPath(),
			};
		} finally {
			this.logger.close();
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

		console.log("🔍 Scanning existing files...");
		const existingFiles = await this.scanExistingFiles();
		console.log(`📁 Found ${existingFiles.length} existing files`);

		if (existingFiles.length > 0) {
			console.log("📄 Existing files:");
			existingFiles.forEach((file) => {
				console.log(`   ${colors.gray(file.path)} (${file.type})`);
			});
		}

		console.log("🤖 AI is analyzing the request and creating a plan...");

		const planPrompt = `You are a systematic coding assistant. Analyze this request and create a detailed execution plan.

USER REQUEST: "${this.userRequest}"

EXISTING FILES IN PROJECT:
${
	existingFiles.length === 0
		? "No existing files - this is a new/empty project"
		: existingFiles
				.map((f) => `${f.path} - ${f.type} - ${f.description}`)
				.join("\n")
}

CRITICAL DECISION RULES:

1. EXISTING FILE AWARENESS:
   - If files already exist, understand their purpose and relationships
   - Don't replace existing files unless explicitly asked to "replace" or "rewrite"
   - When adding new pages/features, CREATE new files and UPDATE existing ones with navigation

2. MULTI-PAGE WEBSITE LOGIC:
   - "add contact page" → CREATE contact.html + UPDATE index.html with navigation
   - "add about page" → CREATE about.html + UPDATE existing pages with links
   - "implement another page" → CREATE new page + UPDATE navigation in existing pages
   - "add new section" to existing page → MODIFY existing file

3. FILE STRATEGY DECISIONS:
   - Single HTML file: Simple standalone content with no existing files
   - Multi-file: When adding pages to existing site OR creating complex applications
   - Always maintain navigation consistency across pages

4. ACTION TYPES:
   - "create" = new file that doesn't exist
   - "modify" = update existing file (add navigation, update content)
   - "replace" = completely rewrite existing file (only when explicitly requested)

RESPONSE FORMAT - RESPOND WITH ONLY THIS JSON STRUCTURE:
{
  "understanding": "What the user wants to accomplish",
  "fileStrategy": "single-file" | "multi-file" | "modify-existing",
  "reasoning": "Why this approach was chosen based on existing files and request",
  "likelyFilesToCreate": ["new-file1.html"],
  "likelyFilesToModify": ["existing-file.html"],
  "contextFilesNeeded": ["file-to-understand.html"],
  "executionSequence": [
    {
      "step": 1,
      "action": "create" | "modify",
      "file": "filename.html",
      "purpose": "What this accomplishes",
      "dependencies": ["other-files"],
      "coordination": "How this works with other files",
      "navigationUpdates": "What navigation changes are needed"
    }
  ],
  "potentialChallenges": ["challenge1", "challenge2"]
}

EXAMPLES:
- Request: "add contact page" + existing index.html → CREATE contact.html + MODIFY index.html (add nav link)
- Request: "create login form" + no existing files → CREATE single index.html
- Request: "update homepage styling" + existing index.html → MODIFY index.html

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
			description: "Discover project structure",
			status: "in-progress",
		};
		this.executionPlan.push(step);

		const executionPlan = this.executionPlan[0]?.details;

		// Check if we have existing files to modify or if it's truly standalone
		const hasFilesToModify =
			(executionPlan?.likelyFilesToModify?.length || 0) > 0;
		const hasContextFiles =
			(executionPlan?.contextFilesNeeded?.length || 0) > 0;
		const isMultiFileStrategy =
			executionPlan?.fileStrategy === "multi-file";

		// Only treat as standalone if it's truly a single-file creation with no modifications needed
		const isStandaloneFileCreation =
			this.isStandaloneFileCreation(executionPlan);

		if (
			isStandaloneFileCreation &&
			!hasFilesToModify &&
			!hasContextFiles &&
			!isMultiFileStrategy
		) {
			console.log(
				"🎯 Detected standalone file creation - skipping dependency analysis"
			);
			console.log("📁 Creating files without existing project structure");

			step.details = {
				standalone: true,
				reason: "Simple single-file creation doesn't require project analysis",
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

		const executionPlan = this.executionPlan[0]?.details;
		const filesToCreate = executionPlan?.likelyFilesToCreate || [];
		const filesToModify = executionPlan?.likelyFilesToModify || [];
		const contextFiles = executionPlan?.contextFilesNeeded || [];

		// Handle projects with existing files (most common case)
		if (!this.fileTree.standalone && !this.fileTree.bareProject) {
			console.log("🎯 Multi-file project with existing structure");
		} else {
			console.log("🎯 Project with limited existing structure");
		}

		step.details = {
			primaryFiles: filesToCreate,
			modifyFiles: filesToModify,
			contextFiles: contextFiles,
			reasoning: {
				primaryFiles:
					"Files to be created as specified in execution plan",
				modifyFiles:
					"Files to be modified as specified in execution plan",
				contextFiles: "Files needed for context and modification",
			},
		};
		step.status = "completed";

		this.selectedFiles = [
			...filesToCreate,
			...filesToModify,
			...contextFiles,
		];

		if (filesToCreate.length > 0) {
			console.log(`📄 Files to create (${filesToCreate.length}):`);
			filesToCreate.forEach((file: string) => {
				console.log(`   ✏️ ${colors.yellow(file)}`);
			});
		}

		if (filesToModify.length > 0) {
			console.log(`📝 Files to modify (${filesToModify.length}):`);
			filesToModify.forEach((file: string) => {
				console.log(`   🔧 ${colors.blue(file)}`);
			});
		}

		if (contextFiles.length > 0) {
			console.log(`📚 Context files (${contextFiles.length}):`);
			contextFiles.forEach((file: string) => {
				console.log(`   📖 ${colors.gray(file)}`);
			});
		}

		await this.pause("Files identified. Continue with loading content?");
	}

	private async phase4_LoadFileContexts(): Promise<void> {
		console.log(colors.cyan("\n📚 PHASE 4: LOADING FILE CONTEXTS"));
		console.log("─".repeat(50));

		const step: PlanStep = {
			id: "load-1",
			phase: "load",
			description: "Load selected file contents",
			status: "in-progress",
		};
		this.executionPlan.push(step);

		// Load any existing files that need to be referenced or modified
		console.log("📖 Loading file contents for context and modification...");

		try {
			let loadedCount = 0;
			const errors: string[] = [];

			for (const file of this.selectedFiles) {
				try {
					console.log(`   📄 Loading: ${colors.gray(file)}`);

					const filePath = path.resolve(this.projectRoot, file);
					if (fs.existsSync(filePath)) {
						// Read file content directly
						const content = fs.readFileSync(filePath, "utf-8");

						this.fileContexts.set(file, {
							path: file,
							content: content,
							relevance: "high",
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
							`   ⚠️  File not found (will be created): ${colors.yellow(
								file
							)}`
						);
						// This is okay - file will be created
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
				)}/${this.selectedFiles.length} existing files`
			);

			if (errors.length > 0) {
				console.log(`⚠️  Encountered ${errors.length} errors:`);
				errors.forEach((error) =>
					console.log(`   - ${colors.red(error)}`)
				);
			}

			const newFilesCount = this.selectedFiles.length - loadedCount;
			if (newFilesCount > 0) {
				console.log(
					`📄 ${newFilesCount} files will be created from scratch`
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

		// Get the execution sequence from the original plan
		const executionPlan =
			this.executionPlan[0]?.details?.executionSequence || [];

		if (executionPlan.length === 0) {
			throw new Error("No execution sequence found in plan");
		}

		console.log(
			`🚀 Executing ${executionPlan.length} planned changes sequentially...`
		);

		// Display the full execution plan
		console.log(`\n📋 Full Execution Plan:`);
		executionPlan.forEach((change: any, index: number) => {
			const icon = change.action === "create" ? "📄" : "🔧";
			console.log(
				`   ${index + 1}. ${icon} ${colors.yellow(
					change.action.toUpperCase()
				)} ${change.file}`
			);
			console.log(`      Purpose: ${colors.gray(change.purpose)}`);
		});

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
			console.log(`🔧 Action: ${change.action.toUpperCase()}`);

			try {
				const result = await this.executeFileChange(
					change,
					coordinationContext
				);
				results.push({ ...change, result, status: "success" });
				successCount++;
				console.log(`   ✅ ${colors.green("Completed successfully")}`);

				// Quick pause between changes
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

		if (successCount < executionPlan.length) {
			console.log(
				colors.yellow(
					`⚠️  ${executionPlan.length - successCount} changes failed`
				)
			);
		}
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
				this.executionPlan[0]?.details?.fileStrategy || "multi-file",
			allFiles: executionPlan.map((item) => item.file),
			coordination: {},
			filesToCreate: executionPlan
				.filter((item) => item.action === "create")
				.map((item) => item.file),
			filesToModify: executionPlan
				.filter((item) => item.action === "modify")
				.map((item) => item.file),
			dependencies: {},
		};

		// Build coordination map and dependencies
		executionPlan.forEach((item) => {
			if (item.coordination) {
				context.coordination[item.file] = item.coordination;
			}
			if (item.dependencies) {
				context.dependencies[item.file] = item.dependencies;
			}
		});

		if (this.debug) {
			console.log(colors.cyan("🔧 [DEBUG] Coordination context built:"));
			console.log(colors.gray(`  Strategy: ${context.fileStrategy}`));
			console.log(
				colors.gray(`  All files: ${context.allFiles.join(", ")}`)
			);
			console.log(
				colors.gray(
					`  Files to create: ${context.filesToCreate.join(", ")}`
				)
			);
			console.log(
				colors.gray(
					`  Files to modify: ${context.filesToModify.join(", ")}`
				)
			);
		}

		return context;
	}

	private async executeFileChange(
		change: any,
		coordinationContext: any
	): Promise<string> {
		this.logger.log(
			"DEBUG",
			"Executing file change",
			{
				file: change.file,
				action: change.action,
				purpose: change.purpose,
			},
			"EXECUTE"
		);

		const filePath = path.resolve(this.projectRoot, change.file);
		const fileExists = fs.existsSync(filePath);

		// Determine expected content type from file extension
		const ext = path.extname(change.file).toLowerCase();
		let expectedType: "html" | "css" | "js" | "json" | "auto" = "auto";

		switch (ext) {
			case ".html":
				expectedType = "html";
				break;
			case ".css":
				expectedType = "css";
				break;
			case ".js":
			case ".ts":
				expectedType = "js";
				break;
			case ".json":
				expectedType = "json";
				break;
		}

		this.logger.log("DEBUG", "File change context", {
			filePath,
			fileExists,
			expectedType,
			fileSize: fileExists ? fs.statSync(filePath).size : 0,
		});

		// Build context for AI
		let contextStr = "";
		if (this.fileContexts.size > 0) {
			contextStr = Array.from(this.fileContexts.entries())
				.map(([file, context]) => `=== ${file} ===\n${context.content}`)
				.join("\n\n");
		} else {
			contextStr = "// No existing project context loaded for reference";
		}

		// Get current file content if modifying
		let currentFileContent = "";
		if (fileExists && change.action === "modify") {
			currentFileContent = fs.readFileSync(filePath, "utf-8");
			this.logger.log("DEBUG", "Loaded current file content", {
				contentLength: currentFileContent.length,
			});
		}

		// Enhanced prompt with explicit HTML requirements
		const filePrompt = `You are implementing a file change as part of a systematic coding task.

ORIGINAL REQUEST: "${this.userRequest}"

CHANGE DETAILS:
- File: ${change.file}
- Action: ${change.action} ${fileExists ? "(file exists)" : "(new file)"}
- Purpose: ${change.purpose}
- Expected Content Type: ${expectedType.toUpperCase()}

${
	change.action === "modify" && currentFileContent
		? `
CURRENT FILE CONTENT:
${currentFileContent}

MODIFICATION INSTRUCTIONS:
- Make targeted changes to achieve the purpose
- Preserve existing functionality unless specifically changing it
- Ensure the output is valid ${expectedType.toUpperCase()}
`
		: `
CREATION INSTRUCTIONS:
- Create a complete, functional ${expectedType.toUpperCase()} file
- Follow best practices for ${expectedType.toUpperCase()} files
`
}

${
	expectedType === "html"
		? `
CRITICAL HTML REQUIREMENTS:
- MUST start with: <!DOCTYPE html>
- MUST include complete HTML structure: <html><head></head><body></body></html>
- MUST include proper meta tags and title
- If this is a modification, preserve the existing HTML structure
- If creating new HTML, include ALL necessary tags and structure
- Do NOT return only CSS or JavaScript - return COMPLETE HTML document
`
		: ""
}

PROJECT CONTEXT FOR REFERENCE:
${contextStr}

CRITICAL OUTPUT REQUIREMENTS:
- Respond with ONLY the complete ${expectedType.toUpperCase()} file content
- NO JSON wrapping, NO markdown code blocks, NO explanations
- Start directly with the file content
- For HTML: MUST start with <!DOCTYPE html>
- For CSS: Start with the first CSS rule
- For JS: Start with the first line of code
- For JSON: Start with { or [

Generate the complete ${expectedType.toUpperCase()} content for ${
			change.file
		}:`;

		this.logger.log("DEBUG", "Sending prompt to AI", {
			promptLength: filePrompt.length,
			expectedType,
		});

		try {
			const response = await this.anthropicService.generateCodeEdits(
				filePrompt
			);

			this.logger.log("DEBUG", "Received AI response", {
				responseLength: response.length,
				preview: response.substring(0, 200),
			});

			const cleanContent = this.contentCleaner.cleanGeneratedContent(
				response,
				expectedType
			);

			this.logger.log("DEBUG", "Content cleaned", {
				originalLength: response.length,
				cleanedLength: cleanContent.length,
				preview: cleanContent.substring(0, 200),
			});

			// Validate the cleaned content
			if (
				this.validateGeneratedContent(
					cleanContent,
					expectedType,
					change.file
				)
			) {
				// Ensure directory exists
				const dir = path.dirname(filePath);
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
					this.logger.log("DEBUG", "Created directory", { dir });
				}

				// Write the file
				fs.writeFileSync(filePath, cleanContent);

				this.logger.log("INFO", "File written successfully", {
					file: change.file,
					size: cleanContent.length,
				});

				return `${
					change.action === "create" ? "Created" : "Modified"
				} ${change.file}`;
			} else {
				throw new Error("Generated content failed validation");
			}
		} catch (error) {
			this.logger.log("ERROR", "File change execution failed", {
				file: change.file,
				error: error.message,
				stack: error.stack,
			});
			throw error;
		}
	}

	private validateGeneratedContent(
		content: string,
		expectedType: string,
		fileName: string
	): boolean {
		this.logger.log("DEBUG", "Validating generated content", {
			expectedType,
			fileName,
			contentLength: content.length,
		});

		try {
			switch (expectedType) {
				case "html":
					return this.validateHtml(content);
				case "css":
					return this.validateCss(content);
				case "js":
					return this.validateJs(content);
				case "json":
					return this.validateJson(content);
				default:
					return content.trim().length > 0;
			}
		} catch (error) {
			this.logger.log("WARN", "Content validation failed", {
				expectedType,
				fileName,
				error: error.message,
			});
			return false;
		}
	}

	private validateHtml(content: string): boolean {
		const hasDoctype = content.includes("<!DOCTYPE html>");
		const hasHtmlTags =
			content.includes("<html") && content.includes("</html>");
		const hasBasicStructure =
			content.includes("<head") && content.includes("<body");

		const isValid = hasDoctype && hasHtmlTags && hasBasicStructure;

		this.logger.log("DEBUG", "HTML validation", {
			hasDoctype,
			hasHtmlTags,
			hasBasicStructure,
			isValid,
		});

		return isValid;
	}

	private validateCss(content: string): boolean {
		const hasRules = /[^{]*\{[^}]*\}/.test(content);
		const hasProperties =
			/(margin|padding|color|background|font|border|width|height):/i.test(
				content
			);

		const isValid = hasRules || hasProperties;

		this.logger.log("DEBUG", "CSS validation", {
			hasRules,
			hasProperties,
			isValid,
		});

		return isValid;
	}

	private validateJs(content: string): boolean {
		// Basic JavaScript validation - check for common patterns
		const hasJsPatterns =
			/(function|const|let|var|class|if|for|while)/i.test(content);
		const isValid = hasJsPatterns && content.trim().length > 0;

		this.logger.log("DEBUG", "JavaScript validation", {
			hasJsPatterns,
			isValid,
		});

		return isValid;
	}

	private validateJson(content: string): boolean {
		try {
			JSON.parse(content);
			this.logger.log("DEBUG", "JSON validation successful");
			return true;
		} catch (error) {
			this.logger.log("DEBUG", "JSON validation failed", {
				error: error.message,
			});
			return false;
		}
	}

	// Helper methods
	private async scanExistingFiles(): Promise<
		Array<{
			path: string;
			type: string;
			description: string;
			size: number;
		}>
	> {
		const existingFiles: Array<{
			path: string;
			type: string;
			description: string;
			size: number;
		}> = [];

		try {
			const files = this.findAllWebFiles(this.projectRoot);

			for (const filePath of files) {
				try {
					const relativePath = path.relative(
						this.projectRoot,
						filePath
					);
					const ext = path.extname(filePath);
					const stats = fs.statSync(filePath);

					let type = "unknown";
					let description = "";

					// Determine file type and basic description
					switch (ext.toLowerCase()) {
						case ".html":
							type = "HTML page";
							const content = fs.readFileSync(filePath, "utf-8");
							const titleMatch = content.match(
								/<title>(.*?)<\/title>/i
							);
							const title = titleMatch
								? titleMatch[1]
								: "Untitled";
							description = `HTML page: ${title}`;

							// Check for navigation or multi-page indicators
							if (
								content.includes("href=") ||
								content.includes("nav")
							) {
								description += " (has navigation)";
							}
							break;
						case ".css":
							type = "Stylesheet";
							description = "CSS stylesheet";
							break;
						case ".js":
							type = "JavaScript";
							description = "JavaScript file";
							break;
						case ".json":
							type = "Configuration";
							description = "JSON configuration";
							break;
						default:
							type = ext.substring(1).toUpperCase();
							description = `${type} file`;
					}

					existingFiles.push({
						path: relativePath,
						type,
						description,
						size: stats.size,
					});
				} catch (error) {
					// Skip files that can't be read
					continue;
				}
			}
		} catch (error) {
			// If scanning fails, return empty array
			if (this.debug) {
				console.log(
					colors.yellow(`⚠️  File scanning failed: ${error.message}`)
				);
			}
		}

		return existingFiles;
	}

	private findAllWebFiles(dir: string): string[] {
		const files: string[] = [];
		const extensions = [".html", ".css", ".js", ".json", ".md", ".txt"];

		if (!fs.existsSync(dir)) return files;

		const items = fs.readdirSync(dir);
		for (const item of items) {
			const fullPath = path.join(dir, item);
			const stat = fs.statSync(fullPath);

			if (
				stat.isDirectory() &&
				!item.startsWith(".") &&
				!["node_modules", "dist", "build", "coverage"].includes(item)
			) {
				files.push(...this.findAllWebFiles(fullPath));
			} else if (extensions.some((ext) => item.endsWith(ext))) {
				files.push(fullPath);
			}
		}
		return files;
	}

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
			colors.gray("⏳ Pausing for 2 seconds to let you catch up...")
		);

		// 2 second pause
		await new Promise((resolve) => setTimeout(resolve, 2000));

		console.log(colors.gray("▶️  Continuing...\n"));
	}

	private isStandaloneFileCreation(executionPlan: any): boolean {
		if (!executionPlan) return false;

		// Explicit strategy check - trust the AI's decision
		if (executionPlan.fileStrategy === "single-file") {
			return true;
		}

		if (
			executionPlan.fileStrategy === "multi-file" ||
			executionPlan.fileStrategy === "modify-existing"
		) {
			return false;
		}

		// If we have files to modify, it's definitely not standalone
		if (
			executionPlan.likelyFilesToModify &&
			executionPlan.likelyFilesToModify.length > 0
		) {
			return false;
		}

		// If we need context files, it's not standalone
		if (
			executionPlan.contextFilesNeeded &&
			executionPlan.contextFilesNeeded.length > 0
		) {
			return false;
		}

		// If creating multiple files (like CSS + HTML), it's not standalone
		const filesToCreate = executionPlan.likelyFilesToCreate || [];
		if (filesToCreate.length > 1) {
			return false;
		}

		// For single file creation with no other dependencies, check if it's a simple standalone type
		if (filesToCreate.length === 1) {
			const file = filesToCreate[0];
			const standaloneExtensions = [
				".html",
				".css",
				".js",
				".md",
				".txt",
				".json",
			];
			const isStandaloneType = standaloneExtensions.some((ext) =>
				file.toLowerCase().endsWith(ext)
			);

			// Only consider it standalone if it's a simple single file with no coordination needs
			return isStandaloneType;
		}

		return false;
	}
}
