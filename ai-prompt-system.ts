// ai-prompt-system.ts


import { LineTrackingEditor, EditOperation } from "./line-tracker-editor";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { DependencyExtractor } from "./dependancy-tree";

interface AIEditResponse {
	file: string;
	analysis: string;
	edits: {
		startIndex: number;
		endIndex: number;
		newContent: string[];
		description: string;
	}[];
}

interface CompilationError {
	file: string;
	line: number;
	message: string;
	code: number;
}

class AIPromptSystem {
	private dependencyExtractor: DependencyExtractor;
	private editor: LineTrackingEditor;
	private projectRoot: string;

	constructor(projectRoot: string, debug = false) {
		this.projectRoot = path.resolve(projectRoot);
		this.dependencyExtractor = new DependencyExtractor({
			rootDir: this.projectRoot,
			debug,
		});
		this.editor = new LineTrackingEditor(debug);
	}

	/**
	 * Main AI coding prompt for file editing
	 */
	createCodeEditPrompt(
		userRequest: string,
		targetFiles: string[],
		includeContext = true
	): string {
		const contextData = includeContext
			? this.buildEditingContext(targetFiles)
			: this.getDirectFileContent(targetFiles);

		return `You are a code editor AI. You will receive code as indexed lines where each line has a corresponding index number (0, 1, 2, etc.).

USER REQUEST: ${userRequest}

${contextData}

Your task is to analyze the code and provide precise editing instructions. You must respond ONLY in this JSON format:

{
  "analysis": "Brief explanation of what changes are needed and why",
  "edits": [
    {
      "file": "relative/path/to/file",
      "analysis": "Specific analysis for this file",
      "edits": [
        {
          "startIndex": <number>,
          "endIndex": <number>, 
          "newContent": ["line 1", "line 2", "line 3"],
          "description": "What this edit accomplishes"
        }
      ]
    }
  ]
}

RULES:
- startIndex and endIndex are inclusive (both lines will be replaced)
- For single line edits, startIndex equals endIndex
- newContent array contains the exact replacement lines with original formatting preserved
- Always preserve existing indentation and formatting style
- Consider TypeScript types and compilation requirements
- Make minimal changes to achieve the goal
- Ensure imports are added/updated as needed

EXAMPLES:

Single line replacement (line 5):
{
  "analysis": "Need to add type annotation to variable",
  "edits": [
    {
      "file": "src/service.ts",
      "analysis": "Adding TypeScript type annotation",
      "edits": [
        {
          "startIndex": 5,
          "endIndex": 5,
          "newContent": ["    const userName: string = 'defaultUser';"],
          "description": "Added string type annotation to userName"
        }
      ]
    }
  ]
}

Multi-line replacement with imports (lines 0-0 for import, 10-15 for method):
{
  "analysis": "Adding email validation method with required imports",
  "edits": [
    {
      "file": "src/user.service.ts", 
      "analysis": "Adding email validation functionality",
      "edits": [
        {
          "startIndex": 0,
          "endIndex": 0,
          "newContent": [
            "import { Injectable } from '@angular/core';",
            "import { EmailValidator } from './validators/email-validator';"
          ],
          "description": "Added required imports for email validation"
        },
        {
          "startIndex": 12,
          "endIndex": 12,
          "newContent": [
            "",
            "  validateEmail(email: string): boolean {",
            "    return EmailValidator.isValid(email);",
            "  }"
          ],
          "description": "Added email validation method"
        }
      ]
    }
  ]
}

Now analyze the provided code and respond with your editing instructions.`;
	}

	/**
	 * AI prompt for fixing TypeScript compilation errors
	 */
	createErrorFixPrompt(errors: CompilationError[], context: string): string {
		const errorList = errors
			.map(
				(err) =>
					`${err.file}:${err.line} - TS${err.code}: ${err.message}`
			)
			.join("\n");

		return `You are a TypeScript error fixing specialist. Fix the following compilation errors:

COMPILATION ERRORS:
${errorList}

CODE CONTEXT:
${context}

Respond with JSON edit instructions to fix these errors. Use the same format as the code editing prompt:

{
  "analysis": "Summary of all fixes needed",
  "edits": [
    {
      "file": "path/to/file",
      "analysis": "Explanation of fixes for this specific file", 
      "edits": [
        {
          "startIndex": <number>,
          "endIndex": <number>,
          "newContent": ["fixed line 1", "fixed line 2"],
          "description": "What error this fixes"
        }
      ]
    }
  ]
}

COMMON FIXES:
- Add missing imports: \`import { Type } from 'module';\`
- Add type annotations: \`variable: Type\`
- Fix interface implementations: \`implements Interface\`
- Add missing method signatures
- Fix generic type parameters
- Add missing properties to interfaces/classes
- Fix module export/import issues

Focus on minimal changes that resolve the errors without breaking existing functionality.`;
	}

	/**
	 * Build comprehensive editing context with dependencies
	 */
	private async buildEditingContext(targetFiles: string[]): Promise<string> {
		let context = "CODE CONTEXT WITH DEPENDENCIES:\n\n";

		for (const filePath of targetFiles) {
			try {
				// Get dependency tree
				const tree = await this.dependencyExtractor.analyze(filePath);

				// Extract files with content
				const relatedFiles = this.extractFilesFromTree(tree);

				// Sort by dependency depth (dependencies first)
				relatedFiles.sort((a, b) => (a.depth || 0) - (b.depth || 0));

				context += `=== EDITING TARGET: ${path.relative(
					this.projectRoot,
					filePath
				)} ===\n\n`;

				for (const file of relatedFiles.slice(0, 10)) {
					// Limit to avoid token overflow
					const lines = (file.content || "").split("\n");
					const indexedLines = lines.map(
						(line, index) => `${index}: ${line}`
					);

					context += `--- ${file.path} ---\n`;
					context += indexedLines.join("\n");
					context += "\n\n";
				}
			} catch (error) {
				console.warn(
					`Could not analyze dependencies for ${filePath}: ${error.message}`
				);

				// Fallback to direct file content
				context += this.getFileWithLineNumbers(filePath);
			}
		}

		return context;
	}

	/**
	 * Get direct file content without dependency analysis
	 */
	public getDirectFileContent(targetFiles: string[]): string {
		let context = "CODE CONTEXT:\n\n";

		for (const filePath of targetFiles) {
			context += this.getFileWithLineNumbers(filePath);
		}

		return context;
	}

	/**
	 * Get file content with line numbers
	 */
	private getFileWithLineNumbers(filePath: string): string {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			const lines = content.split("\n");
			const indexedLines = lines.map(
				(line, index) => `${index}: ${line}`
			);

			const relativePath = path.relative(this.projectRoot, filePath);
			return `--- ${relativePath} ---\n${indexedLines.join("\n")}\n\n`;
		} catch (error) {
			return `--- ${filePath} ---\n// Error reading file: ${error.message}\n\n`;
		}
	}

	/**
	 * Extract files from dependency tree
	 */
	private extractFilesFromTree(tree: any): Array<{
		path: string;
		content: string;
		depth: number;
	}> {
		const files: Array<{ path: string; content: string; depth: number }> =
			[];

		const traverse = (node: any, depth = 0) => {
			if (node.path && node.content && node.exists && !node.external) {
				files.push({
					path: node.path,
					content: node.content,
					depth,
				});
			}

			if (node.dependencies && depth < 3) {
				// Limit depth to avoid infinite recursion
				node.dependencies.forEach((dep: any) =>
					traverse(dep, depth + 1)
				);
			}
		};

		traverse(tree);
		return files;
	}

	/**
	 * Parse AI response and validate format
	 */
	parseAIResponse(response: string): {
		success: boolean;
		data?: {
			analysis: string;
			edits: AIEditResponse[];
		};
		error?: string;
	} {
		try {
			const parsed = JSON.parse(response.trim());

			// Validate structure
			if (!parsed.analysis || !Array.isArray(parsed.edits)) {
				return {
					success: false,
					error: "Invalid response format: missing analysis or edits array",
				};
			}

			// Validate each edit
			for (const edit of parsed.edits) {
				if (
					!edit.file ||
					!edit.analysis ||
					!Array.isArray(edit.edits)
				) {
					return {
						success: false,
						error: "Invalid edit format: missing file, analysis, or edits array",
					};
				}

				for (const operation of edit.edits) {
					if (
						typeof operation.startIndex !== "number" ||
						typeof operation.endIndex !== "number" ||
						!Array.isArray(operation.newContent) ||
						!operation.description
					) {
						return {
							success: false,
							error: "Invalid operation format: missing or invalid fields",
						};
					}
				}
			}

			return {
				success: true,
				data: parsed,
			};
		} catch (error) {
			return {
				success: false,
				error: `JSON parse error: ${error.message}`,
			};
		}
	}

	/**
	 * Apply AI edit instructions using the line tracking editor
	 */
	async applyAIEdits(aiResponse: {
		analysis: string;
		edits: AIEditResponse[];
	}): Promise<{
		success: boolean;
		changes: string[];
		errors: string[];
	}> {
		const allChanges: string[] = [];
		const errors: string[] = [];

		console.log(`🤖 AI Analysis: ${aiResponse.analysis}`);

		for (const fileEdit of aiResponse.edits) {
			try {
				const fullPath = path.resolve(this.projectRoot, fileEdit.file);

				console.log(`\n📁 Processing ${fileEdit.file}`);
				console.log(`   Analysis: ${fileEdit.analysis}`);

				// Load file into editor
				this.editor.loadFile(fullPath);

				// Queue all edits for this file
				for (const edit of fileEdit.edits) {
					this.editor.queueEdit(fullPath, {
						startIndex: edit.startIndex,
						endIndex: edit.endIndex,
						newContent: edit.newContent,
						description: edit.description,
					});
				}

				// Apply edits
				const result = this.editor.applyEdits(fullPath);

				if (result.success) {
					allChanges.push(...result.changes);
					console.log(
						`   ✅ Applied ${fileEdit.edits.length} edits successfully`
					);
				} else {
					errors.push(`Failed to apply edits to ${fileEdit.file}`);
					console.log(`   ❌ Failed to apply edits`);
				}

				// Unload file to free memory
				this.editor.unloadFile(fullPath);
			} catch (error) {
				const errorMsg = `Error processing ${fileEdit.file}: ${error.message}`;
				errors.push(errorMsg);
				console.error(`   ❌ ${errorMsg}`);
			}
		}

		return {
			success: errors.length === 0,
			changes: allChanges,
			errors,
		};
	}

	/**
	 * Compile TypeScript and get errors
	 */
	compileTypeScript(): {
		success: boolean;
		errors: CompilationError[];
	} {
		try {
			const configPath = path.join(this.projectRoot, "tsconfig.json");

			if (!fs.existsSync(configPath)) {
				return {
					success: false,
					errors: [
						{
							file: "tsconfig.json",
							line: 0,
							message: "tsconfig.json not found",
							code: 0,
						},
					],
				};
			}

			const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
			const compilerOptions = ts.parseJsonConfigFileContent(
				configFile.config,
				ts.sys,
				path.dirname(configPath)
			);

			const program = ts.createProgram(
				compilerOptions.fileNames,
				compilerOptions.options
			);

			const diagnostics = ts.getPreEmitDiagnostics(program);
			const errors = diagnostics
				.filter((d) => d.category === ts.DiagnosticCategory.Error)
				.map((d) => {
					const file = d.file
						? path.relative(this.projectRoot, d.file.fileName)
						: "unknown";
					const line =
						d.file && d.start
							? d.file.getLineAndCharacterOfPosition(d.start).line
							: 0;
					const message = ts.flattenDiagnosticMessageText(
						d.messageText,
						"\n"
					);

					return {
						file,
						line,
						message,
						code: d.code,
					};
				});

			return {
				success: errors.length === 0,
				errors,
			};
		} catch (error) {
			return {
				success: false,
				errors: [
					{
						file: "compiler",
						line: 0,
						message: error.message,
						code: 0,
					},
				],
			};
		}
	}
}

// Example usage and integration demo
class IntegrationDemo {
	static async demonstrateFullWorkflow() {
		const projectRoot = "./demo-project";
		const promptSystem = new AIPromptSystem(projectRoot, true);

		// Simulate user request
		const userRequest =
			"Add a new validateEmail method to the UserService class that uses proper TypeScript types";
		const targetFiles = [path.join(projectRoot, "src/user.service.ts")];

		try {
			// 1. Generate AI prompt
			console.log("🤖 Generating AI prompt...");
			const prompt = promptSystem.createCodeEditPrompt(
				userRequest,
				targetFiles
			);

			console.log("Generated prompt:");
			console.log(prompt.substring(0, 500) + "...");

			// 2. Simulate AI response (in real implementation, this would come from your AI service)
			const simulatedAIResponse = `{
        "analysis": "Need to add email validation method with proper TypeScript types and import statements",
        "edits": [
          {
            "file": "src/user.service.ts",
            "analysis": "Adding email validation method with proper imports",
            "edits": [
              {
                "startIndex": 0,
                "endIndex": 0,
                "newContent": [
                  "import { Injectable } from '@angular/core';",
                  "import { EmailValidator } from './validators/email-validator';"
                ],
                "description": "Added required imports"
              },
              {
                "startIndex": 15,
                "endIndex": 15,
                "newContent": [
                  "",
                  "  validateEmail(email: string): boolean {",
                  "    if (!email || typeof email !== 'string') {",
                  "      return false;",
                  "    }",
                  "    return EmailValidator.isValid(email);",
                  "  }"
                ],
                "description": "Added email validation method with type safety"
              }
            ]
          }
        ]
      }`;

			// 3. Parse AI response
			console.log("\n📋 Parsing AI response...");
			const parseResult =
				promptSystem.parseAIResponse(simulatedAIResponse);

			if (!parseResult.success) {
				console.error(
					`❌ Failed to parse AI response: ${parseResult.error}`
				);
				return;
			}

			// 4. Apply edits
			console.log("\n🔧 Applying edits...");
			const applyResult = await promptSystem.applyAIEdits(
				parseResult.data!
			);

			if (applyResult.success) {
				console.log("✅ All edits applied successfully!");
				console.log("Changes made:");
				applyResult.changes.forEach((change) =>
					console.log(`  - ${change}`)
				);
			} else {
				console.log("❌ Some edits failed:");
				applyResult.errors.forEach((error) =>
					console.log(`  - ${error}`)
				);
			}

			// 5. Compile TypeScript
			console.log("\n🔨 Compiling TypeScript...");
			const compileResult = promptSystem.compileTypeScript();

			if (compileResult.success) {
				console.log("✅ TypeScript compilation successful!");
			} else {
				console.log("❌ TypeScript compilation errors:");
				compileResult.errors.forEach((error) =>
					console.log(
						`  - ${error.file}:${error.line} - ${error.message}`
					)
				);

				// 6. Generate error fix prompt
				console.log("\n🔧 Generating error fix prompt...");
				const errorContext =
					promptSystem.getDirectFileContent(targetFiles);
				const fixPrompt = promptSystem.createErrorFixPrompt(
					compileResult.errors,
					errorContext
				);

				console.log("Error fix prompt generated (would be sent to AI)");
			}
		} catch (error) {
			console.error(`❌ Demo failed: ${error.message}`);
		}
	}
}

export { AIPromptSystem, AIEditResponse, CompilationError };

// Run demo if called directly
if (require.main === module) {
	IntegrationDemo.demonstrateFullWorkflow().catch(console.error);
}
