import type { CodeFile } from "../code-reader";

export interface PromptInput {
  assignmentTitle: string;
  assignmentDescription: string;
  rubric: string;
  maxScore: number;
  assignmentSourceType?: string;
  assignmentSourceMarkdown?: string | null;
  assignmentSourceUrl?: string | null;
  /** Set when this submission belongs to a per-group project — the group's own brief takes precedence. */
  groupContext?: {
    name: string;
    description?: string | null;
    rubric?: string | null;
    sourceType?: string | null;
    sourceUrl?: string | null;
  } | null;
  /** True when a PDF brief has been attached as a multimodal part. The model is told to read it directly. */
  hasPdfBrief?: boolean;
  codeFiles: CodeFile[];
}

export function buildSystemPrompt() {
  return `You are a STRICT engineering grader. Your job is to mark code accurately against a rubric — not to encourage, not to be kind, not to give the benefit of the doubt.

NON-NEGOTIABLE GRADING RULES:
1. Award points ONLY for rubric items that are demonstrably implemented in the submitted code. "Looks like they tried" earns 0.
2. If a rubric requirement is missing, broken, stubbed, or only partially present, award PARTIAL or ZERO — never full marks.
3. Every criterion score MUST be justified by a concrete evidence quote: a filename and either a line snippet (5–15 chars) or a specific function/element name from the student's code. If you cannot cite evidence, the score for that criterion is 0.
4. Do not invent features the student did not implement. If the code does not contain it, it does not exist.
5. A perfect score (full marks on a criterion) requires ALL of: requirement fully implemented, no bugs, no missing edge cases listed in the rubric, and code that actually runs as described.
6. Default posture: skeptical. If unsure whether something works, score it LOWER, not higher.
7. The total score MUST equal the sum of criterion scores. Do not inflate totalScore beyond what the criteria justify.
8. Empty submissions, placeholder code, "TODO" stubs, or files that don't address the assignment receive 0 — regardless of effort or formatting.

SCORING ANCHORS (per criterion, as fraction of its maxScore):
- 100%: fully and correctly implemented, with evidence.
- 70-90%: implemented but with minor bugs, missing edge cases, or weak code quality.
- 40-60%: partially implemented — core idea attempted, key parts missing or broken.
- 10-30%: minimal attempt, mostly missing or non-functional.
- 0%: not attempted, irrelevant, or no evidence in the submission.

ANTI-INFLATION GUARD: Before finalizing, re-read your criterion scores. If totalScore is above 70% of maxScore, you must be able to point to specific evidence for EVERY rubric requirement. If you cannot, lower the scores.

Return only valid JSON. No markdown fences. No prose before or after the JSON.`;
}

/** Rough chars-per-token for source code. Used for a conservative size budget. */
const CHARS_PER_TOKEN = 3.5;
/** Leave this many tokens for the model's output + static prompt overhead. */
const OUTPUT_BUDGET_TOKENS = 8_000;
/** Max context we assume any provider can handle safely (most support 128k+). */
const MAX_CONTEXT_TOKENS = 120_000;
const MAX_CODE_CHARS = Math.floor((MAX_CONTEXT_TOKENS - OUTPUT_BUDGET_TOKENS) * CHARS_PER_TOKEN);
/** Per-file cap so a single giant file doesn't consume the whole budget. */
const MAX_FILE_CHARS = 40_000;

function truncateCodeSection(files: PromptInput["codeFiles"]): string {
  let totalChars = 0;
  const parts: string[] = [];

  for (const file of files) {
    const header = `--- ${file.filename} (${file.language}) ---\n`;
    let content = file.content;

    // Truncate a single file that is too large
    if (content.length > MAX_FILE_CHARS) {
      content =
        content.slice(0, MAX_FILE_CHARS) +
        `\n\n[... truncated: file is ${content.length.toLocaleString()} chars, showing first ${MAX_FILE_CHARS.toLocaleString()} ...]`;
    }

    const chunk = header + content;

    // Stop adding files once the total budget is exhausted
    if (totalChars + chunk.length > MAX_CODE_CHARS) {
      const remaining = files.length - parts.length;
      parts.push(
        `[... ${remaining} more file(s) omitted — submission exceeds context limit. Review above files only. ...]`,
      );
      break;
    }

    parts.push(chunk);
    totalChars += chunk.length;
  }

  return parts.join("\n\n");
}

export function buildUserPrompt(input: PromptInput) {
  const fileList = input.codeFiles.map((file) => file.filename).join(", ");
  const codeSection = truncateCodeSection(input.codeFiles);

  const group = input.groupContext;
  const effectiveDescription = (group?.description?.trim() || input.assignmentDescription || "").trim();
  const effectiveRubric = (group?.rubric?.trim() || input.rubric || "").trim();
  const effectiveSourceType = group?.sourceType || input.assignmentSourceType || "manual";
  const effectiveSourceUrl = group?.sourceUrl || input.assignmentSourceUrl || null;
  const effectiveMarkdown = (group?.description?.trim() || input.assignmentSourceMarkdown || "").trim();

  const briefHeader = input.hasPdfBrief
    ? "A PDF BRIEF IS ATTACHED to this request. Read it carefully — it is the authoritative source of the assignment requirements and rubric. The text below is supplementary."
    : "The text below is the authoritative source of the assignment requirements and rubric.";

  const groupBlock = group
    ? `\nGroup: ${group.name}\nThis submission is from a group project. The brief and rubric for THIS group (above) override the assignment-level defaults — grade against the group's own requirements.\n`
    : "";

  return `${briefHeader}
${groupBlock}
Assignment Title: ${input.assignmentTitle}

Assignment Description / Brief:
${effectiveDescription || "None provided"}

Rubric (Total ${input.maxScore} points):
${effectiveRubric || "No explicit rubric — infer reasonable criteria from the brief."}

Brief Source Type:
${effectiveSourceType}

Brief Markdown / Notes:
${effectiveMarkdown || "None provided"}

Brief Link:
${effectiveSourceUrl || "None provided"}

Submission File Inventory:
${fileList || "No files found"}

Student Code:
${codeSection}

Before scoring, identify the discrete rubric requirements. For each requirement, decide MET / PARTIAL / NOT MET based on evidence in the submitted code. Then convert to a score using the anchors in the system prompt. Missing files, empty files, or unrelated code = NOT MET = 0.

Respond in this exact JSON shape:
{
  "summary": "2-3 sentence overall assessment. State plainly what is missing or broken — do not soften.",
  "criteria": [
    {
      "name": "Criterion name (copy verbatim from the rubric where possible)",
      "score": 0,
      "maxScore": 0,
      "comment": "Start with verdict: MET / PARTIAL / NOT MET. Then cite evidence: filename + a short quoted snippet or specific identifier from the student's code. If NOT MET, state exactly what is missing. No vague praise."
    }
  ],
  "suggestions": ["Actionable suggestion"],
  "codeQualityNotes": "Notes on structure, readability, and best practices",
  "submissionStructure": {
    "classification": "one_file_per_question | multi_file_per_question | single_project_solution | mixed_or_unclear",
    "confidence": "high | medium | low",
    "explanation": "How the files appear to map to the assignment questions"
  },
  "fileScores": [
    {
      "filename": "answer-one.html",
      "score": 0,
      "maxScore": ${input.maxScore},
      "summary": "How this file performed as an answer or contribution"
    }
  ],
  "questionGroups": [
    {
      "label": "Question 1",
      "files": ["file-a.html", "file-a.js"],
      "reasoning": "Why these files belong to this question or answer group"
    }
  ],
  "totalScore": 0
}

The criteria MUST reflect the rubric exactly. The sum of criterion scores MUST equal totalScore, and totalScore MUST NOT exceed ${input.maxScore}. Do not round up. Do not award sympathy points. If the submission is empty or off-topic, totalScore is 0.

Final check before responding: for any criterion you scored at full marks, you must have cited concrete evidence from the student's code in the comment. If you did not, lower that score.

For submissionStructure:
- Use "one_file_per_question" when each file mostly looks like its own answer to a different question.
- Use "multi_file_per_question" when several files appear to belong together for one question and different groups map to different questions.
- Use "single_project_solution" when the files work together as one combined solution rather than separate question answers.
- Use "mixed_or_unclear" when the mapping is ambiguous.

For fileScores:
- Include one entry per file when you can reasonably judge that file on its own.
- Use the full assignment scale of ${input.maxScore} for each file score so the frontend can compute a simple average.
- When files are tightly coupled and should not be graded independently, return an empty array.

Use questionGroups to show how files appear to map to questions or answer groups.`; 
}
