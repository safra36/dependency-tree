// path: complete-log-analyzer.ts

import * as fs from "fs";
import * as path from "path";
import colors from "../colors";

interface LogEntry {
	timestamp: string;
	level: "DEBUG" | "INFO" | "WARN" | "ERROR";
	phase?: string;
	requestId?: string;
	message: string;
	data?: any;
}

interface LogAnalysis {
	totalEntries: number;
	entriesByLevel: Record<string, number>;
	entriesByPhase: Record<string, number>;
	timeline: LogEntry[];
	errors: LogEntry[];
	warnings: LogEntry[];
	phases: string[];
	duration: number;
	requestId: string;
	issues: IssueDetection;
}

interface IssueDetection {
	contentProcessingIssues: LogEntry[];
	htmlValidationFailures: LogEntry[];
	aiResponseProblems: LogEntry[];
	fileOperationErrors: LogEntry[];
	criticalFailures: LogEntry[];
	potentialBugs: LogEntry[];
}

export class CompleteLogAnalyzer {
	private logPath: string;
	private entries: LogEntry[] = [];

	constructor(logPath: string) {
		this.logPath = path.resolve(logPath);
		this.loadLogFile();
	}

	private loadLogFile(): void {
		try {
			const logContent = fs.readFileSync(this.logPath, "utf-8");
			const lines = logContent.split("\n").filter((line) => line.trim());

			this.entries = lines.map((line) => {
				try {
					return JSON.parse(line) as LogEntry;
				} catch (error) {
					// Handle malformed log lines
					return {
						timestamp: new Date().toISOString(),
						level: "WARN" as const,
						message: `Malformed log line: ${line}`,
						data: { parseError: error.message },
					};
				}
			});

			console.log(
				colors.green(
					`📊 Loaded ${
						this.entries.length
					} log entries from ${path.basename(this.logPath)}`
				)
			);
		} catch (error) {
			console.error(
				colors.red(`❌ Failed to load log file: ${error.message}`)
			);
			this.entries = [];
		}
	}

	analyze(): LogAnalysis {
		const entriesByLevel: Record<string, number> = {
			DEBUG: 0,
			INFO: 0,
			WARN: 0,
			ERROR: 0,
		};

		const entriesByPhase: Record<string, number> = {};
		const phases: string[] = [];
		const errors: LogEntry[] = [];
		const warnings: LogEntry[] = [];

		for (const entry of this.entries) {
			// Count by level
			entriesByLevel[entry.level]++;

			// Count by phase
			if (entry.phase) {
				if (!entriesByPhase[entry.phase]) {
					entriesByPhase[entry.phase] = 0;
					phases.push(entry.phase);
				}
				entriesByPhase[entry.phase]++;
			}

			// Collect errors and warnings
			if (entry.level === "ERROR") {
				errors.push(entry);
			} else if (entry.level === "WARN") {
				warnings.push(entry);
			}
		}

		// Calculate duration
		const firstEntry = this.entries[0];
		const lastEntry = this.entries[this.entries.length - 1];
		const duration =
			firstEntry && lastEntry
				? new Date(lastEntry.timestamp).getTime() -
				  new Date(firstEntry.timestamp).getTime()
				: 0;

		// Detect specific issues
		const issues = this.detectIssues();

		return {
			totalEntries: this.entries.length,
			entriesByLevel,
			entriesByPhase,
			timeline: this.entries,
			errors,
			warnings,
			phases,
			duration,
			requestId: firstEntry?.requestId || "unknown",
			issues,
		};
	}

	private detectIssues(): IssueDetection {
		const issues: IssueDetection = {
			contentProcessingIssues: [],
			htmlValidationFailures: [],
			aiResponseProblems: [],
			fileOperationErrors: [],
			criticalFailures: [],
			potentialBugs: [],
		};

		for (const entry of this.entries) {
			// Content processing issues
			if (
				entry.message.includes("No HTML structure detected") ||
				entry.message.includes("Content validation failed") ||
				entry.message.includes("JSON parsing failed")
			) {
				issues.contentProcessingIssues.push(entry);
			}

			// HTML validation failures
			if (
				entry.message.includes("HTML validation") &&
				entry.data?.isValid === false
			) {
				issues.htmlValidationFailures.push(entry);
			}

			// AI response problems
			if (
				entry.message.includes("Received AI response") &&
				entry.data?.preview &&
				(entry.data.preview.startsWith("{\\n") ||
					entry.data.preview.includes("margin: 0"))
			) {
				issues.aiResponseProblems.push(entry);
			}

			// File operation errors
			if (
				entry.level === "ERROR" &&
				(entry.message.includes("File change execution failed") ||
					entry.message.includes("Failed to"))
			) {
				issues.fileOperationErrors.push(entry);
			}

			// Critical failures
			if (entry.level === "ERROR") {
				issues.criticalFailures.push(entry);
			}

			// Potential bugs
			if (
				entry.level === "WARN" ||
				entry.message.includes("fallback") ||
				entry.message.includes("unexpected") ||
				entry.message.includes("failed validation")
			) {
				issues.potentialBugs.push(entry);
			}
		}

		return issues;
	}

	printDetailedAnalysis(): void {
		const analysis = this.analyze();

		console.log(colors.blue("\n📊 DETAILED LOG ANALYSIS"));
		console.log("=".repeat(80));

		console.log(colors.cyan("📁 Log File:"), path.basename(this.logPath));
		console.log(colors.cyan("🆔 Request ID:"), analysis.requestId);
		console.log(
			colors.cyan("⏱️  Duration:"),
			`${Math.round(analysis.duration / 1000)}s`
		);
		console.log(colors.cyan("📝 Total Entries:"), analysis.totalEntries);

		console.log(colors.blue("\n📊 Entries by Level:"));
		Object.entries(analysis.entriesByLevel).forEach(([level, count]) => {
			const color = this.getLevelColor(level as LogEntry["level"]);
			console.log(`  ${color(`${level}:`)} ${count}`);
		});

		if (Object.keys(analysis.entriesByPhase).length > 0) {
			console.log(colors.blue("\n🔄 Entries by Phase:"));
			Object.entries(analysis.entriesByPhase).forEach(
				([phase, count]) => {
					console.log(`  ${colors.yellow(phase + ":")} ${count}`);
				}
			);
		}

		// Issue-specific analysis
		this.printIssueAnalysis(analysis.issues);

		if (analysis.errors.length > 0) {
			console.log(
				colors.red(`\n❌ CRITICAL ERRORS (${analysis.errors.length}):`)
			);
			analysis.errors.forEach((error, index) => {
				console.log(
					`\n  ${index + 1}. [${new Date(
						error.timestamp
					).toLocaleTimeString()}] ${colors.red(error.message)}`
				);
				if (error.data) {
					console.log(
						`     ${colors.gray("Context:")} ${JSON.stringify(
							error.data,
							null,
							2
						)}`
					);
				}
			});
		}

		console.log("");
	}

	private printIssueAnalysis(issues: IssueDetection): void {
		console.log(colors.red("\n🚨 ISSUE ANALYSIS"));
		console.log("=".repeat(50));

		let totalIssues = 0;

		if (issues.contentProcessingIssues.length > 0) {
			totalIssues += issues.contentProcessingIssues.length;
			console.log(
				colors.red(
					`\n🔧 Content Processing Issues (${issues.contentProcessingIssues.length}):`
				)
			);
			issues.contentProcessingIssues.forEach((issue, i) => {
				console.log(`  ${i + 1}. ${issue.message}`);
				if (issue.data?.preview) {
					console.log(
						`     Preview: ${colors.gray(
							issue.data.preview.substring(0, 80) + "..."
						)}`
					);
				}
			});

			console.log(colors.yellow("\n  📋 Diagnosis:"));
			console.log(
				"     - AI is returning CSS fragments instead of complete HTML"
			);
			console.log("     - Content cleaner cannot find HTML structure");
			console.log(
				"     - Validation fails because no DOCTYPE/html tags present"
			);
		}

		if (issues.htmlValidationFailures.length > 0) {
			totalIssues += issues.htmlValidationFailures.length;
			console.log(
				colors.red(
					`\n📄 HTML Validation Failures (${issues.htmlValidationFailures.length}):`
				)
			);
			issues.htmlValidationFailures.forEach((issue, i) => {
				console.log(
					`  ${i + 1}. Validation failed for ${
						issue.data?.fileName || "unknown file"
					}`
				);
				if (issue.data) {
					console.log(
						`     DOCTYPE: ${issue.data.hasDoctype ? "✅" : "❌"}`
					);
					console.log(
						`     HTML Tags: ${
							issue.data.hasHtmlTags ? "✅" : "❌"
						}`
					);
					console.log(
						`     Basic Structure: ${
							issue.data.hasBasicStructure ? "✅" : "❌"
						}`
					);
				}
			});
		}

		if (issues.aiResponseProblems.length > 0) {
			totalIssues += issues.aiResponseProblems.length;
			console.log(
				colors.red(
					`\n🤖 AI Response Problems (${issues.aiResponseProblems.length}):`
				)
			);
			issues.aiResponseProblems.forEach((issue, i) => {
				console.log(
					`  ${i + 1}. AI returned unexpected content format`
				);
				console.log(`     Expected: HTML document`);
				console.log(
					`     Received: ${colors.yellow(
						"CSS fragment starting with {"
					)}`
				);
			});

			console.log(colors.yellow("\n  💡 Suggested Fixes:"));
			console.log(
				"     - Enhance AI prompts to be more explicit about HTML requirements"
			);
			console.log(
				"     - Add fallback HTML reconstruction when CSS is detected"
			);
			console.log(
				"     - Implement better content type detection and handling"
			);
		}

		if (issues.fileOperationErrors.length > 0) {
			totalIssues += issues.fileOperationErrors.length;
			console.log(
				colors.red(
					`\n📁 File Operation Errors (${issues.fileOperationErrors.length}):`
				)
			);
			issues.fileOperationErrors.forEach((issue, i) => {
				console.log(`  ${i + 1}. ${issue.message}`);
				if (issue.data?.file) {
					console.log(`     File: ${issue.data.file}`);
				}
			});
		}

		if (totalIssues === 0) {
			console.log(colors.green("✅ No specific issues detected!"));
		} else {
			console.log(colors.red(`\n📊 Total Issues Found: ${totalIssues}`));
			console.log(colors.yellow("\n🔧 Recommended Actions:"));
			console.log(
				"   1. Update AI prompts to explicitly require complete HTML documents"
			);
			console.log(
				"   2. Implement robust content reconstruction for malformed responses"
			);
			console.log("   3. Add better validation and fallback mechanisms");
			console.log(
				"   4. Test with the enhanced agent that includes these fixes"
			);
		}
	}

	printTimeline(): void {
		const analysis = this.analyze();

		console.log(colors.blue("\n📅 EXECUTION TIMELINE"));
		console.log("=".repeat(80));

		let currentPhase = "";
		let issueCount = 0;

		analysis.timeline.forEach((entry, index) => {
			if (entry.phase && entry.phase !== currentPhase) {
				currentPhase = entry.phase;
				console.log(
					colors.cyan(`\n🔄 PHASE: ${currentPhase.toUpperCase()}`)
				);
				console.log("-".repeat(50));
			}

			const time = new Date(entry.timestamp).toLocaleTimeString();
			const color = this.getLevelColor(entry.level);
			const icon = this.getLevelIcon(entry.level);

			console.log(`${color(`${icon} [${time}] ${entry.message}`)}`);

			// Show data for important entries
			if (entry.level === "ERROR" || entry.level === "WARN") {
				issueCount++;
				if (entry.data) {
					if (
						entry.data.preview &&
						typeof entry.data.preview === "string"
					) {
						console.log(
							colors.gray(
								`    Preview: ${entry.data.preview.substring(
									0,
									100
								)}...`
							)
						);
					}
					if (entry.data.error) {
						console.log(
							colors.gray(`    Error: ${entry.data.error}`)
						);
					}
					if (entry.data.expectedType) {
						console.log(
							colors.gray(
								`    Expected: ${entry.data.expectedType}`
							)
						);
					}
				}
			}
		});

		console.log(colors.blue(`\n📊 Timeline Summary:`));
		console.log(`   Total events: ${analysis.timeline.length}`);
		console.log(`   Issues encountered: ${issueCount}`);
		console.log(`   Duration: ${Math.round(analysis.duration / 1000)}s`);
		console.log("");
	}

	exportDetailedAnalysis(outputPath?: string): string {
		const analysis = this.analyze();
		const exportPath =
			outputPath ||
			this.logPath.replace(".log", "-detailed-analysis.json");

		const detailedAnalysis = {
			...analysis,
			exportedAt: new Date().toISOString(),
			logFile: this.logPath,
			diagnosis: this.generateDiagnosis(analysis),
			recommendations: this.generateRecommendations(analysis.issues),
		};

		fs.writeFileSync(exportPath, JSON.stringify(detailedAnalysis, null, 2));

		console.log(
			colors.green(`📤 Detailed analysis exported to: ${exportPath}`)
		);
		return exportPath;
	}

	private generateDiagnosis(analysis: LogAnalysis): any {
		const diagnosis = {
			overallHealth: "unknown",
			primaryIssue: "none",
			confidence: "low",
			details: {},
		};

		// Determine overall health
		if (analysis.errors.length === 0 && analysis.warnings.length <= 2) {
			diagnosis.overallHealth = "healthy";
			diagnosis.confidence = "high";
		} else if (analysis.errors.length > 0) {
			diagnosis.overallHealth = "critical";
			diagnosis.confidence = "high";
		} else if (analysis.warnings.length > 5) {
			diagnosis.overallHealth = "concerning";
			diagnosis.confidence = "medium";
		}

		// Identify primary issue
		if (analysis.issues.aiResponseProblems.length > 0) {
			diagnosis.primaryIssue = "ai_response_format";
			diagnosis.details = {
				description:
					"AI is returning CSS fragments instead of HTML documents",
				impact: "File generation fails validation",
				rootCause: "Inadequate prompting and content processing",
			};
		} else if (analysis.issues.htmlValidationFailures.length > 0) {
			diagnosis.primaryIssue = "html_validation";
			diagnosis.details = {
				description: "Generated HTML fails structural validation",
				impact: "Files cannot be written or are malformed",
				rootCause: "Content reconstruction issues",
			};
		} else if (analysis.issues.fileOperationErrors.length > 0) {
			diagnosis.primaryIssue = "file_operations";
			diagnosis.details = {
				description: "File write/read operations failing",
				impact: "Changes cannot be persisted",
				rootCause: "Permission or path issues",
			};
		}

		return diagnosis;
	}

	private generateRecommendations(issues: IssueDetection): string[] {
		const recommendations: string[] = [];

		if (issues.aiResponseProblems.length > 0) {
			recommendations.push(
				"Enhance AI prompts with explicit HTML structure requirements"
			);
			recommendations.push(
				"Implement content type detection and reconstruction fallbacks"
			);
			recommendations.push(
				"Add more robust response validation before processing"
			);
		}

		if (issues.htmlValidationFailures.length > 0) {
			recommendations.push(
				"Implement HTML reconstruction when AI returns CSS fragments"
			);
			recommendations.push(
				"Add fallback HTML templates for common scenarios"
			);
			recommendations.push(
				"Improve content cleaning logic to handle edge cases"
			);
		}

		if (issues.contentProcessingIssues.length > 0) {
			recommendations.push(
				"Update the ContentCleaner class with better type detection"
			);
			recommendations.push("Add logging for content cleaning decisions");
			recommendations.push("Implement progressive fallback strategies");
		}

		if (issues.fileOperationErrors.length > 0) {
			recommendations.push(
				"Add file system permission checks before operations"
			);
			recommendations.push(
				"Implement retry logic for transient file system errors"
			);
			recommendations.push("Add more detailed file operation logging");
		}

		if (recommendations.length === 0) {
			recommendations.push("System appears to be functioning normally");
			recommendations.push("Continue monitoring for emerging issues");
		}

		return recommendations;
	}

	private getLevelColor(level: LogEntry["level"]) {
		switch (level) {
			case "ERROR":
				return colors.red;
			case "WARN":
				return colors.yellow;
			case "INFO":
				return colors.blue;
			case "DEBUG":
				return colors.cyan;
			default:
				return colors.gray;
		}
	}

	private getLevelIcon(level: LogEntry["level"]): string {
		switch (level) {
			case "ERROR":
				return "❌";
			case "WARN":
				return "⚠️";
			case "INFO":
				return "ℹ️";
			case "DEBUG":
				return "🔧";
			default:
				return "📝";
		}
	}

	static analyzeFromLog(logContent: string): CompleteLogAnalyzer {
		// Create a temporary log file for analysis
		const tempPath = path.join(process.cwd(), "temp-analysis.log");
		fs.writeFileSync(tempPath, logContent);

		const analyzer = new CompleteLogAnalyzer(tempPath);

		// Clean up temp file
		fs.unlinkSync(tempPath);

		return analyzer;
	}

	static findLogFiles(projectRoot: string): string[] {
		const logsDir = path.join(projectRoot, "ai-agent-logs");

		if (!fs.existsSync(logsDir)) {
			return [];
		}

		return fs
			.readdirSync(logsDir)
			.filter((file) => file.endsWith(".log"))
			.map((file) => path.join(logsDir, file))
			.sort(
				(a, b) =>
					fs.statSync(b).mtime.getTime() -
					fs.statSync(a).mtime.getTime()
			); // Most recent first
	}

	static analyzeLatestLog(projectRoot: string): CompleteLogAnalyzer | null {
		const logFiles = this.findLogFiles(projectRoot);

		if (logFiles.length === 0) {
			console.log(colors.yellow("⚠️  No log files found"));
			return null;
		}

		console.log(
			colors.green(
				`📊 Analyzing latest log: ${path.basename(logFiles[0])}`
			)
		);
		return new CompleteLogAnalyzer(logFiles[0]);
	}
}

// CLI interface for log analysis
export async function runCompleteLogAnalyzer() {
	const args = process.argv.slice(2);
	const projectRoot = process.cwd();

	if (args.length === 0) {
		// Analyze latest log with detailed analysis
		const analyzer = CompleteLogAnalyzer.analyzeLatestLog(projectRoot);
		if (analyzer) {
			analyzer.printDetailedAnalysis();
		}
		return;
	}

	const command = args[0];

	switch (command) {
		case "detailed":
		case "full":
			const detailedAnalyzer =
				CompleteLogAnalyzer.analyzeLatestLog(projectRoot);
			if (detailedAnalyzer) {
				detailedAnalyzer.printDetailedAnalysis();
			}
			break;

		case "timeline":
			const timelineAnalyzer =
				CompleteLogAnalyzer.analyzeLatestLog(projectRoot);
			if (timelineAnalyzer) {
				timelineAnalyzer.printTimeline();
			}
			break;

		case "export":
			const exportAnalyzer =
				CompleteLogAnalyzer.analyzeLatestLog(projectRoot);
			if (exportAnalyzer) {
				exportAnalyzer.exportDetailedAnalysis();
			}
			break;

		case "list":
			const logFiles = CompleteLogAnalyzer.findLogFiles(projectRoot);
			console.log(colors.blue("\n📝 Available Log Files:"));
			logFiles.forEach((file, index) => {
				const stats = fs.statSync(file);
				const size = Math.round(stats.size / 1024);
				const time = stats.mtime.toLocaleString();
				console.log(
					`  ${index + 1}. ${colors.yellow(
						path.basename(file)
					)} (${size}KB, ${time})`
				);
			});
			break;

		case "analyze":
			const logPath = args[1];
			if (!logPath) {
				console.log(colors.red("❌ Please provide a log file path"));
				break;
			}

			try {
				const specificAnalyzer = new CompleteLogAnalyzer(logPath);
				specificAnalyzer.printDetailedAnalysis();
			} catch (error) {
				console.log(
					colors.red(`❌ Failed to analyze log: ${error.message}`)
				);
			}
			break;

		case "paste":
			// Analyze log content from the provided paste
			const pasteContent = args[1];
			if (!pasteContent) {
				console.log(colors.red("❌ Please provide log content"));
				break;
			}

			try {
				const pasteAnalyzer =
					CompleteLogAnalyzer.analyzeFromLog(pasteContent);
				pasteAnalyzer.printDetailedAnalysis();
			} catch (error) {
				console.log(
					colors.red(
						`❌ Failed to analyze pasted log: ${error.message}`
					)
				);
			}
			break;

		default:
			console.log(colors.blue("\n📊 Complete AI Agent Log Analyzer"));
			console.log("Usage:");
			console.log(
				"  npm run analyze-logs                 - Detailed analysis of latest log"
			);
			console.log(
				"  npm run analyze-logs detailed        - Full detailed analysis"
			);
			console.log(
				"  npm run analyze-logs timeline        - Show execution timeline"
			);
			console.log(
				"  npm run analyze-logs export          - Export detailed analysis to JSON"
			);
			console.log(
				"  npm run analyze-logs list            - List all log files"
			);
			console.log(
				"  npm run analyze-logs analyze <path>  - Analyze specific log file"
			);
			console.log(
				"  npm run analyze-logs paste <content> - Analyze pasted log content"
			);
			break;
	}
}

// Run CLI if called directly
if (require.main === module) {
	runCompleteLogAnalyzer().catch(console.error);
}
