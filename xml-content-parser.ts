// path: xml-content-parser.ts

import colors from "colors";

interface ParseResult {
	success: boolean;
	content: Record<string, string>;
	errors: string[];
	warnings: string[];
}

interface ParserOptions {
	debug?: boolean;
	stripWhitespace?: boolean;
	allowEmpty?: boolean;
}

export class XMLContentParser {
	private debug: boolean;
	private stripWhitespace: boolean;
	private allowEmpty: boolean;

	constructor(options: ParserOptions = {}) {
		this.debug = options.debug || false;
		this.stripWhitespace = options.stripWhitespace !== false; // Default true
		this.allowEmpty = options.allowEmpty || false;
	}

	/**
	 * Parse AI response for specific XML tags
	 */
	parseResponse(response: string, expectedTags: string[]): ParseResult {
		if (this.debug) {
			console.log(colors.cyan("🔧 [XMLParser] Parsing response"));
			console.log(
				colors.gray(`  Expected tags: ${expectedTags.join(", ")}`)
			);
			console.log(colors.gray(`  Response length: ${response.length}`));
		}

		const result: ParseResult = {
			success: true,
			content: {},
			errors: [],
			warnings: [],
		};

		for (const tag of expectedTags) {
			const extracted = this.extractTag(response, tag);

			if (extracted.success) {
				result.content[tag] = extracted.content;
				if (this.debug) {
					console.log(
						colors.green(
							`  ✅ Found ${tag}: ${extracted.content.length} chars`
						)
					);
				}
			} else {
				result.errors.push(`Missing or invalid tag: ${tag}`);
				result.success = false;
				if (this.debug) {
					console.log(colors.red(`  ❌ Missing ${tag}`));
				}
			}
		}

		// Check for extra tags (potential issues)
		const foundTags = this.findAllTags(response);
		const extraTags = foundTags.filter(
			(tag) => !expectedTags.includes(tag)
		);

		if (extraTags.length > 0) {
			result.warnings.push(
				`Unexpected tags found: ${extraTags.join(", ")}`
			);
			if (this.debug) {
				console.log(
					colors.yellow(`  ⚠️ Extra tags: ${extraTags.join(", ")}`)
				);
			}
		}

		return result;
	}

	/**
	 * Extract content from a specific XML tag
	 */
	extractTag(
		text: string,
		tagName: string
	): { success: boolean; content: string; error?: string } {
		const openTag = `<${tagName}>`;
		const closeTag = `</${tagName}>`;

		// Try exact match first
		let startIndex = text.indexOf(openTag);
		let endIndex = text.indexOf(closeTag);

		if (startIndex === -1 || endIndex === -1) {
			// Try case-insensitive match
			const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, "is");
			const match = text.match(regex);

			if (match) {
				let content = match[1];
				if (this.stripWhitespace) {
					content = content.trim();
				}

				if (!this.allowEmpty && !content) {
					return {
						success: false,
						content: "",
						error: `Tag ${tagName} is empty`,
					};
				}

				return { success: true, content };
			}

			return {
				success: false,
				content: "",
				error: `Tag ${tagName} not found`,
			};
		}

		// Extract content between tags
		const contentStart = startIndex + openTag.length;
		let content = text.substring(contentStart, endIndex);

		if (this.stripWhitespace) {
			content = content.trim();
		}

		if (!this.allowEmpty && !content) {
			return {
				success: false,
				content: "",
				error: `Tag ${tagName} is empty`,
			};
		}

		return { success: true, content };
	}

	/**
	 * Find all XML tags in text
	 */
	findAllTags(text: string): string[] {
		const tagRegex = /<(\w+)>/g;
		const tags: string[] = [];
		let match;

		while ((match = tagRegex.exec(text)) !== null) {
			const tagName = match[1];
			if (!tags.includes(tagName)) {
				tags.push(tagName);
			}
		}

		return tags;
	}

	/**
	 * Parse code blocks with language specification
	 */
	parseCodeBlock(response: string, expectedLanguage?: string): ParseResult {
		const result: ParseResult = {
			success: false,
			content: {},
			errors: [],
			warnings: [],
		};

		// Look for <code> or <content> tags first
		const codeExtraction = this.extractTag(response, "code");
		if (codeExtraction.success) {
			result.content.code = codeExtraction.content;
			result.success = true;
			return result;
		}

		const contentExtraction = this.extractTag(response, "content");
		if (contentExtraction.success) {
			result.content.content = contentExtraction.content;
			result.success = true;
			return result;
		}

		// Fallback to markdown code blocks
		const codeBlockRegex = /```(?:(\w+))?\n(.*?)\n```/gs;
		const matches = [...response.matchAll(codeBlockRegex)];

		if (matches.length > 0) {
			const match = matches[0];
			const language = match[1];
			const code = match[2];

			if (expectedLanguage && language && language !== expectedLanguage) {
				result.warnings.push(
					`Expected ${expectedLanguage} but found ${language}`
				);
			}

			result.content.code = code;
			result.content.language = language || "unknown";
			result.success = true;
		} else {
			result.errors.push("No code block found");
		}

		return result;
	}

	/**
	 * Parse file operations from XML
	 */
	parseFileOperations(response: string): ParseResult {
		const result: ParseResult = {
			success: true,
			content: {},
			errors: [],
			warnings: [],
		};

		// Look for operations tags
		const operationsExtraction = this.extractTag(response, "operations");
		if (operationsExtraction.success) {
			result.content.operations = operationsExtraction.content;
		}

		// Look for individual operation tags
		const operationTags = ["create", "modify", "delete", "execute"];

		for (const tag of operationTags) {
			const extraction = this.extractTag(response, tag);
			if (extraction.success) {
				result.content[tag] = extraction.content;
			}
		}

		// Check if we found any operations
		const hasOperations = Object.keys(result.content).length > 0;
		if (!hasOperations) {
			result.success = false;
			result.errors.push("No file operations found");
		}

		return result;
	}

	/**
	 * Parse analysis sections
	 */
	parseAnalysis(response: string): ParseResult {
		const analysisTags = [
			"analysis",
			"summary",
			"recommendation",
			"conclusion",
		];
		return this.parseResponse(response, analysisTags);
	}

	/**
	 * Create XML template for AI prompts
	 */
	createPromptTemplate(sections: Record<string, string>): string {
		let template = "";

		for (const [tagName, description] of Object.entries(sections)) {
			template += `<${tagName}>\n${description}\n</${tagName}>\n\n`;
		}

		return template.trim();
	}

	/**
	 * Validate XML structure
	 */
	validateXML(text: string): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		const tagStack: string[] = [];

		// Simple XML validation - find opening and closing tags
		const tagRegex = /<(\/?)([\w-]+)[^>]*>/g;
		let match;

		while ((match = tagRegex.exec(text)) !== null) {
			const isClosing = match[1] === "/";
			const tagName = match[2];

			if (isClosing) {
				if (tagStack.length === 0) {
					errors.push(`Unexpected closing tag: ${tagName}`);
				} else {
					const lastOpened = tagStack.pop();
					if (lastOpened !== tagName) {
						errors.push(
							`Mismatched tags: opened ${lastOpened}, closed ${tagName}`
						);
					}
				}
			} else {
				tagStack.push(tagName);
			}
		}

		// Check for unclosed tags
		if (tagStack.length > 0) {
			errors.push(`Unclosed tags: ${tagStack.join(", ")}`);
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Clean and normalize content
	 */
	cleanContent(content: string): string {
		if (!this.stripWhitespace) {
			return content;
		}

		return content
			.trim() // Remove leading/trailing whitespace
			.replace(/\n\s*\n\s*\n/g, "\n\n") // Collapse multiple empty lines
			.replace(/^\s+$/gm, ""); // Remove whitespace-only lines
	}

	/**
	 * Generate instruction template for AI
	 */
	generateInstructionTemplate(expectedTags: string[]): string {
		const tagExamples = expectedTags
			.map((tag) => `<${tag}>\n[Your ${tag} content here]\n</${tag}>`)
			.join("\n\n");

		return `
IMPORTANT: Structure your response using these XML tags exactly as shown:

${tagExamples}

Rules:
- Use the exact tag names provided
- Include all required tags
- Put content between opening and closing tags
- Do not include additional explanations outside the tags
- Ensure tags are properly closed
`;
	}

	setDebug(debug: boolean): void {
		this.debug = debug;
	}
}
