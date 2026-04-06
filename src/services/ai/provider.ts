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

export interface AIProvider {
  name: string;
  review(systemPrompt: string, userPrompt: string): Promise<{
    text: string;
    model: string;
  }>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function parseReviewResponse(
  rawText: string,
  provider: string,
  model: string,
  durationMs: number,
  maxScore: number,
): ReviewResult {
  const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const payload = match ? match[0] : cleaned;

  let parsed: any;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error(`${provider} returned invalid JSON.`);
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
  const inferredTotal = computedTotal > 0 ? computedTotal : averageFileScore ?? 0;
  const totalScore = clamp(Number.isFinite(providedTotal) ? providedTotal : inferredTotal, 0, maxScore);

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
