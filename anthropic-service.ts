// path: anthropic-service.ts

import Anthropic from "@anthropic-ai/sdk";
import { AIEditResponse } from "./ai-prompt-system";

interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class AnthropicService {
  private client: Anthropic;
  private config: AnthropicConfig;

  constructor(config: AnthropicConfig) {
    if (!config.apiKey) {
      throw new Error("Anthropic API key is required");
    }

    this.config = {
      model: "claude-3-5-sonnet-20241022",
      maxTokens: 8192,
      temperature: 0.1,
      ...config,
    };

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
    });
  }

  async generateCodeEdits(prompt: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.config.model!,
        max_tokens: this.config.maxTokens!,
        temperature: this.config.temperature!,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Extract text content from the response
      const content = response.content[0];
      if (content.type === "text") {
        return content.text;
      } else {
        throw new Error("Unexpected response format from Claude");
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Anthropic API error: ${error.message}`);
      }
      throw new Error("Unknown error occurred while calling Anthropic API");
    }
  }

  async identifyTargetFiles(
    request: string,
    fileDescriptions: Array<{ path: string; description: string }>
  ): Promise<string[]> {
    const prompt = `
Analyze this user request and identify which files should be modified:

USER REQUEST: ${request}

AVAILABLE FILES:
${fileDescriptions.map((f) => `${f.path}: ${f.description}`).join("\n")}

Respond with ONLY a JSON array of file paths that need to be modified. No explanation, just the JSON array:
["path1", "path2", ...]
    `;

    try {
      const response = await this.generateCodeEdits(prompt);

      // Try to extract JSON from the response
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: try to parse the entire response
      return JSON.parse(response.trim());
    } catch (error) {
      console.warn(
        "Failed to parse file identification response, using fallback"
      );
      return [];
    }
  }

  async generateErrorFixes(
    errors: Array<{
      file: string;
      line: number;
      message: string;
      code: number;
    }>,
    context: string
  ): Promise<{ analysis: string; edits: AIEditResponse[] }> {
    const errorList = errors
      .map((err) => `${err.file}:${err.line} - TS${err.code}: ${err.message}`)
      .join("\n");

    const prompt = `
You are a TypeScript error fixing specialist. Fix the following compilation errors:

COMPILATION ERRORS:
${errorList}

CODE CONTEXT:
${context}

Respond with JSON edit instructions to fix these errors. Use this exact format:

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

Focus on minimal changes that resolve the errors without breaking existing functionality.
    `;

    const response = await this.generateCodeEdits(prompt);
    return this.parseAIResponse(response);
  }

  private parseAIResponse(response: string): {
    analysis: string;
    edits: AIEditResponse[];
  } {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: try to parse the entire response
      return JSON.parse(response.trim());
    } catch (error) {
      throw new Error(
        `Failed to parse AI response: ${error.message}\nResponse: ${response}`
      );
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: this.config.model!,
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content:
              'Hello, please respond with just "OK" to test the connection.',
          },
        ],
      });

      return (
        response.content[0].type === "text" &&
        response.content[0].text.toLowerCase().includes("ok")
      );
    } catch (error) {
      return false;
    }
  }

  getModel(): string {
    return this.config.model!;
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
