// path: file-operations-manager.ts

import colors from "./colors";
import * as fs from "fs";
import * as path from "path";

interface FileOperationResult {
	success: boolean;
	message?: string;
	error?: string;
	backup?: string;
}

interface FileManagerOptions {
	debug?: boolean;
	createBackups?: boolean;
	maxFileSize?: number;
	allowedExtensions?: string[];
}

export class FileOperationsManager {
	private projectRoot: string;
	private debug: boolean;
	private createBackups: boolean;
	private maxFileSize: number;
	private allowedExtensions: string[];

	constructor(projectRoot: string, options: FileManagerOptions = {}) {
		this.projectRoot = path.resolve(projectRoot);
		this.debug = options.debug || false;
		this.createBackups = options.createBackups !== false; // Default true
		this.maxFileSize = options.maxFileSize || 1024 * 1024; // 1MB default
		this.allowedExtensions = options.allowedExtensions || [
			".ts",
			".tsx",
			".js",
			".jsx",
			".json",
			".md",
			".txt",
			".html",
			".css",
			".scss",
			".less",
			".vue",
			".svelte",
			".py",
			".go",
			".rs",
			".java",
			".cpp",
			".c",
			".h",
			".yml",
			".yaml",
			".toml",
			".ini",
			".conf",
			".env", // Environment files
			".example", // Example files
			".gitignore", // Git ignore files
			".prettierrc", // Prettier config
			".eslintrc", // ESLint config
			"", // Files without extension
		];

		if (this.debug) {
			console.log(colors.cyan("📁 FileOperationsManager initialized"));
			console.log(colors.gray(`  Project root: ${this.projectRoot}`));
			console.log(
				colors.gray(`  Backups enabled: ${this.createBackups}`)
			);
			console.log(
				colors.gray(
					`  Max file size: ${this.formatBytes(this.maxFileSize)}`
				)
			);
		}
	}

	async createFile(
		relativePath: string,
		content: string
	): Promise<FileOperationResult> {
		try {
			const fullPath = this.getFullPath(relativePath);

			// Validate file creation
			const validation = await this.validateFileOperation(
				"create",
				fullPath,
				content
			);
			if (!validation.success) {
				return validation;
			}

			// Check if file already exists
			if (fs.existsSync(fullPath)) {
				return {
					success: false,
					error: `File already exists: ${relativePath}`,
				};
			}

			// Ensure directory exists
			const dir = path.dirname(fullPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
				if (this.debug) {
					console.log(
						colors.gray(
							`  Created directory: ${path.relative(
								this.projectRoot,
								dir
							)}`
						)
					);
				}
			}

			// Write file
			fs.writeFileSync(fullPath, content, "utf-8");

			if (this.debug) {
				console.log(
					colors.green(
						`✅ Created file: ${relativePath} (${content.length} chars)`
					)
				);
			}

			return {
				success: true,
				message: `Created ${relativePath}`,
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to create ${relativePath}: ${error.message}`,
			};
		}
	}

	async modifyFile(
		relativePath: string,
		newContent: string
	): Promise<FileOperationResult> {
		try {
			const fullPath = this.getFullPath(relativePath);

			// Validate file modification
			const validation = await this.validateFileOperation(
				"modify",
				fullPath,
				newContent
			);
			if (!validation.success) {
				return validation;
			}

			// Check if file exists
			if (!fs.existsSync(fullPath)) {
				return {
					success: false,
					error: `File does not exist: ${relativePath}`,
				};
			}

			let backupPath: string | undefined;

			// Create backup if enabled
			if (this.createBackups) {
				const backupResult = await this.createBackup(fullPath);
				if (backupResult.success) {
					backupPath = backupResult.backup;
				} else {
					// Continue without backup but warn
					if (this.debug) {
						console.log(
							colors.yellow(
								`⚠️ Backup failed: ${backupResult.error}`
							)
						);
					}
				}
			}

			// Write new content
			fs.writeFileSync(fullPath, newContent, "utf-8");

			if (this.debug) {
				console.log(colors.green(`✅ Modified file: ${relativePath}`));
				console.log(
					colors.gray(`  Content: ${newContent.length} chars`)
				);
				if (backupPath) {
					console.log(
						colors.gray(
							`  Backup: ${path.relative(
								this.projectRoot,
								backupPath
							)}`
						)
					);
				}
			}

			return {
				success: true,
				message: `Modified ${relativePath}`,
				backup: backupPath,
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to modify ${relativePath}: ${error.message}`,
			};
		}
	}

	async deleteFile(relativePath: string): Promise<FileOperationResult> {
		try {
			const fullPath = this.getFullPath(relativePath);

			// Validate file deletion
			const validation = await this.validateFileOperation(
				"delete",
				fullPath
			);
			if (!validation.success) {
				return validation;
			}

			// Check if file exists
			if (!fs.existsSync(fullPath)) {
				return {
					success: false,
					error: `File does not exist: ${relativePath}`,
				};
			}

			let backupPath: string | undefined;

			// Create backup before deletion
			if (this.createBackups) {
				const backupResult = await this.createBackup(fullPath);
				if (backupResult.success) {
					backupPath = backupResult.backup;
				}
			}

			// Delete file
			fs.unlinkSync(fullPath);

			if (this.debug) {
				console.log(colors.green(`✅ Deleted file: ${relativePath}`));
				if (backupPath) {
					console.log(
						colors.gray(
							`  Backup: ${path.relative(
								this.projectRoot,
								backupPath
							)}`
						)
					);
				}
			}

			return {
				success: true,
				message: `Deleted ${relativePath}`,
				backup: backupPath,
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to delete ${relativePath}: ${error.message}`,
			};
		}
	}

	async readFile(
		relativePath: string
	): Promise<{ success: boolean; content?: string; error?: string }> {
		try {
			const fullPath = this.getFullPath(relativePath);

			if (!fs.existsSync(fullPath)) {
				return {
					success: false,
					error: `File does not exist: ${relativePath}`,
				};
			}

			// Check file size
			const stats = fs.statSync(fullPath);
			if (stats.size > this.maxFileSize) {
				return {
					success: false,
					error: `File too large: ${this.formatBytes(
						stats.size
					)} > ${this.formatBytes(this.maxFileSize)}`,
				};
			}

			const content = fs.readFileSync(fullPath, "utf-8");

			if (this.debug) {
				console.log(
					colors.green(
						`✅ Read file: ${relativePath} (${content.length} chars)`
					)
				);
			}

			return {
				success: true,
				content,
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to read ${relativePath}: ${error.message}`,
			};
		}
	}

	async fileExists(relativePath: string): Promise<boolean> {
		const fullPath = this.getFullPath(relativePath);
		return fs.existsSync(fullPath);
	}

	async getFileInfo(relativePath: string): Promise<{
		success: boolean;
		info?: {
			size: number;
			created: Date;
			modified: Date;
			extension: string;
			isText: boolean;
		};
		error?: string;
	}> {
		try {
			const fullPath = this.getFullPath(relativePath);

			if (!fs.existsSync(fullPath)) {
				return {
					success: false,
					error: `File does not exist: ${relativePath}`,
				};
			}

			const stats = fs.statSync(fullPath);
			const extension = path.extname(relativePath).toLowerCase();

			return {
				success: true,
				info: {
					size: stats.size,
					created: stats.birthtime,
					modified: stats.mtime,
					extension,
					isText: this.isTextFile(extension),
				},
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to get info for ${relativePath}: ${error.message}`,
			};
		}
	}

	async listFiles(directory = ""): Promise<{
		success: boolean;
		files?: string[];
		directories?: string[];
		error?: string;
	}> {
		try {
			const fullPath = directory
				? this.getFullPath(directory)
				: this.projectRoot;

			if (!fs.existsSync(fullPath)) {
				return {
					success: false,
					error: `Directory does not exist: ${directory}`,
				};
			}

			const items = fs.readdirSync(fullPath);
			const files: string[] = [];
			const directories: string[] = [];

			for (const item of items) {
				if (this.shouldSkipItem(item)) continue;

				const itemPath = path.join(fullPath, item);
				const stat = fs.statSync(itemPath);
				const relativePath = directory
					? path.join(directory, item)
					: item;

				if (stat.isDirectory()) {
					directories.push(relativePath);
				} else if (stat.isFile()) {
					files.push(relativePath);
				}
			}

			return {
				success: true,
				files: files.sort(),
				directories: directories.sort(),
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to list directory: ${error.message}`,
			};
		}
	}

	private async validateFileOperation(
		operation: "create" | "modify" | "delete",
		fullPath: string,
		content?: string
	): Promise<FileOperationResult> {
		// Check if path is within project root
		if (!fullPath.startsWith(this.projectRoot)) {
			return {
				success: false,
				error: "File path must be within project root",
			};
		}

		// Get file extension (handle files without extension)
		const ext = path.extname(fullPath).toLowerCase();
		const filename = path.basename(fullPath);

		// Special cases for common files without extensions or special extensions
		const isSpecialFile = [
			".env",
			".gitignore",
			".prettierrc",
			".eslintrc",
			"Dockerfile",
			"README",
			"LICENSE",
			"Makefile",
		].some(
			(special) => filename === special || filename.startsWith(special)
		);

		// Check file extension (allow files without extension and special files)
		if (ext && !this.allowedExtensions.includes(ext) && !isSpecialFile) {
			return {
				success: false,
				error: `File extension not allowed: ${ext}`,
			};
		}

		// Check content size
		if (content && content.length > this.maxFileSize) {
			return {
				success: false,
				error: `Content too large: ${this.formatBytes(
					content.length
				)} > ${this.formatBytes(this.maxFileSize)}`,
			};
		}

		// Additional safety checks
		const relativePath = path.relative(this.projectRoot, fullPath);
		if (relativePath.includes("..")) {
			return {
				success: false,
				error: "Path cannot contain '..' for security",
			};
		}

		return { success: true };
	}

	private async createBackup(fullPath: string): Promise<FileOperationResult> {
		try {
			const backupDir = path.join(this.projectRoot, ".backups");
			if (!fs.existsSync(backupDir)) {
				fs.mkdirSync(backupDir, { recursive: true });
			}

			const relativePath = path.relative(this.projectRoot, fullPath);
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const backupPath = path.join(
				backupDir,
				`${relativePath.replace(/[/\\]/g, "_")}.${timestamp}.bak`
			);

			fs.copyFileSync(fullPath, backupPath);

			return {
				success: true,
				backup: backupPath,
			};
		} catch (error) {
			return {
				success: false,
				error: `Backup failed: ${error.message}`,
			};
		}
	}

	private getFullPath(relativePath: string): string {
		return path.resolve(this.projectRoot, relativePath);
	}

	private isTextFile(extension: string): boolean {
		const textExtensions = [
			".txt",
			".md",
			".json",
			".xml",
			".html",
			".css",
			".scss",
			".less",
			".js",
			".jsx",
			".ts",
			".tsx",
			".vue",
			".svelte",
			".py",
			".go",
			".rs",
			".java",
			".cpp",
			".c",
			".h",
			".yml",
			".yaml",
			".toml",
			".ini",
			".conf",
			".env",
			".example",
		];
		return (
			textExtensions.includes(extension.toLowerCase()) || extension === ""
		);
	}

	private shouldSkipItem(item: string): boolean {
		const skipItems = [
			".git",
			"node_modules",
			".backups",
			"dist",
			"build",
			".next",
			".vscode",
		];
		return (
			skipItems.includes(item) ||
			(item.startsWith(".") &&
				item !== ".env" &&
				item !== ".gitignore" &&
				item !== ".prettierrc")
		);
	}

	private formatBytes(bytes: number): string {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
	}

	setDebug(debug: boolean): void {
		this.debug = debug;
	}
}
