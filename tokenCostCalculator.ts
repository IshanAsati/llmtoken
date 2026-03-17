type NumericInput = number;

export interface TokenCostRequest {
  input_tokens: NumericInput;
  output_tokens: NumericInput;
  input_cost_per_1k_tokens: NumericInput;
  output_cost_per_1k_tokens: NumericInput;
}

export interface ModelPricing {
  input_cost_per_1k_tokens: NumericInput;
  output_cost_per_1k_tokens: NumericInput;
}

export type PricingByModel = Record<string, ModelPricing>;

export interface TokenCostBreakdown {
  input_cost: number;
  output_cost: number;
  total_cost: number;
}

export interface MarginEstimate extends TokenCostBreakdown {
  margin_percentage: number;
  margin_amount: number;
  total_with_margin: number;
}

export interface BatchCostResult {
  index: number;
  success: boolean;
  result?: TokenCostBreakdown;
  error?: string;
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const roundTo6 = (value: number): number => Number(value.toFixed(6));

const assertFiniteNonNegative = (name: string, value: number): void => {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new ValidationError(`"${name}" must be a finite number.`);
  }
  if (value < 0) {
    throw new ValidationError(`"${name}" cannot be negative.`);
  }
};

const validateTokenCostRequest = (request: TokenCostRequest): void => {
  assertFiniteNonNegative("input_tokens", request.input_tokens);
  assertFiniteNonNegative("output_tokens", request.output_tokens);
  assertFiniteNonNegative("input_cost_per_1k_tokens", request.input_cost_per_1k_tokens);
  assertFiniteNonNegative("output_cost_per_1k_tokens", request.output_cost_per_1k_tokens);
};

export const calculateTokenCost = (request: TokenCostRequest): TokenCostBreakdown => {
  validateTokenCostRequest(request);

  const inputCost = (request.input_tokens / 1000) * request.input_cost_per_1k_tokens;
  const outputCost = (request.output_tokens / 1000) * request.output_cost_per_1k_tokens;
  const totalCost = inputCost + outputCost;

  return {
    input_cost: roundTo6(inputCost),
    output_cost: roundTo6(outputCost),
    total_cost: roundTo6(totalCost),
  };
};

export const calculateTokenCostByModel = (
  params: { input_tokens: number; output_tokens: number; model: string },
  pricingByModel: PricingByModel,
): TokenCostBreakdown => {
  assertFiniteNonNegative("input_tokens", params.input_tokens);
  assertFiniteNonNegative("output_tokens", params.output_tokens);

  if (!params.model || typeof params.model !== "string") {
    throw new ValidationError(`"model" must be a non-empty string.`);
  }

  const pricing = pricingByModel[params.model];
  if (!pricing) {
    const availableModels = Object.keys(pricingByModel);
    throw new ValidationError(
      `Unknown model "${params.model}". Available models: ${availableModels.join(", ") || "none"}.`,
    );
  }

  return calculateTokenCost({
    input_tokens: params.input_tokens,
    output_tokens: params.output_tokens,
    input_cost_per_1k_tokens: pricing.input_cost_per_1k_tokens,
    output_cost_per_1k_tokens: pricing.output_cost_per_1k_tokens,
  });
};

export const calculateBatchTokenCosts = (requests: TokenCostRequest[]): BatchCostResult[] => {
  if (!Array.isArray(requests)) {
    throw new ValidationError(`"requests" must be an array of token cost requests.`);
  }

  return requests.map((request, index) => {
    try {
      return {
        index,
        success: true,
        result: calculateTokenCost(request),
      };
    } catch (error) {
      return {
        index,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error.",
      };
    }
  });
};

export const estimateCostWithProfitMargin = (
  cost: TokenCostBreakdown,
  marginPercentage: number,
): MarginEstimate => {
  assertFiniteNonNegative("input_cost", cost.input_cost);
  assertFiniteNonNegative("output_cost", cost.output_cost);
  assertFiniteNonNegative("total_cost", cost.total_cost);
  assertFiniteNonNegative("marginPercentage", marginPercentage);

  const marginAmount = cost.total_cost * (marginPercentage / 100);
  const totalWithMargin = cost.total_cost + marginAmount;

  return {
    input_cost: roundTo6(cost.input_cost),
    output_cost: roundTo6(cost.output_cost),
    total_cost: roundTo6(cost.total_cost),
    margin_percentage: roundTo6(marginPercentage),
    margin_amount: roundTo6(marginAmount),
    total_with_margin: roundTo6(totalWithMargin),
  };
};

// Example usage
const modelPricing: PricingByModel = {
  "gpt-4o-mini": { input_cost_per_1k_tokens: 0.00015, output_cost_per_1k_tokens: 0.0006 },
  "gpt-4.1": { input_cost_per_1k_tokens: 0.002, output_cost_per_1k_tokens: 0.008 },
  "claude-sonnet": { input_cost_per_1k_tokens: 0.003, output_cost_per_1k_tokens: 0.015 },
};

const directCost = calculateTokenCost({
  input_tokens: 1500,
  output_tokens: 800,
  input_cost_per_1k_tokens: 0.002,
  output_cost_per_1k_tokens: 0.008,
});

const modelCost = calculateTokenCostByModel(
  {
    input_tokens: 2200,
    output_tokens: 950,
    model: "gpt-4o-mini",
  },
  modelPricing,
);

const batchResults = calculateBatchTokenCosts([
  {
    input_tokens: 1000,
    output_tokens: 500,
    input_cost_per_1k_tokens: 0.0015,
    output_cost_per_1k_tokens: 0.006,
  },
  {
    input_tokens: -10, // Invalid on purpose to demonstrate graceful handling.
    output_tokens: 400,
    input_cost_per_1k_tokens: 0.0015,
    output_cost_per_1k_tokens: 0.006,
  },
]);

const marginEstimate = estimateCostWithProfitMargin(modelCost, 25);

console.log("Direct cost:", directCost);
console.log("Model-based cost:", modelCost);
console.log("Batch results:", batchResults);
console.log("With profit margin:", marginEstimate);

