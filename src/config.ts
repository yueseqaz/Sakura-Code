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
const GLOBAL_CONFIG_DIR = join(homedir(), ".sakura-code");
const GLOBAL_CONFIG_FILE = join(GLOBAL_CONFIG_DIR, "config.json");
const LOCAL_CONFIG_FILE = ".sakura-code.json";

// ─── Config Manager ──────────────────────────────────────────────────────────
export class ConfigManager {
  private config: Config;
  private configPath: string;

  constructor() {
    this.configPath = this.resolveConfigPath();
    this.config = this.load();
  }

  private resolveConfigPath(): string {
    // 1. Check local config first
    const localPath = resolve(process.cwd(), LOCAL_CONFIG_FILE);
    if (existsSync(localPath)) {
      return localPath;
    }

    // 2. Check global config
    if (existsSync(GLOBAL_CONFIG_FILE)) {
      return GLOBAL_CONFIG_FILE;
    }

    // 3. Create global config if none exists
    this.ensureGlobalConfigDir();
    return GLOBAL_CONFIG_FILE;
  }

  private ensureGlobalConfigDir() {
    if (!existsSync(GLOBAL_CONFIG_DIR)) {
      mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
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
    this.ensureGlobalConfigDir();
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
    // Check environment variables first (highest priority)
    const envApiKey = process.env.OPENAI_API_KEY;
    const envBaseURL = process.env.OPENAI_BASE_URL;
    const envModel = process.env.OPENAI_MODEL;

    if (envApiKey) {
      return {
        apiKey: envApiKey,
        baseURL: envBaseURL ?? this.getProvider()?.baseURL ?? "",
        model: envModel ?? this.config.defaultModel,
      };
    }

    // Use config
    const provider = this.getProvider();
    if (!provider?.apiKey) {
      throw new Error(
        `No API key configured for '${this.config.defaultProvider}'.\n` +
        `Run: sakura-code config set-key ${this.config.defaultProvider} <your-api-key>`
      );
    }

    return {
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      model: envModel ?? this.config.defaultModel,
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
