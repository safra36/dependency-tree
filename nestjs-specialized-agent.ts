// path: nestjs-specialized-agent.ts

import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { AnthropicService } from "./anthropic-service";
import { ConfigManager } from "./config-manager";
import { XMLContentParser } from "./xml-content-parser";
import { FileOperationsManager } from "./file-operations-manager";
import { ShellExecutor } from "./shell-executor";
import colors from "./colors";

const execAsync = promisify(exec);

interface NestJSAgentOptions {
	debug?: boolean;
	maxTokens?: number;
	temperature?: number;
}

interface NestJSOperationResult {
	success: boolean;
	summary?: string;
	details?: string[];
	changes?: string[];
	errors?: any[];
	error?: string;
	projectStructure?: any;
}

interface NestJSProjectContext {
	structure: any;
	dependencies: string[];
	modules: string[];
	controllers: string[];
	services: string[];
	guards: string[];
	pipes: string[];
	interceptors: string[];
	decorators: string[];
	entities: string[];
	dtos: string[];
	packageJson: any;
	nestCliJson: any;
	tsConfig: any;
}

interface NestJSAction {
	type:
		| "scaffold"
		| "generate"
		| "install"
		| "configure"
		| "create-file"
		| "modify-file";
	target: string;
	description: string;
	priority: number;
	schematic?: string; // For nest generate commands
	options?: string[]; // Additional options
}

export class NestJSSpecializedAgent {
	private anthropicService: AnthropicService;
	private xmlParser: XMLContentParser;
	private fileManager: FileOperationsManager;
	private shellExecutor: ShellExecutor;

	private projectRoot: string;
	private debug: boolean;
	private context: NestJSProjectContext;

	constructor(projectRoot: string, options: NestJSAgentOptions = {}) {
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
			maxTokens: options.maxTokens || 8192, // Increased for NestJS context
			temperature: options.temperature || 0.1, // Lower for more consistent code generation
			debug: this.debug,
		});

		this.xmlParser = new XMLContentParser({ debug: this.debug });
		this.fileManager = new FileOperationsManager(this.projectRoot, {
			debug: this.debug,
		});
		this.shellExecutor = new ShellExecutor(this.projectRoot, {
			debug: this.debug,
		});

		this.context = {
			structure: null,
			dependencies: [],
			modules: [],
			controllers: [],
			services: [],
			guards: [],
			pipes: [],
			interceptors: [],
			decorators: [],
			entities: [],
			dtos: [],
			packageJson: null,
			nestCliJson: null,
			tsConfig: null,
		};

		if (this.debug) {
			console.log(colors.cyan("🚀 NestJS Specialized Agent initialized"));
		}
	}

	async initialize(): Promise<void> {
		console.log("🔄 Initializing NestJS specialized agent...");

		// Test AI connection
		const connected = await this.anthropicService.testConnection();
		if (!connected) {
			throw new Error("Failed to connect to AI service");
		}

		// Analyze current project context using dependency-tree.js
		await this.analyzeProjectContext();

		if (this.debug) {
			console.log(`📁 Found ${this.context.modules.length} modules`);
			console.log(
				`🎛️ Found ${this.context.controllers.length} controllers`
			);
			console.log(`⚙️ Found ${this.context.services.length} services`);
		}
	}

	async processNestJSRequest(
		request: string
	): Promise<NestJSOperationResult> {
		try {
			// Refresh project context before processing
			await this.analyzeProjectContext();

			// Analyze the request with full NestJS context
			const analysis = await this.analyzeNestJSRequest(request);

			if (!analysis.success) {
				return {
					success: false,
					error: "Failed to analyze NestJS request",
				};
			}

			if (this.debug) {
				console.log(
					colors.cyan(
						`🔍 Parsed ${analysis.actions.length} NestJS actions`
					)
				);
				analysis.actions.forEach((action, i) => {
					console.log(
						colors.gray(
							`  ${i + 1}. ${action.type}: ${action.target} (${
								action.schematic || "no schematic"
							})`
						)
					);
				});
			}

			// Execute NestJS-specific actions
			const results = await this.executeNestJSActions(analysis.actions);

			// Re-analyze project after changes
			await this.analyzeProjectContext();

			const successCount = results.filter((r) => r.success).length;
			const totalCount = results.length;

			return {
				success: successCount > 0,
				summary: `Completed ${successCount}/${totalCount} NestJS operations`,
				details: results.map(
					(r) => r.summary || r.error || "Unknown result"
				),
				changes: results.flatMap((r) => r.changes || []),
				errors: results.filter((r) => !r.success).map((r) => r.error),
				projectStructure: this.context.structure,
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	private async analyzeProjectContext(): Promise<void> {
		try {
			// Use dependency-tree.js to analyze the project
			const dependencyTreePath = path.join(
				__dirname,
				"dependancy-tree.js"
			);

			if (!fs.existsSync(dependencyTreePath)) {
				throw new Error("dependency-tree.js not found");
			}

			// Check if this is a NestJS project or if we need to create one
			const isNestJSProject = await this.isNestJSProject();

			if (isNestJSProject) {
				// Analyze existing NestJS project
				const { stdout } = await execAsync(
					`node "${dependencyTreePath}" "${this.projectRoot}" --format json --pattern "**/*.ts" --max-content 50000`
				);

				this.context.structure = JSON.parse(stdout);

				// Extract NestJS-specific information
				await this.extractNestJSComponents();
				await this.loadProjectConfigurations();
			} else {
				// Initialize empty context for new project
				this.context = {
					structure: null,
					dependencies: [],
					modules: [],
					controllers: [],
					services: [],
					guards: [],
					pipes: [],
					interceptors: [],
					decorators: [],
					entities: [],
					dtos: [],
					packageJson: null,
					nestCliJson: null,
					tsConfig: null,
				};
			}
		} catch (error) {
			if (this.debug) {
				console.log(
					colors.yellow(
						`⚠️ Could not analyze project context: ${error.message}`
					)
				);
			}
		}
	}

	private async isNestJSProject(): Promise<boolean> {
		const packageJsonPath = path.join(this.projectRoot, "package.json");

		if (!fs.existsSync(packageJsonPath)) {
			return false;
		}

		try {
			const packageJson = JSON.parse(
				fs.readFileSync(packageJsonPath, "utf-8")
			);
			return !!(
				packageJson.dependencies?.["@nestjs/core"] ||
				packageJson.devDependencies?.["@nestjs/core"]
			);
		} catch {
			return false;
		}
	}

	private async extractNestJSComponents(): Promise<void> {
		if (!this.context.structure) return;

		const files = this.getAllFilesFromStructure(this.context.structure);

		for (const file of files) {
			if (!file.content) continue;

			const filePath = file.path;
			const content = file.content;

			// Extract different NestJS component types
			if (filePath.includes(".module.ts")) {
				this.context.modules.push(filePath);
			}

			if (filePath.includes(".controller.ts")) {
				this.context.controllers.push(filePath);
			}

			if (filePath.includes(".service.ts")) {
				this.context.services.push(filePath);
			}

			if (filePath.includes(".guard.ts")) {
				this.context.guards.push(filePath);
			}

			if (filePath.includes(".pipe.ts")) {
				this.context.pipes.push(filePath);
			}

			if (filePath.includes(".interceptor.ts")) {
				this.context.interceptors.push(filePath);
			}

			if (filePath.includes(".decorator.ts")) {
				this.context.decorators.push(filePath);
			}

			if (filePath.includes(".entity.ts")) {
				this.context.entities.push(filePath);
			}

			if (filePath.includes(".dto.ts")) {
				this.context.dtos.push(filePath);
			}
		}
	}

	private getAllFilesFromStructure(structure: any): any[] {
		const files = [];

		if (structure.results) {
			// Multiple file analysis result
			for (const result of structure.results) {
				files.push(...this.extractFilesFromTree(result.tree));
			}
		} else if (structure.tree || structure) {
			// Single file analysis result
			files.push(
				...this.extractFilesFromTree(structure.tree || structure)
			);
		}

		return files;
	}

	private extractFilesFromTree(tree: any): any[] {
		const files = [];

		if (tree.path && tree.content) {
			files.push({
				path: tree.path,
				content: tree.content,
				size: tree.size || 0,
			});
		}

		if (tree.dependencies) {
			for (const dep of tree.dependencies) {
				files.push(...this.extractFilesFromTree(dep));
			}
		}

		return files;
	}

	private async loadProjectConfigurations(): Promise<void> {
		// Load package.json
		const packageJsonPath = path.join(this.projectRoot, "package.json");
		if (fs.existsSync(packageJsonPath)) {
			try {
				this.context.packageJson = JSON.parse(
					fs.readFileSync(packageJsonPath, "utf-8")
				);
				this.context.dependencies = [
					...Object.keys(this.context.packageJson.dependencies || {}),
					...Object.keys(
						this.context.packageJson.devDependencies || {}
					),
				];
			} catch (error) {
				if (this.debug)
					console.log(
						colors.yellow(
							`⚠️ Could not load package.json: ${error.message}`
						)
					);
			}
		}

		// Load nest-cli.json
		const nestCliJsonPath = path.join(this.projectRoot, "nest-cli.json");
		if (fs.existsSync(nestCliJsonPath)) {
			try {
				this.context.nestCliJson = JSON.parse(
					fs.readFileSync(nestCliJsonPath, "utf-8")
				);
			} catch (error) {
				if (this.debug)
					console.log(
						colors.yellow(
							`⚠️ Could not load nest-cli.json: ${error.message}`
						)
					);
			}
		}

		// Load tsconfig.json
		const tsConfigPath = path.join(this.projectRoot, "tsconfig.json");
		if (fs.existsSync(tsConfigPath)) {
			try {
				this.context.tsConfig = JSON.parse(
					fs.readFileSync(tsConfigPath, "utf-8")
				);
			} catch (error) {
				if (this.debug)
					console.log(
						colors.yellow(
							`⚠️ Could not load tsconfig.json: ${error.message}`
						)
					);
			}
		}
	}

	private async analyzeNestJSRequest(request: string): Promise<{
		success: boolean;
		actions: NestJSAction[];
	}> {
		try {
			const prompt = this.buildNestJSAnalysisPrompt(request);

			const response = await this.anthropicService.generateWithXMLPrompt(
				prompt,
				{},
				["analysis", "actions", "recommendations"]
			);

			const analysisResult = this.xmlParser.parseResponse(response, [
				"analysis",
				"actions",
				"recommendations",
			]);

			if (!analysisResult.success) {
				if (this.debug) {
					console.log(
						colors.red(
							"❌ Failed to parse NestJS analysis response"
						)
					);
				}
				return { success: false, actions: [] };
			}

			const actions = this.parseNestJSActions(
				analysisResult.content.actions || ""
			);

			return {
				success: true,
				actions: actions.sort((a, b) => a.priority - b.priority),
			};
		} catch (error) {
			if (this.debug) {
				console.log(
					colors.red(`❌ NestJS analysis failed: ${error.message}`)
				);
			}
			return { success: false, actions: [] };
		}
	}

	private buildNestJSAnalysisPrompt(request: string): string {
		const isExistingProject = this.context.structure !== null;

		return `
<nestjs_context>
  <project_status>${isExistingProject ? "existing" : "new"}</project_status>
  <project_root>${this.projectRoot}</project_root>
  <existing_modules>${
		this.context.modules.join(", ") || "None"
  }</existing_modules>
  <existing_controllers>${
		this.context.controllers.join(", ") || "None"
  }</existing_controllers>
  <existing_services>${
		this.context.services.join(", ") || "None"
  }</existing_services>
  <existing_guards>${this.context.guards.join(", ") || "None"}</existing_guards>
  <existing_pipes>${this.context.pipes.join(", ") || "None"}</existing_pipes>
  <existing_interceptors>${
		this.context.interceptors.join(", ") || "None"
  }</existing_interceptors>
  <existing_entities>${
		this.context.entities.join(", ") || "None"
  }</existing_entities>
  <existing_dtos>${this.context.dtos.join(", ") || "None"}</existing_dtos>
  <dependencies>${this.context.dependencies.join(", ") || "None"}</dependencies>
  <nest_cli_config>${
		this.context.nestCliJson
			? JSON.stringify(this.context.nestCliJson)
			: "Not found"
  }</nest_cli_config>
</nestjs_context>

<user_request>${request}</user_request>

<nestjs_capabilities>
  <scaffolding>
    - nest new [project-name] - Create new NestJS project
    - nest generate app [name] - Generate new application
    - nest generate library [name] - Generate new library
  </scaffolding>
  
  <components>
    - nest generate module [name] - Generate module
    - nest generate controller [name] - Generate controller
    - nest generate service [name] - Generate service
    - nest generate provider [name] - Generate provider
    - nest generate class [name] - Generate class
    - nest generate interface [name] - Generate interface
    - nest generate middleware [name] - Generate middleware
    - nest generate exception [name] - Generate exception filter
    - nest generate pipe [name] - Generate pipe
    - nest generate guard [name] - Generate guard
    - nest generate interceptor [name] - Generate interceptor
    - nest generate decorator [name] - Generate decorator
    - nest generate gateway [name] - Generate WebSocket gateway
    - nest generate resolver [name] - Generate GraphQL resolver
  </scaffolding>
  
  <database>
    - Support for TypeORM, Prisma, Mongoose
    - Entity generation and configuration
    - Migration handling
    - Repository patterns
  </database>
  
  <authentication>
    - JWT implementation
    - Passport integration
    - Guards and strategies
    - Role-based access control
  </authentication>
  
  <api_features>
    - REST API controllers
    - GraphQL resolvers
    - Swagger/OpenAPI documentation
    - Validation pipes
    - Transform pipes
    - Exception filters
  </api_features>
</nestjs_capabilities>

<nestjs_best_practices>
  - Use modules to organize related functionality
  - Implement proper dependency injection
  - Use DTOs for data validation and transformation
  - Implement guards for authentication and authorization
  - Use interceptors for cross-cutting concerns
  - Follow NestJS naming conventions
  - Use proper exception handling
  - Implement proper logging
  - Use configuration management
  - Write unit and e2e tests
</nestjs_best_practices>

<instructions>
Analyze the user request as a NestJS specialist. Determine what NestJS-specific actions are needed.
Focus on NestJS architecture patterns, component generation, and best practices.
Consider the current project state and recommend appropriate next steps.

Provide specific NestJS CLI commands, file creations, and configurations needed.
Include proper module imports, dependency injection setup, and architectural decisions.
</instructions>

RESPONSE FORMAT:
<analysis>
[Your analysis of what needs to be done from a NestJS perspective]
</analysis>

<actions>
[Specific NestJS actions needed - use numbered list with exact commands and file operations]
</actions>

<recommendations>
[NestJS best practices and architectural recommendations for this request]
</recommendations>
`;
	}

	private parseNestJSActions(actionsText: string): NestJSAction[] {
		const actions: NestJSAction[] = [];

		if (this.debug) {
			console.log(colors.cyan("🔍 Parsing NestJS actions"));
		}

		const actionLines = actionsText
			.split(/\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		let priority = 1;

		for (const line of actionLines) {
			// Remove numbering from start of line
			const cleanLine = line.replace(/^\d+\.\s*/, "").trim();

			if (cleanLine.length === 0) continue;

			let action: NestJSAction | null = null;

			// Parse npm install commands
			if (
				cleanLine.includes("npm install") ||
				cleanLine.includes("yarn add")
			) {
				action = {
					type: "install",
					target: cleanLine,
					description: `Install packages: ${cleanLine}`,
					priority: priority,
				};
			}
			// Parse explicit nest generate commands
			else if (
				cleanLine.startsWith("nest generate") ||
				cleanLine.startsWith("nest g")
			) {
				action = this.parseExplicitNestCommand(cleanLine, priority);
			}
			// Parse descriptions that mention nest generate
			else if (cleanLine.includes("nest generate")) {
				action = this.parseExplicitNestCommand(cleanLine, priority);
			}
			// Parse descriptive lines followed by commands
			else if (
				cleanLine.includes(":") &&
				!cleanLine.includes("npm") &&
				!cleanLine.includes("nest")
			) {
				// This might be a description line, skip it and the next line might have the actual command
				continue;
			}
			// Parse configuration lines
			else if (
				cleanLine.includes("JWT_SECRET") ||
				cleanLine.includes(".env") ||
				cleanLine.includes("TypeOrmModule")
			) {
				action = {
					type: "configure",
					target: "configuration",
					description: cleanLine,
					priority: priority,
				};
			}
			// Parse file creation
			else if (
				cleanLine.toLowerCase().includes("create") &&
				(cleanLine.includes(".ts") ||
					cleanLine.includes(".js") ||
					cleanLine.includes(".json"))
			) {
				const fileMatch = cleanLine.match(/(\S+\.\w+)/);
				action = {
					type: "create-file",
					target: fileMatch ? fileMatch[1] : "new-file",
					description: cleanLine,
					priority: priority,
				};
			}

			if (action) {
				actions.push(action);
				priority++;

				if (this.debug) {
					console.log(
						colors.gray(
							`  Parsed: ${action.type} - ${action.target} (${
								action.schematic || "no schematic"
							})`
						)
					);
				}
			}
		}

		return actions;
	}

	private parseExplicitNestCommand(
		command: string,
		priority: number
	): NestJSAction {
		// Parse explicit commands like "nest generate module users"
		const parts = command.split(" ").filter((p) => p.length > 0);

		// Find the generate keyword
		const generateIndex = parts.findIndex(
			(p) => p === "generate" || p === "g"
		);

		if (generateIndex === -1) {
			return {
				type: "generate",
				target: "unknown",
				description: command,
				priority,
			};
		}

		const schematic = parts[generateIndex + 1];
		const name = parts[generateIndex + 2];

		return {
			type: "generate",
			target: name || "component",
			description: command,
			priority,
			schematic: schematic,
			options: parts.slice(generateIndex + 3),
		};
	}

	private isNestCommand(line: string): boolean {
		return line.includes("nest ") || line.startsWith("nest ");
	}

	private parseNestCommand(command: string, priority: number): NestJSAction {
		const parts = command.split(" ");

		if (parts.includes("new")) {
			return {
				type: "scaffold",
				target: parts[parts.indexOf("new") + 1] || "new-project",
				description: command,
				priority,
				schematic: "new",
			};
		}

		if (parts.includes("generate") || parts.includes("g")) {
			const generateIndex = parts.findIndex(
				(p) => p === "generate" || p === "g"
			);
			const schematic = parts[generateIndex + 1];
			const name = parts[generateIndex + 2];

			return {
				type: "generate",
				target: name || "component",
				description: command,
				priority,
				schematic: schematic,
				options: parts.slice(generateIndex + 3),
			};
		}

		return {
			type: "scaffold",
			target: command,
			description: command,
			priority,
		};
	}

	private async executeNestJSActions(
		actions: NestJSAction[]
	): Promise<NestJSOperationResult[]> {
		const results: NestJSOperationResult[] = [];

		// First, check if we need to create a NestJS project
		const needsProject = !(await this.isNestJSProject());
		if (needsProject && actions.some((a) => a.type === "generate")) {
			console.log(
				colors.yellow(
					"⚠️ No NestJS project detected. Creating one first..."
				)
			);

			// Create a basic NestJS project
			const createProjectAction: NestJSAction = {
				type: "scaffold",
				target: "nest-app",
				description: "Create NestJS project",
				priority: 0,
				schematic: "new",
			};

			const projectResult = await this.executeNestCommand(
				createProjectAction
			);
			results.push(projectResult);

			if (!projectResult.success) {
				console.log(
					colors.red(
						"❌ Failed to create NestJS project. Continuing with other actions..."
					)
				);
			} else {
				// Update project root to the new project directory
				this.projectRoot = path.join(this.projectRoot, "nest-app");
				this.shellExecutor = new ShellExecutor(this.projectRoot, {
					debug: this.debug,
				});
				await this.analyzeProjectContext();
			}
		}

		for (const action of actions) {
			if (this.debug) {
				console.log(
					colors.cyan(
						`🚀 Executing NestJS action: ${action.type} ${action.target}`
					)
				);
			}

			let result: NestJSOperationResult;

			switch (action.type) {
				case "scaffold":
				case "generate":
					result = await this.executeNestCommand(action);
					break;
				case "install":
					result = await this.executeInstallCommand(action);
					break;
				case "create-file":
					result = await this.createNestJSFile(action);
					break;
				case "modify-file":
					result = await this.modifyNestJSFile(action);
					break;
				case "configure":
					result = await this.configureNestJS(action);
					break;
				default:
					result = {
						success: false,
						error: `Unknown NestJS action type: ${action.type}`,
					};
			}

			results.push(result);

			if (this.debug) {
				if (result.success) {
					console.log(colors.green(`✅ ${result.summary}`));
					if (result.details && result.details.length > 0) {
						result.details.forEach((detail) => {
							console.log(
								colors.gray(`  ${detail.substring(0, 100)}...`)
							);
						});
					}
				} else {
					console.log(colors.red(`❌ ${result.error}`));
					if (result.errors && result.errors.length > 0) {
						result.errors.forEach((error) => {
							console.log(
								colors.red(`  ${error.substring(0, 100)}...`)
							);
						});
					}
				}
			}

			// Small delay between actions to avoid overwhelming the system
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		return results;
	}

	private async executeNestCommand(
		action: NestJSAction
	): Promise<NestJSOperationResult> {
		try {
			// Check if NestJS CLI is available
			const cliCheck = await this.shellExecutor.executeCommand(
				"nest --version"
			);
			if (!cliCheck.success) {
				// Try to install NestJS CLI globally
				console.log(
					colors.yellow("⚠️ NestJS CLI not found. Installing...")
				);
				const installResult = await this.shellExecutor.executeCommand(
					"npm install -g @nestjs/cli"
				);

				if (!installResult.success) {
					return {
						success: false,
						error: `NestJS CLI not available and failed to install: ${installResult.stderr}`,
					};
				}
			}

			// Build the full nest command based on the action
			let command = "";

			if (action.schematic === "new") {
				command = `nest new ${action.target} --package-manager npm`;
			} else if (action.schematic) {
				command = `nest generate ${action.schematic} ${action.target}`;

				// Add options if provided
				if (action.options && action.options.length > 0) {
					command += ` ${action.options.join(" ")}`;
				}
			} else {
				// Fallback: try to parse from description
				if (
					action.description.includes("nest generate") ||
					action.description.includes("nest g")
				) {
					command = action.description;
				} else {
					return {
						success: false,
						error: `Cannot determine nest command for action: ${action.description}`,
					};
				}
			}

			if (this.debug) {
				console.log(colors.yellow(`🔧 Executing: ${command}`));
			}

			const result = await this.shellExecutor.executeCommand(command);

			return {
				success: result.success,
				summary: result.success
					? `Generated ${action.schematic || "component"}: ${
							action.target
					  }`
					: `Failed to generate ${action.schematic || "component"}: ${
							action.target
					  }`,
				details: result.stdout ? [result.stdout] : [],
				errors: result.success
					? []
					: [result.stderr || result.stdout || "Unknown error"],
			};
		} catch (error) {
			return {
				success: false,
				error: `Command execution failed: ${error.message}`,
			};
		}
	}

	private async executeInstallCommand(
		action: NestJSAction
	): Promise<NestJSOperationResult> {
		try {
			const result = await this.shellExecutor.executeCommand(
				action.target
			);

			return {
				success: result.success,
				summary: result.success
					? `Installed packages`
					: `Failed to install packages`,
				details: result.stdout ? [result.stdout] : [],
				errors: result.success
					? []
					: [result.stderr || "Unknown error"],
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	private async createNestJSFile(
		action: NestJSAction
	): Promise<NestJSOperationResult> {
		try {
			// Generate NestJS-specific file content
			const content = await this.generateNestJSFileContent(
				action.target,
				action.description
			);

			const result = await this.fileManager.createFile(
				action.target,
				content
			);

			return {
				success: result.success,
				summary: result.success
					? `Created NestJS file: ${action.target}`
					: `Failed to create file: ${action.target}`,
				details: result.success
					? [`Generated ${content.length} characters`]
					: [],
				errors: result.success ? [] : [result.error || "Unknown error"],
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	private async modifyNestJSFile(
		action: NestJSAction
	): Promise<NestJSOperationResult> {
		try {
			const currentContent = fs.existsSync(
				path.join(this.projectRoot, action.target)
			)
				? fs.readFileSync(
						path.join(this.projectRoot, action.target),
						"utf-8"
				  )
				: "";

			const newContent = await this.generateNestJSFileModification(
				action.target,
				currentContent,
				action.description
			);

			const result = await this.fileManager.modifyFile(
				action.target,
				newContent
			);

			return {
				success: result.success,
				summary: result.success
					? `Modified NestJS file: ${action.target}`
					: `Failed to modify file: ${action.target}`,
				details: result.success
					? [`Updated with ${newContent.length} characters`]
					: [],
				errors: result.success ? [] : [result.error || "Unknown error"],
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	private async configureNestJS(
		action: NestJSAction
	): Promise<NestJSOperationResult> {
		try {
			const description = action.description.toLowerCase();

			// Handle JWT configuration
			if (description.includes("jwt") && description.includes(".env")) {
				const envContent = `# JWT Configuration
JWT_SECRET=your_jwt_secret_here_${Math.random().toString(36).substring(2, 15)}
JWT_EXPIRATION=24h

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=username
DB_PASSWORD=password
DB_DATABASE=nestjs_app

# Application Configuration
PORT=3000
NODE_ENV=development
`;

				const result = await this.fileManager.createFile(
					".env",
					envContent
				);

				if (result.success) {
					// Also create .env.example
					const envExampleContent = envContent
						.replace(
							/JWT_SECRET=.*/,
							"JWT_SECRET=your_jwt_secret_here"
						)
						.replace(
							/DB_PASSWORD=.*/,
							"DB_PASSWORD=your_password_here"
						);

					await this.fileManager.createFile(
						".env.example",
						envExampleContent
					);
				}

				return {
					success: result.success,
					summary: result.success
						? "Created JWT configuration files (.env and .env.example)"
						: "Failed to create JWT configuration",
					details: result.success
						? [
								"Created .env with JWT_SECRET and database config",
								"Created .env.example template",
						  ]
						: [],
					errors: result.success
						? []
						: [result.error || "Unknown error"],
				};
			}

			// Handle TypeORM configuration
			if (
				description.includes("typeorm") &&
				description.includes("app.module.ts")
			) {
				const appModulePath = path.join(
					this.projectRoot,
					"src",
					"app.module.ts"
				);

				if (fs.existsSync(appModulePath)) {
					let currentContent = fs.readFileSync(
						appModulePath,
						"utf-8"
					);

					// Add TypeORM import if not present
					if (!currentContent.includes("TypeOrmModule")) {
						currentContent = `import { TypeOrmModule } from '@nestjs/typeorm';\n${currentContent}`;
					}

					// Add TypeORM configuration to imports
					const typeormConfig = `TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      username: process.env.DB_USERNAME || 'username',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'nestjs_app',
      entities: [],
      synchronize: true, // Don't use in production
    })`;

					// Insert into imports array
					const importsMatch =
						currentContent.match(/imports:\s*\[(.*?)\]/s);
					if (importsMatch) {
						const currentImports = importsMatch[1].trim();
						const newImports = currentImports
							? `${currentImports},\n    ${typeormConfig}`
							: typeormConfig;
						currentContent = currentContent.replace(
							/imports:\s*\[(.*?)\]/s,
							`imports: [\n    ${newImports}\n  ]`
						);
					}

					const result = await this.fileManager.modifyFile(
						"src/app.module.ts",
						currentContent
					);

					return {
						success: result.success,
						summary: result.success
							? "Configured TypeORM in app.module.ts"
							: "Failed to configure TypeORM",
						details: result.success
							? ["Added TypeORM configuration with PostgreSQL"]
							: [],
						errors: result.success
							? []
							: [result.error || "Unknown error"],
					};
				}
			}

			// Default configuration handler
			return {
				success: true,
				summary: `Configuration task completed: ${action.description}`,
				details: ["Configuration applied successfully"],
			};
		} catch (error) {
			return {
				success: false,
				error: `Configuration failed: ${error.message}`,
			};
		}
	}

	private async generateNestJSFileContent(
		filename: string,
		description: string
	): Promise<string> {
		const prompt = this.buildNestJSFileGenerationPrompt(
			filename,
			description
		);

		const response = await this.anthropicService.generateWithXMLPrompt(
			prompt,
			{},
			["content", "imports", "exports"]
		);

		const result = this.xmlParser.parseResponse(response, [
			"content",
			"imports",
			"exports",
		]);

		if (!result.success || !result.content.content) {
			throw new Error("Failed to generate NestJS file content");
		}

		return result.content.content.trim();
	}

	private async generateNestJSFileModification(
		filename: string,
		currentContent: string,
		description: string
	): Promise<string> {
		const prompt = this.buildNestJSFileModificationPrompt(
			filename,
			currentContent,
			description
		);

		const response = await this.anthropicService.generateWithXMLPrompt(
			prompt,
			{},
			["content", "changes"]
		);

		const result = this.xmlParser.parseResponse(response, [
			"content",
			"changes",
		]);

		if (!result.success || !result.content.content) {
			throw new Error("Failed to generate NestJS file modifications");
		}

		return result.content.content.trim();
	}

	private buildNestJSFileGenerationPrompt(
		filename: string,
		description: string
	): string {
		const fileType = this.determineNestJSFileType(filename);

		return `
<nestjs_file_generation>
  <filename>${filename}</filename>
  <file_type>${fileType}</file_type>
  <description>${description}</description>
  <project_context>
    <modules>${this.context.modules.join(", ")}</modules>
    <controllers>${this.context.controllers.join(", ")}</controllers>
    <services>${this.context.services.join(", ")}</services>
    <dependencies>${this.context.dependencies.join(", ")}</dependencies>
  </project_context>
</nestjs_file_generation>

<nestjs_patterns>
  <module>
    - Use @Module() decorator
    - Import related modules
    - Provide services and controllers
    - Export services for other modules
  </module>
  
  <controller>
    - Use @Controller() decorator with route prefix
    - Inject services via constructor
    - Use route decorators (@Get, @Post, etc.)
    - Use DTOs for request/response validation
    - Implement proper error handling
  </controller>
  
  <service>
    - Use @Injectable() decorator
    - Implement business logic
    - Use dependency injection
    - Return appropriate data structures
  </service>
  
  <guard>
    - Implement CanActivate interface
    - Use @Injectable() decorator
    - Return boolean or Promise<boolean>
  </guard>
  
  <pipe>
    - Implement PipeTransform interface
    - Use @Injectable() decorator
    - Transform and validate data
  </pipe>
  
  <interceptor>
    - Implement NestInterceptor interface
    - Use @Injectable() decorator
    - Handle request/response transformation
  </interceptor>
</nestjs_patterns>

Generate a complete, production-ready NestJS ${fileType} file following NestJS best practices and conventions.

RESPONSE FORMAT:
<content>
[Complete NestJS file content]
</content>

<imports>
[List of imports needed]
</imports>

<exports>
[List of exports provided]
</exports>
`;
	}

	private buildNestJSFileModificationPrompt(
		filename: string,
		currentContent: string,
		description: string
	): string {
		return `
<nestjs_file_modification>
  <filename>${filename}</filename>
  <current_content>${currentContent}</current_content>
  <modification_request>${description}</modification_request>
  <project_context>
    <modules>${this.context.modules.join(", ")}</modules>
    <dependencies>${this.context.dependencies.join(", ")}</dependencies>
  </project_context>
</nestjs_file_modification>

Modify the NestJS file according to the request while maintaining NestJS best practices and existing functionality.

RESPONSE FORMAT:
<content>
[Modified NestJS file content]
</content>

<changes>
[Summary of changes made]
</changes>
`;
	}

	private determineNestJSFileType(filename: string): string {
		if (filename.includes(".module.ts")) return "module";
		if (filename.includes(".controller.ts")) return "controller";
		if (filename.includes(".service.ts")) return "service";
		if (filename.includes(".guard.ts")) return "guard";
		if (filename.includes(".pipe.ts")) return "pipe";
		if (filename.includes(".interceptor.ts")) return "interceptor";
		if (filename.includes(".decorator.ts")) return "decorator";
		if (filename.includes(".entity.ts")) return "entity";
		if (filename.includes(".dto.ts")) return "dto";
		if (filename.includes(".interface.ts")) return "interface";
		if (filename.includes(".middleware.ts")) return "middleware";
		if (filename.includes(".exception.ts")) return "exception-filter";
		if (filename.includes(".gateway.ts")) return "gateway";
		if (filename.includes(".resolver.ts")) return "resolver";

		return "class";
	}

	async testConnection(): Promise<boolean> {
		return await this.anthropicService.testConnection();
	}

	setDebug(debug: boolean): void {
		this.debug = debug;
		this.anthropicService.setDebug?.(debug);
	}

	getProjectContext(): NestJSProjectContext {
		return this.context;
	}
}
