import { GoogleGenAI } from "@google/genai";
import type { AIProvider, ReviewAttachment } from "./provider";

export class GeminiProvider implements AIProvider {
  name = "gemini";
  private client: GoogleGenAI;
  private model: string;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    this.model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }

  async review(systemPrompt: string, userPrompt: string, attachments?: ReviewAttachment[]) {
    const parts: any[] = [];
    for (const att of attachments || []) {
      parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
    }
    parts.push({ text: userPrompt });

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

    return {
      text: response.text || "",
      model: this.model,
    };
  }
}
