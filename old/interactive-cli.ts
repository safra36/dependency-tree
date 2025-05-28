#!/usr/bin/env node
// path: interactive-cli.ts

import * as readline from "readline";
import { AICodeAgent } from "./ai-coding-agent";
import { AIPromptSystem } from "./ai-prompt-system";
import { LineTrackingEditor } from "./line-tracker-editor";
import { ConfigManager } from "../config-manager";
import { AnthropicService } from "../anthropic-service";
import * as path from "path";
import * as fs from "fs";
import colors from "../colors";

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

    if (this.config.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] InteractiveAIAgent constructor"));
      console.log(colors.gray(`  Project root: ${this.config.projectRoot}`));
      console.log(colors.gray(`  Debug mode: ${this.config.debug}`));
      console.log(colors.gray(`  Max depth: ${this.config.maxDepth}`));
    }

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Setting up event handlers"));
    }

    this.rl.on("line", async (input) => {
      if (this.config.debug) {
        console.log(
          colors.cyan(`🔧 [DEBUG] User input received: "${input.trim()}"`)
        );
      }
      await this.processInput(input.trim());
    });

    this.rl.on("close", () => {
      if (this.config.debug) {
        console.log(colors.cyan("🔧 [DEBUG] Readline interface closed"));
      }
      console.log(colors.yellow("\n👋 Goodbye! Happy coding!"));
      process.exit(0);
    });

    // Handle Ctrl+C gracefully
    process.on("SIGINT", () => {
      if (this.config.debug) {
        console.log(colors.cyan("🔧 [DEBUG] SIGINT received"));
      }
      console.log(colors.yellow("\n\n👋 Received SIGINT. Goodbye!"));
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    if (this.config.debug) {
      console.log(
        colors.cyan("\n🔧 [DEBUG] InteractiveAIAgent.start() beginning")
      );
    }

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
    console.log(colors.gray("  - /debug    - Toggle debug mode"));
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
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Checking API key configuration..."));
    }

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

      const answer = await this.askQuestion(
        "Would you like to set your API key now? (y/n): "
      );
      if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
        await this.promptForAPIKey();
      }
    } else {
      console.log(colors.green("✅ Anthropic API key configured"));
      if (this.config.debug) {
        const key = this.configManager.getAnthropicApiKey();
        console.log(colors.gray(`  Key preview: ${key?.substring(0, 10)}...`));
      }
    }
  }

  private async promptForAPIKey(): Promise<void> {
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Prompting for API key..."));
    }

    const apiKey = await this.askQuestion(
      "Enter your Anthropic API key: ",
      true
    );
    if (apiKey && apiKey.trim()) {
      this.configManager.setAnthropicApiKey(apiKey.trim());
      console.log(colors.green("✅ API key saved!"));

      if (this.config.debug) {
        console.log(
          colors.gray(`  Key saved with length: ${apiKey.trim().length}`)
        );
      }
    } else {
      console.log(colors.yellow("⚠️  No API key provided"));
    }
  }

  private async askQuestion(question: string, hidden = false): Promise<string> {
    if (this.config.debug) {
      console.log(
        colors.cyan(
          `🔧 [DEBUG] Asking question (hidden: ${hidden}): ${question}`
        )
      );
    }

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
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Detecting project structure..."));
    }

    const packageJsonPath = path.join(this.config.projectRoot, "package.json");
    const tsconfigPath = path.join(this.config.projectRoot, "tsconfig.json");

    if (this.config.debug) {
      console.log(colors.gray(`  Checking package.json: ${packageJsonPath}`));
      console.log(colors.gray(`  Checking tsconfig.json: ${tsconfigPath}`));
    }

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf-8")
        );
        console.log(
          colors.green(`📦 Detected project: ${packageJson.name || "Unknown"}`)
        );
        console.log(colors.gray(`📁 Project root: ${this.config.projectRoot}`));

        if (this.config.debug) {
          console.log(colors.gray(`  Package.json contents:`));
          console.log(colors.gray(`    Name: ${packageJson.name}`));
          console.log(colors.gray(`    Version: ${packageJson.version}`));
          console.log(
            colors.gray(`    Description: ${packageJson.description}`)
          );
          console.log(
            colors.gray(
              `    Dependencies: ${
                Object.keys(packageJson.dependencies || {}).length
              }`
            )
          );
          console.log(
            colors.gray(
              `    DevDependencies: ${
                Object.keys(packageJson.devDependencies || {}).length
              }`
            )
          );
        }

        if (fs.existsSync(tsconfigPath)) {
          console.log(colors.green("✅ TypeScript configuration found"));

          if (this.config.debug) {
            try {
              const tsconfig = JSON.parse(
                fs.readFileSync(tsconfigPath, "utf-8")
              );
              console.log(colors.gray(`  TypeScript config:`));
              console.log(
                colors.gray(`    Target: ${tsconfig.compilerOptions?.target}`)
              );
              console.log(
                colors.gray(`    Module: ${tsconfig.compilerOptions?.module}`)
              );
              console.log(
                colors.gray(`    OutDir: ${tsconfig.compilerOptions?.outDir}`)
              );
            } catch (error) {
              console.log(
                colors.gray(`  Could not parse tsconfig.json: ${error.message}`)
              );
            }
          }
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
        if (this.config.debug) {
          console.log(colors.red(`  Error: ${error.message}`));
        }
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

      if (this.config.debug) {
        console.log(colors.gray(`  Current directory contents:`));
        try {
          const contents = fs.readdirSync(this.config.projectRoot);
          contents.forEach((item) => {
            console.log(colors.gray(`    ${item}`));
          });
        } catch (error) {
          console.log(
            colors.gray(`    Could not read directory: ${error.message}`)
          );
        }
      }
    }
    console.log("");
  }

  private async processInput(input: string): Promise<void> {
    if (this.config.debug) {
      console.log(colors.cyan(`🔧 [DEBUG] Processing input: "${input}"`));
    }

    if (!input) {
      this.rl.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith("/")) {
      if (this.config.debug) {
        console.log(colors.gray("  Input is a command"));
      }
      await this.handleCommand(input);
      return;
    }

    // Handle coding requests
    if (this.config.debug) {
      console.log(colors.gray("  Input is a coding request"));
    }
    await this.handleCodingRequest(input);
  }

  private async handleCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.slice(1).split(" ");

    if (this.config.debug) {
      console.log(colors.cyan(`🔧 [DEBUG] Handling command: ${cmd}`));
      console.log(colors.gray(`  Arguments: ${args.join(" ")}`));
    }

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
        this.toggleDebugMode();
        break;
      case "root":
        await this.handleRootCommand(args);
        break;
      case "exit":
      case "quit":
      case "q":
        if (this.config.debug) {
          console.log(colors.cyan("🔧 [DEBUG] Exit command received"));
        }
        this.rl.close();
        return;
      default:
        console.log(colors.red(`❌ Unknown command: /${cmd}`));
        console.log(colors.gray("Type /help for available commands"));
        break;
    }

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
        colors.cyan(
          "🔧 [DEBUG] Debug mode enabled - you will now see detailed logging"
        )
      );
      console.log(
        colors.gray(
          "  This includes AI requests/responses, file operations, and internal state"
        )
      );
    }

    // Update services with new debug setting
    if (this.agent) {
      // The agent will pick up the debug setting from config manager
    }
  }

  private async handleRootCommand(args: string[]): Promise<void> {
    if (args.length > 0) {
      const newRoot = path.resolve(args.join(" "));

      if (this.config.debug) {
        console.log(colors.cyan(`🔧 [DEBUG] Changing root to: ${newRoot}`));
      }

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
  }

  private async handleConfigCommand(args: string[]): Promise<void> {
    if (this.config.debug) {
      console.log(
        colors.cyan(`🔧 [DEBUG] Config command with args: ${args.join(" ")}`)
      );
    }

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

          if (this.config.debug) {
            console.log(colors.gray(`  Updated model in config manager`));
          }
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
        if (this.config.debug) {
          console.log(colors.cyan("🔧 [DEBUG] Resetting configuration..."));
        }
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
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] initializeAgent() starting"));
    }

    if (!this.configManager.hasAnthropicApiKey()) {
      console.log(
        colors.red("❌ API key required. Use /config apikey to set it.")
      );
      return;
    }

    console.log(colors.blue("🚀 Initializing AI Agent..."));

    try {
      if (this.config.debug) {
        console.log(colors.gray("  Creating AICodeAgent instance..."));
      }

      this.agent = new AICodeAgent(this.config.projectRoot, {
        debug: this.config.debug,
        maxDepth: this.config.maxDepth,
      });

      if (this.config.debug) {
        console.log(colors.gray("  Creating AIPromptSystem instance..."));
      }

      this.promptSystem = new AIPromptSystem(
        this.config.projectRoot,
        this.config.debug
      );

      console.log(colors.yellow("🔍 Scanning project structure..."));

      if (this.config.debug) {
        console.log(colors.gray("  Calling agent.initialize()..."));
      }

      await this.agent.initialize();

      this.config.initialized = true;
      console.log(colors.green("✅ Agent initialized successfully!"));
      console.log(colors.gray("You can now make coding requests."));

      if (this.config.debug) {
        console.log(
          colors.green("🔧 [DEBUG] Agent initialization completed successfully")
        );
      }
    } catch (error) {
      console.log(colors.red(`❌ Initialization failed: ${error.message}`));

      if (this.config.debug) {
        console.log(colors.red(`🔧 [DEBUG] Initialization error details:`));
        console.log(colors.red(`  Message: ${error.message}`));
        console.log(colors.red(`  Stack: ${error.stack}`));
      }

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
    }
  }

  private async testAIConnection(): Promise<void> {
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] testAIConnection() starting"));
    }

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
        debug: this.config.debug,
      });

      const connected = await anthropicService.testConnection();

      if (connected) {
        console.log(colors.green("✅ AI connection successful!"));
        console.log(colors.gray(`Model: ${anthropicService.getModel()}`));

        if (this.config.debug) {
          console.log(colors.green("🔧 [DEBUG] Connection test passed"));
        }
      } else {
        console.log(colors.red("❌ AI connection failed"));
        console.log(colors.gray("Check your API key and internet connection"));

        if (this.config.debug) {
          console.log(colors.red("🔧 [DEBUG] Connection test failed"));
        }
      }
    } catch (error) {
      console.log(colors.red(`❌ Connection test failed: ${error.message}`));

      if (this.config.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] Connection test error: ${error.message}`)
        );
      }
    }
  }

  private async handleCodingRequest(request: string): Promise<void> {
    if (this.config.debug) {
      console.log(colors.cyan(`🔧 [DEBUG] handleCodingRequest() starting`));
      console.log(colors.gray(`  Request: "${request}"`));
      console.log(
        colors.gray(
          `  API key available: ${this.configManager.hasAnthropicApiKey()}`
        )
      );
      console.log(
        colors.gray(`  Agent initialized: ${this.config.initialized}`)
      );
    }

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

    const startTime = Date.now();

    try {
      if (this.config.debug) {
        console.log(
          colors.cyan("🔧 [DEBUG] Calling agent.handleUserRequest()...")
        );
      }

      const result = await this.agent.handleUserRequest(request);

      const endTime = Date.now();
      const duration = endTime - startTime;

      if (this.config.debug) {
        console.log(
          colors.cyan(`🔧 [DEBUG] Request completed in ${duration}ms`)
        );
        console.log(colors.gray(`  Success: ${result.success}`));
        console.log(colors.gray(`  Changes: ${result.changes.length}`));
        console.log(colors.gray(`  Errors: ${result.errors?.length || 0}`));
      }

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
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(
        colors.red(`\n❌ Error processing request: ${error.message}`)
      );

      if (this.config.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] Request failed after ${duration}ms`)
        );
        console.log(colors.red(`  Error: ${error.message}`));
        console.log(colors.red(`  Stack: ${error.stack}`));
      }

      if (error.message.includes("API")) {
        console.log(colors.gray("This might be an API key or network issue."));
        console.log(colors.gray("Use /test to check your AI connection."));
      }
    }

    console.log(
      colors.cyan("\n🤖 What would you like me to help you with next?")
    );
    this.rl.prompt();
  }

  private async showConfig(): Promise<void> {
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Showing configuration..."));
    }

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

    if (this.config.debug) {
      console.log("\n🔧 Debug Information:");
      console.log(`  Config file: ${this.configManager.getConfigPath()}`);
      console.log(
        `  Full config: ${JSON.stringify(
          this.configManager.getAllConfig(),
          null,
          2
        )}`
      );
    }

    console.log("");
    console.log(colors.gray("Commands to change settings:"));
    console.log(colors.gray("  /config apikey       - Set API key"));
    console.log(colors.gray("  /config model <n> - Change AI model"));
    console.log(
      colors.gray("  /config temperature <0-1> - Set creativity level")
    );
    console.log(
      colors.gray("  /config maxtokens <n> - Set response length limit")
    );
    console.log(colors.gray("  /config reset        - Reset to defaults"));
    console.log(colors.gray("  /debug               - Toggle debug mode"));
    console.log("");
  }

  private async showStatus(): Promise<void> {
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Showing system status..."));
    }

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
        try {
          const compileResult = this.promptSystem.compileTypeScript();
          if (compileResult.success) {
            console.log(colors.green("✅ TypeScript: No errors"));
          } else {
            console.log(
              colors.yellow(
                `⚠️  TypeScript: ${compileResult.errors.length} errors`
              )
            );

            if (this.config.debug) {
              console.log(colors.gray("  TypeScript errors:"));
              compileResult.errors.forEach((error, i) => {
                console.log(
                  colors.gray(
                    `    ${i + 1}. ${error.file}:${error.line} - ${
                      error.message
                    }`
                  )
                );
              });
            }
          }
        } catch (error) {
          console.log(colors.red("❌ TypeScript: Compilation check failed"));
          if (this.config.debug) {
            console.log(colors.red(`  Error: ${error.message}`));
          }
        }
      }
    } else {
      console.log(colors.yellow("🤖 Agent: Not initialized (run /init)"));
    }

    console.log(`📁 Working Directory: ${this.config.projectRoot}`);
    console.log(`🔧 Debug Mode: ${this.config.debug ? "ON" : "OFF"}`);
    console.log(`🧠 AI Model: ${this.configManager.getModel()}`);

    if (this.config.debug) {
      console.log("\n🔧 Debug Status:");
      console.log(`  Process PID: ${process.pid}`);
      console.log(`  Node version: ${process.version}`);
      console.log(`  Platform: ${process.platform}`);
      console.log(
        `  Memory usage: ${JSON.stringify(process.memoryUsage(), null, 2)}`
      );
      console.log(`  Uptime: ${Math.floor(process.uptime())} seconds`);
    }

    console.log("");
  }

  private async checkCompilation(): Promise<void> {
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] checkCompilation() starting"));
    }

    if (!this.promptSystem) {
      console.log(colors.yellow("⚠️  Agent not initialized. Run /init first."));
      return;
    }

    console.log(colors.blue("🔨 Checking TypeScript compilation..."));

    try {
      const result = this.promptSystem.compileTypeScript();

      if (result.success) {
        console.log(colors.green("✅ No compilation errors found!"));

        if (this.config.debug) {
          console.log(
            colors.green("🔧 [DEBUG] TypeScript compilation successful")
          );
        }
      } else {
        console.log(
          colors.red(`❌ Found ${result.errors.length} compilation errors:`)
        );
        result.errors.forEach((error) =>
          console.log(
            colors.red(`  • ${error.file}:${error.line} - ${error.message}`)
          )
        );

        if (this.config.debug) {
          console.log(colors.red("🔧 [DEBUG] Compilation errors details:"));
          result.errors.forEach((error, i) => {
            console.log(colors.red(`  ${i + 1}. File: ${error.file}`));
            console.log(colors.red(`     Line: ${error.line}`));
            console.log(colors.red(`     Code: TS${error.code}`));
            console.log(colors.red(`     Message: ${error.message}`));
          });
        }
      }
    } catch (error) {
      console.log(colors.red(`❌ Compilation check failed: ${error.message}`));

      if (this.config.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] Compilation check error: ${error.message}`)
        );
      }
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
      colors.cyan("/debug") +
        colors.gray("        - Toggle debug mode (see all AI interactions)")
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
    console.log(
      colors.gray('• "Create a calculator service with basic operations"')
    );
    console.log("");
    console.log(colors.green("Tips:"));
    console.log(colors.gray("• Be specific about what you want to achieve"));
    console.log(colors.gray("• Mention file names if you know them"));
    console.log(
      colors.gray("• The agent will ask for clarification if needed")
    );
    console.log(colors.gray("• Use /debug for detailed operation logs"));
    console.log(colors.gray("• Test your API connection with /test"));
    console.log(
      colors.gray("• Enable debug mode to see AI requests and responses")
    );
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
