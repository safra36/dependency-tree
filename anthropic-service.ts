// path: anthropic-service.ts

import Anthropic from "@anthropic-ai/sdk";
import colors from "./colors";

interface AnthropicConfig {
	apiKey: string;
	model?: string;
	maxTokens?: number;
	temperature?: number;
	debug?: boolean;
}

interface XMLPromptContext {
	userRequest?: string;
	projectContext?: string;
	fileContent?: string;
	fileName?: string;
	fileType?: string;
	errors?: string;
	requirements?: string;
	constraints?: string;
}

export class AnthropicService {
	private client: Anthropic;
	private config: AnthropicConfig;
	private requestCounter = 0;

	constructor(config: AnthropicConfig) {
		if (!config.apiKey) {
			throw new Error("Anthropic API key is required");
		}

		this.config = {
			model: "claude-3-5-sonnet-20241022",
			maxTokens: 8192,
			temperature: 0.1,
			debug: false,
			...config,
		};

		this.client = new Anthropic({
			apiKey: this.config.apiKey,
		});

		if (this.config.debug) {
			console.log(
				colors.cyan(
					"🔧 [DEBUG] AnthropicService initialized with XML support"
				)
			);
			console.log(colors.gray(`  Model: ${this.config.model}`));
			console.log(colors.gray(`  Max Tokens: ${this.config.maxTokens}`));
			console.log(
				colors.gray(`  Temperature: ${this.config.temperature}`)
			);
		}
	}

	/**
	 * Generate code with XML-structured prompts
	 */
	async generateWithXMLPrompt(
		promptTemplate: string,
		context: XMLPromptContext = {},
		expectedTags: string[] = ["content"]
	): Promise<string> {
		this.requestCounter++;
		const requestId = `XML-REQ-${this.requestCounter}`;

		if (this.config.debug) {
			console.log(
				colors.cyan(`\n🔧 [DEBUG] ${requestId} XML-based AI request`)
			);
			console.log(
				colors.gray(`  Expected tags: ${expectedTags.join(", ")}`)
			);
		}

		try {
			// Replace context placeholders in the prompt template
			const processedPrompt = this.processPromptTemplate(
				promptTemplate,
				context
			);

			// Add XML formatting instructions
			const enhancedPrompt = this.addXMLInstructions(
				processedPrompt,
				expectedTags
			);

			if (this.config.debug) {
				console.log(colors.gray("━".repeat(80)));
				console.log(colors.yellow("📤 XML PROMPT SENT TO AI:"));
				console.log(colors.gray(enhancedPrompt));
				console.log(colors.gray("━".repeat(80)));
			}

			const startTime = Date.now();

			const response = await this.client.messages.create({
				model: this.config.model!,
				max_tokens: this.config.maxTokens!,
				temperature: this.config.temperature!,
				messages: [
					{
						role: "user",
						content: enhancedPrompt,
					},
				],
			});

			const endTime = Date.now();
			const duration = endTime - startTime;

			if (this.config.debug) {
				console.log(
					colors.cyan(
						`🔧 [DEBUG] ${requestId} Response received (${duration}ms)`
					)
				);
				console.log(
					colors.gray(`  Usage: ${JSON.stringify(response.usage)}`)
				);
			}

			const content = response.content[0];
			if (content.type === "text") {
				if (this.config.debug) {
					console.log(colors.gray("━".repeat(80)));
					console.log(colors.yellow("📥 RAW XML RESPONSE:"));
					console.log(colors.gray(content.text));
					console.log(colors.gray("━".repeat(80)));
				}

				return content.text;
			} else {
				throw new Error("Unexpected response format from Claude");
			}
		} catch (error) {
			if (this.config.debug) {
				console.log(
					colors.red(
						`🔧 [DEBUG] ${requestId} Request failed: ${error.message}`
					)
				);
			}
			throw new Error(`Anthropic API error: ${error.message}`);
		}
	}

	/**
	 * Legacy method for backward compatibility
	 */
	async generateCodeEdits(prompt: string): Promise<string> {
		return this.generateWithXMLPrompt(prompt);
	}

	/**
	 * Process template placeholders with context data
	 */
	private processPromptTemplate(
		template: string,
		context: XMLPromptContext
	): string {
		let processed = template;

		// Replace all context placeholders
		Object.entries(context).forEach(([key, value]) => {
			if (value !== undefined) {
				const placeholder = `{{${key}}}`;
				processed = processed.replace(
					new RegExp(placeholder, "g"),
					String(value)
				);
			}
		});

		// Clean up any remaining empty placeholders
		processed = processed.replace(/\{\{[^}]+\}\}/g, "[Not provided]");

		return processed;
	}

	/**
	 * Add XML formatting instructions to prompts
	 */
	private addXMLInstructions(prompt: string, expectedTags: string[]): string {
		const xmlInstructions = `
CRITICAL XML FORMATTING REQUIREMENTS:
- Structure your response using ONLY these XML tags: ${expectedTags
			.map((tag) => `<${tag}></${tag}>`)
			.join(", ")}
- Each tag must be properly opened and closed
- Do not include any text outside the XML tags
- Do not use markdown, JSON, or other formatting
- Ensure XML is well-formed and valid

${prompt}

RESPONSE FORMAT:
${expectedTags
	.map((tag) => `<${tag}>\n[Your ${tag} content here]\n</${tag}>`)
	.join("\n\n")}

Remember: Use ONLY the XML tags specified above. No additional text or formatting.`;

		return xmlInstructions;
	}

	async testConnection(): Promise<boolean> {
		if (this.config.debug) {
			console.log(colors.cyan("🔧 [DEBUG] Testing AI connection..."));
		}

		try {
			const response = await this.client.messages.create({
				model: this.config.model!,
				max_tokens: 10,
				messages: [
					{
						role: "user",
						content: "Respond with only: <test>OK</test>",
					},
				],
			});

			const success =
				response.content[0].type === "text" &&
				response.content[0].text.includes("<test>OK</test>");

			if (this.config.debug) {
				console.log(
					colors.cyan(`🔧 [DEBUG] Connection test result: ${success}`)
				);
				console.log(
					colors.gray(
						`  Response: ${
							response.content[0].type === "text"
								? response.content[0].text
								: "non-text"
						}`
					)
				);
			}

			return success;
		} catch (error) {
			if (this.config.debug) {
				console.log(
					colors.red(
						`🔧 [DEBUG] Connection test failed: ${error.message}`
					)
				);
			}
			return false;
		}
	}

	getModel(): string {
		return this.config.model!;
	}

	setDebug(debug: boolean): void {
		this.config.debug = debug;
	}

	updateConfig(updates: Partial<AnthropicConfig>): void {
		this.config = { ...this.config, ...updates };

		if (updates.apiKey) {
			this.client = new Anthropic({
				apiKey: updates.apiKey,
			});
		}
	}
}
