#!/usr/bin/env node
// path: enhanced-interactive-cli.ts

import * as readline from "readline";
import { EnhancedSequentialAIAgent } from "./enhanced-ai-agent";
import { ConfigManager } from "../config-manager";
import { EnhancedAnthropicService } from "./enhanced-anthropic-service";
import * as path from "path";
import * as fs from "fs";
import colors from "../colors";

interface SessionConfig {
	projectRoot: string;
	debug: boolean;
	initialized: boolean;
}

class EnhancedInteractiveAIAgent {
	private rl: readline.Interface;
	private config: SessionConfig;
	private agent: EnhancedSequentialAIAgent | null = null;
	private configManager: ConfigManager;

	constructor() {
		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: colors.cyan("🤖 Enhanced AI > "),
		});

		this.configManager = ConfigManager.createFromEnv();

		this.config = {
			projectRoot: this.configManager.getProjectRoot() || process.cwd(),
			debug: this.configManager.getDebug(),
			initialized: false,
		};

		this.setupEventHandlers();
	}

	private setupEventHandlers(): void {
		this.rl.on("line", async (input) => {
			await this.processInput(input.trim());
		});

		this.rl.on("close", () => {
			console.log(
				colors.yellow(
					"\n👋 Goodbye! Happy coding with the Enhanced AI Agent!"
				)
			);
			process.exit(0);
		});

		process.on("SIGINT", () => {
			console.log(colors.yellow("\n\n👋 Received SIGINT. Goodbye!"));
			process.exit(0);
		});
	}

	async start(): Promise<void> {
		console.log(
			colors.bold(colors.blue("🚀 Enhanced Sequential AI Coding Agent"))
		);
		console.log(colors.gray("========================================"));
		console.log("");
		console.log(colors.green("Welcome to the Enhanced AI Coding Agent!"));
		console.log(
			colors.gray(
				"This agent uses a systematic, sequential approach with:"
			)
		);
		console.log(
			colors.gray("  • Smart project analysis using dependency trees")
		);
		console.log(
			colors.gray("  • AI-driven file selection and context building")
		);
		console.log(
			colors.gray(
				"  • Complete file replacement (no line-by-line editing)"
			)
		);
		console.log(colors.gray("  • Sequential execution with user feedback"));
		console.log(
			colors.gray("  • 100-line file limit for maintainable code")
		);
		console.log("");
		console.log(colors.yellow("Available commands:"));
		console.log(colors.gray("  - Type any coding request"));
		console.log(colors.gray("  - /init     - Initialize the agent"));
		console.log(colors.gray("  - /config   - Configure settings"));
		console.log(colors.gray("  - /status   - Show current status"));
		console.log(colors.gray("  - /test     - Test AI connection"));
		console.log(colors.gray("  - /debug    - Toggle debug mode"));
		console.log(colors.gray("  - /help     - Show help"));
		console.log(colors.gray("  - /exit     - Exit"));
		console.log("");

		await this.checkAPIKey();
		await this.detectProject();

		console.log(colors.cyan("🎯 Ready for systematic coding assistance!"));
		console.log(
			colors.gray(
				"The agent will guide you through each step of the process."
			)
		);
		this.rl.prompt();
	}

	private async checkAPIKey(): Promise<void> {
		if (!this.configManager.hasAnthropicApiKey()) {
			console.log(colors.yellow("⚠️  No Anthropic API key found!"));
			console.log(colors.gray("Set your API key using:"));
			console.log(
				colors.gray(
					'  1. Environment: export ANTHROPIC_API_KEY="your-key"'
				)
			);
			console.log(colors.gray("  2. Interactive: /config apikey"));
			console.log("");

			const answer = await this.askQuestion("Set API key now? (y/n): ");
			if (
				answer.toLowerCase() === "y" ||
				answer.toLowerCase() === "yes"
			) {
				await this.promptForAPIKey();
			}
		} else {
			console.log(colors.green("✅ Anthropic API key configured"));
		}
	}

	private async promptForAPIKey(): Promise<void> {
		const apiKey = await this.askQuestion(
			"Enter your Anthropic API key: ",
			true
		);
		if (apiKey && apiKey.trim()) {
			this.configManager.setAnthropicApiKey(apiKey.trim());
			console.log(colors.green("✅ API key saved!"));
		} else {
			console.log(colors.yellow("⚠️  No API key provided"));
		}
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

	private async detectProject(): Promise<void> {
		const packageJsonPath = path.join(
			this.config.projectRoot,
			"package.json"
		);
		const tsconfigPath = path.join(
			this.config.projectRoot,
			"tsconfig.json"
		);

		if (fs.existsSync(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(
					fs.readFileSync(packageJsonPath, "utf-8")
				);
				console.log(
					colors.green(`📦 Project: ${packageJson.name || "Unknown"}`)
				);
				console.log(colors.gray(`📁 Root: ${this.config.projectRoot}`));

				if (fs.existsSync(tsconfigPath)) {
					console.log(
						colors.green("✅ TypeScript configuration found")
					);
				}

				if (this.configManager.hasAnthropicApiKey()) {
					console.log(
						colors.yellow(
							"💡 Run /init to initialize the enhanced agent"
						)
					);
				}
			} catch (error) {
				console.log(colors.red("⚠️  Could not read package.json"));
			}
		} else {
			console.log(colors.yellow("⚠️  No package.json found"));
			console.log(
				colors.gray(
					"💡 Use /config root to set the correct project root"
				)
			);
		}
		console.log("");
	}

	private async processInput(input: string): Promise<void> {
		if (!input) {
			this.rl.prompt();
			return;
		}

		if (input.startsWith("/")) {
			await this.handleCommand(input);
			return;
		}

		await this.handleCodingRequest(input);
	}

	private async handleCommand(command: string): Promise<void> {
		const [cmd, ...args] = command.slice(1).split(" ");

		switch (cmd.toLowerCase()) {
			case "init":
				await this.initializeAgent();
				break;
			case "config":
				await this.handleConfigCommand(args);
				break;
			case "status":
				await this.showStatus();
				break;
			case "test":
				await this.testAIConnection();
				break;
			case "help":
				this.showDetailedHelp();
				break;
			case "debug":
				this.toggleDebugMode();
				break;
			case "root":
				await this.handleRootCommand(args);
				break;
			case "exit":
			case "quit":
			case "q":
				this.rl.close();
				return;
			default:
				console.log(colors.red(`❌ Unknown command: /${cmd}`));
				console.log(colors.gray("Type /help for available commands"));
				break;
		}

		this.rl.prompt();
	}

	private async handleConfigCommand(args: string[]): Promise<void> {
		if (args.length === 0) {
			await this.showConfig();
			return;
		}

		const [subCmd, ...values] = args;

		switch (subCmd.toLowerCase()) {
			case "apikey":
				await this.promptForAPIKey();
				break;
			case "model":
				if (values.length > 0) {
					const model = values.join(" ");
					this.configManager.setModel(model);
					console.log(colors.green(`✅ Model set to: ${model}`));
				} else {
					console.log(
						colors.gray(
							`Current model: ${this.configManager.getModel()}`
						)
					);
				}
				break;
			case "temperature":
				if (values.length > 0) {
					const temp = parseFloat(values[0]);
					if (temp >= 0 && temp <= 1) {
						this.configManager.setTemperature(temp);
						console.log(
							colors.green(`✅ Temperature set to: ${temp}`)
						);
					} else {
						console.log(
							colors.red("❌ Temperature must be between 0 and 1")
						);
					}
				} else {
					console.log(
						colors.gray(
							`Current temperature: ${this.configManager.getTemperature()}`
						)
					);
				}
				break;
			default:
				console.log(colors.red(`❌ Unknown config command: ${subCmd}`));
				break;
		}
	}

	private async initializeAgent(): Promise<void> {
		if (!this.configManager.hasAnthropicApiKey()) {
			console.log(
				colors.red("❌ API key required. Use /config apikey to set it.")
			);
			return;
		}

		console.log(
			colors.blue("🚀 Initializing Enhanced Sequential AI Agent...")
		);

		try {
			this.agent = new EnhancedSequentialAIAgent(
				this.config.projectRoot,
				{
					debug: this.config.debug,
				}
			);

			this.config.initialized = true;
			console.log(colors.green("✅ Enhanced agent initialized!"));
			console.log(
				colors.gray(
					"The agent is ready for systematic coding requests."
				)
			);
			console.log(
				colors.gray(
					"It will guide you through each phase of execution."
				)
			);
		} catch (error) {
			console.log(
				colors.red(`❌ Initialization failed: ${error.message}`)
			);
		}
	}

	private async testAIConnection(): Promise<void> {
		if (!this.configManager.hasAnthropicApiKey()) {
			console.log(colors.red("❌ API key required."));
			return;
		}

		console.log(colors.blue("🔗 Testing AI connection..."));

		try {
			const service = new EnhancedAnthropicService({
				apiKey: this.configManager.getAnthropicApiKey()!,
				model: this.configManager.getModel(),
				debug: this.config.debug,
			});

			const connected = await service.testConnection();

			if (connected) {
				console.log(colors.green("✅ AI connection successful!"));
				console.log(colors.gray(`Model: ${service.getModel()}`));
			} else {
				console.log(colors.red("❌ AI connection failed"));
			}
		} catch (error) {
			console.log(
				colors.red(`❌ Connection test failed: ${error.message}`)
			);
		}
	}

	private async handleCodingRequest(request: string): Promise<void> {
		if (!this.configManager.hasAnthropicApiKey()) {
			console.log(colors.red("❌ API key required. Use /config apikey"));
			this.rl.prompt();
			return;
		}

		if (!this.config.initialized) {
			console.log(
				colors.yellow("⚠️  Agent not initialized. Run /init first.")
			);
			this.rl.prompt();
			return;
		}

		if (!this.agent) {
			console.log(colors.red("❌ Agent not available. Run /init."));
			this.rl.prompt();
			return;
		}

		console.log(colors.blue(`\n🎯 Processing request: "${request}"`));
		console.log(
			colors.gray(
				"The enhanced agent will now work systematically through this request."
			)
		);
		console.log(
			colors.gray("You'll see detailed progress through each phase.\n")
		);

		const startTime = Date.now();

		try {
			const result = await this.agent.processUserRequest(request);
			const endTime = Date.now();
			const duration = Math.round((endTime - startTime) / 1000);

			if (result.success) {
				console.log(
					colors.green(
						`\n🎉 Request completed successfully in ${duration}s!`
					)
				);
				console.log(colors.gray(result.summary));

				// Show execution summary
				const completedSteps = result.steps.filter(
					(step) => step.status === "completed"
				).length;
				const totalSteps = result.steps.length;
				console.log(
					colors.green(
						`📊 Execution: ${completedSteps}/${totalSteps} phases completed`
					)
				);
			} else {
				console.log(
					colors.red(`\n❌ Request failed after ${duration}s`)
				);
				console.log(colors.red(result.summary));
			}
		} catch (error) {
			const endTime = Date.now();
			const duration = Math.round((endTime - startTime) / 1000);
			console.log(
				colors.red(
					`\n❌ Request failed after ${duration}s: ${error.message}`
				)
			);
		}

		console.log(
			colors.cyan("\n🤖 Ready for your next systematic coding request!")
		);
		this.rl.prompt();
	}

	private toggleDebugMode(): void {
		this.config.debug = !this.config.debug;
		this.configManager.setDebug(this.config.debug);

		console.log(
			colors.yellow(`🔧 Debug mode: ${this.config.debug ? "ON" : "OFF"}`)
		);

		if (this.config.debug) {
			console.log(
				colors.gray(
					"  You'll now see detailed logging of all operations"
				)
			);
		}
	}

	private async handleRootCommand(args: string[]): Promise<void> {
		if (args.length > 0) {
			const newRoot = path.resolve(args.join(" "));
			if (fs.existsSync(newRoot)) {
				this.config.projectRoot = newRoot;
				this.configManager.setProjectRoot(newRoot);
				this.config.initialized = false;
				console.log(
					colors.green(`📁 Project root changed to: ${newRoot}`)
				);
				await this.detectProject();
			} else {
				console.log(colors.red(`❌ Directory not found: ${newRoot}`));
			}
		} else {
			console.log(
				colors.gray(
					`📁 Current project root: ${this.config.projectRoot}`
				)
			);
		}
	}

	private async showConfig(): Promise<void> {
		console.log(colors.blue("\n⚙️  Enhanced Agent Configuration:"));
		console.log(colors.gray("===================================="));
		console.log(`📁 Project Root: ${this.config.projectRoot}`);
		console.log(`🔧 Debug Mode: ${this.config.debug ? "ON" : "OFF"}`);
		console.log(
			`🤖 Initialized: ${this.config.initialized ? "YES" : "NO"}`
		);
		console.log(
			`🔑 API Key: ${
				this.configManager.hasAnthropicApiKey() ? "SET" : "NOT SET"
			}`
		);
		console.log(`🧠 Model: ${this.configManager.getModel()}`);
		console.log(`🌡️  Temperature: ${this.configManager.getTemperature()}`);
		console.log(`📏 Max Tokens: ${this.configManager.getMaxTokens()}`);
		console.log("");
	}

	private async showStatus(): Promise<void> {
		console.log(colors.blue("\n📊 Enhanced Agent Status:"));
		console.log(colors.gray("==========================="));

		if (this.configManager.hasAnthropicApiKey()) {
			console.log(colors.green("🔑 API Key: Configured"));
		} else {
			console.log(colors.red("🔑 API Key: Missing"));
		}

		if (this.config.initialized && this.agent) {
			console.log(colors.green("🤖 Enhanced Agent: Ready"));
			console.log(colors.green("📁 Project: Loaded"));
		} else {
			console.log(colors.yellow("🤖 Enhanced Agent: Not initialized"));
		}

		console.log(`📁 Working Directory: ${this.config.projectRoot}`);
		console.log(`🔧 Debug Mode: ${this.config.debug ? "ON" : "OFF"}`);
		console.log(`🧠 AI Model: ${this.configManager.getModel()}`);
		console.log("");
	}

	private showDetailedHelp(): void {
		console.log(colors.blue("\n🚀 Enhanced Sequential AI Agent - Help"));
		console.log(colors.gray("======================================="));
		console.log("");
		console.log(colors.green("🎯 What's Different:"));
		console.log(
			colors.gray("• Systematic, sequential approach with user feedback")
		);
		console.log(
			colors.gray("• Smart project analysis using dependency trees")
		);
		console.log(
			colors.gray("• AI-driven file selection and context building")
		);
		console.log(
			colors.gray("• Complete file replacement (no line editing)")
		);
		console.log(colors.gray("• 100-line file limit for maintainable code"));
		console.log(
			colors.gray("• 5-second pauses between phases for user awareness")
		);
		console.log("");
		console.log(colors.green("📋 Process Flow:"));
		console.log(
			colors.gray("1. 📋 PLANNING - AI creates detailed execution plan")
		);
		console.log(
			colors.gray(
				"2. 🌳 DISCOVERY - Analyze project structure with dependency tree"
			)
		);
		console.log(
			colors.gray(
				"3. 🎯 SELECTION - AI selects relevant files for context"
			)
		);
		console.log(colors.gray("4. 📚 LOADING - Load selected file contents"));
		console.log(
			colors.gray("5. ⚡ EXECUTION - Generate and replace complete files")
		);
		console.log(
			colors.gray("6. 🔍 VALIDATION - Check syntax and compilation")
		);
		console.log("");
		console.log(colors.green("🔧 Commands:"));
		console.log(
			colors.cyan("/init") +
				colors.gray("         - Initialize the enhanced agent")
		);
		console.log(
			colors.cyan("/config apikey") +
				colors.gray(" - Set your Anthropic API key")
		);
		console.log(
			colors.cyan("/status") +
				colors.gray("       - Show detailed status")
		);
		console.log(
			colors.cyan("/test") + colors.gray("         - Test AI connection")
		);
		console.log(
			colors.cyan("/debug") + colors.gray("        - Toggle debug mode")
		);
		console.log(
			colors.cyan("/help") + colors.gray("         - Show this help")
		);
		console.log("");
		console.log(colors.green("💡 Example Requests:"));
		console.log(colors.gray('• "Create a user authentication service"'));
		console.log(colors.gray('• "Add error handling to the API endpoints"'));
		console.log(
			colors.gray('• "Refactor the user service into smaller modules"')
		);
		console.log(
			colors.gray('• "Create a new component for data visualization"')
		);
		console.log("");
		console.log(colors.green("✨ Key Benefits:"));
		console.log(colors.gray("• Complete transparency - see every step"));
		console.log(
			colors.gray("• No truncated code - always full implementations")
		);
		console.log(
			colors.gray("• Maintainable structure with 100-line file limit")
		);
		console.log(
			colors.gray("• Smart context selection minimizes token usage")
		);
		console.log("");
	}
}

// Main execution
async function main() {
	const agent = new EnhancedInteractiveAIAgent();
	await agent.start();
}

// Run if called directly
if (require.main === module) {
	main().catch((error) => {
		console.error(colors.red(`❌ Fatal error: ${error.message}`));
		process.exit(1);
	});
}

export { EnhancedInteractiveAIAgent };
