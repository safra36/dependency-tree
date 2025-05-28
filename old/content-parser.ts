// path: content-parser.ts

import * as path from "path";
import colors from "../colors";

export interface ParseResult {
	success: boolean;
	content: string;
	errors: string[];
	warnings: string[];
}

interface ParserConfig {
	debug?: boolean;
	preserveFormatting?: boolean;
	validateContent?: boolean;
}

abstract class FileTypeParser {
	protected debug: boolean;
	protected config: ParserConfig;

	constructor(config: ParserConfig = {}) {
		this.debug = config.debug || false;
		this.config = config;
	}

	abstract parse(rawContent: string): ParseResult;
	abstract validate(content: string): boolean;

	protected log(
		message: string,
		level: "info" | "warn" | "error" = "info"
	): void {
		if (!this.debug) return;

		const color =
			level === "error"
				? colors.red
				: level === "warn"
				? colors.yellow
				: colors.gray;
		console.log(color(`[${this.constructor.name}] ${message}`));
	}
}

class HTMLParser extends FileTypeParser {
	parse(rawContent: string): ParseResult {
		this.log(`Parsing HTML content (${rawContent.length} chars)`);

		let content = rawContent.trim();
		const errors: string[] = [];
		const warnings: string[] = [];

		// Step 1: Remove markdown code blocks
		content = this.removeMarkdownBlocks(content);

		// Step 2: Unescape JSON-encoded content
		content = this.unescapeJsonContent(content);

		// Step 3: Extract actual HTML if wrapped in JSON
		content = this.extractFromJsonWrapper(content);

		// Step 4: Ensure proper HTML structure
		content = this.ensureHtmlStructure(content, warnings);

		// Step 5: Validate result
		const isValid = this.validate(content);
		if (!isValid) {
			errors.push(
				"Generated HTML does not meet minimum structure requirements"
			);
		}

		this.log(
			`Parsed HTML: ${content.length} chars, ${errors.length} errors, ${warnings.length} warnings`
		);

		return {
			success: errors.length === 0,
			content,
			errors,
			warnings,
		};
	}

	private removeMarkdownBlocks(content: string): string {
		// Remove ```html or ``` blocks
		content = content.replace(/```html\s*/g, "").replace(/```\s*/g, "");
		this.log("Removed markdown code blocks");
		return content;
	}

	private unescapeJsonContent(content: string): string {
		// Unescape common JSON escapes
		const original = content;
		content = content
			.replace(/\\n/g, "\n")
			.replace(/\\r/g, "\r")
			.replace(/\\t/g, "\t")
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");

		if (content !== original) {
			this.log("Unescaped JSON content");
		}
		return content;
	}

	private extractFromJsonWrapper(content: string): string {
		// Handle various JSON wrapper patterns
		if (content.trim().startsWith("{")) {
			try {
				const parsed = JSON.parse(content);

				// Handle {"content": "..."} wrapper
				if (parsed.content && typeof parsed.content === "string") {
					this.log("Extracted content from 'content' JSON wrapper");
					return this.unescapeJsonContent(parsed.content);
				}

				// Handle {"html": "..."} wrapper for HTML files
				if (parsed.html && typeof parsed.html === "string") {
					this.log("Extracted content from 'html' JSON wrapper");
					return this.unescapeJsonContent(parsed.html);
				}

				// Handle NestJS/file-specific wrappers: {"fileName": "...", "content": "..."}
				if (
					(parsed.fileName || parsed.filename) &&
					parsed.content &&
					typeof parsed.content === "string"
				) {
					this.log(
						`Extracted content from NestJS-style wrapper (${
							parsed.fileName || parsed.filename
						})`
					);
					return this.unescapeJsonContent(parsed.content);
				}

				// Handle other single-key wrappers
				const keys = Object.keys(parsed);
				if (keys.length === 1 && typeof parsed[keys[0]] === "string") {
					const extractedContent = parsed[keys[0]];
					this.log(
						`Extracted content from '${keys[0]}' JSON wrapper`
					);
					return this.unescapeJsonContent(extractedContent);
				}

				// Handle multi-key objects where one field contains the main content
				const contentFields = [
					"content",
					"code",
					"text",
					"body",
					"source",
				];
				for (const field of contentFields) {
					if (parsed[field] && typeof parsed[field] === "string") {
						this.log(
							`Extracted content from '${field}' field in JSON wrapper`
						);
						return this.unescapeJsonContent(parsed[field]);
					}
				}
			} catch (error) {
				this.log(
					`Failed to parse JSON wrapper: ${error.message}`,
					"warn"
				);
			}
		}
		return content;
	}

	private ensureHtmlStructure(content: string, warnings: string[]): string {
		// Check if we have a complete HTML document
		if (content.includes("<!DOCTYPE html>")) {
			return content; // Already complete
		}

		// If we have HTML tags but no DOCTYPE, add structure
		if (
			content.includes("<html") ||
			content.includes("<head") ||
			content.includes("<body")
		) {
			if (!content.includes("<!DOCTYPE html>")) {
				warnings.push("Added missing DOCTYPE declaration");
				content = "<!DOCTYPE html>\n" + content;
			}
			return content;
		}

		// If we have content that looks like CSS/JS only, create basic HTML
		if (
			this.looksLikeCssFragment(content) ||
			this.looksLikeJsFragment(content)
		) {
			warnings.push(
				"Converted CSS/JS fragment to complete HTML document"
			);
			return this.wrapInHtmlStructure(content);
		}

		// If we have partial HTML content, wrap it
		if (content.includes("<") && content.includes(">")) {
			warnings.push(
				"Wrapped partial HTML in complete document structure"
			);
			return this.wrapInHtmlStructure(content);
		}

		// Plain text content
		warnings.push("Wrapped plain text in HTML document structure");
		return this.wrapInHtmlStructure(`<p>${content}</p>`);
	}

	private looksLikeCssFragment(content: string): boolean {
		return (
			/^\s*[\w\-#.][\w\-#.\s]*\{/.test(content) ||
			/margin\s*:|padding\s*:|color\s*:|background\s*:/.test(content)
		);
	}

	private looksLikeJsFragment(content: string): boolean {
		return (
			/^(function|const|let|var|class)\s/.test(content.trim()) ||
			/console\.log|document\./.test(content)
		);
	}

	private wrapInHtmlStructure(innerContent: string): string {
		// Determine if content is CSS, JS, or HTML
		if (this.looksLikeCssFragment(innerContent)) {
			return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Page</title>
    <style>
${innerContent}
    </style>
</head>
<body>
    <div class="content">
        <h1>Generated Page</h1>
        <p>This page includes the generated styles.</p>
    </div>
</body>
</html>`;
		}

		if (this.looksLikeJsFragment(innerContent)) {
			return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Page</title>
</head>
<body>
    <div class="content">
        <h1>Generated Page</h1>
        <p>This page includes the generated JavaScript.</p>
    </div>
    <script>
${innerContent}
    </script>
</body>
</html>`;
		}

		// Assume HTML content
		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Page</title>
</head>
<body>
    ${innerContent}
</body>
</html>`;
	}

	validate(content: string): boolean {
		return (
			content.includes("<!DOCTYPE html>") &&
			content.includes("<html") &&
			content.includes("</html>") &&
			content.includes("<head") &&
			content.includes("<body")
		);
	}
}

class CSSParser extends FileTypeParser {
	parse(rawContent: string): ParseResult {
		this.log(`Parsing CSS content (${rawContent.length} chars)`);

		let content = rawContent.trim();
		const errors: string[] = [];
		const warnings: string[] = [];

		// Remove markdown blocks
		content = content.replace(/```css\s*/g, "").replace(/```\s*/g, "");

		// Unescape JSON content
		content = content
			.replace(/\\n/g, "\n")
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");

		// Extract from JSON wrapper if present
		if (content.startsWith("{") && content.includes('"content"')) {
			try {
				const parsed = JSON.parse(content);
				if (parsed.content) {
					content = parsed.content;
					this.log("Extracted CSS from JSON wrapper");
				}
			} catch (error) {
				warnings.push("Failed to parse JSON wrapper");
			}
		}

		// Validate CSS structure
		if (!this.validate(content)) {
			errors.push("Content does not appear to be valid CSS");
		}

		return {
			success: errors.length === 0,
			content,
			errors,
			warnings,
		};
	}

	validate(content: string): boolean {
		// Basic CSS validation - should have selectors and properties
		return (
			/[\w\-#.][\w\-#.\s]*\{[\s\S]*?\}/.test(content) ||
			/(margin|padding|color|background|font|border)\s*:/.test(content)
		);
	}
}

class TypeScriptParser extends FileTypeParser {
	parse(rawContent: string): ParseResult {
		this.log(`Parsing TypeScript content (${rawContent.length} chars)`);

		let content = rawContent.trim();
		const errors: string[] = [];
		const warnings: string[] = [];

		// Remove markdown blocks
		content = content
			.replace(/```(?:typescript|ts)\s*/g, "")
			.replace(/```\s*/g, "");

		// Unescape JSON content
		content = content
			.replace(/\\n/g, "\n")
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");

		// Extract from JSON wrapper if present (common in NestJS generation)
		content = this.extractFromJsonWrapper(content);

		// Validate basic TypeScript structure
		if (!this.validate(content)) {
			warnings.push("Content may not be valid TypeScript");
		}

		return {
			success: true,
			content,
			errors,
			warnings,
		};
	}

	private extractFromJsonWrapper(content: string): string {
		if (content.startsWith("{")) {
			try {
				const parsed = JSON.parse(content);

				// Handle NestJS-style wrappers
				if ((parsed.fileName || parsed.filename) && parsed.content) {
					this.log(
						`Extracted TypeScript from NestJS wrapper (${
							parsed.fileName || parsed.filename
						})`
					);
					return parsed.content
						.replace(/\\n/g, "\n")
						.replace(/\\"/g, '"');
				}

				if (parsed.content) {
					this.log("Extracted TypeScript from content wrapper");
					return parsed.content
						.replace(/\\n/g, "\n")
						.replace(/\\"/g, '"');
				}
			} catch (error) {
				this.log(
					`Failed to parse JSON wrapper: ${error.message}`,
					"warn"
				);
			}
		}
		return content;
	}

	validate(content: string): boolean {
		// Basic TypeScript validation
		return (
			content.length > 0 &&
			(/(import|export|class|interface|function|const|let|var|@|type)/.test(
				content
			) ||
				content.includes("=") ||
				content.includes("("))
		);
	}
}

class JavaScriptParser extends FileTypeParser {
	parse(rawContent: string): ParseResult {
		this.log(`Parsing JavaScript content (${rawContent.length} chars)`);

		let content = rawContent.trim();
		const errors: string[] = [];
		const warnings: string[] = [];

		// Remove markdown blocks
		content = content
			.replace(/```(?:javascript|js)\s*/g, "")
			.replace(/```\s*/g, "");

		// Unescape JSON content
		content = content
			.replace(/\\n/g, "\n")
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");

		// Extract from JSON wrapper if present
		if (content.startsWith("{") && content.includes('"content"')) {
			try {
				const parsed = JSON.parse(content);
				if (parsed.content) {
					content = parsed.content;
					this.log("Extracted JavaScript from JSON wrapper");
				}
			} catch (error) {
				warnings.push("Failed to parse JSON wrapper");
			}
		}

		return {
			success: true, // Less strict validation for JS
			content,
			errors,
			warnings,
		};
	}

	validate(content: string): boolean {
		// Basic JavaScript validation - check for common patterns
		return (
			content.length > 0 &&
			(/(function|const|let|var|class|if|for|while)/.test(content) ||
				content.includes("=") ||
				content.includes("("))
		);
	}
}

class JSONParser extends FileTypeParser {
	parse(rawContent: string): ParseResult {
		this.log(`Parsing JSON content (${rawContent.length} chars)`);

		let content = rawContent.trim();
		const errors: string[] = [];
		const warnings: string[] = [];

		// Remove markdown blocks
		content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");

		// Find JSON boundaries
		const jsonStart = Math.min(
			content.indexOf("{") === -1 ? Infinity : content.indexOf("{"),
			content.indexOf("[") === -1 ? Infinity : content.indexOf("[")
		);

		if (jsonStart !== Infinity && jsonStart > 0) {
			content = content.substring(jsonStart);
			warnings.push("Trimmed content before JSON start");
		}

		const lastBrace = content.lastIndexOf("}");
		const lastBracket = content.lastIndexOf("]");
		const jsonEnd = Math.max(lastBrace, lastBracket);

		if (jsonEnd !== -1 && jsonEnd < content.length - 1) {
			content = content.substring(0, jsonEnd + 1);
			warnings.push("Trimmed content after JSON end");
		}

		// Remove trailing commas
		content = content.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

		// Validate JSON
		if (!this.validate(content)) {
			errors.push("Invalid JSON syntax");
		}

		return {
			success: errors.length === 0,
			content,
			errors,
			warnings,
		};
	}

	validate(content: string): boolean {
		try {
			JSON.parse(content);
			return true;
		} catch {
			return false;
		}
	}
}

export class ContentParser {
	private parsers: Map<string, FileTypeParser>;
	private debug: boolean;

	constructor(config: ParserConfig = {}) {
		this.debug = config.debug || false;
		this.parsers = new Map();

		// Initialize parsers for different file types
		this.parsers.set(".html", new HTMLParser(config));
		this.parsers.set(".htm", new HTMLParser(config));
		this.parsers.set(".css", new CSSParser(config));
		this.parsers.set(".js", new JavaScriptParser(config));
		this.parsers.set(".ts", new TypeScriptParser(config)); // Use TypeScript parser for .ts files
		this.parsers.set(".jsx", new JavaScriptParser(config));
		this.parsers.set(".tsx", new TypeScriptParser(config)); // Use TypeScript parser for .tsx files
		this.parsers.set(".json", new JSONParser(config));
	}

	parseForFile(filePath: string, rawContent: string): ParseResult {
		const ext = path.extname(filePath).toLowerCase();
		const parser = this.parsers.get(ext);

		if (this.debug) {
			console.log(
				colors.cyan(`[ContentParser] Parsing ${filePath} (${ext})`)
			);
		}

		if (!parser) {
			// No specific parser, return content as-is with basic cleaning
			return this.parseGeneric(rawContent);
		}

		const result = parser.parse(rawContent);

		if (this.debug) {
			console.log(
				colors.gray(
					`[ContentParser] Parse result: ${
						result.success ? "SUCCESS" : "FAILED"
					}`
				)
			);
			if (result.warnings.length > 0) {
				result.warnings.forEach((warning) =>
					console.log(colors.yellow(`  Warning: ${warning}`))
				);
			}
			if (result.errors.length > 0) {
				result.errors.forEach((error) =>
					console.log(colors.red(`  Error: ${error}`))
				);
			}
		}

		return result;
	}

	private parseGeneric(rawContent: string): ParseResult {
		// Generic parser for unknown file types
		let content = rawContent.trim();

		// Remove common markdown blocks
		content = content.replace(/```[\w]*\s*/g, "").replace(/```\s*/g, "");

		// Basic JSON unescape
		content = content
			.replace(/\\n/g, "\n")
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");

		return {
			success: true,
			content,
			errors: [],
			warnings:
				content !== rawContent
					? ["Applied generic content cleaning"]
					: [],
		};
	}

	// Utility method to test what a parser would do without applying it
	previewParse(filePath: string, rawContent: string): ParseResult {
		return this.parseForFile(filePath, rawContent);
	}

	// Add custom parser for specific file extensions
	addParser(extension: string, parser: FileTypeParser): void {
		this.parsers.set(extension.toLowerCase(), parser);
		if (this.debug) {
			console.log(
				colors.green(
					`[ContentParser] Added custom parser for ${extension}`
				)
			);
		}
	}

	// Get available parsers
	getSupportedExtensions(): string[] {
		return Array.from(this.parsers.keys());
	}
}
