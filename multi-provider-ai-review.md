# AI Review Engine — Multi-Provider Setup

This replaces the single `ai-reviewer.ts` from the original guide with a provider-agnostic system that supports **Claude**, **Gemini**, and **local models** (Ollama with Gemma 4, DeepSeek, etc.).

---

## Architecture

```
src/services/
├── ai/
│   ├── provider.ts          # Provider interface + factory
│   ├── claude-provider.ts   # Anthropic Claude
│   ├── gemini-provider.ts   # Google Gemini
│   ├── ollama-provider.ts   # Local models via Ollama (Gemma 4, DeepSeek, etc.)
│   ├── prompt.ts            # Shared prompt builder (all providers use same prompt)
│   └── reviewer.ts          # Main reviewer that uses whichever provider is configured
```

---

## Environment Variables

Add these to your `.env`:

```env
# ─── AI Provider Config ───
# Which provider to use: "claude" | "gemini" | "ollama"
AI_PROVIDER=claude

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx
CLAUDE_MODEL=claude-sonnet-4-20250514

# Google Gemini
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXX
GEMINI_MODEL=gemini-2.5-flash

# Ollama (Local - Gemma 4, DeepSeek, etc.)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:27b
# Other options: deepseek-coder-v2, codellama, qwen2.5-coder
```

---

## Dependencies

```bash
# Claude
bun add @anthropic-ai/sdk

# Gemini
bun add @google/genai

# Ollama — no package needed, it's a REST API
```

---

## File 1: `src/services/ai/prompt.ts`

The shared prompt that ALL providers use. This keeps scoring consistent regardless of which AI is doing the review.

```typescript
interface CodeFile {
  filename: string;
  content: string;
  language: string;
}

interface PromptInput {
  assignmentTitle: string;
  assignmentDescription: string;
  rubric: string;
  maxScore: number;
  codeFiles: CodeFile[];
}

export function buildSystemPrompt(): string {
  return `You are an experienced frontend engineering instructor reviewing a student's code submission. You must evaluate the code against the assignment requirements and rubric, then provide a structured score and feedback.

You are fair but thorough. You check for:
- Whether the assignment requirements are actually met
- Code correctness (does it work as expected?)
- Code quality (clean, readable, well-structured)
- Best practices (semantic HTML, proper CSS usage, clean JS)
- Whether the student clearly understands the concepts or just copied code

Be encouraging but honest. Students learn from specific, actionable feedback.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no backticks, no explanation before or after the JSON. Just the raw JSON object.`;
}

export function buildUserPrompt(input: PromptInput): string {
  const { assignmentTitle, assignmentDescription, rubric, maxScore, codeFiles } = input;

  const codeSection = codeFiles
    .map((f) => `--- ${f.filename} (${f.language}) ---\n${f.content}`)
    .join("\n\n");

  return `## Assignment: ${assignmentTitle}

### Description
${assignmentDescription}

### Rubric (Total: ${maxScore} points)
${rubric}

### Student's Submitted Code
${codeSection}

---

Evaluate this submission against the rubric. Return your evaluation as JSON in this exact format:

{
  "summary": "2-3 sentence overall assessment",
  "criteria": [
    {
      "name": "Criterion name from rubric",
      "score": <number>,
      "maxScore": <number>,
      "comment": "Specific feedback for this criterion"
    }
  ],
  "suggestions": ["Specific improvement suggestion 1", "Suggestion 2"],
  "codeQualityNotes": "Notes on code style, structure, best practices",
  "totalScore": <number out of ${maxScore}>
}

Make sure the criteria match what's in the rubric. The scores for each criterion should add up to totalScore.`;
}

export type { CodeFile, PromptInput };
```

---

## File 2: `src/services/ai/provider.ts`

The provider interface that all AI providers implement.

```typescript
export interface ReviewFeedback {
  summary: string;
  criteria: {
    name: string;
    score: number;
    maxScore: number;
    comment: string;
  }[];
  suggestions: string[];
  codeQualityNotes: string;
}

export interface ReviewResult {
  totalScore: number;
  feedback: ReviewFeedback;
  rawResponse: string;
  provider: string;        // Which AI provider was used
  model: string;           // Which model specifically
  durationMs: number;      // How long the review took
}

export interface AIProvider {
  name: string;
  review(systemPrompt: string, userPrompt: string): Promise<{
    text: string;
    model: string;
  }>;
}

/**
 * Parse the raw AI response text into structured feedback.
 * Shared across all providers since they all return the same JSON format.
 */
export function parseReviewResponse(
  rawText: string,
  providerName: string,
  model: string,
  durationMs: number
): ReviewResult {
  // Clean potential markdown fences that some models add
  const cleaned = rawText
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  // Some models wrap in extra text — try to extract JSON
  let jsonStr = cleaned;
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    return {
      totalScore: parsed.totalScore,
      feedback: {
        summary: parsed.summary || "No summary provided.",
        criteria: parsed.criteria || [],
        suggestions: parsed.suggestions || [],
        codeQualityNotes: parsed.codeQualityNotes || "",
      },
      rawResponse: rawText,
      provider: providerName,
      model,
      durationMs,
    };
  } catch (parseErr) {
    console.error(`[${providerName}] Failed to parse response:`, rawText.substring(0, 500));
    throw new Error(
      `${providerName} returned invalid JSON. This sometimes happens with local models. ` +
      `Try a larger model or re-run the review.`
    );
  }
}
```

---

## File 3: `src/services/ai/claude-provider.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider } from "./provider";

export class ClaudeProvider implements AIProvider {
  name = "claude";
  private client: Anthropic;
  private model: string;

  constructor() {
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

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return { text, model: this.model };
  }
}
```

---

## File 4: `src/services/ai/gemini-provider.ts`

```typescript
import { GoogleGenAI } from "@google/genai";
import type { AIProvider } from "./provider";

export class GeminiProvider implements AIProvider {
  name = "gemini";
  private client: GoogleGenAI;
  private model: string;

  constructor() {
    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
    });
    this.model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }

  async review(systemPrompt: string, userPrompt: string) {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 4096,
        temperature: 0.3, // Lower temp for more consistent scoring
        responseMimeType: "application/json", // Force JSON output
      },
    });

    const text = response.text || "";

    return { text, model: this.model };
  }
}
```

---

## File 5: `src/services/ai/ollama-provider.ts`

Works with any model running in Ollama — Gemma 4, DeepSeek Coder, CodeLlama, Qwen, etc.

```typescript
import type { AIProvider } from "./provider";

export class OllamaProvider implements AIProvider {
  name = "ollama";
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.model = process.env.OLLAMA_MODEL || "gemma3:27b";
  }

  async review(systemPrompt: string, userPrompt: string) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 4096,
        },
        // Force JSON output if supported by the model
        format: "json",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const text = data.message?.content || "";

    return { text, model: this.model };
  }
}
```

---

## File 6: `src/services/ai/reviewer.ts`

The main reviewer that ties everything together.

```typescript
import type { AIProvider, ReviewResult } from "./provider";
import { parseReviewResponse } from "./provider";
import { buildSystemPrompt, buildUserPrompt, type CodeFile } from "./prompt";
import { ClaudeProvider } from "./claude-provider";
import { GeminiProvider } from "./gemini-provider";
import { OllamaProvider } from "./ollama-provider";

// ─── Provider Factory ───

function createProvider(providerName?: string): AIProvider {
  const name = providerName || process.env.AI_PROVIDER || "claude";

  switch (name.toLowerCase()) {
    case "claude":
    case "anthropic":
      return new ClaudeProvider();

    case "gemini":
    case "google":
      return new GeminiProvider();

    case "ollama":
    case "local":
    case "gemma":
    case "deepseek":
      return new OllamaProvider();

    default:
      throw new Error(
        `Unknown AI provider: "${name}". Supported: claude, gemini, ollama`
      );
  }
}

// ─── Single Provider Review ───

interface ReviewInput {
  assignmentTitle: string;
  assignmentDescription: string;
  rubric: string;
  maxScore: number;
  codeFiles: CodeFile[];
  provider?: string; // Override the default provider
}

export async function reviewCode(input: ReviewInput): Promise<ReviewResult> {
  const provider = createProvider(input.provider);
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input);

  console.log(`[AI Review] Using provider: ${provider.name}`);
  const startTime = Date.now();

  const { text, model } = await provider.review(systemPrompt, userPrompt);
  const durationMs = Date.now() - startTime;

  console.log(`[AI Review] ${provider.name}/${model} responded in ${durationMs}ms`);

  return parseReviewResponse(text, provider.name, model, durationMs);
}

// ─── Multi-Provider Review (Compare Mode) ───
// Run the same submission through multiple AIs and return all results.
// Useful for calibrating scores or letting you pick the best review.

export async function reviewCodeMulti(
  input: Omit<ReviewInput, "provider">,
  providers: string[] = ["claude", "gemini"]
): Promise<ReviewResult[]> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input);

  const results = await Promise.allSettled(
    providers.map(async (providerName) => {
      const provider = createProvider(providerName);
      const startTime = Date.now();

      const { text, model } = await provider.review(systemPrompt, userPrompt);
      const durationMs = Date.now() - startTime;

      return parseReviewResponse(text, provider.name, model, durationMs);
    })
  );

  // Return only successful results
  return results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<ReviewResult>).value);
}

// ─── List Available Providers ───

export function getAvailableProviders(): {
  name: string;
  configured: boolean;
  model: string;
}[] {
  return [
    {
      name: "claude",
      configured: !!process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
    },
    {
      name: "gemini",
      configured: !!process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    },
    {
      name: "ollama",
      configured: !!process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_MODEL || "gemma3:27b",
    },
  ];
}
```

---

## Updated Route: `src/routes/reviews.ts`

Replace the old reviews route to support provider selection and multi-provider mode.

```typescript
import { db } from "../db/connection";
import { reviews, submissions, assignments } from "../db/schema";
import { eq } from "drizzle-orm";
import { reviewCode, reviewCodeMulti, getAvailableProviders } from "../services/ai/reviewer";
import { readCodeFiles } from "../services/code-reader";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const reviewRoutes = {
  // GET /api/reviews/providers — List available AI providers
  async providers(req: Request, params: Record<string, string>) {
    return json(getAvailableProviders());
  },

  // POST /api/reviews/:submissionId/run — Trigger AI review
  // Body: { provider?: "claude"|"gemini"|"ollama", compare?: boolean }
  async run(req: Request, params: Record<string, string>) {
    const user = (req as any).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can trigger reviews" }, 403);
    }

    const { submissionId } = params;

    // Parse optional body
    let provider: string | undefined;
    let compareMode = false;
    try {
      const body = await req.json();
      provider = body.provider;
      compareMode = body.compare === true;
    } catch {
      // No body is fine, use defaults
    }

    // Get submission + assignment
    const [submission] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!submission) {
      return json({ error: "Submission not found" }, 404);
    }

    const [assignment] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, submission.assignmentId))
      .limit(1);

    if (!assignment) {
      return json({ error: "Assignment not found" }, 404);
    }

    // Create or update review record
    let [existingReview] = await db
      .select()
      .from(reviews)
      .where(eq(reviews.submissionId, submissionId))
      .limit(1);

    if (!existingReview) {
      [existingReview] = await db
        .insert(reviews)
        .values({
          submissionId,
          status: "reviewing",
          maxScore: assignment.maxScore,
        })
        .returning();
    } else {
      await db
        .update(reviews)
        .set({ status: "reviewing" })
        .where(eq(reviews.id, existingReview.id));
    }

    // Read the student's code files
    const codeFiles = await readCodeFiles(submission.filePath!);

    const reviewInput = {
      assignmentTitle: assignment.title,
      assignmentDescription: assignment.description,
      rubric: assignment.rubric,
      maxScore: assignment.maxScore,
      codeFiles,
    };

    try {
      if (compareMode) {
        // Run through multiple providers
        const configuredProviders = getAvailableProviders()
          .filter((p) => p.configured)
          .map((p) => p.name);

        const results = await reviewCodeMulti(reviewInput, configuredProviders);

        // Use the average score or the first result as primary
        const avgScore = Math.round(
          results.reduce((sum, r) => sum + r.totalScore, 0) / results.length
        );

        // Store all results in feedback
        const feedback = {
          ...results[0].feedback,
          comparisons: results.map((r) => ({
            provider: r.provider,
            model: r.model,
            score: r.totalScore,
            durationMs: r.durationMs,
            feedback: r.feedback,
          })),
        };

        await db
          .update(reviews)
          .set({
            status: "completed",
            aiScore: avgScore,
            feedback: feedback as any,
            rawAiResponse: JSON.stringify(
              results.map((r) => ({
                provider: r.provider,
                model: r.model,
                raw: r.rawResponse,
              }))
            ),
            reviewedAt: new Date(),
          })
          .where(eq(reviews.id, existingReview.id));
      } else {
        // Single provider review
        const result = await reviewCode({ ...reviewInput, provider });

        const feedback = {
          ...result.feedback,
          provider: result.provider,
          model: result.model,
          durationMs: result.durationMs,
        };

        await db
          .update(reviews)
          .set({
            status: "completed",
            aiScore: result.totalScore,
            feedback: feedback as any,
            rawAiResponse: result.rawResponse,
            reviewedAt: new Date(),
          })
          .where(eq(reviews.id, existingReview.id));
      }

      const [updated] = await db
        .select()
        .from(reviews)
        .where(eq(reviews.id, existingReview.id))
        .limit(1);

      return json(updated);
    } catch (err: any) {
      await db
        .update(reviews)
        .set({ status: "failed", rawAiResponse: err.message })
        .where(eq(reviews.id, existingReview.id));

      return json({ error: "AI review failed", details: err.message }, 500);
    }
  },

  // GET /api/reviews/:submissionId
  async get(req: Request, params: Record<string, string>) {
    const [review] = await db
      .select()
      .from(reviews)
      .where(eq(reviews.submissionId, params.submissionId))
      .limit(1);

    if (!review) {
      return json({ error: "Review not found" }, 404);
    }

    return json(review);
  },

  // PATCH /api/reviews/:submissionId/override
  async override(req: Request, params: Record<string, string>) {
    const user = (req as any).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can override scores" }, 403);
    }

    const { score } = await req.json();

    const [updated] = await db
      .update(reviews)
      .set({ teacherOverrideScore: score })
      .where(eq(reviews.submissionId, params.submissionId))
      .returning();

    if (!updated) {
      return json({ error: "Review not found" }, 404);
    }

    return json(updated);
  },
};
```

---

## Updated Route Registration in `src/index.ts`

Add the new providers endpoint:

```typescript
// Add this line alongside the other review routes:
addRoute("GET", "/api/reviews/providers", reviewRoutes.providers);
addRoute("POST", "/api/reviews/:submissionId/run", reviewRoutes.run);
addRoute("GET", "/api/reviews/:submissionId", reviewRoutes.get);
addRoute("PATCH", "/api/reviews/:submissionId/override", reviewRoutes.override);
```

---

## Updated Frontend: Provider Selector in `ReviewSubmission.tsx`

Add this to the AI Review section of the ReviewSubmission page. Replace the existing review button area:

```tsx
// Add these state variables at the top of the component:
const [providers, setProviders] = useState<any[]>([]);
const [selectedProvider, setSelectedProvider] = useState<string>("");
const [compareMode, setCompareMode] = useState(false);

// Add this useEffect to load available providers:
useEffect(() => {
  api("/reviews/providers").then((data) => {
    setProviders(data);
    const defaultProvider = data.find((p: any) => p.configured);
    if (defaultProvider) setSelectedProvider(defaultProvider.name);
  });
}, []);

// Update the runReview function:
const runReview = async () => {
  setReviewing(true);
  try {
    const result = await api(`/reviews/${submissionId}/run`, {
      method: "POST",
      body: JSON.stringify({
        provider: selectedProvider || undefined,
        compare: compareMode,
      }),
    });
    setReview(result);
  } catch (err: any) {
    alert("Review failed: " + err.message);
  }
  setReviewing(false);
};

// Replace the review button JSX with this:
{/* AI Review Controls */}
<div style={{ borderTop: "2px solid #eee", paddingTop: 20 }}>
  <h2>AI Review</h2>

  {/* Provider Selection */}
  <div style={{
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
  }}>
    <span style={{ fontWeight: 500 }}>Provider:</span>

    {providers.map((p) => (
      <button
        key={p.name}
        onClick={() => setSelectedProvider(p.name)}
        disabled={!p.configured}
        style={{
          padding: "6px 16px",
          background: selectedProvider === p.name ? "#333" : "#f0f0f0",
          color: selectedProvider === p.name ? "#fff" : p.configured ? "#333" : "#bbb",
          border: "1px solid",
          borderColor: selectedProvider === p.name ? "#333" : "#ddd",
          borderRadius: 20,
          cursor: p.configured ? "pointer" : "not-allowed",
          fontSize: 13,
        }}
      >
        {p.name === "claude" && "🟣 "}
        {p.name === "gemini" && "🔵 "}
        {p.name === "ollama" && "🟢 "}
        {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
        <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>
          ({p.model})
        </span>
        {!p.configured && " ⚠️"}
      </button>
    ))}

    <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
      <input
        type="checkbox"
        checked={compareMode}
        onChange={(e) => setCompareMode(e.target.checked)}
      />
      <span style={{ fontSize: 13 }}>Compare all providers</span>
    </label>
  </div>

  <button
    onClick={runReview}
    disabled={reviewing}
    style={{
      padding: "10px 28px",
      background: reviewing ? "#999" : "#2563eb",
      color: "#fff",
      border: "none",
      borderRadius: 6,
      cursor: reviewing ? "default" : "pointer",
      fontSize: 16,
    }}
  >
    {reviewing
      ? "Reviewing..."
      : review
      ? "Re-run Review"
      : compareMode
      ? "Run All Providers"
      : `Run Review (${selectedProvider})`}
  </button>

  {/* Show comparison results if compare mode was used */}
  {review?.feedback?.comparisons && (
    <div style={{ marginTop: 20 }}>
      <h3>Provider Comparison</h3>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${review.feedback.comparisons.length}, 1fr)`, gap: 16 }}>
        {review.feedback.comparisons.map((comp: any, i: number) => (
          <div key={i} style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ textTransform: "capitalize" }}>{comp.provider}</strong>
              <span style={{ fontSize: 12, color: "#999" }}>{comp.durationMs}ms</span>
            </div>
            <p style={{ fontSize: 11, color: "#666" }}>{comp.model}</p>
            <p style={{
              fontSize: 36,
              fontWeight: "bold",
              margin: "8px 0",
              color: comp.score >= review.maxScore * 0.7 ? "#16a34a" : "#ca8a04",
            }}>
              {comp.score}/{review.maxScore}
            </p>
            <p style={{ fontSize: 13 }}>{comp.feedback.summary}</p>
          </div>
        ))}
      </div>
    </div>
  )}

  {/* Rest of the review display (score, criteria, suggestions) stays the same */}
</div>
```

---

## Ollama Setup Guide (for running Gemma 4 locally)

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull a model
ollama pull gemma3:27b          # Google Gemma 3 27B (best quality/speed balance)
ollama pull gemma3:12b          # Smaller, faster, still good
ollama pull deepseek-coder-v2   # Excellent for code review
ollama pull qwen2.5-coder:14b   # Good code understanding

# 3. Verify it's running
curl http://localhost:11434/api/tags
# Should list your downloaded models

# 4. Test a generation
curl http://localhost:11434/api/chat -d '{
  "model": "gemma3:27b",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}'
```

### Hardware Requirements for Local Models

| Model              | RAM Needed | GPU VRAM  | Speed        | Quality     |
|-------------------|-----------|-----------|-------------|-------------|
| gemma3:4b         | 8GB       | 4GB       | Very fast    | Basic       |
| gemma3:12b        | 16GB      | 8GB       | Fast         | Good        |
| gemma3:27b        | 32GB      | 16GB      | Medium       | Very good   |
| deepseek-coder-v2 | 16GB      | 8GB       | Fast         | Great code  |
| qwen2.5-coder:14b | 16GB      | 10GB      | Fast         | Great code  |

For a classroom setting with 30 students, the 12B models hit a sweet spot — fast enough to review a batch in a few minutes, good enough to give useful feedback.

---

## Cost Comparison

| Provider            | Model                    | Cost per Review* | Best For                          |
|--------------------|--------------------------|-----------------|-----------------------------------|
| Claude             | claude-sonnet-4          | ~₦15-50         | Best quality feedback             |
| Gemini             | gemini-2.5-flash         | Free tier / ~₦5 | Budget-friendly, fast             |
| Ollama (local)     | gemma3:27b               | ₦0 (electricity)| No API costs, privacy, offline    |
| Ollama (local)     | deepseek-coder-v2        | ₦0 (electricity)| Best free option for code         |

*Approximate cost per review assuming ~3,000 tokens input, ~1,500 tokens output.

**Recommendation:** Use Gemini Flash for day-to-day batch reviews (cheapest API option), Claude for when you want the highest-quality feedback on specific submissions, and Ollama/Gemma for when you want zero cost and don't mind running it on your machine.

---

## Strategy: Per-Assignment Provider Selection

You could also add a `default_provider` column to the assignments table so different assignments use different AIs:

```sql
ALTER TABLE assignments ADD COLUMN default_provider VARCHAR(20) DEFAULT 'claude';
```

Then in the review route, if no explicit provider is passed, fall back to the assignment's default:

```typescript
const providerToUse = provider || assignment.defaultProvider || process.env.AI_PROVIDER;
```

This way you could use Claude for complex JS assignments where nuanced feedback matters, and Gemini Flash for simpler HTML/CSS assignments where speed matters more.
