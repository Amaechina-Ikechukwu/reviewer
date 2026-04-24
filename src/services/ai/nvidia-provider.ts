import OpenAI from "openai";
import type { AIProvider } from "./provider";

export class NvidiaProvider implements AIProvider {
  name = "nvidia";
  private client: OpenAI;
  private model: string;

  constructor() {
    if (!process.env.NVIDIA_API_KEY) {
      throw new Error("NVIDIA_API_KEY is not configured.");
    }

    this.client = new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
    this.model = process.env.NVIDIA_MODEL || "google/gemma-4-31b-it";
  }

  async review(systemPrompt: string, userPrompt: string) {
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
