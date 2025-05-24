// path: config-manager.ts

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface AgentConfig {
  anthropicApiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  debug?: boolean;
  maxDepth?: number;
  projectRoot?: string;
}

export class ConfigManager {
  private configPath: string;
  private config: AgentConfig = {};

  constructor() {
    this.configPath = path.join(
      os.homedir(),
      ".ai-coding-agent",
      "config.json"
    );
    this.ensureConfigDir();
    this.loadConfig();
  }

  private ensureConfigDir(): void {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, "utf-8");
        this.config = JSON.parse(configData);
      }
    } catch (error) {
      console.warn("Failed to load config, using defaults");
      this.config = {};
    }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("Failed to save config:", error.message);
    }
  }

  setAnthropicApiKey(apiKey: string): void {
    this.config.anthropicApiKey = apiKey;
    this.saveConfig();
  }

  getAnthropicApiKey(): string | undefined {
    // Check environment variable first, then config file
    return process.env.ANTHROPIC_API_KEY || this.config.anthropicApiKey;
  }

  setModel(model: string): void {
    this.config.model = model;
    this.saveConfig();
  }

  getModel(): string {
    return this.config.model || "claude-3-5-sonnet-20241022";
  }

  setMaxTokens(maxTokens: number): void {
    this.config.maxTokens = maxTokens;
    this.saveConfig();
  }

  getMaxTokens(): number {
    return this.config.maxTokens || 8192;
  }

  setTemperature(temperature: number): void {
    this.config.temperature = temperature;
    this.saveConfig();
  }

  getTemperature(): number {
    return this.config.temperature || 0.1;
  }

  setDebug(debug: boolean): void {
    this.config.debug = debug;
    this.saveConfig();
  }

  getDebug(): boolean {
    return this.config.debug || false;
  }

  setMaxDepth(maxDepth: number): void {
    this.config.maxDepth = maxDepth;
    this.saveConfig();
  }

  getMaxDepth(): number {
    return this.config.maxDepth || 3;
  }

  setProjectRoot(projectRoot: string): void {
    this.config.projectRoot = projectRoot;
    this.saveConfig();
  }

  getProjectRoot(): string | undefined {
    return this.config.projectRoot;
  }

  getAllConfig(): AgentConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  resetConfig(): void {
    this.config = {};
    this.saveConfig();
  }

  hasAnthropicApiKey(): boolean {
    return !!(process.env.ANTHROPIC_API_KEY || this.config.anthropicApiKey);
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.hasAnthropicApiKey()) {
      errors.push(
        "Anthropic API key is required. Set it via environment variable ANTHROPIC_API_KEY or use /config"
      );
    }

    if (
      this.config.maxTokens &&
      (this.config.maxTokens < 1 || this.config.maxTokens > 200000)
    ) {
      errors.push("Max tokens must be between 1 and 200000");
    }

    if (
      this.config.temperature &&
      (this.config.temperature < 0 || this.config.temperature > 1)
    ) {
      errors.push("Temperature must be between 0 and 1");
    }

    if (this.config.maxDepth && this.config.maxDepth < 1) {
      errors.push("Max depth must be at least 1");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  getConfigPath(): string {
    return this.configPath;
  }

  static createFromEnv(): ConfigManager {
    const manager = new ConfigManager();

    // Load from environment variables if available
    if (process.env.ANTHROPIC_API_KEY) {
      manager.setAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
    }

    if (process.env.AI_AGENT_MODEL) {
      manager.setModel(process.env.AI_AGENT_MODEL);
    }

    if (process.env.AI_AGENT_MAX_TOKENS) {
      manager.setMaxTokens(parseInt(process.env.AI_AGENT_MAX_TOKENS));
    }

    if (process.env.AI_AGENT_TEMPERATURE) {
      manager.setTemperature(parseFloat(process.env.AI_AGENT_TEMPERATURE));
    }

    if (process.env.AI_AGENT_DEBUG === "true") {
      manager.setDebug(true);
    }

    return manager;
  }
}
