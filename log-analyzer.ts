// path: log-analyzer.ts

import * as fs from "fs";
import * as path from "path";
import colors from "./colors";

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
}

export class LogAnalyzer {
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
		};
	}

	printSummary(): void {
		const analysis = this.analyze();

		console.log(colors.blue("\n📊 LOG ANALYSIS SUMMARY"));
		console.log("=".repeat(50));

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

		if (analysis.errors.length > 0) {
			console.log(colors.red(`\n❌ ERRORS (${analysis.errors.length}):`));
			analysis.errors.forEach((error, index) => {
				console.log(
					`  ${index + 1}. [${error.timestamp}] ${error.message}`
				);
				if (error.data) {
					console.log(
						`     ${colors.gray(
							JSON.stringify(error.data, null, 2)
						)}`
					);
				}
			});
		}

		if (analysis.warnings.length > 0) {
			console.log(
				colors.yellow(`\n⚠️  WARNINGS (${analysis.warnings.length}):`)
			);
			analysis.warnings.forEach((warning, index) => {
				console.log(
					`  ${index + 1}. [${warning.timestamp}] ${warning.message}`
				);
			});
		}

		console.log("");
	}

	printTimeline(): void {
		const analysis = this.analyze();

		console.log(colors.blue("\n📅 EXECUTION TIMELINE"));
		console.log("=".repeat(50));

		let currentPhase = "";

		analysis.timeline.forEach((entry, index) => {
			if (entry.phase && entry.phase !== currentPhase) {
				currentPhase = entry.phase;
				console.log(
					colors.cyan(`\n🔄 PHASE: ${currentPhase.toUpperCase()}`)
				);
				console.log("-".repeat(30));
			}

			const time = new Date(entry.timestamp).toLocaleTimeString();
			const color = this.getLevelColor(entry.level);
			const icon = this.getLevelIcon(entry.level);

			console.log(`${color(`${icon} [${time}] ${entry.message}`)}`);

			// Show data for important entries
			if (
				entry.data &&
				(entry.level === "ERROR" || entry.level === "WARN")
			) {
				console.log(colors.gray(`    ${JSON.stringify(entry.data)}`));
			}
		});

		console.log("");
	}

	exportAnalysis(outputPath?: string): string {
		const analysis = this.analyze();
		const exportPath =
			outputPath || this.logPath.replace(".log", "-analysis.json");

		const exportData = {
			...analysis,
			exportedAt: new Date().toISOString(),
			logFile: this.logPath,
		};

		fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));

		console.log(colors.green(`📤 Analysis exported to: ${exportPath}`));
		return exportPath;
	}

	findIssues(): { criticalIssues: LogEntry[]; potentialIssues: LogEntry[] } {
		const criticalIssues: LogEntry[] = [];
		const potentialIssues: LogEntry[] = [];

		for (const entry of this.entries) {
			// Critical issues
			if (entry.level === "ERROR") {
				criticalIssues.push(entry);
			}

			// Potential issues
			if (
				entry.level === "WARN" ||
				entry.message.toLowerCase().includes("failed") ||
				entry.message.toLowerCase().includes("invalid") ||
				entry.message.toLowerCase().includes("malformed")
			) {
				potentialIssues.push(entry);
			}
		}

		return { criticalIssues, potentialIssues };
	}

	printIssueReport(): void {
		const { criticalIssues, potentialIssues } = this.findIssues();

		console.log(colors.red("\n🚨 ISSUE REPORT"));
		console.log("=".repeat(50));

		if (criticalIssues.length === 0 && potentialIssues.length === 0) {
			console.log(colors.green("✅ No issues found!"));
			return;
		}

		if (criticalIssues.length > 0) {
			console.log(
				colors.red(`❌ CRITICAL ISSUES (${criticalIssues.length}):`)
			);
			criticalIssues.forEach((issue, index) => {
				console.log(`\n  ${index + 1}. ${colors.red(issue.message)}`);
				console.log(`     Time: ${issue.timestamp}`);
				console.log(`     Phase: ${issue.phase || "Unknown"}`);
				if (issue.data) {
					console.log(
						`     Data: ${JSON.stringify(issue.data, null, 4)}`
					);
				}
			});
		}

		if (potentialIssues.length > 0) {
			console.log(
				colors.yellow(
					`\n⚠️  POTENTIAL ISSUES (${potentialIssues.length}):`
				)
			);
			potentialIssues.forEach((issue, index) => {
				console.log(`  ${index + 1}. ${colors.yellow(issue.message)}`);
				console.log(`     Time: ${issue.timestamp}`);
				console.log(`     Phase: ${issue.phase || "Unknown"}`);
			});
		}

		console.log("");
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

	static analyzeLatestLog(projectRoot: string): LogAnalyzer | null {
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
		return new LogAnalyzer(logFiles[0]);
	}
}

// CLI interface for log analysis
export async function runLogAnalyzer() {
	const args = process.argv.slice(2);
	const projectRoot = process.cwd();

	if (args.length === 0) {
		// Analyze latest log
		const analyzer = LogAnalyzer.analyzeLatestLog(projectRoot);
		if (analyzer) {
			analyzer.printSummary();
			analyzer.printIssueReport();
		}
		return;
	}

	const command = args[0];

	switch (command) {
		case "summary":
			const summaryAnalyzer = LogAnalyzer.analyzeLatestLog(projectRoot);
			if (summaryAnalyzer) {
				summaryAnalyzer.printSummary();
			}
			break;

		case "timeline":
			const timelineAnalyzer = LogAnalyzer.analyzeLatestLog(projectRoot);
			if (timelineAnalyzer) {
				timelineAnalyzer.printTimeline();
			}
			break;

		case "issues":
			const issueAnalyzer = LogAnalyzer.analyzeLatestLog(projectRoot);
			if (issueAnalyzer) {
				issueAnalyzer.printIssueReport();
			}
			break;

		case "export":
			const exportAnalyzer = LogAnalyzer.analyzeLatestLog(projectRoot);
			if (exportAnalyzer) {
				exportAnalyzer.exportAnalysis();
			}
			break;

		case "list":
			const logFiles = LogAnalyzer.findLogFiles(projectRoot);
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
				const specificAnalyzer = new LogAnalyzer(logPath);
				specificAnalyzer.printSummary();
				specificAnalyzer.printIssueReport();
			} catch (error) {
				console.log(
					colors.red(`❌ Failed to analyze log: ${error.message}`)
				);
			}
			break;

		default:
			console.log(colors.blue("\n📊 AI Agent Log Analyzer"));
			console.log("Usage:");
			console.log(
				"  npm run analyze-logs           - Analyze latest log"
			);
			console.log("  npm run analyze-logs summary   - Show summary only");
			console.log(
				"  npm run analyze-logs timeline  - Show detailed timeline"
			);
			console.log("  npm run analyze-logs issues    - Show issues only");
			console.log(
				"  npm run analyze-logs export    - Export analysis to JSON"
			);
			console.log(
				"  npm run analyze-logs list      - List all log files"
			);
			console.log(
				"  npm run analyze-logs analyze <path> - Analyze specific log file"
			);
			break;
	}
}

// Run CLI if called directly
if (require.main === module) {
	runLogAnalyzer().catch(console.error);
}
