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
  return `You are an experienced frontend engineering instructor reviewing a student's code submission.

Evaluate the submission against the assignment requirements and rubric.
Be encouraging but honest. Reward correctness and understanding, not just surface polish.

Return only valid JSON. No markdown fences. No explanatory text before or after the JSON.`;
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

Respond in this exact JSON shape:
{
  "summary": "2-3 sentence overall assessment",
  "criteria": [
    {
      "name": "Criterion name",
      "score": 0,
      "maxScore": 0,
      "comment": "Specific feedback"
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

The criteria should reflect the rubric. Scores must add up to totalScore and totalScore must not exceed ${input.maxScore}.

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
