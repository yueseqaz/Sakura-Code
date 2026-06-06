import prompts from "prompts";
import { ConfigManager, type Provider } from "./config.js";

const PROVIDERS = [
  { title: "DeepSeek (Recommended, cost-effective)", value: "deepseek" },
  { title: "OpenAI (GPT-4o)", value: "openai" },
  { title: "Ollama (Local, free)", value: "ollama" },
  { title: "Custom", value: "custom" },
];

// ─── Fetch Models from API ───────────────────────────────────────────────────
async function fetchModels(baseURL: string, apiKey: string): Promise<string[]> {
  try {
    const url = `${baseURL.replace(/\/$/, "")}/models`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.log(`\n⚠️ Failed to fetch models (HTTP ${response.status})`);
      return [];
    }

    const data = await response.json() as { data?: { id: string }[] };
    
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }

    // Extract model IDs and sort
    return data.data
      .map(m => m.id)
      .filter(id => id && typeof id === "string")
      .sort();
  } catch (err) {
    console.log(`\n⚠️ Failed to fetch models: ${(err as Error).message}`);
    return [];
  }
}

// ─── First-time Setup ────────────────────────────────────────────────────────
export async function firstTimeSetup(configManager: ConfigManager): Promise<void> {
  console.log("\n🌸 Welcome to Sakura Code!");
  console.log("Looks like you haven't configured an API yet. Let me help you set up~\n");

  const { provider } = await prompts({
    type: "select",
    name: "provider",
    message: "Which AI provider would you like to use?",
    choices: PROVIDERS,
  });

  if (provider === undefined) {
    console.log("\nSetup cancelled. See you next time ♡");
    process.exit(0);
  }

  let providerName: string;
  let baseURL: string;
  let apiKey: string;
  let models: string[] = [];
  let defaultModel: string;

  if (provider === "custom") {
    const custom = await prompts([
      {
        type: "text",
        name: "name",
        message: "Provider name:",
        validate: (v: string) => v.trim() ? true : "Please enter a name",
      },
      {
        type: "text",
        name: "baseURL",
        message: "API Base URL:",
        validate: (v: string) => v.startsWith("http") ? true : "Please enter a valid URL",
      },
      {
        type: "password",
        name: "apiKey",
        message: "API Key:",
      },
    ]);

    providerName = custom.name;
    baseURL = custom.baseURL;
    apiKey = custom.apiKey;

    // Fetch models from custom provider
    console.log("\nFetching available models...");
    models = await fetchModels(baseURL, apiKey);

    if (models.length > 0) {
      const { model } = await prompts({
        type: "select",
        name: "model",
        message: "Select default model:",
        choices: models.map(m => ({ title: m, value: m })),
      });
      defaultModel = model;
    } else {
      const { model } = await prompts({
        type: "text",
        name: "model",
        message: "Enter default model name:",
        validate: (v: string) => v.trim() ? true : "Please enter a model name",
      });
      defaultModel = model;
      models = [model];
    }
  } else {
    providerName = provider;

    // Get provider-specific base URL
    const providerConfig = getProviderConfig(provider);
    baseURL = providerConfig.baseURL;

    // Get API key
    if (provider === "ollama") {
      apiKey = "ollama";
      console.log("\n💡 Ollama is a local model, no API key needed~");
      console.log("   Make sure Ollama is running: ollama serve\n");
    } else {
      const { key } = await prompts({
        type: "password",
        name: "key",
        message: `Enter ${providerName} API Key:`,
        validate: (v: string) => v.trim() ? true : "Please enter API Key",
      });
      apiKey = key;
    }

    // Fetch models from provider
    console.log("\nFetching available models...");
    models = await fetchModels(baseURL, apiKey);

    if (models.length > 0) {
      const { model } = await prompts({
        type: "select",
        name: "model",
        message: "Select default model:",
        choices: models.map(m => ({ title: m, value: m })),
      });
      defaultModel = model;
    } else {
      // Fallback to manual input
      console.log("\nCould not fetch models. Please enter manually.");
      const { model } = await prompts({
        type: "text",
        name: "model",
        message: "Enter model name:",
        validate: (v: string) => v.trim() ? true : "Please enter a model name",
      });
      defaultModel = model;
      models = [model];
    }
  }

  // Save config
  configManager.addProvider(providerName, {
    baseURL,
    apiKey,
    models,
  });
  configManager.setDefaultProvider(providerName);
  configManager.setDefaultModel(defaultModel);

  console.log("\n✨ Configuration saved to ~/.sakura-code/config.json");
  console.log("   Let's start chatting~ ♡\n");
}

// ─── Interactive Config Menu ─────────────────────────────────────────────────
export async function interactiveConfig(configManager: ConfigManager): Promise<void> {
  let exit = false;

  while (!exit) {
    const { action } = await prompts({
      type: "select",
      name: "action",
      message: "Configuration",
      choices: [
        { title: "📋 Show current config", value: "show" },
        { title: "🔄 Switch provider", value: "switch" },
        { title: "🔑 Update API Key", value: "key" },
        { title: "📦 Change default model", value: "model" },
        { title: "🔄 Refresh models from API", value: "refresh" },
        { title: "➕ Add new provider", value: "add" },
        { title: "❌ Remove provider", value: "remove" },
        { title: "🚪 Back", value: "exit" },
      ],
    });

    if (action === undefined || action === "exit") {
      exit = true;
      continue;
    }

    switch (action) {
      case "show":
        console.log("\n" + configManager.display() + "\n");
        break;

      case "switch":
        await switchProvider(configManager);
        break;

      case "key":
        await updateApiKey(configManager);
        break;

      case "model":
        await updateModel(configManager);
        break;

      case "refresh":
        await refreshModels(configManager);
        break;

      case "add":
        await addProvider(configManager);
        break;

      case "remove":
        await removeProvider(configManager);
        break;
    }
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────
function getProviderConfig(provider: string): { baseURL: string } {
  switch (provider) {
    case "deepseek":
      return { baseURL: "https://api.deepseek.com/v1" };
    case "openai":
      return { baseURL: "https://api.openai.com/v1" };
    case "ollama":
      return { baseURL: "http://localhost:11434/v1" };
    default:
      return { baseURL: "" };
  }
}

async function switchProvider(configManager: ConfigManager): Promise<void> {
  const config = configManager.get();
  const providers = Object.keys(config.providers);

  if (providers.length === 0) {
    console.log("\n⚠️ No providers configured yet~\n");
    return;
  }

  const { provider } = await prompts({
    type: "select",
    name: "provider",
    message: "Select provider",
    choices: providers.map(p => ({
      title: `${p}${p === config.defaultProvider ? " (current)" : ""}`,
      value: p,
    })),
  });

  if (provider) {
    configManager.setDefaultProvider(provider);
    console.log(`\n✓ Switched to ${provider}\n`);
  }
}

async function updateApiKey(configManager: ConfigManager): Promise<void> {
  const config = configManager.get();
  const providers = Object.keys(config.providers);

  const { provider } = await prompts({
    type: "select",
    name: "provider",
    message: "Select provider",
    choices: providers.map(p => ({ title: p, value: p })),
  });

  if (provider) {
    const { apiKey } = await prompts({
      type: "password",
      name: "apiKey",
      message: `Enter new API Key for ${provider}:`,
    });

    if (apiKey) {
      configManager.setApiKey(provider, apiKey);
      console.log(`\n✓ ${provider} API Key updated\n`);
    }
  }
}

async function updateModel(configManager: ConfigManager): Promise<void> {
  const config = configManager.get();
  const provider = config.providers[config.defaultProvider];

  if (!provider) {
    console.log("\n⚠️ Please select a provider first~\n");
    return;
  }

  let choices: { title: string; value: string }[] = [];

  if (provider.models && provider.models.length > 0) {
    choices = provider.models.map(m => ({ title: m, value: m }));
    choices.push({ title: "Other (enter manually)", value: "custom" });
  }

  if (choices.length === 0) {
    // No models stored, ask for manual input
    const { model } = await prompts({
      type: "text",
      name: "model",
      message: "Enter model name:",
      initial: config.defaultModel,
    });

    if (model) {
      configManager.setDefaultModel(model);
      console.log(`\n✓ Default model set to ${model}\n`);
    }
    return;
  }

  const { model } = await prompts({
    type: "select",
    name: "model",
    message: "Select model",
    choices,
  });

  if (model) {
    if (model === "custom") {
      const { customModel } = await prompts({
        type: "text",
        name: "customModel",
        message: "Enter model name:",
      });
      if (customModel) {
        configManager.setDefaultModel(customModel);
        console.log(`\n✓ Default model set to ${customModel}\n`);
      }
    } else {
      configManager.setDefaultModel(model);
      console.log(`\n✓ Default model set to ${model}\n`);
    }
  }
}

async function refreshModels(configManager: ConfigManager): Promise<void> {
  const config = configManager.get();
  const provider = config.providers[config.defaultProvider];

  if (!provider) {
    console.log("\n⚠️ Please select a provider first~\n");
    return;
  }

  console.log(`\nFetching models from ${config.defaultProvider}...`);
  const models = await fetchModels(provider.baseURL, provider.apiKey);

  if (models.length > 0) {
    configManager.updateProvider(config.defaultProvider, { models });
    console.log(`✓ Found ${models.length} models\n`);
  } else {
    console.log("⚠️ No models found or failed to fetch\n");
  }
}

async function addProvider(configManager: ConfigManager): Promise<void> {
  const { name, baseURL, apiKey } = await prompts([
    {
      type: "text",
      name: "name",
      message: "Provider name:",
      validate: (v: string) => v.trim() ? true : "Please enter a name",
    },
    {
      type: "text",
      name: "baseURL",
      message: "API Base URL:",
      validate: (v: string) => v.startsWith("http") ? true : "Please enter a valid URL",
    },
    {
      type: "password",
      name: "apiKey",
      message: "API Key (optional, press Enter to skip):",
    },
  ]);

  if (name && baseURL) {
    // Fetch models
    let models: string[] = [];
    if (apiKey) {
      console.log("\nFetching models...");
      models = await fetchModels(baseURL, apiKey);
    }

    configManager.addProvider(name, {
      baseURL,
      apiKey: apiKey || "",
      models,
    });
    console.log(`\n✓ Provider ${name} added${models.length > 0 ? ` with ${models.length} models` : ""}\n`);
  }
}

async function removeProvider(configManager: ConfigManager): Promise<void> {
  const config = configManager.get();
  const providers = Object.keys(config.providers).filter(p => p !== config.defaultProvider);

  if (providers.length === 0) {
    console.log("\n⚠️ No providers to remove (cannot remove default provider)\n");
    return;
  }

  const { provider } = await prompts({
    type: "select",
    name: "provider",
    message: "Select provider to remove",
    choices: providers.map(p => ({ title: p, value: p })),
  });

  if (provider) {
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Are you sure you want to remove ${provider}?`,
      initial: false,
    });

    if (confirm) {
      configManager.removeProvider(provider);
      console.log(`\n✓ ${provider} removed\n`);
    }
  }
}
