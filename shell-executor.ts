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

		// Enhanced allowed commands list including NestJS and common development tools
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
			"nest", // NestJS CLI
			"cd", // Change directory
			"echo", // Echo command
			"cp", // Copy files
			"mv", // Move files
			"rm", // Remove files (with safety checks)
		];

		if (this.debug) {
			console.log(colors.cyan("🔧 [DEBUG] ShellExecutor initialized"));
			console.log(colors.gray(`  Project root: ${this.projectRoot}`));
			console.log(
				colors.gray(
					`  Allowed commands: ${this.allowedCommands.join(", ")}`
				)
			);
		}
	}

	async executeCommand(
		command: string,
		options: Partial<CommandOptions> = {}
	): Promise<CommandResult> {
		const startTime = Date.now();
		const cwd = options.cwd || this.projectRoot;
		const timeout = options.timeout || 120000; // Increased to 2 minutes for package installs

		if (this.debug) {
			console.log(
				colors.cyan(`\n🔧 [DEBUG] Executing command: ${command}`)
			);
			console.log(colors.gray(`  Working directory: ${cwd}`));
			console.log(colors.gray(`  Timeout: ${timeout}ms`));
		}

		// Enhanced security check
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

		// Special handling for certain commands
		const processedCommand = await this.preprocessCommand(command, cwd);

		return new Promise((resolve) => {
			const child = exec(
				processedCommand,
				{
					cwd,
					timeout,
					maxBuffer: 1024 * 1024 * 50, // Increased to 50MB for larger outputs
				},
				(error, stdout, stderr) => {
					const duration = Date.now() - startTime;
					const exitCode = error?.code || 0;
					const success = exitCode === 0;

					if (this.debug) {
						console.log(
							colors.cyan(
								`🔧 [DEBUG] Command completed (${duration}ms)`
							)
						);
						console.log(colors.gray(`  Exit code: ${exitCode}`));
						console.log(colors.gray(`  Success: ${success}`));
						if (stdout && stdout.length > 0) {
							console.log(
								colors.gray(
									`  Stdout length: ${stdout.length} chars`
								)
							);
							console.log(
								colors.gray(
									`  Stdout preview: ${stdout.substring(
										0,
										300
									)}${stdout.length > 300 ? "..." : ""}`
								)
							);
						}
						if (stderr && stderr.length > 0) {
							console.log(
								colors.gray(
									`  Stderr: ${stderr.substring(0, 300)}${
										stderr.length > 300 ? "..." : ""
									}`
								)
							);
						}
					}

					resolve({
						success,
						stdout: stdout ? stdout.trim() : "",
						stderr: stderr ? stderr.trim() : "",
						exitCode,
						command: processedCommand,
						duration,
					});
				}
			);

			// Handle timeout and errors
			child.on("error", (error) => {
				if (this.debug) {
					console.log(
						colors.red(`🔧 [DEBUG] Command error: ${error.message}`)
					);
				}
			});

			// Handle process exit
			child.on("exit", (code, signal) => {
				if (this.debug && signal) {
					console.log(
						colors.yellow(
							`🔧 [DEBUG] Process terminated by signal: ${signal}`
						)
					);
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

			// Stop on first failure unless continuing on error
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

	// Enhanced command preprocessing
	private async preprocessCommand(
		command: string,
		cwd: string
	): Promise<string> {
		let processedCommand = command.trim();

		// Handle directory changes
		if (processedCommand.startsWith("cd ")) {
			const targetDir = processedCommand.substring(3).trim();

			// If it's an absolute path, validate it's within project bounds
			if (path.isAbsolute(targetDir)) {
				if (!targetDir.startsWith(this.projectRoot)) {
					throw new Error(
						`Directory change outside project root not allowed: ${targetDir}`
					);
				}
			}

			// For relative paths, resolve them relative to current cwd
			const resolvedPath = path.resolve(cwd, targetDir);
			if (!resolvedPath.startsWith(this.projectRoot)) {
				throw new Error(
					`Directory change outside project root not allowed: ${resolvedPath}`
				);
			}

			// Create directory if it doesn't exist (for cd to new directories)
			if (!require("fs").existsSync(resolvedPath)) {
				if (this.debug) {
					console.log(
						colors.yellow(
							`🔧 [DEBUG] Creating directory: ${resolvedPath}`
						)
					);
				}
				require("fs").mkdirSync(resolvedPath, { recursive: true });
			}

			// Return the cd command - the actual directory change will be handled by exec
			return processedCommand;
		}

		// Handle NestJS CLI commands that might need special handling
		if (processedCommand.includes("nest new")) {
			// Ensure we handle the current directory case
			if (processedCommand.includes("nest new .")) {
				processedCommand = processedCommand.replace(
					"nest new .",
					`nest new temp-nest-app`
				);
				// We'll need to move the contents after creation
			}
		}

		// Handle npm/yarn commands with better error handling
		if (
			processedCommand.startsWith("npm ") ||
			processedCommand.startsWith("yarn ")
		) {
			// Add --verbose flag for better debugging if in debug mode and not already present
			if (
				this.debug &&
				!processedCommand.includes("--verbose") &&
				!processedCommand.includes("--silent")
			) {
				processedCommand += " --verbose";
			}
		}

		// Handle git commands - ensure they run in the right directory
		if (processedCommand.startsWith("git ")) {
			// Check if we're in a NestJS project subdirectory and adjust accordingly
			const projectDirs = ["agent-watch", "nestjs-app"]; // common project names
			const currentDirParts = cwd.split(path.sep);
			const projectDir = projectDirs.find((dir) =>
				currentDirParts.includes(dir)
			);

			if (projectDir && !processedCommand.includes("git init")) {
				// For git commands other than init, we might need to be inside the project
				const projectPath = path.join(this.projectRoot, projectDir);
				if (
					require("fs").existsSync(projectPath) &&
					!cwd.includes(projectDir)
				) {
					// Change the working directory context for this command
					return `cd ${projectPath} && ${processedCommand}`;
				}
			}
		}

		return processedCommand;
	}

	private isCommandAllowed(command: string): boolean {
		const baseCommand = command.trim().split(" ")[0];

		// Special handling for some commands
		if (baseCommand === "cd") return true;
		if (baseCommand === "echo") return true;

		return this.allowedCommands.some(
			(allowed) =>
				baseCommand === allowed ||
				baseCommand.startsWith(allowed + ".") ||
				(allowed === "nest" && baseCommand === "nest") ||
				(allowed === "npm" &&
					(baseCommand === "npm" || baseCommand === "npx"))
		);
	}

	// Enhanced project initialization for NestJS
	async initializeNestJSProject(): Promise<CommandResult[]> {
		const commands: string[] = [];

		if (this.debug) {
			console.log(colors.cyan("🔧 [DEBUG] Initializing NestJS project"));
		}

		// Check if @nestjs/cli is installed globally
		const nestCheck = await this.executeCommand("nest --version");
		if (!nestCheck.success) {
			commands.push("npm install -g @nestjs/cli");
		}

		// Create new NestJS project in current directory
		commands.push("nest new . --package-manager npm --skip-git");

		// Install additional dependencies
		commands.push("npm install @nestjs/config");
		commands.push("npm install @nestjs/swagger");
		commands.push("npm install class-validator class-transformer");
		commands.push("npm install helmet compression");

		// Create basic structure
		commands.push("nest generate module core");
		commands.push("nest generate module shared");
		commands.push("nest generate module features");

		// Create environment files
		commands.push("touch .env");
		commands.push("touch .env.example");
		commands.push("touch .env.development");
		commands.push("touch .env.production");

		// Initialize git if not already initialized
		const gitCheck = await this.executeCommand("git status");
		if (!gitCheck.success) {
			commands.push("git init");
			commands.push("git add .");
			commands.push('git commit -m "Initial NestJS project setup"');
		}

		return await this.executeMultipleCommands(commands);
	}

	// Common project commands
	async initializeProject(
		projectType:
			| "react"
			| "next"
			| "vue"
			| "svelte"
			| "node"
			| "nestjs" = "node"
	): Promise<CommandResult[]> {
		if (projectType === "nestjs") {
			return await this.initializeNestJSProject();
		}

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
				colors.cyan(
					`🔧 [DEBUG] Installing packages: ${packages.join(", ")}`
				)
			);
		}

		return await this.executeCommand(command);
	}

	async buildProject(): Promise<CommandResult> {
		// Try common build commands
		const buildCommands = ["npm run build", "npm run compile", "tsc"];

		for (const command of buildCommands) {
			// Check if the command exists first
			if (command.startsWith("npm run")) {
				const packageInfo = await this.getPackageInfo();
				const scriptName = command.split(" ")[2];
				if (!packageInfo?.scripts?.[scriptName]) {
					continue;
				}
			}

			const result = await this.executeCommand(command);
			if (result.success) {
				return result;
			}
		}

		return {
			success: false,
			stdout: "",
			stderr: "No build command found or all build commands failed",
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
			// Check if the command exists in package.json
			const packageInfo = await this.getPackageInfo();
			const scriptName = command.split(" ")[2] || "start";

			if (packageInfo?.scripts?.[scriptName]) {
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
			if (!fs.existsSync(packagePath)) {
				return null;
			}
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

			if (deps["@nestjs/core"]) {
				projectType = "backend";
				framework = "nestjs";
			} else if (deps.react) {
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
			scripts: packageInfo?.scripts
				? Object.keys(packageInfo.scripts)
				: [],
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
