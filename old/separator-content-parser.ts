// path: separator-content-parser.ts

import * as path from "path";
import colors from "../colors";

export interface ParseResult {
	success: boolean;
	content: string;
	errors: string[];
	warnings: string[];
	extractedFrom?: string; // Which separator was used
}

interface SeparatorConfig {
	debug?: boolean;
	fallbackToMarkdown?: boolean; // Fallback to ```code``` if separators not found
}

export class SeparatorContentParser {
	private debug: boolean;
	private fallbackToMarkdown: boolean;

	// Define separator patterns for different content types
	private separators = {
		// Code separators
		html: { start: "<html>", end: "</html>" },
		css: { start: "<css>", end: "</css>" },
		javascript: { start: "<javascript>", end: "</javascript>" },
		js: { start: "<js>", end: "</js>" },
		typescript: { start: "<typescript>", end: "</typescript>" },
		ts: { start: "<ts>", end: "</ts>" },
		json: { start: "<json>", end: "</json>" },
		code: { start: "<code>", end: "</code>" }, // Generic code

		// Content separators
		content: { start: "<content>", end: "</content>" },
		file: { start: "<file>", end: "</file>" },

		// Markdown fallbacks
		markdown_html: { start: "```html", end: "```" },
		markdown_css: { start: "```css", end: "```" },
		markdown_js: { start: "```javascript", end: "```" },
		markdown_ts: { start: "```typescript", end: "```" },
		markdown_json: { start: "```json", end: "```" },
		markdown_generic: { start: "```", end: "```" },
	};

	constructor(config: SeparatorConfig = {}) {
		this.debug = config.debug || false;
		this.fallbackToMarkdown = config.fallbackToMarkdown !== false; // Default true
	}

	parseForFile(filePath: string, rawResponse: string): ParseResult {
		const ext = path.extname(filePath).toLowerCase();

		if (this.debug) {
			console.log(
				colors.cyan(
					`[SeparatorParser] Parsing response for ${filePath} (${ext})`
				)
			);
			console.log(
				colors.gray(`Response length: ${rawResponse.length} chars`)
			);
		}

		// Try to extract content using separators based on file type
		let result = this.extractBySeparators(rawResponse, ext);

		// If no separator content found, try to extract from the response directly
		if (!result.success) {
			result = this.extractFallbackContent(rawResponse, ext);
		}

		if (this.debug) {
			console.log(
				colors.gray(
					`Parse result: ${result.success ? "SUCCESS" : "FAILED"}`
				)
			);
			if (result.extractedFrom) {
				console.log(
					colors.gray(`Extracted using: ${result.extractedFrom}`)
				);
			}
			if (result.warnings.length > 0) {
				result.warnings.forEach((w) =>
					console.log(colors.yellow(`  Warning: ${w}`))
				);
			}
		}

		return result;
	}

	private extractBySeparators(
		response: string,
		fileExt: string
	): ParseResult {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Determine which separators to try based on file extension
		const separatorsToTry = this.getSeparatorsForFileType(fileExt);

		for (const separatorKey of separatorsToTry) {
			const separator = this.separators[separatorKey];
			const content = this.extractContent(
				response,
				separator.start,
				separator.end
			);

			if (content) {
				return {
					success: true,
					content: content.trim(),
					errors,
					warnings,
					extractedFrom: separatorKey,
				};
			}
		}

		return {
			success: false,
			content: "",
			errors: ["No content found using expected separators"],
			warnings,
		};
	}

	private getSeparatorsForFileType(fileExt: string): string[] {
		const baseType = fileExt.substring(1); // Remove the dot

		switch (baseType) {
			case "html":
			case "htm":
				return [
					"html",
					"content",
					"code",
					"file",
					"markdown_html",
					"markdown_generic",
				];

			case "css":
				return [
					"css",
					"content",
					"code",
					"file",
					"markdown_css",
					"markdown_generic",
				];

			case "js":
			case "jsx":
				return [
					"javascript",
					"js",
					"content",
					"code",
					"file",
					"markdown_js",
					"markdown_generic",
				];

			case "ts":
			case "tsx":
				return [
					"typescript",
					"ts",
					"javascript",
					"js",
					"content",
					"code",
					"file",
					"markdown_ts",
					"markdown_js",
					"markdown_generic",
				];

			case "json":
				return [
					"json",
					"content",
					"code",
					"file",
					"markdown_json",
					"markdown_generic",
				];

			default:
				return ["content", "code", "file", "markdown_generic"];
		}
	}

	private extractContent(
		text: string,
		startTag: string,
		endTag: string
	): string | null {
		const startIndex = text.indexOf(startTag);
		if (startIndex === -1) return null;

		const contentStart = startIndex + startTag.length;
		const endIndex = text.indexOf(endTag, contentStart);
		if (endIndex === -1) return null;

		return text.substring(contentStart, endIndex);
	}

	private extractFallbackContent(
		response: string,
		fileExt: string
	): ParseResult {
		const warnings: string[] = [];

		// Try to intelligently extract content without separators
		let content = response.trim();

		// Remove common AI response prefixes
		content = this.removeResponsePrefixes(content);

		// If still no good content, return the cleaned response
		if (content.length === 0) {
			return {
				success: false,
				content: response,
				errors: ["Could not extract meaningful content"],
				warnings: ["Using raw response as fallback"],
			};
		}

		warnings.push("Extracted content without separators");

		return {
			success: true,
			content,
			errors: [],
			warnings,
			extractedFrom: "fallback",
		};
	}

	private removeResponsePrefixes(content: string): string {
		// Remove common AI response patterns
		const prefixes = [
			/^Here'?s?\s+the\s+.+?:\s*/i,
			/^I'?ll\s+.+?:\s*/i,
			/^Let me\s+.+?:\s*/i,
			/^Sure,?\s*/i,
			/^Of course,?\s*/i,
			/^Certainly,?\s*/i,
		];

		for (const prefix of prefixes) {
			content = content.replace(prefix, "");
		}

		return content.trim();
	}

	// Generate prompt instructions for AI to use separators
	generatePromptInstructions(fileType: string): string {
		const separatorKey = this.getPreferredSeparatorForType(fileType);
		const separator = this.separators[separatorKey];

		return `
CRITICAL: Enclose your ${fileType.toUpperCase()} code within these exact separators:
${separator.start}
[Your ${fileType} code here]
${separator.end}

Do not use JSON, markdown code blocks, or any other formatting. Just natural response with the separators around the actual code content.`;
	}

	private getPreferredSeparatorForType(fileType: string): string {
		switch (fileType.toLowerCase()) {
			case "html":
				return "html";
			case "css":
				return "css";
			case "javascript":
			case "js":
				return "javascript";
			case "typescript":
			case "ts":
				return "typescript";
			case "json":
				return "json";
			default:
				return "code";
		}
	}

	// Test method to validate separators work correctly
	testSeparators(testContent: string): { [key: string]: string | null } {
		const results: { [key: string]: string | null } = {};

		for (const [key, separator] of Object.entries(this.separators)) {
			results[key] = this.extractContent(
				testContent,
				separator.start,
				separator.end
			);
		}

		return results;
	}

	// Get all available separators (useful for documentation)
	getAvailableSeparators(): typeof this.separators {
		return { ...this.separators };
	}

	// Add custom separator
	addSeparator(name: string, start: string, end: string): void {
		this.separators[name] = { start, end };
		if (this.debug) {
			console.log(
				colors.green(
					`[SeparatorParser] Added custom separator: ${name} (${start}...${end})`
				)
			);
		}
	}
}
