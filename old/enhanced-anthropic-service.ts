// path: enhanced-anthropic-service.ts

import Anthropic from "@anthropic-ai/sdk";
import colors from "../colors";

interface AnthropicConfig {
	apiKey: string;
	model?: string;
	maxTokens?: number;
	temperature?: number;
	debug?: boolean;
}

export class EnhancedAnthropicService {
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
				colors.cyan("🔧 [DEBUG] EnhancedAnthropicService initialized")
			);
			console.log(colors.gray(`  Model: ${this.config.model}`));
			console.log(colors.gray(`  Max Tokens: ${this.config.maxTokens}`));
			console.log(
				colors.gray(`  Temperature: ${this.config.temperature}`)
			);
		}
	}

	async generateCodeEdits(prompt: string): Promise<string> {
		this.requestCounter++;
		const requestId = `REQ-${this.requestCounter}`;

		if (this.config.debug) {
			console.log(
				colors.cyan(`\n🔧 [DEBUG] ${requestId} Starting AI request`)
			);
			console.log(colors.gray("━".repeat(80)));
			console.log(colors.yellow("📤 PROMPT SENT TO AI:"));
			console.log(colors.gray(prompt.substring(0, 500) + "..."));
			console.log(colors.gray("━".repeat(80)));
		}

		try {
			const enhancedPrompt = this.addSystemConstraints(prompt);
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
						`🔧 [DEBUG] ${requestId} API response received (${duration}ms)`
					)
				);
				console.log(
					colors.gray(`  Usage: ${JSON.stringify(response.usage)}`)
				);
				console.log(
					colors.gray(`  Stop Reason: ${response.stop_reason}`)
				);
			}

			const content = response.content[0];
			if (content.type === "text") {
				const cleanedResponse = this.cleanResponse(content.text);

				if (this.config.debug) {
					console.log(colors.yellow("🧹 CLEANED RESPONSE PREVIEW:"));
					console.log(
						colors.gray(cleanedResponse.substring(0, 300) + "...")
					);
					console.log(colors.gray("━".repeat(80)));
				}

				return cleanedResponse;
			} else {
				throw new Error("Unexpected response format from Claude");
			}
		} catch (error) {
			if (this.config.debug) {
				console.log(
					colors.red(`🔧 [DEBUG] ${requestId} API call failed`)
				);
				console.log(colors.red(`  Error: ${error.message}`));
			}

			throw new Error(`Anthropic API error: ${error.message}`);
		}
	}

	private addSystemConstraints(prompt: string): string {
		const systemConstraints = `CRITICAL SYSTEM CONSTRAINTS - FOLLOW THESE RULES STRICTLY:

🚫 NEVER TRUNCATE CODE
- Always provide complete, functional implementations
- Never use "..." or "// rest of implementation" or similar abbreviations
- Every function, class, and file must be complete and ready to use

📏 FILE SIZE LIMITS
- Each file should be maximum 100 lines to keep context manageable
- If implementation would exceed 100 lines, suggest breaking into smaller modules
- Focus on clean, modular design with single responsibility

🎯 CODE QUALITY REQUIREMENTS
- Provide production-ready, fully functional code
- Include all necessary imports and exports
- Ensure proper TypeScript typing and interfaces
- Follow established patterns from the provided codebase context
- Handle edge cases and errors appropriately

📋 RESPONSE FORMAT - CRITICAL
- When generating file content, respond with ONLY the raw file content
- Do NOT wrap responses in JSON objects like {"content": "..."}
- Do NOT use markdown code blocks like \`\`\`html
- Start your response directly with the file content
- For HTML: Start with <!DOCTYPE html>
- For CSS: Start with the first CSS rule
- For JS/TS: Start with imports or the first line of code
- For JSON: Start with { or [

💡 OPTIMIZATION GUIDELINES
- Minimize context by keeping files focused and small
- Use clear, descriptive names for better maintainability
- Leverage TypeScript features for better type safety
- Structure code for easy testing and debugging

${prompt}

Remember: COMPLETE implementations only. Never truncate or abbreviate code. Respond with raw file content, not JSON or markdown.`;

		return systemConstraints;
	}

	private cleanResponse(response: string): string {
		if (this.config.debug) {
			console.log(colors.cyan("🔧 [DEBUG] Cleaning response..."));
		}

		let cleaned = response;

		// Remove markdown code blocks if present
		cleaned = cleaned.replace(/```[\w]*\n?/g, "");

		// Remove any explanatory text that might precede JSON
		if (cleaned.trim().startsWith("{") || cleaned.trim().startsWith("[")) {
			// If it starts with JSON, extract just the JSON part
			const jsonMatch = cleaned.match(
				/^[\s\S]*?(\{[\s\S]*\}|\[[\s\S]*\])[\s\S]*$/
			);
			if (jsonMatch && jsonMatch[1]) {
				cleaned = jsonMatch[1];
			}
		}

		// Remove trailing explanatory text after code
		const lines = cleaned.split("\n");
		let endIndex = lines.length;

		// Find where code likely ends (look for common ending patterns)
		for (let i = lines.length - 1; i >= 0; i--) {
			const line = lines[i].trim();
			if (
				line === "" ||
				line.startsWith("//") ||
				line.startsWith("*") ||
				line.toLowerCase().includes("note:") ||
				line.toLowerCase().includes("this")
			) {
				continue;
			}
			endIndex = i + 1;
			break;
		}

		cleaned = lines.slice(0, endIndex).join("\n");

		return cleaned.trim();
	}

	async generateExecutionPlan(
		request: string,
		projectContext: string
	): Promise<any> {
		const planPrompt = `You are a systematic coding assistant creating an execution plan.

USER REQUEST: "${request}"

PROJECT CONTEXT:
${projectContext}

Create a detailed plan that addresses the following:

1. UNDERSTANDING: What exactly does the user want to accomplish?
2. APPROACH: What's the best systematic approach to implement this?
3. FILE ANALYSIS: Which files need to be modified or created?
4. EXECUTION SEQUENCE: What order should changes be made in?

CONSTRAINTS TO CONSIDER:
- Each file should be maximum 100 lines
- Break complex functionality into smaller, focused modules
- Maintain clean architecture and separation of concerns
- Ensure all code is complete and functional (no truncation)

Respond with a comprehensive JSON plan:
{
  "understanding": "Clear description of what user wants",
  "approach": "High-level strategy to implement this",
  "likelyFilesToModify": ["existing-file1.ts", "existing-file2.ts"],
  "likelyFilesToCreate": ["new-file1.ts", "new-file2.ts"],
  "contextFilesNeeded": ["context-file1.ts", "context-file2.ts"],
  "executionSequence": [
    {
      "step": 1,
      "action": "modify|create",
      "file": "specific-file.ts",
      "purpose": "What this accomplishes in the overall plan",
      "dependencies": ["files this change depends on"],
      "estimatedLines": 50
    }
  ],
  "potentialChallenges": ["challenge1", "challenge2"],
  "successCriteria": ["criteria1", "criteria2"]
}`;

		const response = await this.generateCodeEdits(planPrompt);
		return JSON.parse(this.extractJsonFromResponse(response));
	}

	async selectRelevantFiles(
		request: string,
		availableFiles: string[],
		executionPlan: any
	): Promise<any> {
		const selectionPrompt = `Select the most relevant files for this coding task.

USER REQUEST: "${request}"

EXECUTION PLAN: ${JSON.stringify(executionPlan, null, 2)}

AVAILABLE PROJECT FILES:
${availableFiles.join("\n")}

Guidelines for selection:
- Keep context manageable - select only truly necessary files
- Prioritize files that will be modified or are essential for understanding
- Consider dependencies between files
- Focus on files that provide the most value for understanding the codebase

Respond with JSON:
{
  "primaryFiles": [
    "files that will be directly modified or created"
  ],
  "contextFiles": [
    "files needed for understanding existing patterns and dependencies"
  ],
  "reasoning": {
    "primaryFiles": "Why these files were selected for modification",
    "contextFiles": "Why these files are needed for context",
    "excluded": "Why other files were not selected"
  },
  "estimatedRelevance": {
    "high": ["files absolutely critical"],
    "medium": ["files helpful but not critical"],
    "low": ["files with minimal relevance"]
  }
}`;

		const response = await this.generateCodeEdits(selectionPrompt);
		return JSON.parse(this.extractJsonFromResponse(response));
	}

	async generateCompleteFile(
		fileName: string,
		purpose: string,
		context: string,
		existingContent: string | null,
		originalRequest: string
	): Promise<string> {
		const filePrompt = `Generate a complete, production-ready file implementation.

FILE: ${fileName}
ACTION: ${existingContent ? "MODIFY" : "CREATE"}
PURPOSE: ${purpose}
ORIGINAL REQUEST: ${originalRequest}

${existingContent ? `EXISTING CONTENT:\n${existingContent}\n` : ""}

PROJECT CONTEXT:
${context}

CRITICAL REQUIREMENTS:
🚫 NEVER truncate or abbreviate - provide COMPLETE implementation
📏 Keep file under 100 lines - if longer, suggest breaking into modules
🎯 Provide fully functional, production-ready code
📋 Include all necessary imports, exports, and types
🔧 Follow TypeScript best practices and patterns from context
✅ Ensure code compiles and runs without errors

Generate the COMPLETE file content for ${fileName}:`;

		return await this.generateCodeEdits(filePrompt);
	}

	async validateFileImplementation(
		fileName: string,
		content: string,
		purpose: string,
		context: string
	): Promise<any> {
		const validationPrompt = `Validate this file implementation for quality and completeness.

FILE: ${fileName}
PURPOSE: ${purpose}

IMPLEMENTATION:
${content}

CONTEXT:
${context}

Check for:
1. Completeness - is the implementation fully functional?
2. Quality - does it follow TypeScript best practices?
3. Integration - does it fit well with the existing codebase?
4. Size - is it under 100 lines? If not, suggest refactoring
5. Dependencies - are all imports and exports correct?

Respond with JSON:
{
  "isValid": true/false,
  "quality": "excellent|good|needs-improvement|poor",
  "completeness": "complete|incomplete|has-placeholders",
  "lineCount": number,
  "issues": [
    {
      "type": "error|warning|suggestion",
      "line": number,
      "message": "description of issue",
      "fix": "suggested fix"
    }
  ],
  "improvements": [
    "suggestion 1",
    "suggestion 2"
  ],
  "refactoringNeeded": "If over 100 lines, suggest how to break it down"
}`;

		const response = await this.generateCodeEdits(validationPrompt);
		return JSON.parse(this.extractJsonFromResponse(response));
	}

	private extractJsonFromResponse(response: string): string {
		// Try to find JSON in the response
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			return jsonMatch[0];
		}

		// Try array format
		const arrayMatch = response.match(/\[[\s\S]*\]/);
		if (arrayMatch) {
			return arrayMatch[0];
		}

		// If no JSON found, return the response as-is and let caller handle parsing error
		return response.trim();
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
						content: "Respond with only: OK",
					},
				],
			});

			const success =
				response.content[0].type === "text" &&
				response.content[0].text.toLowerCase().includes("ok");

			if (this.config.debug) {
				console.log(
					colors.cyan(`🔧 [DEBUG] Connection test result: ${success}`)
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
}
