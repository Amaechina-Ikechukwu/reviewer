export interface ReviewFeedback {
  summary: string;
  criteria: Array<{
    name: string;
    score: number;
    maxScore: number;
    comment: string;
  }>;
  suggestions: string[];
  codeQualityNotes: string;
  submissionStructure?: {
    classification: "one_file_per_question" | "multi_file_per_question" | "single_project_solution" | "mixed_or_unclear";
    confidence: "high" | "medium" | "low";
    explanation: string;
  };
  fileScores?: Array<{
    filename: string;
    score: number;
    maxScore: number;
    summary: string;
  }>;
  averageFileScore?: number | null;
  questionGroups?: Array<{
    label: string;
    files: string[];
    reasoning: string;
  }>;
}

export interface ReviewResult {
  totalScore: number;
  feedback: ReviewFeedback;
  rawResponse: string;
  provider: string;
  model: string;
  durationMs: number;
}

export interface ReviewAttachment {
  filename: string;
  mimeType: string;
  /** base64-encoded content */
  data: string;
}

export interface AIProvider {
  name: string;
  review(systemPrompt: string, userPrompt: string, attachments?: ReviewAttachment[]): Promise<{
    text: string;
    model: string;
  }>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function extractJsonObject(text: string): string | null {
  // Find the first '{' and walk forward, tracking depth, until the matching '}'.
  // This is more robust than a greedy regex when the model appends trailing prose
  // (e.g. reasoning models that emit JSON, then a stray sentence).
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseReviewResponse(
  rawText: string,
  provider: string,
  model: string,
  durationMs: number,
  maxScore: number,
): ReviewResult {
  // Strip reasoning/thinking blocks emitted by reasoning models (DeepSeek V4 Flash,
  // Nemotron Reasoning, Trinity Thinking, etc.) before they reach JSON parsing.
  const withoutThinking = rawText
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, "");
  const cleaned = withoutThinking.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const payload = extractJsonObject(cleaned) ?? cleaned;

  let parsed: any;

  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    // Surface a snippet of what the model actually returned so failures are
    // diagnosable from logs without re-running the request.
    const snippet = rawText.slice(0, 400).replace(/\s+/g, " ").trim();
    throw new Error(
      `${provider} (${model}) returned invalid JSON: ${(err as Error).message}. ` +
      `Raw start: "${snippet}${rawText.length > 400 ? "…" : ""}"`,
    );
  }

  const criteria = Array.isArray(parsed.criteria)
    ? parsed.criteria.map((criterion: any) => ({
        name: String(criterion?.name || "Criterion"),
        score: clamp(Number(criterion?.score || 0), 0, maxScore),
        maxScore: clamp(Number(criterion?.maxScore || 0), 0, maxScore),
        comment: String(criterion?.comment || ""),
      }))
    : [];

  const computedTotal = criteria.reduce((sum: number, criterion: { score: number }) => sum + criterion.score, 0);
  const fileScores = Array.isArray(parsed.fileScores)
    ? parsed.fileScores.map((entry: any) => ({
        filename: String(entry?.filename || "Unnamed file"),
        score: clamp(Number(entry?.score || 0), 0, maxScore),
        maxScore: clamp(Number(entry?.maxScore || maxScore), 1, maxScore),
        summary: String(entry?.summary || ""),
      }))
    : [];
  const averageFileScore = fileScores.length > 0
    ? fileScores.reduce((sum: number, entry: { score: number; maxScore: number }) => {
        return sum + ((entry.score / entry.maxScore) * maxScore);
      }, 0) / fileScores.length
    : null;
  const providedTotal = Number(parsed.totalScore);
  // If criteria are present, the sum is authoritative — never let totalScore exceed it.
  // This prevents models from inflating totalScore beyond what the per-criterion breakdown justifies.
  const inferredTotal = criteria.length > 0
    ? computedTotal
    : (averageFileScore ?? (Number.isFinite(providedTotal) ? providedTotal : 0));
  const totalScore = clamp(inferredTotal, 0, maxScore);

  return {
    totalScore,
    feedback: {
      summary: String(parsed.summary || "No summary provided."),
      criteria,
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map((suggestion: unknown) => String(suggestion))
        : [],
      codeQualityNotes: String(parsed.codeQualityNotes || ""),
      submissionStructure: parsed.submissionStructure
        ? {
            classification: [
              "one_file_per_question",
              "multi_file_per_question",
              "single_project_solution",
              "mixed_or_unclear",
            ].includes(String(parsed.submissionStructure.classification))
              ? parsed.submissionStructure.classification
              : "mixed_or_unclear",
            confidence: ["high", "medium", "low"].includes(String(parsed.submissionStructure.confidence))
              ? parsed.submissionStructure.confidence
              : "low",
            explanation: String(parsed.submissionStructure.explanation || ""),
          }
        : undefined,
      fileScores,
      averageFileScore,
      questionGroups: Array.isArray(parsed.questionGroups)
        ? parsed.questionGroups.map((group: any) => ({
            label: String(group?.label || "Unlabeled group"),
            files: Array.isArray(group?.files) ? group.files.map((file: unknown) => String(file)) : [],
            reasoning: String(group?.reasoning || ""),
          }))
        : [],
    },
    rawResponse: rawText,
    provider,
    model,
    durationMs,
  };
}
