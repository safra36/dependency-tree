#!/usr/bin/env node
// path: simple-cli.ts

import * as readline from "readline";
import { SimplifiedAIAgent } from "./simplified-ai-agent";
import { ConfigManager } from "../config-manager";
import colors from "../colors";

class SimpleCLI {
	private rl: readline.Interface;
	private agent: SimplifiedAIAgent | null = null;
	private projectRoot: string;
	private debug: boolean = false;

	constructor() {
		this.projectRoot = process.cwd();

		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: colors.cyan("🤖 AI > "),
		});

		this.setupEventHandlers();
	}

	private setupEventHandlers(): void {
		this.rl.on("line", async (input) => {
			await this.processInput(input.trim());
		});

		this.rl.on("close", () => {
			console.log(colors.yellow("\n👋 Goodbye!"));
			process.exit(0);
		});

		process.on("SIGINT", () => {
			console.log(colors.yellow("\n\n👋 Goodbye!"));
			process.exit(0);
		});
	}

	async start(): Promise<void> {
		console.log(colors.bold(colors.blue("🤖 Simple AI Coding Agent")));
		console.log("=".repeat(40));
		console.log("");
		console.log(
			colors.green("Welcome! This is a simplified AI coding agent.")
		);
		console.log("");
		console.log(colors.yellow("Commands:"));
		console.log("  /init    - Initialize the agent");
		console.log("  /test    - Test AI connection");
		console.log("  /debug   - Toggle debug mode");
		console.log("  /help    - Show help");
		console.log("  /exit    - Exit");
		console.log("");
		console.log("Or just type your request directly!");
		console.log("");

		await this.checkSetup();
		this.rl.prompt();
	}

	private async checkSetup(): Promise<void> {
		const configManager = ConfigManager.createFromEnv();

		if (!configManager.hasAnthropicApiKey()) {
			console.log(colors.red("⚠️  No API key found!"));
			console.log(
				"Set ANTHROPIC_API_KEY environment variable or run /init"
			);
		} else {
			console.log(colors.green("✅ API key configured"));
			try {
				this.agent = new SimplifiedAIAgent(
					this.projectRoot,
					this.debug
				);
				console.log(colors.green("✅ Agent ready"));
			} catch (error) {
				console.log(
					colors.red(`❌ Agent setup failed: ${error.message}`)
				);
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
			await this.handleRequest(input);
		}
	}

	private async handleCommand(command: string): Promise<void> {
		const [cmd, ...args] = command.split(" ");

		switch (cmd.toLowerCase()) {
			case "init":
				await this.initializeAgent();
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
		}

		this.rl.prompt();
	}

	private async initializeAgent(): Promise<void> {
		const configManager = ConfigManager.createFromEnv();

		if (!configManager.hasAnthropicApiKey()) {
			console.log(colors.red("❌ API key required"));
			const apiKey = await this.askQuestion(
				"Enter your Anthropic API key: ",
				true
			);

			if (apiKey && apiKey.trim()) {
				configManager.setAnthropicApiKey(apiKey.trim());
				console.log(colors.green("✅ API key saved"));
			} else {
				console.log(colors.yellow("⚠️ No API key provided"));
				return;
			}
		}

		try {
			this.agent = new SimplifiedAIAgent(this.projectRoot, this.debug);
			console.log(colors.green("✅ Agent initialized"));
		} catch (error) {
			console.log(
				colors.red(`❌ Failed to initialize: ${error.message}`)
			);
		}
	}

	private async testConnection(): Promise<void> {
		if (!this.agent) {
			console.log(
				colors.yellow("⚠️ Agent not initialized. Run /init first")
			);
			return;
		}

		console.log("🔗 Testing connection...");

		try {
			const connected = await this.agent.testConnection();

			if (connected) {
				console.log(colors.green("✅ Connection successful"));
			} else {
				console.log(colors.red("❌ Connection failed"));
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
			// Reinitialize agent with new debug setting
			try {
				this.agent = new SimplifiedAIAgent(
					this.projectRoot,
					this.debug
				);
			} catch (error) {
				console.log(
					colors.red(`❌ Failed to update agent: ${error.message}`)
				);
			}
		}
	}

	private showHelp(): void {
		console.log(colors.blue("\n🤖 Simple AI Coding Agent - Help"));
		console.log("=".repeat(40));
		console.log("");
		console.log(colors.green("Commands:"));
		console.log("  /init    - Initialize the agent with API key");
		console.log("  /test    - Test AI connection");
		console.log("  /debug   - Toggle debug mode");
		console.log("  /help    - Show this help");
		console.log("  /exit    - Exit the program");
		console.log("");
		console.log(colors.green("Usage:"));
		console.log("  Just type your request directly, like:");
		console.log('  "fix the broken HTML files"');
		console.log('  "create a simple webpage"');
		console.log('  "add CSS styling to the page"');
		console.log("");
	}

	private async handleRequest(request: string): Promise<void> {
		if (!this.agent) {
			console.log(
				colors.yellow("⚠️ Agent not initialized. Run /init first")
			);
			this.rl.prompt();
			return;
		}

		console.log(colors.blue(`\n🎯 Processing: "${request}"`));

		try {
			const result = await this.agent.processRequest(request);

			if (result.success) {
				console.log(colors.green(`\n✅ ${result.summary}`));

				if (result.changes.length > 0) {
					console.log(colors.green("\n📝 Changes made:"));
					result.changes.forEach((change) => {
						console.log(`  • ${change}`);
					});
				}
			} else {
				console.log(colors.red(`\n❌ ${result.summary}`));

				if (result.errors.length > 0) {
					console.log(colors.red("\n🚨 Errors:"));
					result.errors.forEach((error) => {
						console.log(`  • ${error}`);
					});
				}
			}
		} catch (error) {
			console.log(colors.red(`\n❌ Request failed: ${error.message}`));
		}

		console.log(colors.cyan("\n🤖 Ready for next request!"));
		this.rl.prompt();
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
	const cli = new SimpleCLI();
	cli.start().catch(console.error);
}

export { SimpleCLI };
