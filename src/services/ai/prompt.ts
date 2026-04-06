import type { CodeFile } from "../code-reader";

export interface PromptInput {
  assignmentTitle: string;
  assignmentDescription: string;
  rubric: string;
  maxScore: number;
  assignmentSourceType?: string;
  assignmentSourceMarkdown?: string | null;
  assignmentSourceUrl?: string | null;
  codeFiles: CodeFile[];
}

export function buildSystemPrompt() {
  return `You are an experienced frontend engineering instructor reviewing a student's code submission.

Evaluate the submission against the assignment requirements and rubric.
Be encouraging but honest. Reward correctness and understanding, not just surface polish.

Return only valid JSON. No markdown fences. No explanatory text before or after the JSON.`;
}

export function buildUserPrompt(input: PromptInput) {
  const fileList = input.codeFiles.map((file) => file.filename).join(", ");
  const codeSection = input.codeFiles
    .map((file) => `--- ${file.filename} (${file.language}) ---\n${file.content}`)
    .join("\n\n");

  return `Assignment Title: ${input.assignmentTitle}

Assignment Description:
${input.assignmentDescription}

Rubric (Total ${input.maxScore} points):
${input.rubric}

Original Assignment Source Type:
${input.assignmentSourceType || "manual"}

Original Assignment Markdown / Notes:
${input.assignmentSourceMarkdown || "None provided"}

Original Assignment Link:
${input.assignmentSourceUrl || "None provided"}

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
