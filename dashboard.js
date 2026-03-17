const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const LOCAL_API_KEY = "openrouter_api_key";

const ui = {
  apiKey: document.getElementById("apiKey"),
  loadModelsButton: document.getElementById("loadModelsButton"),
  modelSearch: document.getElementById("modelSearch"),
  model: document.getElementById("model"),
  modelMeta: document.getElementById("modelMeta"),
  modelError: document.getElementById("modelError"),
  modelDetails: document.getElementById("modelDetails"),
  inputTokens: document.getElementById("inputTokens"),
  outputTokens: document.getElementById("outputTokens"),
  inputCostPer1k: document.getElementById("inputCostPer1k"),
  outputCostPer1k: document.getElementById("outputCostPer1k"),
  requestsPerDay: document.getElementById("requestsPerDay"),
  usdToInrRate: document.getElementById("usdToInrRate"),
  usagePreset: document.getElementById("usagePreset"),
  applyPresetButton: document.getElementById("applyPresetButton"),
  presetDescription: document.getElementById("presetDescription"),
  inputCostValue: document.getElementById("inputCostValue"),
  outputCostValue: document.getElementById("outputCostValue"),
  totalCostValue: document.getElementById("totalCostValue"),
  dailyCostValue: document.getElementById("dailyCostValue"),
  monthlyCostValue: document.getElementById("monthlyCostValue"),
  inputCostInrValue: document.getElementById("inputCostInrValue"),
  outputCostInrValue: document.getElementById("outputCostInrValue"),
  totalCostInrValue: document.getElementById("totalCostInrValue"),
  dailyCostInrValue: document.getElementById("dailyCostInrValue"),
  monthlyCostInrValue: document.getElementById("monthlyCostInrValue"),
  calcError: document.getElementById("calcError"),
};

/** @type {Array<{id: string, name: string, context_length?: number, description?: string, pricing?: {prompt?: string, completion?: string}}>} */
let allModels = [];
let visibleModels = [];

const usagePresets = {
  "basic-chat": {
    inputTokens: 1000,
    outputTokens: 300,
    requestsPerDay: 50,
    description: "Matches typical 100-300 token replies + small context",
  },
  "chat-with-history": {
    inputTokens: 4000,
    outputTokens: 400,
    requestsPerDay: 40,
    description: "Real apps send full history -> 3k-4k input",
  },
  "study-mode": {
    inputTokens: 2000,
    outputTokens: 600,
    requestsPerDay: 30,
    description: "Slightly longer explanations",
  },
  copywriting: {
    inputTokens: 1500,
    outputTokens: 1000,
    requestsPerDay: 25,
    description: "Output-heavy but not insane",
  },
  "coding-help": {
    inputTokens: 4000,
    outputTokens: 800,
    requestsPerDay: 30,
    description: "Logs + code inflate input heavily",
  },
  "heavy-coding-agents": {
    inputTokens: 8000,
    outputTokens: 1500,
    requestsPerDay: 20,
    description: "Multi-step reasoning, larger context",
  },
  "research-deep-tasks": {
    inputTokens: 7000,
    outputTokens: 1000,
    requestsPerDay: 15,
    description: "Big input, controlled output",
  },
  "automation-high-volume": {
    inputTokens: 500,
    outputTokens: 150,
    requestsPerDay: 200,
    description: "Small calls but high frequency",
  },
  "extreme-agent-workflow": {
    inputTokens: 25000,
    outputTokens: 4000,
    requestsPerDay: 10,
    description: "Real agent systems can hit 20k+ tokens per task",
  },
};

const roundTo6 = (value) => Number(value.toFixed(6));
const money = (value) => `$${roundTo6(value).toFixed(6)}`;
const moneyInr = (value) => `₹${Number(value).toFixed(2)}`;

const readNonNegative = (name, raw) => {
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new Error(`"${name}" must be a finite number.`);
  }
  if (parsed < 0) {
    throw new Error(`"${name}" cannot be negative.`);
  }
  return parsed;
};

const calculateTokenCost = (request) => {
  const inputCost = (request.input_tokens / 1_000_000) * request.input_cost_per_mtok;
  const outputCost = (request.output_tokens / 1_000_000) * request.output_cost_per_mtok;
  return {
    input_cost: roundTo6(inputCost),
    output_cost: roundTo6(outputCost),
    total_cost: roundTo6(inputCost + outputCost),
  };
};

const tokenPriceToPerMTok = (tokenPriceRaw) => {
  const tokenPrice = Number(tokenPriceRaw || "0");
  if (Number.isNaN(tokenPrice) || !Number.isFinite(tokenPrice) || tokenPrice < 0) {
    return 0;
  }
  return roundTo6(tokenPrice * 1_000_000);
};

const stringOrNA = (value) => {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }
  return String(value);
};

const usdString = (rawValue) => {
  const parsed = Number(rawValue || "0");
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
    return "N/A";
  }
  return `$${parsed.toFixed(6)}`;
};

const renderModelDetails = (model) => {
  if (!model) {
    ui.modelDetails.innerHTML = "";
    return;
  }

  const pricing = model.pricing || {};
  const promptPerToken = Number(pricing.prompt || "0");
  const completionPerToken = Number(pricing.completion || "0");
  const requestPerToken = Number(pricing.request || "0");
  const imagePerToken = Number(pricing.image || "0");

  const createdDate =
    typeof model.created === "number" ? new Date(model.created * 1000).toISOString() : "N/A";
  const supportedParameters = Array.isArray(model.supported_parameters)
    ? model.supported_parameters.join(", ")
    : "N/A";
  const inputModalities = Array.isArray(model.architecture?.input_modalities)
    ? model.architecture.input_modalities.join(", ")
    : "N/A";
  const outputModalities = Array.isArray(model.architecture?.output_modalities)
    ? model.architecture.output_modalities.join(", ")
    : "N/A";

  const detailItems = [
    ["ID", stringOrNA(model.id)],
    ["Canonical slug", stringOrNA(model.canonical_slug)],
    ["Name", stringOrNA(model.name)],
    ["Created", createdDate],
    ["Context length", stringOrNA(model.context_length)],
    ["Description", stringOrNA(model.description)],
    ["Prompt cost / token", usdString(promptPerToken)],
    ["Completion cost / token", usdString(completionPerToken)],
    ["Request cost / token", usdString(requestPerToken)],
    ["Image cost / token", usdString(imagePerToken)],
    ["Prompt cost / MTok", `$${tokenPriceToPerMTok(pricing.prompt).toFixed(6)}`],
    ["Completion cost / MTok", `$${tokenPriceToPerMTok(pricing.completion).toFixed(6)}`],
    ["Request cost / MTok", `$${tokenPriceToPerMTok(pricing.request).toFixed(6)}`],
    ["Image cost / MTok", `$${tokenPriceToPerMTok(pricing.image).toFixed(6)}`],
    ["Architecture modality", stringOrNA(model.architecture?.modality)],
    ["Input modalities", inputModalities],
    ["Output modalities", outputModalities],
    ["Tokenizer", stringOrNA(model.architecture?.tokenizer)],
    ["Instruct type", stringOrNA(model.architecture?.instruct_type)],
    ["Top provider moderated", stringOrNA(model.top_provider?.is_moderated)],
    ["Top provider max completion tokens", stringOrNA(model.top_provider?.max_completion_tokens)],
    ["Supported parameters", supportedParameters],
  ];

  ui.modelDetails.innerHTML = `
    <div class="details-grid">
      ${detailItems
        .map(
          ([label, value]) => `
            <div class="detail-item">
              <span class="detail-label">${label}</span>
              <span class="detail-value">${value}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
};

const setModelPricing = (modelId) => {
  const model = allModels.find((item) => item.id === modelId);
  if (!model) {
    return;
  }

  const inputPerMTok = tokenPriceToPerMTok(model.pricing?.prompt);
  const outputPerMTok = tokenPriceToPerMTok(model.pricing?.completion);

  ui.inputCostPer1k.value = String(inputPerMTok);
  ui.outputCostPer1k.value = String(outputPerMTok);
  ui.modelMeta.textContent = `${model.name || model.id} | Context: ${model.context_length || "N/A"} | Input/MTok: $${inputPerMTok.toFixed(6)} | Output/MTok: $${outputPerMTok.toFixed(6)}`;
  renderModelDetails(model);
};

const renderModelOptions = () => {
  ui.model.innerHTML = "";
  if (visibleModels.length === 0) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "No models found";
    ui.model.append(empty);
    ui.modelDetails.innerHTML = "";
    return;
  }

  visibleModels.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = `${model.id}${model.name ? ` - ${model.name}` : ""}`;
    ui.model.append(option);
  });

  ui.model.value = visibleModels[0].id;
  setModelPricing(ui.model.value);
  renderCosts();
};

const filterModels = () => {
  const query = ui.modelSearch.value.trim().toLowerCase();
  visibleModels = allModels.filter((model) => {
    const haystack = `${model.id} ${model.name || ""} ${model.description || ""}`.toLowerCase();
    return haystack.includes(query);
  });
  renderModelOptions();
};

const loadModels = async () => {
  ui.modelError.textContent = "";
  ui.modelMeta.textContent = "Loading models...";
  const apiKey = ui.apiKey.value.trim();
  if (!apiKey) {
    ui.modelError.textContent = "OpenRouter API key is required.";
    ui.modelMeta.textContent = "";
    return;
  }

  try {
    localStorage.setItem(LOCAL_API_KEY, apiKey);

    const response = await fetch(OPENROUTER_MODELS_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Model fetch failed with status ${response.status}.`);
    }

    const payload = await response.json();
    if (!payload?.data || !Array.isArray(payload.data)) {
      throw new Error("Unexpected API response. Expected a 'data' array.");
    }

    allModels = payload.data;
    visibleModels = [...allModels];
    renderModelOptions();
    ui.modelMeta.textContent = `Loaded ${allModels.length} models from OpenRouter.`;
  } catch (error) {
    ui.modelMeta.textContent = "";
    ui.modelError.textContent = error instanceof Error ? error.message : "Failed to load models.";
  }
};

const renderCosts = () => {
  try {
    const request = {
      input_tokens: readNonNegative("input_tokens", ui.inputTokens.value),
      output_tokens: readNonNegative("output_tokens", ui.outputTokens.value),
      input_cost_per_mtok: readNonNegative(
        "input_cost_per_mtok",
        ui.inputCostPer1k.value,
      ),
      output_cost_per_mtok: readNonNegative(
        "output_cost_per_mtok",
        ui.outputCostPer1k.value,
      ),
    };

    const requestsPerDay = readNonNegative("requestsPerDay", ui.requestsPerDay.value);
    const usdToInrRate = readNonNegative("usdToInrRate", ui.usdToInrRate.value);
    const cost = calculateTokenCost(request);
    const dailyCost = roundTo6(cost.total_cost * requestsPerDay);
    const monthlyCost = roundTo6(dailyCost * 30);
    const inrCosts = {
      input: cost.input_cost * usdToInrRate,
      output: cost.output_cost * usdToInrRate,
      total: cost.total_cost * usdToInrRate,
      daily: dailyCost * usdToInrRate,
      monthly: monthlyCost * usdToInrRate,
    };

    ui.calcError.textContent = "";
    ui.inputCostValue.textContent = money(cost.input_cost);
    ui.outputCostValue.textContent = money(cost.output_cost);
    ui.totalCostValue.textContent = money(cost.total_cost);
    ui.dailyCostValue.textContent = money(dailyCost);
    ui.monthlyCostValue.textContent = money(monthlyCost);
    ui.inputCostInrValue.textContent = moneyInr(inrCosts.input);
    ui.outputCostInrValue.textContent = moneyInr(inrCosts.output);
    ui.totalCostInrValue.textContent = moneyInr(inrCosts.total);
    ui.dailyCostInrValue.textContent = moneyInr(inrCosts.daily);
    ui.monthlyCostInrValue.textContent = moneyInr(inrCosts.monthly);
  } catch (error) {
    ui.calcError.textContent = error instanceof Error ? error.message : "Invalid input.";
  }
};

const applyUsagePreset = () => {
  const selectedPreset = ui.usagePreset.value;
  if (!selectedPreset || !usagePresets[selectedPreset]) {
    ui.presetDescription.textContent = "Custom values.";
    return;
  }

  const preset = usagePresets[selectedPreset];
  ui.inputTokens.value = String(preset.inputTokens);
  ui.outputTokens.value = String(preset.outputTokens);
  ui.requestsPerDay.value = String(preset.requestsPerDay);
  ui.presetDescription.textContent = preset.description;
  renderCosts();
};

const initialize = () => {
  const savedKey = localStorage.getItem(LOCAL_API_KEY);
  if (savedKey) {
    ui.apiKey.value = savedKey;
  }

  ui.loadModelsButton.addEventListener("click", loadModels);
  ui.modelSearch.addEventListener("input", filterModels);
  ui.model.addEventListener("change", () => {
    setModelPricing(ui.model.value);
    renderCosts();
  });
  ui.applyPresetButton.addEventListener("click", applyUsagePreset);
  ui.usagePreset.addEventListener("change", applyUsagePreset);

  [
    ui.inputTokens,
    ui.outputTokens,
    ui.inputCostPer1k,
    ui.outputCostPer1k,
    ui.requestsPerDay,
    ui.usdToInrRate,
  ].forEach((element) => {
    element.addEventListener("input", renderCosts);
  });

  ui.inputCostPer1k.value = "2.000000";
  ui.outputCostPer1k.value = "8.000000";
  ui.usagePreset.value = "basic-chat";
  applyUsagePreset();
  renderCosts();
};

initialize();
