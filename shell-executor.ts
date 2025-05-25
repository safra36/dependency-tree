// path: shell-executor.ts

import { spawn, exec } from "child_process";
import * as path from "path";
import colors from "./colors";

interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  duration: number;
}

interface CommandOptions {
  cwd?: string;
  timeout?: number;
  allowedCommands?: string[];
  debug?: boolean;
}

export class ShellExecutor {
  private projectRoot: string;
  private debug: boolean;
  private allowedCommands: string[];

  constructor(projectRoot: string, options: CommandOptions = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.debug = options.debug || false;

    // Default allowed commands - can be extended
    this.allowedCommands = options.allowedCommands || [
      "npm",
      "yarn",
      "pnpm",
      "bun",
      "git",
      "node",
      "npx",
      "mkdir",
      "touch",
      "ls",
      "pwd",
      "tsc",
      "eslint",
      "prettier",
      "vite",
      "next",
      "create-react-app",
      "ng",
      "vue",
      "svelte",
    ];

    if (this.debug) {
      console.log(colors.cyan("🔧 [DEBUG] ShellExecutor initialized"));
      console.log(colors.gray(`  Project root: ${this.projectRoot}`));
      console.log(
        colors.gray(`  Allowed commands: ${this.allowedCommands.join(", ")}`)
      );
    }
  }

  async executeCommand(
    command: string,
    options: Partial<CommandOptions> = {}
  ): Promise<CommandResult> {
    const startTime = Date.now();
    const cwd = options.cwd || this.projectRoot;
    const timeout = options.timeout || 60000; // 60 seconds default

    if (this.debug) {
      console.log(colors.cyan(`\n🔧 [DEBUG] Executing command: ${command}`));
      console.log(colors.gray(`  Working directory: ${cwd}`));
      console.log(colors.gray(`  Timeout: ${timeout}ms`));
    }

    // Security check
    if (!this.isCommandAllowed(command)) {
      const error = `Command not allowed: ${command.split(" ")[0]}`;
      if (this.debug) {
        console.log(colors.red(`🔧 [DEBUG] ${error}`));
      }
      return {
        success: false,
        stdout: "",
        stderr: error,
        exitCode: 1,
        command,
        duration: Date.now() - startTime,
      };
    }

    return new Promise((resolve) => {
      const child = exec(
        command,
        {
          cwd,
          timeout,
          maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        },
        (error, stdout, stderr) => {
          const duration = Date.now() - startTime;
          const exitCode = error?.code || 0;
          const success = exitCode === 0;

          if (this.debug) {
            console.log(
              colors.cyan(`🔧 [DEBUG] Command completed (${duration}ms)`)
            );
            console.log(colors.gray(`  Exit code: ${exitCode}`));
            console.log(colors.gray(`  Success: ${success}`));
            if (stdout)
              console.log(
                colors.gray(`  Stdout: ${stdout.substring(0, 200)}...`)
              );
            if (stderr)
              console.log(
                colors.gray(`  Stderr: ${stderr.substring(0, 200)}...`)
              );
          }

          resolve({
            success,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode,
            command,
            duration,
          });
        }
      );

      // Handle timeout
      child.on("error", (error) => {
        if (this.debug) {
          console.log(colors.red(`🔧 [DEBUG] Command error: ${error.message}`));
        }
      });
    });
  }

  async executeMultipleCommands(
    commands: string[],
    options: Partial<CommandOptions> = {}
  ): Promise<CommandResult[]> {
    const results: CommandResult[] = [];

    if (this.debug) {
      console.log(
        colors.cyan(
          `\n🔧 [DEBUG] Executing ${commands.length} commands sequentially`
        )
      );
    }

    for (const command of commands) {
      const result = await this.executeCommand(command, options);
      results.push(result);

      // Stop on first failure unless continuing
      if (
        !result.success &&
        !options.allowedCommands?.includes("continue-on-error")
      ) {
        if (this.debug) {
          console.log(
            colors.red(
              `🔧 [DEBUG] Stopping execution due to failed command: ${command}`
            )
          );
        }
        break;
      }
    }

    return results;
  }

  private isCommandAllowed(command: string): boolean {
    const baseCommand = command.trim().split(" ")[0];
    return this.allowedCommands.some(
      (allowed) =>
        baseCommand === allowed || baseCommand.startsWith(allowed + ".")
    );
  }

  // Common project commands
  async initializeProject(
    projectType: "react" | "next" | "vue" | "svelte" | "node" = "node"
  ): Promise<CommandResult[]> {
    const commands: string[] = [];

    switch (projectType) {
      case "react":
        commands.push(
          "npm init -y",
          "npm install react react-dom",
          "npm install -D @types/react @types/react-dom typescript @vitejs/plugin-react vite"
        );
        break;
      case "next":
        commands.push(
          "npm init -y",
          "npm install next react react-dom",
          "npm install -D @types/react @types/react-dom @types/node typescript"
        );
        break;
      case "vue":
        commands.push(
          "npm init -y",
          "npm install vue",
          "npm install -D @vitejs/plugin-vue vite typescript"
        );
        break;
      case "svelte":
        commands.push(
          "npm init -y",
          "npm install svelte",
          "npm install -D @sveltejs/vite-plugin-svelte vite typescript"
        );
        break;
      default:
        commands.push("npm init -y");
        break;
    }

    if (this.debug) {
      console.log(
        colors.cyan(`🔧 [DEBUG] Initializing ${projectType} project`)
      );
    }

    return await this.executeMultipleCommands(commands);
  }

  async installPackages(
    packages: string[],
    dev = false
  ): Promise<CommandResult> {
    const flag = dev ? "-D" : "";
    const command = `npm install ${flag} ${packages.join(" ")}`;

    if (this.debug) {
      console.log(
        colors.cyan(`🔧 [DEBUG] Installing packages: ${packages.join(", ")}`)
      );
    }

    return await this.executeCommand(command);
  }

  async buildProject(): Promise<CommandResult> {
    // Try common build commands
    const buildCommands = ["npm run build", "npm run compile", "tsc"];

    for (const command of buildCommands) {
      const result = await this.executeCommand(command);
      if (result.success) {
        return result;
      }
    }

    return {
      success: false,
      stdout: "",
      stderr: "No build command found",
      exitCode: 1,
      command: "build",
      duration: 0,
    };
  }

  async runTests(): Promise<CommandResult> {
    return await this.executeCommand("npm test");
  }

  async startDevServer(): Promise<CommandResult> {
    const devCommands = ["npm run dev", "npm start", "npm run serve"];

    for (const command of devCommands) {
      // Just check if the command exists in package.json scripts
      const result = await this.executeCommand(
        `npm run --silent 2>/dev/null || echo "not found"`
      );
      if (result.stdout.includes("dev") || result.stdout.includes("start")) {
        return await this.executeCommand(command);
      }
    }

    return {
      success: false,
      stdout: "",
      stderr: "No dev server command found",
      exitCode: 1,
      command: "dev",
      duration: 0,
    };
  }

  // Git operations
  async initGit(): Promise<CommandResult[]> {
    return await this.executeMultipleCommands([
      "git init",
      "git add .",
      'git commit -m "Initial commit"',
    ]);
  }

  // Package.json utilities
  async getPackageInfo(): Promise<any> {
    const packagePath = path.join(this.projectRoot, "package.json");
    try {
      const fs = await import("fs");
      const content = fs.readFileSync(packagePath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  async updatePackageJson(updates: any): Promise<boolean> {
    const packagePath = path.join(this.projectRoot, "package.json");
    try {
      const fs = await import("fs");
      const existing = (await this.getPackageInfo()) || {};
      const updated = { ...existing, ...updates };
      fs.writeFileSync(packagePath, JSON.stringify(updated, null, 2));
      return true;
    } catch (error) {
      return false;
    }
  }

  // Project analysis
  async analyzeProject(): Promise<{
    type: string;
    framework?: string;
    packageManager: string;
    hasPackageJson: boolean;
    scripts: string[];
    dependencies: string[];
    devDependencies: string[];
  }> {
    const packageInfo = await this.getPackageInfo();
    const hasYarnLock = await this.fileExists("yarn.lock");
    const hasPnpmLock = await this.fileExists("pnpm-lock.yaml");
    const hasBunLock = await this.fileExists("bun.lockb");

    let packageManager = "npm";
    if (hasBunLock) packageManager = "bun";
    else if (hasPnpmLock) packageManager = "pnpm";
    else if (hasYarnLock) packageManager = "yarn";

    let projectType = "node";
    let framework = undefined;

    if (packageInfo) {
      const deps = {
        ...packageInfo.dependencies,
        ...packageInfo.devDependencies,
      };

      if (deps.react) {
        projectType = "frontend";
        framework = deps.next ? "next" : "react";
      } else if (deps.vue) {
        projectType = "frontend";
        framework = "vue";
      } else if (deps.svelte) {
        projectType = "frontend";
        framework = "svelte";
      } else if (deps.express || deps.fastify || deps.koa) {
        projectType = "backend";
      }
    }

    return {
      type: projectType,
      framework,
      packageManager,
      hasPackageJson: !!packageInfo,
      scripts: packageInfo?.scripts ? Object.keys(packageInfo.scripts) : [],
      dependencies: packageInfo?.dependencies
        ? Object.keys(packageInfo.dependencies)
        : [],
      devDependencies: packageInfo?.devDependencies
        ? Object.keys(packageInfo.devDependencies)
        : [],
    };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const fs = await import("fs");
      const fullPath = path.join(this.projectRoot, filePath);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
  }

  addAllowedCommand(command: string): void {
    if (!this.allowedCommands.includes(command)) {
      this.allowedCommands.push(command);
      if (this.debug) {
        console.log(colors.gray(`  Added allowed command: ${command}`));
      }
    }
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }
}
