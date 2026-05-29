import OpenAI from "openai";
import type { AIProvider, ReviewAttachment } from "./provider";

/**
 * Curated set of free-tier OpenRouter models. Operators can add more by passing
 * an explicit model id in the request body; the frontend picker uses this list.
 */
// DeepSeek V4 Flash is the default — the review parser strips <think> blocks
// emitted by reasoning models before JSON parsing, so its reasoning output
// is handled safely.
export const FREE_OPENROUTER_MODELS: Array<{ id: string; label: string; note?: string }> = [
  { id: "deepseek/deepseek-v4-flash:free", label: "DeepSeek V4 Flash", note: "DeepSeek · Free · 1M ctx · Reasoning · Recommended" },
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", note: "Google · Free · 262k ctx" },
  { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B A4B", note: "Google · Free · MoE" },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "Nemotron 3 Nano Omni 30B", note: "NVIDIA · Free · Reasoning" },
  { id: "arcee-ai/trinity-large-thinking:free", label: "Arcee Trinity Large Thinking", note: "Arcee · Free · Reasoning" },
  { id: "poolside/laguna-m.1:free", label: "Laguna M.1", note: "Poolside · Free · Code-focused" },
  { id: "poolside/laguna-xs.2:free", label: "Laguna XS.2", note: "Poolside · Free · Fast" },
  { id: "baidu/cobuddy:free", label: "CoBuddy", note: "Baidu · Free" },
];

export const DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || FREE_OPENROUTER_MODELS[0].id;

export class OpenRouterProvider implements AIProvider {
  name = "openrouter";
  private client: OpenAI;
  private model: string;

  constructor(model?: string) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    }

    this.client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        // Optional attribution headers recommended by OpenRouter.
        "HTTP-Referer": process.env.OPENROUTER_REFERRER || "https://reviewer.local",
        "X-Title": process.env.OPENROUTER_TITLE || "Reviewer",
      },
    });
    this.model = model || DEFAULT_OPENROUTER_MODEL;
  }

  async review(systemPrompt: string, userPrompt: string, _attachments?: ReviewAttachment[]) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      top_p: 0.1,
      max_tokens: 4096,
    });

    return {
      text: response.choices[0]?.message?.content || "",
      model: this.model,
    };
  }
}
