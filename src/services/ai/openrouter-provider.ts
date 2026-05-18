import OpenAI from "openai";
import type { AIProvider, ReviewAttachment } from "./provider";

/**
 * Curated set of free-tier OpenRouter models. Operators can add more by passing
 * an explicit model id in the request body; the frontend picker uses this list.
 */
export const FREE_OPENROUTER_MODELS: Array<{ id: string; label: string; note?: string }> = [
  { id: "google/gemma-2-9b-it:free", label: "Gemma 2 9B", note: "Google · Free" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", note: "Meta · Free" },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3", note: "DeepSeek · Free" },
  { id: "qwen/qwen-2.5-coder-32b-instruct:free", label: "Qwen 2.5 Coder 32B", note: "Qwen · Free · Code-focused" },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1 24B", note: "Mistral · Free" },
  { id: "nvidia/llama-3.1-nemotron-70b-instruct:free", label: "Nemotron 70B", note: "NVIDIA · Free" },
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
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2048,
    });

    return {
      text: response.choices[0]?.message?.content || "",
      model: this.model,
    };
  }
}
