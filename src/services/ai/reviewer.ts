import { GeminiProvider } from "./gemini-provider";
import { buildSystemPrompt, buildUserPrompt, type PromptInput } from "./prompt";
import type { ReviewResult } from "./provider";
import { parseReviewResponse } from "./provider";

export type ProviderName = "gemini";

type ProviderDescriptor = {
  name: ProviderName;
  configured: boolean;
  model: string;
};

export function getAvailableProviders(): ProviderDescriptor[] {
  return [
    {
      name: "gemini",
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    },
  ];
}

export async function reviewCode(input: PromptInput): Promise<ReviewResult> {
  const provider = new GeminiProvider();
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input);
  const startedAt = Date.now();

  const { text, model } = await provider.review(systemPrompt, userPrompt);

  return parseReviewResponse(text, provider.name, model, Date.now() - startedAt, input.maxScore);
}
