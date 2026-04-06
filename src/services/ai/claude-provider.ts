import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider } from "./provider";

export class ClaudeProvider implements AIProvider {
  name = "claude";
  private client: Anthropic;
  private model: string;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    }

    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
  }

  async review(systemPrompt: string, userPrompt: string) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const firstBlock = response.content.find((block) => block.type === "text");
    return {
      text: firstBlock?.type === "text" ? firstBlock.text : "",
      model: this.model,
    };
  }
}
