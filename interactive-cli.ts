#!/usr/bin/env node
// path: interactive-cli.ts

import * as readline from "readline";
import { AICodeAgent } from "./ai-coding-agent";
import { AIPromptSystem } from "./ai-prompt-system";
import { LineTrackingEditor } from "./line-tracker-editor";
import { ConfigManager } from "./config-manager";
import { AnthropicService } from "./anthropic-service";
import * as path from "path";
import * as fs from "fs";
import colors from "./colors";

interface SessionConfig {
  projectRoot: string;
  debug: boolean;
  maxDepth: number;
  initialized: boolean;
}

class InteractiveAIAgent {
  private rl: readline.Interface;
  private config: SessionConfig;
  private agent: AICodeAgent | null = null;
  private promptSystem: AIPromptSystem | null = null;
  private configManager: ConfigManager;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: colors.cyan("🤖 AI Agent > "),
    });

    this.configManager = ConfigManager.createFromEnv();

    this.config = {
      projectRoot: this.configManager.getProjectRoot() || process.cwd(),
      debug: this.configManager.getDebug(),
      maxDepth: this.configManager.getMaxDepth(),
      initialized: false,
    };

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.rl.on("line", async (input) => {
      await this.processInput(input.trim());
    });

    this.rl.on("close", () => {
      console.log(colors.yellow("\n👋 Goodbye! Happy coding!"));
      process.exit(0);
    });

    // Handle Ctrl+C gracefully
    process.on("SIGINT", () => {
      console.log(colors.yellow("\n\n👋 Received SIGINT. Goodbye!"));
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    console.log(
      colors.bold(colors.blue("🤖 AI Coding Agent - Interactive Mode"))
    );
    console.log(colors.gray("==============================================="));
    console.log("");
    console.log(
      colors.green("Welcome to the AI Coding Agent with Claude integration!")
    );
    console.log(
      colors.gray("Type your coding requests and I'll help you implement them.")
    );
    console.log("");
    console.log(colors.yellow("Available commands:"));
    console.log(
      colors.gray(
        '  - Type any coding request (e.g., "Add email validation to UserService")'
      )
    );
    console.log(
      colors.gray("  - /init     - Initialize the agent for current project")
    );
    console.log(colors.gray("  - /config   - Configure API keys and settings"));
    console.log(colors.gray("  - /status   - Show current status"));
    console.log(colors.gray("  - /compile  - Check TypeScript compilation"));
    console.log(colors.gray("  - /test     - Test AI connection"));
    console.log(colors.gray("  - /help     - Show detailed help"));
    console.log(colors.gray("  - /exit     - Exit the agent"));
    console.log("");

    // Check API key first
    await this.checkAPIKey();

    // Auto-detect project and suggest initialization
    await this.detectProject();

    console.log(colors.cyan("Ready! What would you like me to help you with?"));
    this.rl.prompt();
  }

  private async checkAPIKey(): Promise<void> {
    if (!this.configManager.hasAnthropicApiKey()) {
      console.log(colors.yellow("⚠️  No Anthropic API key found!"));
      console.log(colors.gray("Set your API key using one of these methods:"));
      console.log(
        colors.gray(
          '  1. Environment variable: export ANTHROPIC_API_KEY="your-key"'
        )
      );
      console.log(colors.gray("  2. Interactive config: /config apikey"));
      console.log("");

      // Ask if they want to set it now
      const answer = await this.askQuestion(
        "Would you like to set your API key now? (y/n): "
      );
      if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
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

  private async askQuestion(question: string, hidden = false): Promise<string> {
    return new Promise((resolve) => {
      if (hidden) {
        // Hide input for sensitive data
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
            console.log(""); // New line
            resolve(input);
          } else if (c === "\x08" || c === "\x7f") {
            // Backspace
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
    const packageJsonPath = path.join(this.config.projectRoot, "package.json");
    const tsconfigPath = path.join(this.config.projectRoot, "tsconfig.json");

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf-8")
        );
        console.log(
          colors.green(`📦 Detected project: ${packageJson.name || "Unknown"}`)
        );
        console.log(colors.gray(`📁 Project root: ${this.config.projectRoot}`));

        if (fs.existsSync(tsconfigPath)) {
          console.log(colors.green("✅ TypeScript configuration found"));
        }

        if (this.configManager.hasAnthropicApiKey()) {
          console.log(
            colors.yellow(
              "💡 Run /init to initialize the agent for this project"
            )
          );
        }
      } catch (error) {
        console.log(colors.red("⚠️  Could not read package.json"));
      }
    } else {
      console.log(
        colors.yellow(
          "⚠️  No package.json found. Make sure you're in the right directory."
        )
      );
      console.log(
        colors.gray("💡 Use /config root to set the correct project root")
      );
    }
    console.log("");
  }

  private async processInput(input: string): Promise<void> {
    if (!input) {
      this.rl.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith("/")) {
      await this.handleCommand(input);
      return;
    }

    // Handle coding requests
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
      case "compile":
        await this.checkCompilation();
        break;
      case "test":
        await this.testAIConnection();
        break;
      case "help":
        this.showDetailedHelp();
        break;
      case "debug":
        this.config.debug = !this.config.debug;
        this.configManager.setDebug(this.config.debug);
        console.log(
          colors.yellow(`🔧 Debug mode: ${this.config.debug ? "ON" : "OFF"}`)
        );
        break;
      case "root":
        if (args.length > 0) {
          const newRoot = path.resolve(args.join(" "));
          if (fs.existsSync(newRoot)) {
            this.config.projectRoot = newRoot;
            this.configManager.setProjectRoot(newRoot);
            this.config.initialized = false;
            console.log(colors.green(`📁 Project root changed to: ${newRoot}`));
            await this.detectProject();
          } else {
            console.log(colors.red(`❌ Directory not found: ${newRoot}`));
          }
        } else {
          console.log(
            colors.gray(`📁 Current project root: ${this.config.projectRoot}`)
          );
        }
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
          this.configManager.setModel(values.join(" "));
          console.log(colors.green(`✅ Model set to: ${values.join(" ")}`));
        } else {
          console.log(
            colors.gray(`Current model: ${this.configManager.getModel()}`)
          );
        }
        break;
      case "temperature":
        if (values.length > 0) {
          const temp = parseFloat(values[0]);
          if (temp >= 0 && temp <= 1) {
            this.configManager.setTemperature(temp);
            console.log(colors.green(`✅ Temperature set to: ${temp}`));
          } else {
            console.log(colors.red("❌ Temperature must be between 0 and 1"));
          }
        } else {
          console.log(
            colors.gray(
              `Current temperature: ${this.configManager.getTemperature()}`
            )
          );
        }
        break;
      case "maxtokens":
        if (values.length > 0) {
          const tokens = parseInt(values[0]);
          if (tokens > 0 && tokens <= 200000) {
            this.configManager.setMaxTokens(tokens);
            console.log(colors.green(`✅ Max tokens set to: ${tokens}`));
          } else {
            console.log(
              colors.red("❌ Max tokens must be between 1 and 200000")
            );
          }
        } else {
          console.log(
            colors.gray(
              `Current max tokens: ${this.configManager.getMaxTokens()}`
            )
          );
        }
        break;
      case "reset":
        this.configManager.resetConfig();
        console.log(colors.yellow("🔄 Configuration reset to defaults"));
        break;
      default:
        console.log(colors.red(`❌ Unknown config command: ${subCmd}`));
        console.log(
          colors.gray("Available: apikey, model, temperature, maxtokens, reset")
        );
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

    console.log(colors.blue("🚀 Initializing AI Agent..."));

    try {
      this.agent = new AICodeAgent(this.config.projectRoot, {
        debug: this.config.debug,
        maxDepth: this.config.maxDepth,
      });

      this.promptSystem = new AIPromptSystem(
        this.config.projectRoot,
        this.config.debug
      );

      console.log(colors.yellow("🔍 Scanning project structure..."));
      await this.agent.initialize();

      this.config.initialized = true;
      console.log(colors.green("✅ Agent initialized successfully!"));
      console.log(colors.gray("You can now make coding requests."));
    } catch (error) {
      console.log(colors.red(`❌ Initialization failed: ${error.message}`));

      if (error.message.includes("API key")) {
        console.log(
          colors.gray("Use /config apikey to set your Anthropic API key")
        );
      } else {
        console.log(
          colors.gray(
            "Check your project structure and API key, then try again."
          )
        );
      }

      if (this.config.debug) {
        console.log(colors.gray("Debug info:"), error);
      }
    }
  }

  private async testAIConnection(): Promise<void> {
    if (!this.configManager.hasAnthropicApiKey()) {
      console.log(
        colors.red("❌ API key required. Use /config apikey to set it.")
      );
      return;
    }

    console.log(colors.blue("🔗 Testing AI connection..."));

    try {
      const anthropicService = new AnthropicService({
        apiKey: this.configManager.getAnthropicApiKey()!,
        model: this.configManager.getModel(),
        maxTokens: 50,
        temperature: 0.1,
      });

      const connected = await anthropicService.testConnection();

      if (connected) {
        console.log(colors.green("✅ AI connection successful!"));
        console.log(colors.gray(`Model: ${anthropicService.getModel()}`));
      } else {
        console.log(colors.red("❌ AI connection failed"));
        console.log(colors.gray("Check your API key and internet connection"));
      }
    } catch (error) {
      console.log(colors.red(`❌ Connection test failed: ${error.message}`));
    }
  }

  private async handleCodingRequest(request: string): Promise<void> {
    if (!this.configManager.hasAnthropicApiKey()) {
      console.log(
        colors.red("❌ API key required. Use /config apikey to set it.")
      );
      this.rl.prompt();
      return;
    }

    if (!this.config.initialized) {
      console.log(colors.yellow("⚠️  Agent not initialized. Run /init first."));
      this.rl.prompt();
      return;
    }

    if (!this.agent) {
      console.log(colors.red("❌ Agent not available. Please run /init."));
      this.rl.prompt();
      return;
    }

    console.log(colors.blue(`\n🎯 Processing request: "${request}"`));
    console.log(colors.gray("🧠 AI is analyzing your request..."));

    try {
      const result = await this.agent.handleUserRequest(request);

      if (result.success) {
        console.log(colors.green("\n✅ Request completed successfully!"));
        if (result.changes.length > 0) {
          console.log(colors.green("📝 Changes made:"));
          result.changes.forEach((change) =>
            console.log(colors.gray(`  • ${change}`))
          );
        } else {
          console.log(colors.yellow("ℹ️  No changes were needed"));
        }
      } else {
        console.log(colors.red("\n❌ Request failed:"));
        result.errors?.forEach((error) =>
          console.log(colors.red(`  • ${error}`))
        );
      }
    } catch (error) {
      console.log(
        colors.red(`\n❌ Error processing request: ${error.message}`)
      );

      if (error.message.includes("API")) {
        console.log(colors.gray("This might be an API key or network issue."));
        console.log(colors.gray("Use /test to check your AI connection."));
      }

      if (this.config.debug) {
        console.log(colors.gray("Debug info:"), error);
      }
    }

    console.log(
      colors.cyan("\n🤖 What would you like me to help you with next?")
    );
    this.rl.prompt();
  }

  private async showConfig(): Promise<void> {
    console.log(colors.blue("\n⚙️  Current Configuration:"));
    console.log(colors.gray("========================"));
    console.log(`📁 Project Root: ${this.config.projectRoot}`);
    console.log(`🔧 Debug Mode: ${this.config.debug ? "ON" : "OFF"}`);
    console.log(`📊 Max Depth: ${this.config.maxDepth}`);
    console.log(`🤖 Initialized: ${this.config.initialized ? "YES" : "NO"}`);
    console.log(
      `🔑 API Key: ${
        this.configManager.hasAnthropicApiKey() ? "SET" : "NOT SET"
      }`
    );
    console.log(`🧠 Model: ${this.configManager.getModel()}`);
    console.log(`🌡️  Temperature: ${this.configManager.getTemperature()}`);
    console.log(`📏 Max Tokens: ${this.configManager.getMaxTokens()}`);
    console.log("");
    console.log(colors.gray("Commands to change settings:"));
    console.log(colors.gray("  /config apikey       - Set API key"));
    console.log(colors.gray("  /config model <name> - Change AI model"));
    console.log(
      colors.gray("  /config temperature <0-1> - Set creativity level")
    );
    console.log(
      colors.gray("  /config maxtokens <n> - Set response length limit")
    );
    console.log(colors.gray("  /config reset        - Reset to defaults"));
    console.log("");
  }

  private async showStatus(): Promise<void> {
    console.log(colors.blue("\n📊 Agent Status:"));
    console.log(colors.gray("================"));

    // API Status
    if (this.configManager.hasAnthropicApiKey()) {
      console.log(colors.green("🔑 API Key: Configured"));
    } else {
      console.log(colors.red("🔑 API Key: Missing"));
    }

    // Agent Status
    if (this.config.initialized && this.agent) {
      console.log(colors.green("🤖 Agent: Ready"));
      console.log(colors.green("📁 Project: Loaded"));

      // Check if TypeScript compilation is working
      if (this.promptSystem) {
        const compileResult = this.promptSystem.compileTypeScript();
        if (compileResult.success) {
          console.log(colors.green("✅ TypeScript: No errors"));
        } else {
          console.log(
            colors.yellow(
              `⚠️  TypeScript: ${compileResult.errors.length} errors`
            )
          );
        }
      }
    } else {
      console.log(colors.yellow("🤖 Agent: Not initialized (run /init)"));
    }

    console.log(`📁 Working Directory: ${this.config.projectRoot}`);
    console.log(`🔧 Debug Mode: ${this.config.debug ? "ON" : "OFF"}`);
    console.log(`🧠 AI Model: ${this.configManager.getModel()}`);
    console.log("");
  }

  private async checkCompilation(): Promise<void> {
    if (!this.promptSystem) {
      console.log(colors.yellow("⚠️  Agent not initialized. Run /init first."));
      return;
    }

    console.log(colors.blue("🔨 Checking TypeScript compilation..."));

    const result = this.promptSystem.compileTypeScript();

    if (result.success) {
      console.log(colors.green("✅ No compilation errors found!"));
    } else {
      console.log(
        colors.red(`❌ Found ${result.errors.length} compilation errors:`)
      );
      result.errors.forEach((error) =>
        console.log(
          colors.red(`  • ${error.file}:${error.line} - ${error.message}`)
        )
      );
    }
    console.log("");
  }

  private showDetailedHelp(): void {
    console.log(colors.blue("\n🤖 AI Coding Agent - Detailed Help"));
    console.log(colors.gray("====================================="));
    console.log("");
    console.log(colors.green("Getting Started:"));
    console.log(colors.gray("1. Set your Anthropic API key: /config apikey"));
    console.log(
      colors.gray("2. Run /init to initialize the agent for your project")
    );
    console.log(colors.gray("3. Make coding requests in natural language"));
    console.log(
      colors.gray("4. The agent will analyze, plan, and implement changes")
    );
    console.log("");
    console.log(colors.green("Commands:"));
    console.log(
      colors.cyan("/init") +
        colors.gray("         - Initialize agent for current project")
    );
    console.log(
      colors.cyan("/config") + colors.gray("       - Show/modify configuration")
    );
    console.log(
      colors.cyan("/config apikey") + colors.gray(" - Set Anthropic API key")
    );
    console.log(
      colors.cyan("/status") +
        colors.gray("       - Show agent status and project info")
    );
    console.log(
      colors.cyan("/compile") +
        colors.gray("      - Check TypeScript compilation")
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
    console.log(
      colors.cyan("/exit") + colors.gray("         - Exit the agent")
    );
    console.log("");
    console.log(colors.green("Example Requests:"));
    console.log(colors.gray('• "Add email validation to UserService"'));
    console.log(colors.gray('• "Create a new component for user profile"'));
    console.log(
      colors.gray('• "Fix the TypeScript errors in auth.service.ts"')
    );
    console.log(
      colors.gray('• "Refactor the user repository to use async/await"')
    );
    console.log(colors.gray('• "Add error handling to the API endpoints"'));
    console.log("");
    console.log(colors.green("Tips:"));
    console.log(colors.gray("• Be specific about what you want to achieve"));
    console.log(colors.gray("• Mention file names if you know them"));
    console.log(
      colors.gray("• The agent will ask for clarification if needed")
    );
    console.log(colors.gray("• Use /debug for detailed operation logs"));
    console.log(colors.gray("• Test your API connection with /test"));
    console.log("");
  }
}

// Main execution
async function main() {
  const agent = new InteractiveAIAgent();
  await agent.start();
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error(colors.red(`❌ Fatal error: ${error.message}`));
    process.exit(1);
  });
}

export { InteractiveAIAgent };
