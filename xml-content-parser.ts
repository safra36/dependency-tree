// path: xml-content-parser.ts

import colors from "./colors";

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
	 * Parse AI response for specific XML tags with enhanced error handling
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
				// Try alternative extraction methods before marking as failed
				const alternativeExtracted = this.tryAlternativeExtraction(
					response,
					tag
				);

				if (alternativeExtracted.success) {
					result.content[tag] = alternativeExtracted.content;
					result.warnings.push(
						`Tag ${tag} found using alternative method`
					);
					if (this.debug) {
						console.log(
							colors.yellow(
								`  ⚠️ Found ${tag} with alternative method: ${alternativeExtracted.content.length} chars`
							)
						);
					}
				} else {
					result.errors.push(`Missing or invalid tag: ${tag}`);
					result.success = false;
					if (this.debug) {
						console.log(colors.red(`  ❌ Missing ${tag}`));
						console.log(
							colors.gray(`    Error: ${extracted.error}`)
						);
					}
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
	 * Extract content from a specific XML tag with enhanced matching
	 */
	extractTag(
		text: string,
		tagName: string
	): { success: boolean; content: string; error?: string } {
		// Try multiple extraction strategies

		// Strategy 1: Exact case-sensitive match
		let result = this.extractTagExact(text, tagName);
		if (result.success) return result;

		// Strategy 2: Case-insensitive match
		result = this.extractTagCaseInsensitive(text, tagName);
		if (result.success) return result;

		// Strategy 3: Whitespace-tolerant match
		result = this.extractTagWhitespaceTolerant(text, tagName);
		if (result.success) return result;

		return {
			success: false,
			content: "",
			error: `Tag ${tagName} not found with any extraction method`,
		};
	}

	private extractTagExact(
		text: string,
		tagName: string
	): { success: boolean; content: string; error?: string } {
		const openTag = `<${tagName}>`;
		const closeTag = `</${tagName}>`;

		const startIndex = text.indexOf(openTag);
		const endIndex = text.indexOf(closeTag);

		if (startIndex === -1 || endIndex === -1) {
			return {
				success: false,
				content: "",
				error: `Exact match failed for tag ${tagName}`,
			};
		}

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

	private extractTagCaseInsensitive(
		text: string,
		tagName: string
	): { success: boolean; content: string; error?: string } {
		const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, "is");
		const match = text.match(regex);

		if (!match) {
			return {
				success: false,
				content: "",
				error: `Case-insensitive match failed for tag ${tagName}`,
			};
		}

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

	private extractTagWhitespaceTolerant(
		text: string,
		tagName: string
	): { success: boolean; content: string; error?: string } {
		// Allow for whitespace around tag names
		const regex = new RegExp(
			`<\\s*${tagName}\\s*>(.*?)<\\s*/\\s*${tagName}\\s*>`,
			"is"
		);
		const match = text.match(regex);

		if (!match) {
			return {
				success: false,
				content: "",
				error: `Whitespace-tolerant match failed for tag ${tagName}`,
			};
		}

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

	/**
	 * Try alternative extraction methods for content that might not be in XML tags
	 */
	private tryAlternativeExtraction(
		text: string,
		tagName: string
	): { success: boolean; content: string; error?: string } {
		// Strategy 1: Look for section headers that match the tag name
		const sectionMatch = this.extractFromSectionHeaders(text, tagName);
		if (sectionMatch.success) return sectionMatch;

		// Strategy 2: Look for markdown-style headers
		const markdownMatch = this.extractFromMarkdownHeaders(text, tagName);
		if (markdownMatch.success) return markdownMatch;

		// Strategy 3: Look for content that follows the pattern but might be malformed
		const patternMatch = this.extractFromPatterns(text, tagName);
		if (patternMatch.success) return patternMatch;

		return {
			success: false,
			content: "",
			error: `No alternative extraction method worked for ${tagName}`,
		};
	}

	private extractFromSectionHeaders(
		text: string,
		tagName: string
	): { success: boolean; content: string; error?: string } {
		// Look for patterns like "Analysis:" or "Actions:" followed by content
		const patterns = [
			new RegExp(`${tagName}:\\s*\\n([\\s\\S]*?)(?=\\n\\w+:|$)`, "i"),
			new RegExp(`${tagName}:\\s*([\\s\\S]*?)(?=\\n\\w+:|$)`, "i"),
			new RegExp(
				`\\b${tagName}\\b[:\\s]+([\\s\\S]*?)(?=\\n\\w+:|$)`,
				"i"
			),
		];

		for (const pattern of patterns) {
			const match = text.match(pattern);
			if (match) {
				let content = match[1];
				if (this.stripWhitespace) {
					content = content.trim();
				}

				if (content) {
					return { success: true, content };
				}
			}
		}

		return {
			success: false,
			content: "",
			error: `Section header extraction failed for ${tagName}`,
		};
	}

	private extractFromMarkdownHeaders(
		text: string,
		tagName: string
	): { success: boolean; content: string; error?: string } {
		// Look for markdown headers like "## Analysis" followed by content
		const patterns = [
			new RegExp(`#+\\s*${tagName}\\s*\\n([\\s\\S]*?)(?=\\n#+|$)`, "i"),
			new RegExp(
				`\\*\\*${tagName}\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*|$)`,
				"i"
			),
		];

		for (const pattern of patterns) {
			const match = text.match(pattern);
			if (match) {
				let content = match[1];
				if (this.stripWhitespace) {
					content = content.trim();
				}

				if (content) {
					return { success: true, content };
				}
			}
		}

		return {
			success: false,
			content: "",
			error: `Markdown header extraction failed for ${tagName}`,
		};
	}

	private extractFromPatterns(
		text: string,
		tagName: string
	): { success: boolean; content: string; error?: string } {
		// Look for common patterns where the content might be structured differently
		if (tagName.toLowerCase() === "actions") {
			// Special handling for actions - look for numbered lists
			const numberedListMatch = text.match(
				/(?:1\.\s+.*(?:\n\d+\.\s+.*)*)/s
			);
			if (numberedListMatch) {
				return { success: true, content: numberedListMatch[0] };
			}
		}

		if (tagName.toLowerCase() === "analysis") {
			// Look for analysis content that might start with common phrases
			const analysisPatterns = [
				/(?:The|This|To|For|In order to|Based on)[^.]*\.(?:[^.]*\.?)*/s,
				/(?:Creating|Setting up|Installing|Configuring)[^.]*\.(?:[^.]*\.?)*/s,
			];

			for (const pattern of analysisPatterns) {
				const match = text.match(pattern);
				if (match && match[0].length > 50) {
					// Ensure it's substantial content
					return { success: true, content: match[0] };
				}
			}
		}

		return {
			success: false,
			content: "",
			error: `Pattern extraction failed for ${tagName}`,
		};
	}

	/**
	 * Find all XML tags in text with enhanced detection
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
	 * Enhanced validation with better error reporting
	 */
	validateXML(text: string): {
		valid: boolean;
		errors: string[];
		warnings: string[];
	} {
		const errors: string[] = [];
		const warnings: string[] = [];
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
			warnings.push(
				`Unclosed tags: ${tagStack.join(", ")} (might be self-closing)`
			);
		}

		// Check for common XML issues
		if (text.includes("<>") || text.includes("</>")) {
			warnings.push("Empty tag names found");
		}

		if (text.includes("< ") || text.includes(" >")) {
			warnings.push("Possible malformed tags with extra spaces");
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Clean and normalize content with enhanced processing
	 */
	cleanContent(content: string): string {
		if (!this.stripWhitespace) {
			return content;
		}

		return content
			.trim() // Remove leading/trailing whitespace
			.replace(/\n\s*\n\s*\n/g, "\n\n") // Collapse multiple empty lines
			.replace(/^\s+$/gm, "") // Remove whitespace-only lines
			.replace(/\r\n/g, "\n") // Normalize line endings
			.replace(/\t/g, "  "); // Convert tabs to spaces
	}

	/**
	 * Generate instruction template for AI with enhanced formatting
	 */
	generateInstructionTemplate(expectedTags: string[]): string {
		const tagExamples = expectedTags
			.map((tag) => `<${tag}>\n[Your ${tag} content here]\n</${tag}>`)
			.join("\n\n");

		return `
CRITICAL XML FORMATTING REQUIREMENTS:
- Structure your response using ONLY these XML tags: ${expectedTags
			.map((tag) => `<${tag}></${tag}>`)
			.join(", ")}
- Each tag must be properly opened and closed
- Do not include any text outside the XML tags
- Do not use markdown, JSON, or other formatting
- Ensure XML is well-formed and valid

Expected Response Format:
${tagExamples}

IMPORTANT NOTES:
- Use exact tag names as specified
- Content must be between opening and closing tags
- No additional explanations outside the XML structure
- Ensure proper tag closure for valid XML
`;
	}

	/**
	 * Extract structured data from mixed content
	 */
	extractStructuredData(
		text: string,
		dataType: "commands" | "files" | "urls" | "numbers"
	): string[] {
		const patterns = {
			commands: [
				/npm\s+[^\n]+/g,
				/yarn\s+[^\n]+/g,
				/git\s+[^\n]+/g,
				/nest\s+[^\n]+/g,
				/touch\s+[^\n]+/g,
				/mkdir\s+[^\n]+/g,
			],
			files: [
				/\S+\.\w{2,4}/g, // Files with extensions
				/[^\s]+\.json/g,
				/[^\s]+\.ts/g,
				/[^\s]+\.js/g,
			],
			urls: [/https?:\/\/[^\s]+/g],
			numbers: [/\d+/g],
		};

		const results: string[] = [];
		const patternList = patterns[dataType] || [];

		for (const pattern of patternList) {
			const matches = text.match(pattern);
			if (matches) {
				results.push(...matches);
			}
		}

		return [...new Set(results)]; // Remove duplicates
	}

	setDebug(debug: boolean): void {
		this.debug = debug;
	}
}
