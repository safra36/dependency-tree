#!/usr/bin/env node

/**
 * Complete Dependency Tree Extractor - Enhanced Version with Directory Scanning
 * Analyzes file dependencies and provides complete context for code editing
 * New: Supports directory scanning with file pattern filtering
 */

const fs = require("fs");
const path = require("path");

class DependencyExtractor {
	constructor(options = {}) {
		// Configuration
		this.maxDepth = options.maxDepth || Infinity;
		this.rootDir = options.rootDir || process.cwd();
		this.includeExternal = options.includeExternal || false;
		this.maxContentLength = options.maxContentLength || 100000; // default to 100KB
		this.debug = options.debug || false;

		// File extensions to try when resolving imports
		this.extensions = options.extensions || [
			".ts",
			".tsx",
			".js",
			".jsx",
			".json",
			".mjs",
			".cjs",
			".d.ts",
			".svelte", // Added Svelte support
		];

		// Patterns to exclude from analysis
		this.excludePatterns = options.excludePatterns || [
			/node_modules/,
			/\.d\.ts$/,
			/\.spec\.ts$/,
			/\.test\.ts$/,
			/\.spec\.js$/,
			/\.test\.js$/,
			/dist\//,
			/build\//,
			/coverage\//,
			/\.git\//,
			/\.vscode\//,
			/\.idea\//,
		];

		// State tracking
		this.visited = new Map();
		this.circularDeps = new Set();
		this.allFiles = new Map();
		this.unresolved = new Set();

		// Svelte/SvelteKit specific configuration
		this.svelteAliases = options.svelteAliases || {
			$lib: "src/lib",
			$app: "@sveltejs/kit", // SvelteKit built-in
			$env: "@sveltejs/kit", // SvelteKit built-in
			"$service-worker": "@sveltejs/kit", // SvelteKit built-in
		};
	}

	async analyze(targetPath, pattern = null) {
		console.log(`🔍 Analyzing dependencies for: ${targetPath}\n`);

		// Auto-detect project root if not explicitly set
		if (!this.rootDir || this.rootDir === process.cwd()) {
			this.autoDetectProjectRoot(targetPath);
		}

		if (this.debug) {
			console.log(`📁 Using root directory: ${this.rootDir}`);
			console.log(`📁 Target path: ${path.resolve(targetPath)}\n`);
		}

		// Check if targetPath is a directory or file
		const targetStat = fs.statSync(targetPath);
		let filesToAnalyze = [];

		if (targetStat.isDirectory()) {
			// Directory mode - find files matching pattern
			if (!pattern) {
				throw new Error(
					"Pattern is required when analyzing a directory. Use --pattern option."
				);
			}

			filesToAnalyze = this.findMatchingFiles(targetPath, pattern);

			if (filesToAnalyze.length === 0) {
				throw new Error(
					`No files found matching pattern "${pattern}" in directory "${targetPath}"`
				);
			}

			console.log(
				`📂 Found ${filesToAnalyze.length} files matching pattern "${pattern}":`
			);
			filesToAnalyze.forEach((file) => {
				console.log(`   ${path.relative(this.rootDir, file)}`);
			});
			console.log("");
		} else {
			// Single file mode
			filesToAnalyze = [targetPath];
		}

		// Analyze each file
		const results = [];
		for (const filePath of filesToAnalyze) {
			// Reset state for each file analysis
			this.visited.clear();
			this.circularDeps.clear();
			this.unresolved.clear();

			const tree = this.extractDependencies(filePath);
			if (tree) {
				results.push({
					filePath: filePath,
					relativePath: path.relative(this.rootDir, filePath),
					tree: tree,
				});
			}
		}

		return {
			isMultiFile: filesToAnalyze.length > 1,
			pattern: pattern,
			targetPath: targetPath,
			results: results,
		};
	}

	findMatchingFiles(dirPath, pattern) {
		const matchingFiles = [];
		const regex = this.patternToRegex(pattern);

		if (this.debug) {
			console.log(`🔍 Searching for files matching pattern: ${pattern}`);
			console.log(`📁 Search directory: ${dirPath}`);
			console.log(`🎯 Regex pattern: ${regex}`);
		}

		const searchRecursive = (currentDir) => {
			try {
				const items = fs.readdirSync(currentDir);

				for (const item of items) {
					const itemPath = path.join(currentDir, item);

					// Skip if excluded
					if (this.shouldExclude(itemPath)) {
						continue;
					}

					const stat = fs.statSync(itemPath);

					if (stat.isDirectory()) {
						// Recursively search subdirectories
						searchRecursive(itemPath);
					} else if (stat.isFile()) {
						// Check if file matches pattern
						if (regex.test(item) || regex.test(itemPath)) {
							matchingFiles.push(itemPath);
							if (this.debug) {
								console.log(
									`   ✅ Match: ${path.relative(
										this.rootDir,
										itemPath
									)}`
								);
							}
						} else if (this.debug) {
							console.log(
								`   ❌ No match: ${path.relative(
									this.rootDir,
									itemPath
								)}`
							);
						}
					}
				}
			} catch (error) {
				if (this.debug) {
					console.log(
						`⚠️  Could not read directory ${currentDir}: ${error.message}`
					);
				}
			}
		};

		searchRecursive(dirPath);
		return matchingFiles;
	}

	patternToRegex(pattern) {
		// Convert glob-like patterns to regex
		// Support common patterns like *.controller.ts, **/*.service.js, etc.

		// Escape special regex characters except * and ?
		let regexPattern = pattern
			.replace(/[.+^${}()|[\]\\]/g, "\\$&")
			.replace(/\*\*/g, "___DOUBLESTAR___") // Temporarily replace **
			.replace(/\*/g, "[^/\\\\]*") // * matches anything except path separators
			.replace(/___DOUBLESTAR___/g, ".*") // ** matches anything including path separators
			.replace(/\?/g, "[^/\\\\]"); // ? matches single character except path separators

		// If pattern doesn't start with path separators, match filename only
		if (!pattern.includes("/") && !pattern.includes("\\")) {
			regexPattern = `(^|[/\\\\])${regexPattern}$`;
		} else {
			regexPattern = `${regexPattern}$`;
		}

		return new RegExp(regexPattern, "i"); // Case insensitive
	}

	autoDetectProjectRoot(filePath) {
		const resolvedFilePath = path.resolve(filePath);
		const searchDir = fs.statSync(resolvedFilePath).isDirectory()
			? resolvedFilePath
			: path.dirname(resolvedFilePath);

		// Walk up directories to find project root indicators
		let currentDir = searchDir;
		while (currentDir !== path.dirname(currentDir)) {
			// Check for common project root indicators
			const indicators = [
				"package.json",
				"svelte.config.js", // Svelte project indicator
				"vite.config.js", // Often used with Svelte
				"tsconfig.json",
				"angular.json",
				"next.config.js",
				"webpack.config.js",
				".git",
				"yarn.lock",
				"package-lock.json",
			];

			for (const indicator of indicators) {
				if (fs.existsSync(path.join(currentDir, indicator))) {
					this.rootDir = currentDir;
					if (this.debug) {
						console.log(
							`📁 Auto-detected root from ${indicator}: ${this.rootDir}`
						);
					}
					return;
				}
			}
			currentDir = path.dirname(currentDir);
		}

		// Fallback: infer from file path structure
		const pathParts = resolvedFilePath.split(path.sep);

		// Look for 'src' and use its parent as root
		const srcIndex = pathParts.findIndex((part) => part === "src");
		if (srcIndex > 0) {
			this.rootDir = pathParts.slice(0, srcIndex).join(path.sep);
			if (this.debug) {
				console.log(
					`📁 Inferred root from 'src' folder: ${this.rootDir}`
				);
			}
			return;
		}

		// Look for 'app' folder structure
		const appIndex = pathParts.findIndex((part) => part === "app");
		if (appIndex > 0) {
			this.rootDir = pathParts.slice(0, appIndex + 1).join(path.sep);
			if (this.debug) {
				console.log(
					`📁 Inferred root from 'app' folder: ${this.rootDir}`
				);
			}
			return;
		}

		// Look for common SvelteKit structure patterns
		const routesIndex = pathParts.findIndex((part) => part === "routes");
		if (routesIndex > 1) {
			this.rootDir = pathParts.slice(0, routesIndex - 1).join(path.sep); // Go back to project root
			if (this.debug) {
				console.log(
					`📁 Inferred root from SvelteKit 'routes' folder: ${this.rootDir}`
				);
			}
		}
	}

	extractDependencies(filePath, currentDepth = 0) {
		const resolvedPath = path.resolve(filePath);
		const relativePath = path.relative(this.rootDir, resolvedPath);

		// Check depth limit
		if (currentDepth > this.maxDepth) {
			return null;
		}

		// Check if already visited at this or shallower depth
		const existing = this.visited.get(resolvedPath);
		if (existing && existing.depth <= currentDepth) {
			return {
				path: relativePath,
				absolutePath: resolvedPath,
				circular: true,
				depth: currentDepth,
				dependencies: [],
			};
		}

		// Check file existence
		if (!fs.existsSync(resolvedPath)) {
			return {
				path: relativePath,
				absolutePath: resolvedPath,
				exists: false,
				error: "File not found",
				depth: currentDepth,
				dependencies: [],
			};
		}

		// Mark as visited
		this.visited.set(resolvedPath, { depth: currentDepth });

		// Get file information and content
		const fileInfo = this.getFileInfo(resolvedPath);
		const imports = this.parseImports(fileInfo.content, relativePath);

		if (this.debug) {
			console.log(
				`📄 Processing: ${relativePath} (depth: ${currentDepth})`
			);
			console.log(
				`   Found ${imports.length} imports: [${imports.join(", ")}]\n`
			);
		}

		const dependencies = [];

		// Process each import
		for (const importPath of imports) {
			if (this.debug) {
				console.log(`🔍 Resolving: "${importPath}"`);
			}

			const resolvedImport = this.resolveImportPath(
				importPath,
				resolvedPath
			);

			if (resolvedImport) {
				// Check for circular dependency
				if (this.visited.has(resolvedImport)) {
					const circularRef = `${relativePath} -> ${path.relative(
						this.rootDir,
						resolvedImport
					)}`;
					this.circularDeps.add(circularRef);

					dependencies.push({
						path: path.relative(this.rootDir, resolvedImport),
						absolutePath: resolvedImport,
						originalImport: importPath,
						circular: true,
						depth: currentDepth + 1,
						dependencies: [],
					});
				} else {
					const childTree = this.extractDependencies(
						resolvedImport,
						currentDepth + 1
					);
					if (childTree) {
						dependencies.push({
							...childTree,
							originalImport: importPath,
						});
					}
				}
			} else if (this.includeExternal) {
				dependencies.push({
					path: importPath,
					absolutePath: null,
					originalImport: importPath,
					external: true,
					depth: currentDepth + 1,
					dependencies: [],
				});
			} else {
				this.unresolved.add(importPath);
			}
		}

		const result = {
			path: relativePath,
			absolutePath: resolvedPath,
			exists: true,
			dependencies,
			depth: currentDepth,
			size: fileInfo.size,
			importCount: imports.length,
			skipReason: fileInfo.skipReason,
			content: fileInfo.content,
			isText: fileInfo.isText,
		};

		this.allFiles.set(resolvedPath, result);

		if (this.debug && dependencies.length === 0 && imports.length > 0) {
			console.log(
				`⚠️  Warning: Found ${imports.length} imports but resolved 0 dependencies`
			);
			console.log(`   Unresolved: [${imports.join(", ")}]\n`);
		}

		return result;
	}

	parseImports(content, fileName = "") {
		if (!content) return [];

		const imports = new Set();

		// For Svelte files, we need to parse script sections
		if (fileName.endsWith(".svelte")) {
			content = this.extractScriptFromSvelte(content);
		}

		const lines = content.split("\n");

		if (this.debug) {
			console.log(`   Parsing ${lines.length} lines of content...`);
		}

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();

			// Skip comments, empty lines, and strings
			if (
				!line ||
				line.startsWith("//") ||
				line.startsWith("/*") ||
				line.startsWith("*")
			) {
				continue;
			}

			const lineImports = this.extractImportsFromLine(line, i + 1);
			lineImports.forEach((imp) => imports.add(imp));
		}

		if (this.debug && imports.size > 0) {
			console.log(
				`   Extracted imports: [${Array.from(imports).join(", ")}]`
			);
		}

		return Array.from(imports);
	}

	extractScriptFromSvelte(content) {
		// Extract content from <script> tags in Svelte files
		const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
		let scriptContent = "";
		let match;

		while ((match = scriptRegex.exec(content)) !== null) {
			scriptContent += match[1] + "\n";
		}

		return scriptContent || content;
	}

	extractImportsFromLine(line, lineNumber) {
		const imports = [];

		// Comprehensive import patterns
		const patterns = [
			// Standard ES6 imports: import ... from "path"
			{
				name: "ES6 Import",
				regex: /import\s+(?:[^'"]*?)\s+from\s+['"`]([^'"`]+)['"`]/g,
			},
			// Type-only imports: import type ... from "path"
			{
				name: "Type Import",
				regex: /import\s+type\s+(?:[^'"]*?)\s+from\s+['"`]([^'"`]+)['"`]/g,
			},
			// Side-effect imports: import "path"
			{
				name: "Side Effect",
				regex: /import\s+['"`]([^'"`]+)['"`]/g,
			},
			// Dynamic imports: import("path")
			{
				name: "Dynamic Import",
				regex: /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
			},
			// Re-exports: export ... from "path"
			{
				name: "Re-export",
				regex: /export\s+(?:[^'"]*?)\s+from\s+['"`]([^'"`]+)['"`]/g,
			},
			// CommonJS with assignment: const x = require("path")
			{
				name: "CommonJS Assign",
				regex: /(?:const|let|var)\s+[^=]+\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
			},
			// Direct require: require("path")
			{
				name: "Direct Require",
				regex: /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
			},
		];

		for (const pattern of patterns) {
			let match;
			pattern.regex.lastIndex = 0;

			while ((match = pattern.regex.exec(line)) !== null) {
				const importPath = match[1];

				if (this.isValidImportPath(importPath)) {
					imports.push(importPath);

					if (this.debug) {
						console.log(
							`     Line ${lineNumber}: ${pattern.name} -> "${importPath}"`
						);
					}
				}
			}
		}

		return imports;
	}

	isValidImportPath(importPath) {
		return (
			importPath &&
			importPath.length > 0 &&
			!importPath.startsWith("http") &&
			!importPath.startsWith("//") &&
			!importPath.includes("?") &&
			!importPath.includes("#") &&
			!/^[\s]*$/.test(importPath) &&
			!importPath.includes("${") &&
			!importPath.includes("`") &&
			!importPath.startsWith("data:")
		);
	}

	resolveImportPath(importPath, fromFile) {
		if (this.debug) {
			console.log(`     🔍 Resolving "${importPath}" from ${fromFile}`);
		}

		// Handle Svelte/SvelteKit aliases first
		if (this.isSvelteAlias(importPath)) {
			const resolved = this.resolveSvelteAlias(importPath);
			if (this.debug) {
				console.log(
					`     ${resolved ? "✅" : "❌"} Svelte alias: ${
						resolved || "Not found"
					}`
				);
			}
			return resolved;
		}

		// Handle TypeScript absolute imports (src/..., app/..., etc.)
		if (this.isProjectAbsoluteImport(importPath)) {
			const resolved = this.resolveProjectAbsoluteImport(importPath);
			if (this.debug) {
				console.log(
					`     ${resolved ? "✅" : "❌"} Project absolute: ${
						resolved || "Not found"
					}`
				);
			}
			return resolved;
		}

		// Handle relative imports (./..., ../...)
		if (importPath.startsWith(".") || importPath.startsWith("/")) {
			const resolved = this.resolveRelativeImport(importPath, fromFile);
			if (this.debug) {
				console.log(
					`     ${resolved ? "✅" : "❌"} Relative: ${
						resolved || "Not found"
					}`
				);
			}
			return resolved;
		}

		// External module (node_modules)
		if (!this.includeExternal) {
			if (this.debug) {
				console.log(`     ⏭️  External (skipped): ${importPath}`);
			}
			return null;
		}

		try {
			const resolved = require.resolve(importPath, {
				paths: [path.dirname(fromFile)],
			});
			if (this.debug) {
				console.log(`     ✅ External resolved: ${resolved}`);
			}
			return resolved;
		} catch {
			if (this.debug) {
				console.log(`     ❌ External not found: ${importPath}`);
			}
			return null;
		}
	}

	isSvelteAlias(importPath) {
		return Object.keys(this.svelteAliases).some((alias) =>
			importPath.startsWith(alias)
		);
	}

	resolveSvelteAlias(importPath) {
		for (const [alias, target] of Object.entries(this.svelteAliases)) {
			if (importPath.startsWith(alias)) {
				// Handle SvelteKit built-in modules
				if (target.startsWith("@sveltejs/kit")) {
					if (this.includeExternal) {
						try {
							return require.resolve(target);
						} catch {
							return null;
						}
					}
					return null; // Skip SvelteKit built-ins unless including external
				}

				// Handle local aliases like $lib
				const remainingPath = importPath.substring(alias.length);
				const resolvedPath = path.resolve(
					this.rootDir,
					target + remainingPath
				);

				if (this.debug) {
					console.log(
						`       Svelte alias: ${alias} -> ${target}, full path: ${resolvedPath}`
					);
				}

				return this.tryResolveWithExtensions(resolvedPath);
			}
		}
		return null;
	}

	isProjectAbsoluteImport(importPath) {
		// Common project prefixes
		const projectPrefixes = [
			"src/",
			"app/",
			"lib/",
			"libs/",
			"packages/",
			"modules/",
			"components/",
			"services/",
			"utils/",
			"helpers/",
			"shared/",
			"core/",
			"common/",
			"config/",
			"assets/",
			"styles/",
			"types/",
			"interfaces/",
			"models/",
			"entities/",
			"dtos/",
			"guards/",
			"middleware/",
			"decorators/",
			"pipes/",
			"filters/",
			"interceptors/",
			"controllers/",
			"providers/",
			"repositories/",
			"schemas/",
		];

		return projectPrefixes.some((prefix) => importPath.startsWith(prefix));
	}

	resolveProjectAbsoluteImport(importPath) {
		// Multiple root directories to try
		const possibleRoots = [
			this.rootDir,
			path.join(this.rootDir, "app"),
			path.join(this.rootDir, "src"),
			path.join(this.rootDir, ".."),
			path.join(this.rootDir, "../app"),
			path.dirname(this.rootDir),
		];

		if (this.debug) {
			console.log(
				`       Trying to resolve absolute import: ${importPath}`
			);
			console.log(`       Current rootDir: ${this.rootDir}`);
			console.log(`       Possible roots: ${possibleRoots.join(", ")}`);
		}

		for (const root of possibleRoots) {
			if (!fs.existsSync(root)) {
				if (this.debug) {
					console.log(`       Root doesn't exist: ${root}`);
				}
				continue;
			}

			const fullPath = path.resolve(root, importPath);
			if (this.debug) {
				console.log(`       Trying full path: ${fullPath}`);
				console.log(
					`       Path exists check: ${fs.existsSync(fullPath)}`
				);
			}

			const resolved = this.tryResolveWithExtensions(fullPath);
			if (resolved) {
				if (this.debug) {
					console.log(
						`       ✅ Found in root: ${root} -> ${resolved}`
					);
				}
				return resolved;
			} else if (this.debug) {
				console.log(`       ❌ No resolution found for: ${fullPath}`);
			}
		}

		if (this.debug) {
			console.log(
				`       ❌ Could not resolve absolute import: ${importPath}`
			);
		}
		return null;
	}

	resolveRelativeImport(importPath, fromFile) {
		const fromDir = path.dirname(fromFile);
		const resolvedPath = path.resolve(fromDir, importPath);

		if (this.debug) {
			console.log(
				`       Resolving relative: ${importPath} from ${fromDir}`
			);
			console.log(`       Full path: ${resolvedPath}`);
		}

		return this.tryResolveWithExtensions(resolvedPath);
	}

	tryResolveWithExtensions(basePath) {
		if (this.debug) {
			console.log(
				`       Trying to resolve with extensions: ${basePath}`
			);
		}

		// Try exact path first, but only if it's a file (not a directory)
		if (fs.existsSync(basePath) && !this.shouldExclude(basePath)) {
			const stats = fs.statSync(basePath);
			if (stats.isFile()) {
				if (this.debug) {
					console.log(`       ✅ Found exact file: ${basePath}`);
				}
				return basePath;
			} else if (this.debug) {
				console.log(
					`       ❌ Exact path is a directory, trying extensions: ${basePath}`
				);
			}
		} else if (this.debug) {
			console.log(
				`       ❌ Exact path doesn't exist or excluded: ${basePath}`
			);
		}

		// Try with extensions
		for (const ext of this.extensions) {
			const withExt = basePath + ext;
			if (this.debug) {
				console.log(`       Trying with extension: ${withExt}`);
				console.log(`       File exists: ${fs.existsSync(withExt)}`);
				console.log(
					`       Should exclude: ${this.shouldExclude(withExt)}`
				);
			}
			if (fs.existsSync(withExt) && !this.shouldExclude(withExt)) {
				if (this.debug) {
					console.log(`       ✅ Found with extension: ${withExt}`);
				}
				return withExt;
			}
		}

		// Try as directory with index files
		for (const ext of this.extensions) {
			const indexPath = path.join(basePath, `index${ext}`);
			if (this.debug) {
				console.log(`       Trying index file: ${indexPath}`);
				console.log(
					`       Index file exists: ${fs.existsSync(indexPath)}`
				);
			}
			if (fs.existsSync(indexPath) && !this.shouldExclude(indexPath)) {
				if (this.debug) {
					console.log(`       ✅ Found index file: ${indexPath}`);
				}
				return indexPath;
			}
		}

		if (this.debug) {
			console.log(`       ❌ Could not resolve: ${basePath}`);
			console.log(
				`       Extensions tried: ${this.extensions.join(", ")}`
			);
		}
		return null;
	}

	shouldExclude(filePath) {
		return this.excludePatterns.some((pattern) => pattern.test(filePath));
	}

	getFileInfo(filePath) {
		try {
			const stats = fs.statSync(filePath);
			let content = "";
			let isText = false;
			let skipReason = null;

			// Check if we should read the content
			if (this.isBinaryFile(filePath)) {
				skipReason = "Binary file";
			} else if (stats.size > this.maxContentLength * 4) {
				// Increased limit
				skipReason = `File too large (${this.formatBytes(
					stats.size
				)} > ${this.formatBytes(this.maxContentLength * 4)})`;
			} else {
				try {
					content = fs.readFileSync(filePath, "utf-8");
					isText = true;

					if (this.debug) {
						console.log(
							`📖 Successfully read ${this.formatBytes(
								stats.size
							)} from ${path.relative(this.rootDir, filePath)}`
						);
					}
				} catch (error) {
					skipReason = `Read error: ${error.message}`;
					if (this.debug) {
						console.log(
							`⚠️  Could not read content of ${filePath}: ${error.message}`
						);
					}
				}
			}

			if (skipReason && this.debug) {
				console.log(
					`⚠️  Skipping content for ${path.relative(
						this.rootDir,
						filePath
					)}: ${skipReason}`
				);
			}

			return {
				size: stats.size,
				content: content,
				isText: isText,
				skipReason: skipReason,
			};
		} catch (error) {
			return {
				size: 0,
				content: "",
				isText: false,
				error: error.message,
			};
		}
	}

	isBinaryFile(filePath) {
		const binaryExtensions = [
			".png",
			".jpg",
			".jpeg",
			".gif",
			".bmp",
			".ico",
			".svg",
			".pdf",
			".zip",
			".tar",
			".gz",
			".rar",
			".7z",
			".exe",
			".dll",
			".so",
			".dylib",
			".woff",
			".woff2",
			".ttf",
			".eot",
			".mp3",
			".mp4",
			".avi",
			".mov",
			".webm",
			".node",
			".bin",
			".lock",
		];

		const ext = path.extname(filePath).toLowerCase();
		return binaryExtensions.includes(ext);
	}

	// Output Formatters
	printTree(analysisResult, options = {}) {
		const format = options.format || "tree";

		if (analysisResult.isMultiFile) {
			this.printMultiFileResults(analysisResult, options);
		} else {
			// Single file - use original behavior
			const tree = analysisResult.results[0].tree;
			switch (format) {
				case "json":
					this.printJSON(tree);
					break;
				case "list":
					this.printList(tree, options);
					break;
				case "content":
					this.printContent(tree, options);
					break;
				default:
					this.printTreeView(tree, options);
			}
			this.printSummary(tree, options);
		}
	}

	printMultiFileResults(analysisResult, options = {}) {
		const format = options.format || "tree";

		console.log(`🌳 Multi-file Analysis Results`);
		console.log(`📂 Pattern: ${analysisResult.pattern}`);
		console.log(`📁 Directory: ${analysisResult.targetPath}`);
		console.log(`📄 Files analyzed: ${analysisResult.results.length}\n`);

		if (format === "json") {
			console.log(JSON.stringify(analysisResult, null, 2));
			return;
		}

		for (let i = 0; i < analysisResult.results.length; i++) {
			const result = analysisResult.results[i];

			if (i > 0) {
				console.log("\n" + "=".repeat(80) + "\n");
			}

			console.log(
				`📄 File ${i + 1}/${analysisResult.results.length}: ${
					result.relativePath
				}`
			);
			console.log("─".repeat(60));

			switch (format) {
				case "list":
					this.printList(result.tree, options);
					break;
				case "content":
					this.printContent(result.tree, options);
					break;
				default:
					this.printTreeView(result.tree, options);
			}

			// Print individual file summary
			this.printFileSummary(result.tree, options);
		}

		// Print overall summary
		this.printOverallSummary(analysisResult, options);
	}

	printFileSummary(tree, options = {}) {
		if (options.format === "json" || options.format === "content") return;

		const stats = this.getStats(tree);
		console.log(`\n📊 File Statistics:`);
		console.log(`  Dependencies: ${stats.totalFiles - 1}`); // Exclude the file itself
		console.log(`  Total size: ${this.formatBytes(stats.totalSize)}`);
		console.log(`  Max depth: ${stats.maxDepth}`);
	}

	printOverallSummary(analysisResult, options = {}) {
		if (options.format === "json") return;

		console.log("\n" + "=".repeat(80));
		console.log("🌐 Overall Summary");
		console.log("=".repeat(80));

		let totalFiles = 0;
		let totalSize = 0;
		let maxDepth = 0;
		let allFileTypes = {};

		analysisResult.results.forEach((result) => {
			const stats = this.getStats(result.tree);
			totalFiles += stats.totalFiles;
			totalSize += stats.totalSize;
			maxDepth = Math.max(maxDepth, stats.maxDepth);

			// Merge file types
			Object.entries(stats.fileTypes).forEach(([ext, count]) => {
				allFileTypes[ext] = (allFileTypes[ext] || 0) + count;
			});
		});

		console.log(
			`📄 Source files analyzed: ${analysisResult.results.length}`
		);
		console.log(
			`📚 Total dependencies: ${
				totalFiles - analysisResult.results.length
			}`
		);
		console.log(`📊 Total size: ${this.formatBytes(totalSize)}`);
		console.log(`🔍 Max dependency depth: ${maxDepth}`);

		if (Object.keys(allFileTypes).length > 0) {
			const types = Object.entries(allFileTypes)
				.map(([ext, count]) => `${ext || "no-ext"}(${count})`)
				.join(", ");
			console.log(`📂 File types: ${types}`);
		}
	}

	printJSON(tree) {
		console.log(JSON.stringify(tree, null, 2));
	}

	printList(tree, options) {
		const files = this.collectAllFiles(tree, options.showExternal);
		console.log(`📋 All Dependencies (${files.length} files):\n`);

		files.sort().forEach((file, index) => {
			console.log(`${(index + 1).toString().padStart(3)}. ${file}`);
		});
	}

	printContent(tree, options = {}) {
		const files = this.collectFilesWithContent(tree, options.showExternal);
		const sortedFiles = this.sortFilesByDependency(files);

		console.log(
			`📁 Complete Dependency Context (${sortedFiles.length} files)\n`
		);

		sortedFiles.forEach((file, index) => {
			if (index > 0) {
				console.log("\n" + "=".repeat(80) + "\n");
			}

			this.printFileContent(file, options);
		});
	}

	printFileContent(file, options) {
		const maxLength = options.maxContentLength || this.maxContentLength;
		const content = this.getDisplayContent(file, maxLength);
		const language = this.getLanguageFromPath(file.path);

		console.log(`${file.path}:`);

		if (file.skipReason) {
			console.log(
				`\`\`\`\n// Skipped: ${
					file.skipReason
				}\n// File size: ${this.formatBytes(
					file.size
				)}\n// Use --max-content ${Math.ceil(
					file.size / 1000
				)} to force reading\n\`\`\``
			);
		} else if (content.error) {
			console.log(`\`\`\`\n// Error: ${content.error}\n\`\`\``);
		} else if (content.truncated) {
			console.log(
				`\`\`\`${language}\n${
					content.text
				}\n\n// ... (truncated at ${maxLength} characters)\n// Original size: ${this.formatBytes(
					file.size
				)}\n\`\`\``
			);
		} else {
			console.log(`\`\`\`${language}\n${content.text}\n\`\`\``);
		}
	}

	printTreeView(tree, options = {}) {
		this.printTreeRecursive(tree, "", new Set(), options);
	}

	printTreeRecursive(node, prefix, printed, options, isLast = true) {
		if (!node || printed.has(node.absolutePath)) return;

		printed.add(node.absolutePath);

		const connector = isLast ? "└── " : "├── ";
		const sizeInfo =
			options.showSize && node.size
				? ` (${this.formatBytes(node.size)})`
				: "";
		const indicators = this.getNodeIndicators(node);

		if (node.external && !options.showExternal) return;

		console.log(
			`${prefix}${connector}${node.path}${sizeInfo}${indicators}`
		);

		if (
			node.dependencies &&
			node.dependencies.length > 0 &&
			!node.circular
		) {
			const newPrefix = prefix + (isLast ? "    " : "│   ");
			node.dependencies.forEach((dep, index) => {
				const isLastDep = index === node.dependencies.length - 1;
				this.printTreeRecursive(
					dep,
					newPrefix,
					printed,
					options,
					isLastDep
				);
			});
		}
	}

	getNodeIndicators(node) {
		const indicators = [];
		if (node.external) indicators.push("📦");
		if (node.circular) indicators.push("🔄");
		if (node.error) indicators.push(`❌ (${node.error})`);
		return indicators.length > 0 ? " " + indicators.join(" ") : "";
	}

	printSummary(tree, options = {}) {
		if (options.format === "json") return;

		console.log(""); // Empty line before summary

		if (this.circularDeps.size > 0) {
			console.log("🔄 Circular Dependencies:");
			Array.from(this.circularDeps).forEach((dep) => {
				console.log(`  ${dep}`);
			});
			console.log("");
		}

		if (this.unresolved.size > 0 && this.debug) {
			console.log("❓ Unresolved Imports:");
			Array.from(this.unresolved).forEach((imp) => {
				console.log(`  ${imp}`);
			});
			console.log("");
		}

		const stats = this.getStats(tree);
		console.log("📊 Statistics:");
		console.log(`  Total files: ${stats.totalFiles}`);
		console.log(`  Total size: ${this.formatBytes(stats.totalSize)}`);
		console.log(`  Max depth: ${stats.maxDepth}`);
		console.log(`  External deps: ${stats.externalDeps}`);
		console.log(`  Circular deps: ${this.circularDeps.size}`);
		console.log(`  Unresolved: ${this.unresolved.size}`);

		if (Object.keys(stats.fileTypes).length > 0) {
			const types = Object.entries(stats.fileTypes)
				.map(([ext, count]) => `${ext || "no-ext"}(${count})`)
				.join(", ");
			console.log(`  File types: ${types}`);
		}
	}

	// Helper methods
	collectAllFiles(tree, includeExternal = true) {
		const files = new Set();
		this.collectFilesRecursive(tree, files, includeExternal);
		return Array.from(files);
	}

	collectFilesRecursive(node, files, includeExternal, visited = new Set()) {
		if (!node || visited.has(node.absolutePath)) return;

		visited.add(node.absolutePath);

		if (includeExternal || !node.external) {
			files.add(node.path);
		}

		if (node.dependencies) {
			node.dependencies.forEach((dep) => {
				this.collectFilesRecursive(
					dep,
					files,
					includeExternal,
					visited
				);
			});
		}
	}

	collectFilesWithContent(tree, includeExternal = true) {
		const files = [];
		const visited = new Set();

		this.collectContentRecursive(tree, files, includeExternal, visited);
		return files;
	}

	collectContentRecursive(node, files, includeExternal, visited) {
		if (!node || visited.has(node.absolutePath)) return;

		visited.add(node.absolutePath);

		if (node.exists && !node.error && (includeExternal || !node.external)) {
			files.push({
				path: node.path,
				absolutePath: node.absolutePath,
				depth: node.depth,
				size: node.size || 0,
				content: node.content || "",
				external: node.external,
				isText: node.isText,
				skipReason: node.skipReason,
			});
		}

		if (node.dependencies) {
			node.dependencies.forEach((dep) => {
				this.collectContentRecursive(
					dep,
					files,
					includeExternal,
					visited
				);
			});
		}
	}

	sortFilesByDependency(files) {
		return files.sort((a, b) => {
			if (a.depth !== b.depth) return a.depth - b.depth;
			return a.path.localeCompare(b.path);
		});
	}

	getDisplayContent(file, maxLength) {
		if (file.skipReason) {
			return { error: file.skipReason, text: "", truncated: false };
		}

		if (!file.content) {
			return {
				error: "No content available",
				text: "",
				truncated: false,
			};
		}

		if (file.content.length > maxLength) {
			return {
				text: file.content.substring(0, maxLength),
				truncated: true,
				error: null,
			};
		}

		return {
			text: file.content,
			truncated: false,
			error: null,
		};
	}

	getLanguageFromPath(filePath) {
		const ext = path.extname(filePath).toLowerCase();
		const languageMap = {
			".ts": "typescript",
			".tsx": "tsx",
			".js": "javascript",
			".jsx": "jsx",
			".svelte": "svelte",
			".json": "json",
			".md": "markdown",
			".yml": "yaml",
			".yaml": "yaml",
			".xml": "xml",
			".html": "html",
			".css": "css",
			".scss": "scss",
			".less": "less",
			".sql": "sql",
			".sh": "bash",
			".py": "python",
			".rb": "ruby",
			".go": "go",
			".rs": "rust",
			".php": "php",
			".java": "java",
			".c": "c",
			".cpp": "cpp",
			".h": "c",
			".vue": "vue",
		};

		return languageMap[ext] || "";
	}

	getStats(tree) {
		const stats = {
			totalFiles: 0,
			totalSize: 0,
			maxDepth: 0,
			externalDeps: 0,
			fileTypes: {},
		};

		this.calculateStatsRecursive(tree, stats, new Set());
		return stats;
	}

	calculateStatsRecursive(node, stats, visited, depth = 0) {
		if (!node || visited.has(node.absolutePath)) return;

		visited.add(node.absolutePath);

		stats.totalFiles++;
		stats.totalSize += node.size || 0;
		stats.maxDepth = Math.max(stats.maxDepth, depth);

		if (node.external) {
			stats.externalDeps++;
		}

		if (node.path) {
			const ext = path.extname(node.path);
			stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
		}

		if (node.dependencies) {
			node.dependencies.forEach((dep) => {
				this.calculateStatsRecursive(dep, stats, visited, depth + 1);
			});
		}
	}

	formatBytes(bytes) {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
	}
}

// CLI Interface
async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		console.log(`
🌳 Complete Dependency Tree Extractor - Enhanced with Directory Scanning

A powerful tool to analyze file dependencies and extract complete context for code editing.
Now supports directory scanning with pattern matching for bulk analysis.

Usage: 
  node dependency-tree.js <file> [options]                    # Single file analysis
  node dependency-tree.js <directory> --pattern <glob> [options]  # Multiple files analysis

Options:
  --pattern <glob>      File pattern to match (required for directory analysis)
                        Examples: "*.controller.ts", "**/*.service.js", "**/+page.svelte"
  --depth <n>           Maximum depth to traverse (default: infinite)
  --format <type>       Output format: tree, json, list, content (default: tree)
  --root <path>         Project root directory (auto-detected if not specified)
  --include-external    Include external/node_modules dependencies
  --show-size          Show file sizes in tree view
  --show-external      Show external dependencies (default: true)
  --max-content <n>    Maximum content length per file (default: 100000)
  --exclude <pattern>   Exclude files matching pattern (can be used multiple times)
  --debug              Enable detailed debug output
  --help, -h           Show this help

Pattern Examples:
  "*.controller.ts"     Find all controller files in any directory
  "**/*.service.js"     Find all service files recursively
  "**/+page.svelte"     Find all SvelteKit page files
  "auth/*.ts"           Find all TypeScript files in auth directory
  "*.spec.ts"           Find all test specification files
  "components/**/*.vue" Find all Vue components recursively

Output Formats:
  tree                 Visual tree structure with dependency hierarchy
  list                 Flat list of all dependency files  
  content              Complete file contents with proper formatting
  json                 Machine-readable JSON output for tools

Examples:

Single File Analysis:
  # Basic dependency analysis
  node dependency-tree.js src/app.module.ts
  
  # Complete context for editing
  node dependency-tree.js src/ai/ai.service.ts --format content --depth 3

Multiple Files Analysis:
  # Analyze all controllers
  node dependency-tree.js src --pattern "*.controller.ts" --format content
  
  # Analyze all services with dependencies
  node dependency-tree.js src --pattern "**/*.service.ts" --format tree --depth 2
  
  # All SvelteKit pages
  node dependency-tree.js src/routes --pattern "**/+page.svelte" --format content
  
  # Export all component context to file
  node dependency-tree.js src/components --pattern "*.tsx" --format content > components-context.md
  
  # Debug pattern matching
  node dependency-tree.js src --pattern "auth/*.ts" --debug

Other Examples:
  # Debug import resolution issues
  node dependency-tree.js src/problematic-file.ts --debug --root ./app
  
  # Include external dependencies
  node dependency-tree.js src/app.ts --format content --include-external

Perfect for:
  ✨ Understanding code before editing
  🔍 Debugging import issues  
  📚 Generating documentation context
  🤖 Providing complete context to AI assistants
  🛠️ Code review and refactoring
  🟠 Svelte/SvelteKit project analysis
  📦 Bulk analysis of related files (NEW!)
        `);
		return;
	}

	const targetPath = args[0];
	const options = {
		maxDepth: Infinity,
		rootDir: null,
		includeExternal: false,
		maxContentLength: 100000,
		debug: false,
		excludePatterns: [
			/node_modules/,
			/\.d\.ts$/,
			/\.spec\.ts$/,
			/\.test\.ts$/,
			/\.spec\.js$/,
			/\.test\.js$/,
			/dist\//,
			/build\//,
			/coverage\//,
			/\.git\//,
		],
	};

	const printOptions = {
		format: "tree",
		showSize: false,
		showExternal: true,
		maxContentLength: 100000,
	};

	let pattern = null;

	// Parse command line arguments
	for (let i = 1; i < args.length; i++) {
		switch (args[i]) {
			case "--pattern":
				pattern = args[++i];
				break;
			case "--depth":
				options.maxDepth = parseInt(args[++i]) || Infinity;
				break;
			case "--format":
				printOptions.format = args[++i] || "tree";
				break;
			case "--root":
				options.rootDir = path.resolve(args[++i] || process.cwd());
				break;
			case "--include-external":
				options.includeExternal = true;
				break;
			case "--show-size":
				printOptions.showSize = true;
				break;
			case "--show-external":
				printOptions.showExternal = true;
				break;
			case "--max-content":
				const maxContent = parseInt(args[++i]);
				if (maxContent > 0) {
					options.maxContentLength = maxContent;
					printOptions.maxContentLength = maxContent;
				}
				break;
			case "--exclude":
				const excludePattern = args[++i];
				if (excludePattern) {
					options.excludePatterns.push(new RegExp(excludePattern));
				}
				break;
			case "--debug":
				options.debug = true;
				break;
		}
	}

	try {
		const extractor = new DependencyExtractor(options);
		const result = await extractor.analyze(targetPath, pattern);
		extractor.printTree(result, printOptions);
	} catch (error) {
		console.error(`❌ Error: ${error.message}`);
		if (options.debug) {
			console.error(error.stack);
		}
		process.exit(1);
	}
}

// Run if called directly
if (require.main === module) {
	main().catch((error) => {
		console.error(`❌ Fatal error: ${error.message}`);
		process.exit(1);
	});
}

module.exports = { DependencyExtractor };
