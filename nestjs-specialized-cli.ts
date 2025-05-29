#!/usr/bin/env node
// path: nestjs-specialized-cli.ts

import colors from "./colors";
import { ConfigManager } from "./config-manager";
import * as readline from "readline";
import { NestJSSpecializedAgent } from "./nestjs-specialized-agent";

class NestJSSpecializedCLI {
	private rl: readline.Interface;
	private agent: NestJSSpecializedAgent | null = null;
	private projectRoot: string;
	private debug: boolean = false;

	constructor() {
		this.projectRoot = process.cwd();

		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: colors.cyan("🚀 NestJS Agent > "),
		});

		this.setupEventHandlers();
	}

	private setupEventHandlers(): void {
		this.rl.on("line", async (input) => {
			await this.processInput(input.trim());
		});

		this.rl.on("close", () => {
			console.log(colors.yellow("\n👋 Happy NestJS coding!"));
			process.exit(0);
		});

		process.on("SIGINT", () => {
			console.log(colors.yellow("\n\n👋 Happy NestJS coding!"));
			process.exit(0);
		});
	}

	async start(): Promise<void> {
		console.log(colors.bold(colors.red("🚀 NestJS Specialized Agent")));
		console.log("=".repeat(50));
		console.log("");
		console.log(colors.green("AI-powered NestJS development assistant"));
		console.log("");
		console.log(colors.yellow("NestJS Commands:"));
		console.log("  /init           - Initialize NestJS agent");
		console.log("  /new <name>     - Create new NestJS project");
		console.log(
			"  /generate <component> <name> - Generate NestJS component"
		);
		console.log("  /module <name>  - Generate module");
		console.log("  /controller <name> - Generate controller");
		console.log("  /service <name> - Generate service");
		console.log("  /guard <name>   - Generate guard");
		console.log("  /pipe <name>    - Generate pipe");
		console.log("  /interceptor <name> - Generate interceptor");
		console.log("  /entity <name>  - Generate entity");
		console.log("  /dto <name>     - Generate DTO");
		console.log("");
		console.log(colors.yellow("Project Commands:"));
		console.log("  /analyze        - Analyze current NestJS project");
		console.log("  /structure      - Show project structure");
		console.log("  /dependencies   - Show project dependencies");
		console.log("  /test           - Test AI connection");
		console.log("  /debug          - Toggle debug mode");
		console.log("  /help           - Show help");
		console.log("  /exit           - Exit");
		console.log("");
		console.log(colors.green("Natural Language:"));
		console.log('  "create a user authentication module"');
		console.log('  "add JWT authentication to my app"');
		console.log('  "create a REST API for products"');
		console.log('  "set up database with TypeORM"');
		console.log('  "add Swagger documentation"');
		console.log('  "create a GraphQL resolver for users"');
		console.log("");

		await this.checkSetup();
		this.rl.prompt();
	}

	private async checkSetup(): Promise<void> {
		const configManager = ConfigManager.createFromEnv();

		if (!configManager.hasAnthropicApiKey()) {
			console.log(colors.red("⚠️  No API key found!"));
			console.log("Set ANTHROPIC_API_KEY or run /init");
		} else {
			console.log(colors.green("✅ API key configured"));
			try {
				this.agent = new NestJSSpecializedAgent(this.projectRoot, {
					debug: this.debug,
				});
				await this.agent.initialize();
				console.log(colors.green("✅ NestJS Agent ready"));

				const context = this.agent.getProjectContext();
				if (context.structure) {
					console.log(
						colors.blue(
							`📁 Detected NestJS project with ${context.modules.length} modules`
						)
					);
				} else {
					console.log(
						colors.yellow(
							"📁 No NestJS project detected in current directory"
						)
					);
				}
			} catch (error) {
				console.log(colors.red(`❌ Setup failed: ${error.message}`));
			}
		}
	}

	private async processInput(input: string): Promise<void> {
		if (!input) {
			this.rl.prompt();
			return;
		}

		if (input.startsWith("/")) {
			await this.handleCommand(input.substring(1));
		} else {
			await this.handleNestJSRequest(input);
		}
	}

	private async handleCommand(command: string): Promise<void> {
		const [cmd, ...args] = command.split(" ");
		const arg = args.join(" ");

		switch (cmd.toLowerCase()) {
			case "init":
				await this.initializeAgent();
				break;
			case "new":
				if (!arg) {
					console.log(colors.red("Usage: /new <project-name>"));
					break;
				}
				await this.createProject(arg);
				break;
			case "generate":
			case "g":
				if (args.length < 2) {
					console.log(
						colors.red("Usage: /generate <component-type> <name>")
					);
					console.log(
						colors.gray(
							"Examples: /generate module users, /generate controller auth"
						)
					);
					break;
				}
				await this.generateComponent(args[0], args[1], args.slice(2));
				break;
			case "module":
				if (!arg) {
					console.log(colors.red("Usage: /module <name>"));
					break;
				}
				await this.generateComponent("module", arg);
				break;
			case "controller":
				if (!arg) {
					console.log(colors.red("Usage: /controller <name>"));
					break;
				}
				await this.generateComponent("controller", arg);
				break;
			case "service":
				if (!arg) {
					console.log(colors.red("Usage: /service <name>"));
					break;
				}
				await this.generateComponent("service", arg);
				break;
			case "guard":
				if (!arg) {
					console.log(colors.red("Usage: /guard <name>"));
					break;
				}
				await this.generateComponent("guard", arg);
				break;
			case "pipe":
				if (!arg) {
					console.log(colors.red("Usage: /pipe <name>"));
					break;
				}
				await this.generateComponent("pipe", arg);
				break;
			case "interceptor":
				if (!arg) {
					console.log(colors.red("Usage: /interceptor <name>"));
					break;
				}
				await this.generateComponent("interceptor", arg);
				break;
			case "entity":
				if (!arg) {
					console.log(colors.red("Usage: /entity <name>"));
					break;
				}
				await this.generateComponent("entity", arg);
				break;
			case "dto":
				if (!arg) {
					console.log(colors.red("Usage: /dto <name>"));
					break;
				}
				await this.generateComponent("dto", arg);
				break;
			case "analyze":
				await this.analyzeProject();
				break;
			case "structure":
				await this.showProjectStructure();
				break;
			case "dependencies":
				await this.showDependencies();
				break;
			case "test":
				await this.testConnection();
				break;
			case "debug":
				this.toggleDebug();
				break;
			case "help":
				this.showHelp();
				break;
			case "exit":
			case "quit":
				this.rl.close();
				return;
			default:
				console.log(colors.red(`Unknown command: ${cmd}`));
				console.log(colors.gray("Type /help for available commands"));
		}

		this.rl.prompt();
	}

	private async initializeAgent(): Promise<void> {
		const configManager = ConfigManager.createFromEnv();

		if (!configManager.hasAnthropicApiKey()) {
			const apiKey = await this.askQuestion(
				"Enter Anthropic API key: ",
				true
			);
			if (apiKey?.trim()) {
				configManager.setAnthropicApiKey(apiKey.trim());
				console.log(colors.green("✅ API key saved"));
			} else {
				console.log(colors.yellow("⚠️ No API key provided"));
				return;
			}
		}

		try {
			this.agent = new NestJSSpecializedAgent(this.projectRoot, {
				debug: this.debug,
			});
			await this.agent.initialize();
			console.log(colors.green("✅ NestJS Agent initialized"));

			const context = this.agent.getProjectContext();
			if (context.structure) {
				console.log(
					colors.blue(
						`📁 Analyzed NestJS project with ${context.modules.length} modules, ${context.controllers.length} controllers, ${context.services.length} services`
					)
				);
			}
		} catch (error) {
			console.log(colors.red(`❌ Failed: ${error.message}`));
		}
	}

	private async createProject(name: string): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			return;
		}

		console.log(colors.blue(`🚀 Creating NestJS project: ${name}`));

		try {
			const result = await this.agent.processNestJSRequest(
				`create new nestjs project named ${name}`
			);
			if (result.success) {
				console.log(colors.green(`✅ ${result.summary}`));
				result.details?.forEach((detail) => console.log(`  ${detail}`));

				if (result.projectStructure) {
					console.log(
						colors.blue("📁 Project structure created successfully")
					);
				}
			} else {
				console.log(colors.red(`❌ Failed: ${result.error}`));
			}
		} catch (error) {
			console.log(colors.red(`❌ Error: ${error.message}`));
		}
	}

	private async generateComponent(
		type: string,
		name: string,
		options: string[] = []
	): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			return;
		}

		const optionsStr =
			options.length > 0 ? ` with options ${options.join(" ")}` : "";
		console.log(colors.blue(`🔨 Generating ${type}: ${name}${optionsStr}`));

		try {
			const result = await this.agent.processNestJSRequest(
				`generate ${type} named ${name}${optionsStr}`
			);
			if (result.success) {
				console.log(colors.green(`✅ ${result.summary}`));
				result.details?.forEach((detail) => console.log(`  ${detail}`));
			} else {
				console.log(colors.red(`❌ Failed: ${result.error}`));
			}
		} catch (error) {
			console.log(colors.red(`❌ Error: ${error.message}`));
		}
	}

	private async analyzeProject(): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			return;
		}

		console.log(colors.blue("🔍 Analyzing NestJS project..."));

		try {
			// Re-initialize to get fresh analysis
			await this.agent.initialize();
			const context = this.agent.getProjectContext();

			if (!context.structure) {
				console.log(
					colors.yellow(
						"📁 No NestJS project detected in current directory"
					)
				);
				console.log(
					colors.gray(
						"Use /new <project-name> to create a new NestJS project"
					)
				);
				return;
			}

			console.log(colors.green("✅ Project Analysis Complete"));
			console.log(colors.blue("📊 Project Statistics:"));
			console.log(`  📦 Modules: ${context.modules.length}`);
			console.log(`  🎛️  Controllers: ${context.controllers.length}`);
			console.log(`  ⚙️  Services: ${context.services.length}`);
			console.log(`  🛡️  Guards: ${context.guards.length}`);
			console.log(`  🔧 Pipes: ${context.pipes.length}`);
			console.log(`  🔄 Interceptors: ${context.interceptors.length}`);
			console.log(`  🏷️  Decorators: ${context.decorators.length}`);
			console.log(`  🗄️  Entities: ${context.entities.length}`);
			console.log(`  📝 DTOs: ${context.dtos.length}`);
			console.log(`  📦 Dependencies: ${context.dependencies.length}`);

			if (context.modules.length > 0) {
				console.log(colors.blue("\n📦 Modules:"));
				context.modules.forEach((mod) => console.log(`  • ${mod}`));
			}
		} catch (error) {
			console.log(colors.red(`❌ Analysis failed: ${error.message}`));
		}
	}

	private async showProjectStructure(): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			return;
		}

		const context = this.agent.getProjectContext();

		if (!context.structure) {
			console.log(
				colors.yellow("📁 No NestJS project structure available")
			);
			return;
		}

		console.log(colors.blue("🏗️  NestJS Project Structure:"));
		console.log(colors.green("📦 Components:"));

		if (context.modules.length > 0) {
			console.log(colors.yellow("  📦 Modules:"));
			context.modules.forEach((mod) => console.log(`    • ${mod}`));
		}

		if (context.controllers.length > 0) {
			console.log(colors.yellow("  🎛️ Controllers:"));
			context.controllers.forEach((ctrl) => console.log(`    • ${ctrl}`));
		}

		if (context.services.length > 0) {
			console.log(colors.yellow("  ⚙️ Services:"));
			context.services.forEach((svc) => console.log(`    • ${svc}`));
		}

		if (context.entities.length > 0) {
			console.log(colors.yellow("  🗄️ Entities:"));
			context.entities.forEach((entity) =>
				console.log(`    • ${entity}`)
			);
		}

		if (context.dtos.length > 0) {
			console.log(colors.yellow("  📝 DTOs:"));
			context.dtos.forEach((dto) => console.log(`    • ${dto}`));
		}
	}

	private async showDependencies(): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			return;
		}

		const context = this.agent.getProjectContext();

		if (context.dependencies.length === 0) {
			console.log(colors.yellow("📦 No dependencies found"));
			return;
		}

		console.log(colors.blue("📦 Project Dependencies:"));

		// Group NestJS dependencies
		const nestDeps = context.dependencies.filter((dep) =>
			dep.includes("@nestjs")
		);
		const otherDeps = context.dependencies.filter(
			(dep) => !dep.includes("@nestjs")
		);

		if (nestDeps.length > 0) {
			console.log(colors.green("🚀 NestJS Dependencies:"));
			nestDeps.forEach((dep) => console.log(`  • ${dep}`));
		}

		if (otherDeps.length > 0) {
			console.log(colors.yellow("📚 Other Dependencies:"));
			otherDeps.forEach((dep) => console.log(`  • ${dep}`));
		}
	}

	private async testConnection(): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			return;
		}

		try {
			const connected = await this.agent.testConnection();
			if (connected) {
				console.log(colors.green("✅ AI connection successful"));
			} else {
				console.log(colors.red("❌ AI connection failed"));
			}
		} catch (error) {
			console.log(colors.red(`❌ Test failed: ${error.message}`));
		}
	}

	private toggleDebug(): void {
		this.debug = !this.debug;
		console.log(
			colors.yellow(`🔧 Debug mode: ${this.debug ? "ON" : "OFF"}`)
		);
		if (this.agent) {
			this.agent.setDebug(this.debug);
		}
	}

	private async handleNestJSRequest(request: string): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			this.rl.prompt();
			return;
		}

		console.log(
			colors.blue(`\n🎯 Processing NestJS request: "${request}"`)
		);

		try {
			const result = await this.agent.processNestJSRequest(request);

			if (result.success) {
				console.log(colors.green(`\n✅ ${result.summary}`));
				result.changes?.forEach((change) => {
					console.log(`  • ${change}`);
				});

				if (result.projectStructure) {
					console.log(colors.blue("📁 Project structure updated"));
				}
			} else {
				console.log(
					colors.red(`\n❌ ${result.summary || result.error}`)
				);
				result.errors?.forEach((error) => {
					console.log(`  • ${error}`);
				});
			}
		} catch (error) {
			console.log(colors.red(`\n❌ Request failed: ${error.message}`));
		}

		console.log(colors.cyan("\n🚀 Ready for next NestJS request!"));
		this.rl.prompt();
	}

	private showHelp(): void {
		console.log(colors.blue("\n🚀 NestJS Specialized Agent - Help"));
		console.log("=".repeat(50));
		console.log("");
		console.log(colors.green("Project Creation:"));
		console.log("  /new <name>             - Create new NestJS project");
		console.log("  /analyze                - Analyze current project");
		console.log("  /structure              - Show project structure");
		console.log("");
		console.log(colors.green("Component Generation:"));
		console.log(
			"  /generate <type> <name> - Generate any NestJS component"
		);
		console.log("  /module <name>          - Generate module");
		console.log("  /controller <name>      - Generate controller");
		console.log("  /service <name>         - Generate service");
		console.log("  /guard <name>           - Generate guard");
		console.log("  /pipe <name>            - Generate pipe");
		console.log("  /interceptor <name>     - Generate interceptor");
		console.log("  /entity <name>          - Generate entity");
		console.log("  /dto <name>             - Generate DTO");
		console.log("");
		console.log(colors.green("Project Management:"));
		console.log("  /dependencies           - Show project dependencies");
		console.log("  /test                   - Test AI connection");
		console.log("  /debug                  - Toggle debug output");
		console.log("");
		console.log(colors.green("Natural Language Examples:"));
		console.log('  "create a user authentication module with JWT"');
		console.log('  "add a REST API for managing products"');
		console.log('  "set up database integration with TypeORM"');
		console.log('  "add Swagger documentation to my API"');
		console.log('  "create a WebSocket gateway for real-time chat"');
		console.log('  "implement role-based access control"');
		console.log('  "add validation pipes for user input"');
		console.log('  "create a GraphQL resolver for users"');
		console.log("");
		console.log(
			colors.yellow(
				"💡 Tip: Use natural language to describe what you want to build!"
			)
		);
		console.log("");
	}

	private async askQuestion(
		question: string,
		hidden = false
	): Promise<string> {
		return new Promise((resolve) => {
			if (hidden) {
				process.stdout.write(question);
				process.stdin.setRawMode(true);
				process.stdin.resume();

				let input = "";
				const onData = (char: Buffer) => {
					const c = char.toString();
					if (c === "\r" || c === "\n") {
						process.stdin.setRawMode(false);
						process.stdin.pause();
						process.stdin.removeListener("data", onData);
						console.log("");
						resolve(input);
					} else if (c === "\x08" || c === "\x7f") {
						if (input.length > 0) {
							input = input.slice(0, -1);
							process.stdout.write("\b \b");
						}
					} else if (c >= " ") {
						input += c;
						process.stdout.write("*");
					}
				};

				process.stdin.on("data", onData);
			} else {
				this.rl.question(question, resolve);
			}
		});
	}
}

// Run if called directly
if (require.main === module) {
	const cli = new NestJSSpecializedCLI();
	cli.start().catch(console.error);
}

export { NestJSSpecializedCLI };
