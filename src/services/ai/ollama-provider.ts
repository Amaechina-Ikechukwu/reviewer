import type { AIProvider } from "./provider";

export class OllamaProvider implements AIProvider {
  name = "ollama";
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.model = process.env.OLLAMA_MODEL || "gemma3:12b";
  }

  async review(systemPrompt: string, userPrompt: string) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: "json",
        options: {
          temperature: 0.2,
          num_predict: 4096,
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}.`);
    }

    const data = await response.json();
    return {
      text: String(data?.message?.content || ""),
      model: this.model,
    };
  }
}
