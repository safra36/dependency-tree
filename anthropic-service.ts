// path: anthropic-service.ts

import Anthropic from "@anthropic-ai/sdk";
import { AIEditResponse } from "./ai-prompt-system";
import colors from "./colors";

interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  debug?: boolean;
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
      console.log(colors.cyan("🔧 [DEBUG] AnthropicService initialized"));
      console.log(colors.gray(`  Model: ${this.config.model}`));
      console.log(colors.gray(`  Max Tokens: ${this.config.maxTokens}`));
      console.log(colors.gray(`  Temperature: ${this.config.temperature}`));
      console.log(
        colors.gray(`  API Key: ${this.config.apiKey?.substring(0, 10)}...`)
      );
    }
  }

  async generateCodeEdits(prompt: string): Promise<string> {
    this.requestCounter++;
    const requestId = `REQ-${this.requestCounter}`;

    if (this.config.debug) {
      console.log(colors.cyan(`\n🔧 [DEBUG] ${requestId} Starting AI request`));
      console.log(colors.gray("━".repeat(80)));
      console.log(colors.yellow("📤 PROMPT SENT TO AI:"));
      console.log(colors.gray(prompt));
      console.log(colors.gray("━".repeat(80)));
    }

    try {
      const enhancedPrompt = `${prompt}

CRITICAL: Your response must be ONLY valid JSON. Do not include any explanatory text before or after the JSON. Start your response with { or [ and end with } or ].

JSON ESCAPING RULES:
- Escape all double quotes in strings as \"
- Escape backslashes as \\
- Escape newlines as \n
- Example: "const msg = \"Hello World\";" becomes "const msg = \\\"Hello World\\\";"`;

      const startTime = Date.now();

      if (this.config.debug) {
        console.log(
          colors.cyan(`🔧 [DEBUG] ${requestId} Calling Anthropic API...`)
        );
        console.log(colors.gray(`  Model: ${this.config.model}`));
        console.log(colors.gray(`  Max Tokens: ${this.config.maxTokens}`));
        console.log(colors.gray(`  Temperature: ${this.config.temperature}`));
      }

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
        console.log(colors.gray(`  Usage: ${JSON.stringify(response.usage)}`));
        console.log(colors.gray(`  Stop Reason: ${response.stop_reason}`));
        console.log(colors.gray("━".repeat(80)));
        console.log(colors.yellow("📥 RAW RESPONSE FROM AI:"));
      }

      const content = response.content[0];
      if (content.type === "text") {
        if (this.config.debug) {
          console.log(colors.gray(content.text));
          console.log(colors.gray("━".repeat(80)));
        }

        const cleanedResponse = this.cleanJsonResponse(content.text);

        if (this.config.debug) {
          console.log(colors.yellow("🧹 CLEANED RESPONSE:"));
          console.log(colors.gray(cleanedResponse));
          console.log(colors.gray("━".repeat(80)));

          // Test JSON parsing
          try {
            const parsed = JSON.parse(cleanedResponse);
            console.log(colors.green(`✅ JSON parsing successful`));
            console.log(
              colors.gray(
                `  Type: ${Array.isArray(parsed) ? "Array" : "Object"}`
              )
            );
            console.log(
              colors.gray(
                `  Keys: ${
                  Array.isArray(parsed)
                    ? parsed.length + " items"
                    : Object.keys(parsed).join(", ")
                }`
              )
            );
          } catch (parseError) {
            console.log(
              colors.red(`❌ JSON parsing failed: ${parseError.message}`)
            );
            console.log(
              colors.gray(
                `  First 100 chars: ${cleanedResponse.substring(0, 100)}...`
              )
            );
          }
        }

        return cleanedResponse;
      } else {
        throw new Error("Unexpected response format from Claude");
      }
    } catch (error) {
      if (this.config.debug) {
        console.log(colors.red(`🔧 [DEBUG] ${requestId} API call failed`));
        console.log(colors.red(`  Error: ${error.message}`));
        if (error.response) {
          console.log(colors.red(`  Status: ${error.response.status}`));
          console.log(
            colors.red(`  Response: ${JSON.stringify(error.response.data)}`)
          );
        }
      }

      if (error instanceof Error) {
        throw new Error(`Anthropic API error: ${error.message}`);
      }
      throw new Error("Unknown error occurred while calling Anthropic API");
    }
  }

  private cleanJsonResponse(response: string): string {
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Cleaning JSON response..."));
      console.log(
        colors.gray(`  Original length: ${response.length} characters`)
      );
    }

    // Remove markdown code blocks if present
    let cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "");

    if (this.config.debug && cleaned !== response) {
      console.log(colors.gray(`  ✂️  Removed markdown code blocks`));
    }

    // Remove any text before the first { or [
    const jsonStart = Math.min(
      cleaned.indexOf("{") === -1 ? Infinity : cleaned.indexOf("{"),
      cleaned.indexOf("[") === -1 ? Infinity : cleaned.indexOf("[")
    );

    if (jsonStart !== Infinity && jsonStart > 0) {
      if (this.config.debug) {
        console.log(
          colors.gray(`  ✂️  Removed ${jsonStart} characters before JSON start`)
        );
      }
      cleaned = cleaned.substring(jsonStart);
    }

    // Remove any text after the last } or ]
    const lastBrace = cleaned.lastIndexOf("}");
    const lastBracket = cleaned.lastIndexOf("]");
    const jsonEnd = Math.max(lastBrace, lastBracket);

    if (jsonEnd !== -1 && jsonEnd < cleaned.length - 1) {
      const removedChars = cleaned.length - jsonEnd - 1;
      if (this.config.debug && removedChars > 0) {
        console.log(
          colors.gray(`  ✂️  Removed ${removedChars} characters after JSON end`)
        );
      }
      cleaned = cleaned.substring(0, jsonEnd + 1);
    }

    // Only apply minimal fixes - avoid aggressive transformations that break content
    const originalCleaned = cleaned;
    cleaned = cleaned
      .replace(/,\s*}/g, "}") // Remove trailing commas before }
      .replace(/,\s*]/g, "]"); // Remove trailing commas before ]

    if (this.config.debug && cleaned !== originalCleaned) {
      console.log(
        colors.gray(`  🔧 Applied minimal JSON fixes (trailing commas only)`)
      );
    }

    if (this.config.debug) {
      console.log(colors.gray(`  Final length: ${cleaned.length} characters`));
    }

    return cleaned.trim();
  }

  async identifyTargetFiles(
    request: string,
    fileDescriptions: Array<{ path: string; description: string }>
  ): Promise<string[]> {
    if (this.config.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] Identifying target files..."));
      console.log(colors.gray(`  Request: "${request}"`));
      console.log(colors.gray(`  Available files: ${fileDescriptions.length}`));
    }

    const prompt = `
Analyze this user request and identify which files should be modified or created:

USER REQUEST: ${request}

AVAILABLE FILES:
${fileDescriptions.map((f) => `${f.path}: ${f.description}`).join("\n")}

Respond with ONLY a JSON array of file paths. No explanation, just the array:
["path1", "path2"]

If creating new files, suggest appropriate paths like:
["src/services/calculator.service.ts", "src/types/calculator.types.ts"]

CRITICAL: Respond ONLY with valid JSON array. No other text.`;

    try {
      const response = await this.generateCodeEdits(prompt);
      const cleaned = this.cleanJsonResponse(response);

      if (this.config.debug) {
        console.log(
          colors.cyan("🔧 [DEBUG] Parsing file identification response...")
        );
      }

      // Try to parse as array
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        if (this.config.debug) {
          console.log(
            colors.green(
              `✅ Successfully identified ${parsed.length} target files:`
            )
          );
          parsed.forEach((file, i) =>
            console.log(colors.gray(`  ${i + 1}. ${file}`))
          );
        }
        return parsed;
      }

      // If it's an object, try to extract array values
      if (typeof parsed === "object") {
        if (this.config.debug) {
          console.log(
            colors.yellow(
              "⚠️  Response is object, searching for array values..."
            )
          );
        }
        const values = Object.values(parsed);
        for (const value of values) {
          if (Array.isArray(value)) {
            if (this.config.debug) {
              console.log(
                colors.green(
                  `✅ Found array in object with ${value.length} files`
                )
              );
            }
            return value;
          }
        }
      }

      if (this.config.debug) {
        console.log(
          colors.red("❌ Could not extract file array from response")
        );
      }
      return [];
    } catch (error) {
      if (this.config.debug) {
        console.log(
          colors.red(`❌ File identification failed: ${error.message}`)
        );
      }
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
    if (this.config.debug) {
      console.log(colors.cyan("\n🔧 [DEBUG] Generating error fixes..."));
      console.log(colors.gray(`  Error count: ${errors.length}`));
      errors.forEach((err, i) => {
        console.log(
          colors.gray(
            `  ${i + 1}. ${err.file}:${err.line} - TS${err.code}: ${
              err.message
            }`
          )
        );
      });
    }

    if (errors.length === 0) {
      if (this.config.debug) {
        console.log(colors.yellow("⚠️  No errors to fix"));
      }
      return { analysis: "No errors to fix", edits: [] };
    }

    const errorList = errors
      .map((err) => `${err.file}:${err.line} - TS${err.code}: ${err.message}`)
      .join("\n");

    const prompt = `
Fix these TypeScript compilation errors:

ERRORS:
${errorList}

CODE CONTEXT:
${context}

Respond with ONLY this JSON format:

{
  "analysis": "Summary of fixes needed",
  "edits": [
    {
      "file": "path/to/file",
      "analysis": "Explanation of fixes", 
      "edits": [
        {
          "startIndex": 0,
          "endIndex": 0,
          "newContent": ["fixed line"],
          "description": "What error this fixes"
        }
      ]
    }
  ]
}

CRITICAL: Respond ONLY with valid JSON. No explanatory text.`;

    const response = await this.generateCodeEdits(prompt);
    const result = this.parseAIResponse(response);

    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Error fix response parsed:"));
      console.log(colors.gray(`  Analysis: ${result.analysis}`));
      console.log(colors.gray(`  File edits: ${result.edits.length}`));
    }

    return result;
  }

  private parseAIResponse(response: string): {
    analysis: string;
    edits: AIEditResponse[];
  } {
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Parsing AI response..."));
    }

    try {
      const cleaned = this.cleanJsonResponse(response);
      const parsed = JSON.parse(cleaned);

      // Validate structure
      if (!parsed.analysis || !Array.isArray(parsed.edits)) {
        if (this.config.debug) {
          console.log(colors.red("❌ Invalid response structure"));
          console.log(colors.gray(`  Has analysis: ${!!parsed.analysis}`));
          console.log(
            colors.gray(`  Has edits array: ${Array.isArray(parsed.edits)}`)
          );
        }
        throw new Error("Invalid response structure");
      }

      if (this.config.debug) {
        console.log(colors.green("✅ Response structure valid"));
      }

      return parsed;
    } catch (error) {
      if (this.config.debug) {
        console.log(
          colors.red(`❌ Failed to parse AI response: ${error.message}`)
        );
        console.log(colors.gray(`  Returning safe fallback`));
      }
      // Return safe fallback
      return {
        analysis: "Could not parse AI response",
        edits: [],
      };
    }
  }

  async testConnection(): Promise<boolean> {
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Testing AI connection..."));
    }

    try {
      const startTime = Date.now();
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

      const duration = Date.now() - startTime;
      const success =
        response.content[0].type === "text" &&
        response.content[0].text.toLowerCase().includes("ok");

      if (this.config.debug) {
        console.log(
          colors.cyan(`🔧 [DEBUG] Connection test completed (${duration}ms)`)
        );
        console.log(
          colors.gray(
            `  Response: "${
              response.content[0].type === "text"
                ? response.content[0].text
                : "non-text"
            }"`
          )
        );
        console.log(colors.gray(`  Success: ${success}`));
      }

      return success;
    } catch (error) {
      if (this.config.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] Connection test failed: ${error.message}`)
        );
      }
      return false;
    }
  }

  getModel(): string {
    return this.config.model!;
  }

  updateConfig(updates: Partial<AnthropicConfig>): void {
    if (this.config.debug) {
      console.log(colors.cyan("🔧 [DEBUG] Updating Anthropic config..."));
      console.log(
        colors.gray(`  Current: ${JSON.stringify(this.config, null, 2)}`)
      );
      console.log(
        colors.gray(`  Updates: ${JSON.stringify(updates, null, 2)}`)
      );
    }

    this.config = { ...this.config, ...updates };

    if (updates.apiKey) {
      this.client = new Anthropic({
        apiKey: updates.apiKey,
      });

      if (this.config.debug) {
        console.log(
          colors.cyan("🔧 [DEBUG] Recreated Anthropic client with new API key")
        );
      }
    }

    if (this.config.debug) {
      console.log(
        colors.gray(`  New config: ${JSON.stringify(this.config, null, 2)}`)
      );
    }
  }

  setDebug(debug: boolean): void {
    this.config.debug = debug;
    if (debug) {
      console.log(
        colors.cyan("🔧 [DEBUG] Debug mode enabled for AnthropicService")
      );
    }
  }
}
