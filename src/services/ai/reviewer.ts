import { GeminiProvider } from "./gemini-provider";
import { NvidiaProvider } from "./nvidia-provider";
import { DEFAULT_OPENROUTER_MODEL, FREE_OPENROUTER_MODELS, OpenRouterProvider } from "./openrouter-provider";
import { buildSystemPrompt, buildUserPrompt, type PromptInput } from "./prompt";
import type { ReviewAttachment, ReviewResult } from "./provider";
import { parseReviewResponse } from "./provider";

export type ProviderName = "gemini" | "nvidia" | "openrouter";

type ProviderDescriptor = {
  name: ProviderName;
  configured: boolean;
  model: string;
  models?: Array<{ id: string; label: string; note?: string }>;
};

export function getAvailableProviders(): ProviderDescriptor[] {
  return [
    {
      name: "gemini",
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    },
    {
      name: "openrouter",
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      model: DEFAULT_OPENROUTER_MODEL,
      models: FREE_OPENROUTER_MODELS,
    },
    {
      name: "nvidia",
      configured: Boolean(process.env.NVIDIA_API_KEY),
      model: process.env.NVIDIA_MODEL || "google/gemma-4-31b-it",
    },
  ];
}

export async function reviewCode(
  input: PromptInput,
  providerName: ProviderName = "gemini",
  attachments?: ReviewAttachment[],
  model?: string,
): Promise<ReviewResult> {
  const provider =
    providerName === "gemini"
      ? new GeminiProvider()
      : providerName === "openrouter"
        ? new OpenRouterProvider(model)
        : new NvidiaProvider();
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input);
  const startedAt = Date.now();

  const { text, model: usedModel } = await provider.review(systemPrompt, userPrompt, attachments);

  return parseReviewResponse(text, provider.name, usedModel, Date.now() - startedAt, input.maxScore);
}
