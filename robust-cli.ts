#!/usr/bin/env node
// path: robust-cli.ts

import colors from "./colors";
import { ConfigManager } from "./config-manager";
import * as readline from "readline";
import { RobustAIAgent } from "./robust-ai-agent";

class RobustCLI {
	private rl: readline.Interface;
	private agent: RobustAIAgent | null = null;
	private projectRoot: string;
	private debug: boolean = false;

	constructor() {
		this.projectRoot = process.cwd();

		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: colors.cyan("🤖 AI Agent > "),
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
		console.log(colors.bold(colors.blue("🤖 Robust AI Coding Agent")));
		console.log("=".repeat(50));
		console.log("");
		console.log(
			colors.green("Advanced AI agent with XML-based communication")
		);
		console.log("");
		console.log(colors.yellow("Commands:"));
		console.log("  /init           - Initialize agent");
		console.log("  /create <file>  - Create new file");
		console.log("  /modify <file>  - Modify existing file");
		console.log("  /delete <file>  - Delete file");
		console.log("  /exec <cmd>     - Execute shell command");
		console.log("  /check          - Check for type errors");
		console.log("  /test           - Test AI connection");
		console.log("  /debug          - Toggle debug mode");
		console.log("  /help           - Show help");
		console.log("  /exit           - Exit");
		console.log("");
		console.log("Or describe what you want to accomplish!");
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
				this.agent = new RobustAIAgent(this.projectRoot, {
					debug: this.debug,
				});
				await this.agent.initialize();
				console.log(colors.green("✅ Agent ready"));
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
			await this.handleRequest(input);
		}
	}

	private async handleCommand(command: string): Promise<void> {
		const [cmd, ...args] = command.split(" ");
		const arg = args.join(" ");

		switch (cmd.toLowerCase()) {
			case "init":
				await this.initializeAgent();
				break;
			case "create":
				if (!arg) {
					console.log(colors.red("Usage: /create <filename>"));
					break;
				}
				await this.createFile(arg);
				break;
			case "modify":
				if (!arg) {
					console.log(colors.red("Usage: /modify <filename>"));
					break;
				}
				await this.modifyFile(arg);
				break;
			case "delete":
				if (!arg) {
					console.log(colors.red("Usage: /delete <filename>"));
					break;
				}
				await this.deleteFile(arg);
				break;
			case "exec":
				if (!arg) {
					console.log(colors.red("Usage: /exec <command>"));
					break;
				}
				await this.executeCommand(arg);
				break;
			case "check":
				await this.checkTypes();
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
			this.agent = new RobustAIAgent(this.projectRoot, {
				debug: this.debug,
			});
			await this.agent.initialize();
			console.log(colors.green("✅ Agent initialized"));
		} catch (error) {
			console.log(colors.red(`❌ Failed: ${error.message}`));
		}
	}

	private async createFile(filename: string): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			return;
		}

		const description = await this.askQuestion(
			`Describe the file ${filename}: `
		);
		if (!description) return;

		try {
			const result = await this.agent.createFile(filename, description);
			if (result.success) {
				console.log(colors.green(`✅ Created ${filename}`));
				result.details?.forEach((detail) => console.log(`  ${detail}`));
			} else {
				console.log(colors.red(`❌ Failed: ${result.error}`));
			}
		} catch (error) {
			console.log(colors.red(`❌ Error: ${error.message}`));
		}
	}

	private async modifyFile(filename: string): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			return;
		}

		const description = await this.askQuestion(
			`How to modify ${filename}: `
		);
		if (!description) return;

		try {
			const result = await this.agent.modifyFile(filename, description);
			if (result.success) {
				console.log(colors.green(`✅ Modified ${filename}`));
				result.details?.forEach((detail) => console.log(`  ${detail}`));
			} else {
				console.log(colors.red(`❌ Failed: ${result.error}`));
			}
		} catch (error) {
			console.log(colors.red(`❌ Error: ${error.message}`));
		}
	}

	private async deleteFile(filename: string): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			return;
		}

		const confirm = await this.askQuestion(`Delete ${filename}? (y/N): `);
		if (confirm?.toLowerCase() !== "y") return;

		try {
			const result = await this.agent.deleteFile(filename);
			if (result.success) {
				console.log(colors.green(`✅ Deleted ${filename}`));
			} else {
				console.log(colors.red(`❌ Failed: ${result.error}`));
			}
		} catch (error) {
			console.log(colors.red(`❌ Error: ${error.message}`));
		}
	}

	private async executeCommand(command: string): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			return;
		}

		try {
			const result = await this.agent.executeShellCommand(command);
			if (result.success) {
				console.log(colors.green(`✅ Command executed`));
				if (result.stdout) console.log(result.stdout);
				if (result.stderr) console.log(colors.yellow(result.stderr));
			} else {
				console.log(colors.red(`❌ Failed: ${result.error}`));
			}
		} catch (error) {
			console.log(colors.red(`❌ Error: ${error.message}`));
		}
	}

	private async checkTypes(): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			return;
		}

		try {
			const result = await this.agent.checkTypes();
			if (result.success) {
				console.log(colors.green(`✅ No type errors`));
			} else {
				console.log(
					colors.red(`❌ Found ${result.errors?.length || 0} errors`)
				);
				result.errors?.forEach((error) => {
					console.log(
						`  ${colors.red(error.file)}:${error.line} - ${
							error.message
						}`
					);
				});
			}
		} catch (error) {
			console.log(colors.red(`❌ Error: ${error.message}`));
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

	private async handleRequest(request: string): Promise<void> {
		if (!this.agent) {
			console.log(colors.yellow("Agent not initialized. Run /init"));
			this.rl.prompt();
			return;
		}

		console.log(colors.blue(`\n🎯 Processing: "${request}"`));

		try {
			const result = await this.agent.processRequest(request);

			if (result.success) {
				console.log(colors.green(`\n✅ ${result.summary}`));
				result.changes?.forEach((change) => {
					console.log(`  • ${change}`);
				});
			} else {
				console.log(colors.red(`\n❌ ${result.summary}`));
				result.errors?.forEach((error) => {
					console.log(`  • ${error}`);
				});
			}
		} catch (error) {
			console.log(colors.red(`\n❌ Request failed: ${error.message}`));
		}

		console.log(colors.cyan("\n🤖 Ready for next request!"));
		this.rl.prompt();
	}

	private showHelp(): void {
		console.log(colors.blue("\n🤖 Robust AI Coding Agent - Help"));
		console.log("=".repeat(50));
		console.log("");
		console.log(colors.green("File Operations:"));
		console.log("  /create <file>  - Create new file with AI assistance");
		console.log("  /modify <file>  - Modify existing file");
		console.log("  /delete <file>  - Delete file (with confirmation)");
		console.log("");
		console.log(colors.green("Development:"));
		console.log("  /exec <cmd>     - Execute shell command safely");
		console.log("  /check          - Check TypeScript/syntax errors");
		console.log("  /test           - Test AI connection");
		console.log("");
		console.log(colors.green("System:"));
		console.log("  /init           - Initialize agent with API key");
		console.log("  /debug          - Toggle debug output");
		console.log("  /help           - Show this help");
		console.log("  /exit           - Exit agent");
		console.log("");
		console.log(colors.green("Natural Language:"));
		console.log("  Just describe what you want:");
		console.log('  "fix the TypeScript errors"');
		console.log('  "create a React component for user profile"');
		console.log('  "add error handling to the API"');
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
	const cli = new RobustCLI();
	cli.start().catch(console.error);
}

export { RobustCLI };
