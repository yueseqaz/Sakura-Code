import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

// ─── Config Types ────────────────────────────────────────────────────────────
export interface Provider {
  baseURL: string;
  apiKey: string;
  models?: string[];
}

export interface Config {
  providers: Record<string, Provider>;
  defaultProvider: string;
  defaultModel: string;
  theme?: "default" | "cute" | "cool";
}

// ─── Default Config ──────────────────────────────────────────────────────────
const DEFAULT_CONFIG: Config = {
  providers: {
    deepseek: {
      baseURL: "https://api.deepseek.com/v1",
      apiKey: "",
      models: ["deepseek-chat", "deepseek-coder"],
    },
    openai: {
      baseURL: "https://api.openai.com/v1",
      apiKey: "",
      models: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
    },
    ollama: {
      baseURL: "http://localhost:11434/v1",
      apiKey: "ollama",
      models: ["llama3", "codellama", "mistral"],
    },
  },
  defaultProvider: "deepseek",
  defaultModel: "deepseek-chat",
};

// ─── Config Paths ────────────────────────────────────────────────────────────
const CONFIG_DIR = join(homedir(), ".sakura-code");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

// ─── Config Manager ──────────────────────────────────────────────────────────
export class ConfigManager {
  private config: Config;
  private configPath: string;

  constructor() {
    this.configPath = CONFIG_FILE;
    this.config = this.load();
  }

  private ensureConfigDir() {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  private load(): Config {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, "utf8");
        const loaded = JSON.parse(raw);
        // Merge with defaults to ensure all fields exist
        return this.mergeConfig(DEFAULT_CONFIG, loaded);
      }
    } catch (err) {
      console.error(`Warning: Failed to load config from ${this.configPath}`);
    }
    return { ...DEFAULT_CONFIG };
  }

  private mergeConfig(defaults: Config, loaded: Partial<Config>): Config {
    return {
      providers: { ...defaults.providers, ...loaded.providers },
      defaultProvider: loaded.defaultProvider ?? defaults.defaultProvider,
      defaultModel: loaded.defaultModel ?? defaults.defaultModel,
      theme: loaded.theme ?? defaults.theme,
    };
  }

  save() {
    this.ensureConfigDir();
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  // ─── Getters ─────────────────────────────────────────────────────────────
  get(): Config {
    return this.config;
  }

  getProvider(name?: string): Provider | undefined {
    const providerName = name ?? this.config.defaultProvider;
    return this.config.providers[providerName];
  }

  getModel(): string {
    return this.config.defaultModel;
  }

  // ─── Setters ─────────────────────────────────────────────────────────────
  setDefaultProvider(name: string) {
    if (!this.config.providers[name]) {
      throw new Error(`Provider '${name}' not found. Add it first.`);
    }
    this.config.defaultProvider = name;
    this.save();
  }

  setDefaultModel(model: string) {
    this.config.defaultModel = model;
    this.save();
  }

  addProvider(name: string, provider: Provider) {
    this.config.providers[name] = provider;
    this.save();
  }

  updateProvider(name: string, updates: Partial<Provider>) {
    if (!this.config.providers[name]) {
      throw new Error(`Provider '${name}' not found.`);
    }
    this.config.providers[name] = { ...this.config.providers[name], ...updates };
    this.save();
  }

  removeProvider(name: string) {
    if (name === this.config.defaultProvider) {
      throw new Error(`Cannot remove the default provider. Change default first.`);
    }
    delete this.config.providers[name];
    this.save();
  }

  // ─── API Key Management ──────────────────────────────────────────────────
  setApiKey(provider: string, apiKey: string) {
    if (!this.config.providers[provider]) {
      throw new Error(`Provider '${provider}' not found.`);
    }
    this.config.providers[provider].apiKey = apiKey;
    this.save();
  }

  // ─── Resolve for Agent ───────────────────────────────────────────────────
  resolveForAgent(): { apiKey: string; baseURL: string; model: string } {
    const provider = this.getProvider();
    if (!provider?.apiKey) {
      throw new Error(
        `No API key configured for '${this.config.defaultProvider}'.\n` +
        `Run: sakura-code config` + ` to set up your API key.`
      );
    }

    return {
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      model: this.config.defaultModel,
    };
  }

  // ─── Display ─────────────────────────────────────────────────────────────
  display(): string {
    const lines: string[] = [];
    lines.push(`Config file: ${this.configPath}`);
    lines.push(`Default provider: ${this.config.defaultProvider}`);
    lines.push(`Default model: ${this.config.defaultModel}`);
    lines.push("");
    lines.push("Providers:");

    for (const [name, provider] of Object.entries(this.config.providers)) {
      const isDefault = name === this.config.defaultProvider;
      const marker = isDefault ? " (default)" : "";
      const keyDisplay = provider.apiKey ? "****" + provider.apiKey.slice(-4) : "(not set)";
      lines.push(`  ${name}${marker}`);
      lines.push(`    URL: ${provider.baseURL}`);
      lines.push(`    Key: ${keyDisplay}`);
      if (provider.models?.length) {
        lines.push(`    Models: ${provider.models.join(", ")}`);
      }
    }

    return lines.join("\n");
  }
}
