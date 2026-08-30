import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { isStaffOrGranted } from "../../utils/permissions";
import { json, parseJson } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { audit } from "../services/audit";
import { enqueueEmailJob } from "../services/emailJobs";

type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

type QuizStatus = "draft" | "open" | "closed";

type QuizDoc = {
  id: string;
  title: string;
  description?: string;
  cohortId: string;
  questions: QuizQuestion[];
  secondsPerQuestion: number;
  leaveThreshold: number;
  penaltyPerLeave: number;
  status: QuizStatus;
  resultsReleased?: boolean;
  resultsReleasedAt?: Date | null;
  createdBy: string;
  createdAt: Date;
};

type QuizAttempt = {
  id: string;
  quizId: string;
  studentId: string;
  startedAt: Date;
  submittedAt: Date | null;
  answers: Record<string, number>;
  leaveCount: number;
  rawScore: number;
  penalty: number;
  finalScore: number;
  totalQuestions: number;
  status: "in_progress" | "submitted" | "auto_submitted";
  released?: boolean;
  releasedAt?: Date | null;
};

type CreateBody = {
  title?: string;
  description?: string;
  cohortId?: string;
  questionsJson?: unknown;
  questions?: unknown;
  secondsPerQuestion?: number;
  leaveThreshold?: number;
  penaltyPerLeave?: number;
  status?: QuizStatus;
};

function parseQuestionsInput(input: unknown): { ok: true; questions: QuizQuestion[] } | { ok: false; error: string } {
  let raw = input;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, error: "Questions JSON is empty." };
    try {
      raw = JSON.parse(trimmed);
    } catch (err) {
      return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // Support wrapped { questions: [...] } too (alt shape)
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const wrapped = (raw as any).questions;
    if (Array.isArray(wrapped)) raw = wrapped;
  }

  if (!Array.isArray(raw)) {
    return { ok: false, error: "Questions must be a JSON array." };
  }
  if (raw.length === 0) return { ok: false, error: "Add at least one question." };

  const questions: QuizQuestion[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as any;
    if (!item || typeof item !== "object") {
      return { ok: false, error: `Question ${i + 1} is not an object.` };
    }
    const prompt = String(item.question ?? item.prompt ?? item.q ?? "").trim();
    if (!prompt) return { ok: false, error: `Question ${i + 1} is missing a 'question' field.` };

    const optionsRaw = item.options ?? item.choices;
    if (!Array.isArray(optionsRaw) || optionsRaw.length < 2) {
      return { ok: false, error: `Question ${i + 1} needs an 'options' array with at least 2 choices.` };
    }
    const options = optionsRaw.map((o) => String(o ?? "").trim()).filter(Boolean);
    if (options.length < 2) {
      return { ok: false, error: `Question ${i + 1} needs at least 2 non-empty options.` };
    }

    const answerRaw = item.answer ?? item.correct ?? item.correctAnswer ?? item.correctIndex;
    let correctIndex: number;
    if (typeof answerRaw === "number" && Number.isInteger(answerRaw)) {
      correctIndex = answerRaw;
    } else if (typeof answerRaw === "string") {
      const idx = options.findIndex((o) => o.toLowerCase() === answerRaw.trim().toLowerCase());
      if (idx === -1) {
        return { ok: false, error: `Question ${i + 1}: 'answer' "${answerRaw}" does not match any option.` };
      }
      correctIndex = idx;
    } else {
      return { ok: false, error: `Question ${i + 1} is missing 'answer' (option text or index).` };
    }
    if (correctIndex < 0 || correctIndex >= options.length) {
      return { ok: false, error: `Question ${i + 1}: 'answer' index ${correctIndex} is out of range.` };
    }

    questions.push({
      id: `q_${i}_${randomUUID().slice(0, 8)}`,
      prompt,
      options,
      correctIndex,
    });
  }

  return { ok: true, questions };
}

function publicQuiz(quiz: QuizDoc) {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description ?? "",
    cohortId: quiz.cohortId,
    secondsPerQuestion: quiz.secondsPerQuestion,
    leaveThreshold: quiz.leaveThreshold,
    penaltyPerLeave: quiz.penaltyPerLeave,
    status: quiz.status,
    questionCount: quiz.questions.length,
    resultsReleased: !!quiz.resultsReleased,
    resultsReleasedAt: quiz.resultsReleasedAt ?? null,
    createdAt: quiz.createdAt,
    createdBy: quiz.createdBy,
  };
}

function isReleased(attempt: QuizAttempt, quiz: Pick<QuizDoc, "resultsReleased">): boolean {
  return !!quiz.resultsReleased || !!attempt.released;
}

// What a student is allowed to see about their own attempt before results are released.
// We hide the score, the chosen answers, and the correct answers — they only see that
// it was submitted.
function maskAttemptForStudent(attempt: QuizAttempt, released: boolean): QuizAttempt {
  if (released) return attempt;
  return {
    ...attempt,
    answers: {},
    rawScore: 0,
    penalty: 0,
    finalScore: 0,
  };
}

function sanitizedQuestionsForStudent(quiz: QuizDoc) {
  return quiz.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options }));
}

async function ensureCohort(cohortId: string | undefined): Promise<{ ok: true; cohort: any } | { ok: false; error: string }> {
  if (!cohortId) return { ok: false, error: "A cohort is required." };
  const cohort = await data.getById<any>(COLLECTIONS.cohorts, cohortId);
  if (!cohort) return { ok: false, error: "Cohort not found." };
  return { ok: true, cohort };
}

export const quizRoutes = {
  async create(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "quizzes.manage")) return json({ error: "Access denied." }, 403);

    const body = await parseJson<CreateBody>(request);
    const title = body.title?.trim();
    if (!title) return json({ error: "A quiz title is required." }, 400);

    const cohortCheck = await ensureCohort(body.cohortId);
    if (!cohortCheck.ok) return json({ error: cohortCheck.error }, 400);

    const parsed = parseQuestionsInput(body.questionsJson ?? body.questions);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const secondsPerQuestion = Number.isFinite(Number(body.secondsPerQuestion))
      ? Math.min(600, Math.max(3, Math.floor(Number(body.secondsPerQuestion))))
      : 15;
    const leaveThreshold = Number.isFinite(Number(body.leaveThreshold))
      ? Math.max(1, Math.floor(Number(body.leaveThreshold)))
      : 3;
    const penaltyPerLeave = Number.isFinite(Number(body.penaltyPerLeave))
      ? Math.max(0, Math.floor(Number(body.penaltyPerLeave)))
      : 2;

    const status: QuizStatus = body.status === "open" || body.status === "closed" ? body.status : "draft";

    const id = randomUUID();
    const quiz = await data.insert<QuizDoc>(COLLECTIONS.quizzes, id, {
      title,
      description: body.description?.trim() || "",
      cohortId: cohortCheck.cohort.id,
      questions: parsed.questions,
      secondsPerQuestion,
      leaveThreshold,
      penaltyPerLeave,
      status,
      createdBy: user.userId,
    });

    audit({
      actorId: user.userId,
      actorEmail: user.email,
      action: "quiz.create",
      targetType: "quiz",
      targetId: id,
      details: { title, cohortId: cohortCheck.cohort.id, questionCount: parsed.questions.length },
    });

    return json({ ...publicQuiz(quiz as QuizDoc), questions: (quiz as QuizDoc).questions }, 201);
  },

  async list(request: Request) {
    const user = (request as AuthenticatedRequest).user;

    function sortByCreatedAtDesc<T extends { createdAt: unknown }>(rows: T[]): T[] {
      return rows.slice().sort((a, b) => {
        const ad = a.createdAt ? new Date(a.createdAt as any).getTime() : 0;
        const bd = b.createdAt ? new Date(b.createdAt as any).getTime() : 0;
        return bd - ad;
      });
    }

    if (isStaff(user.role)) {
      const rows = await data.findMany<QuizDoc>(COLLECTIONS.quizzes, {
        where: [["createdBy", "==", user.userId]],
      });
      return json(sortByCreatedAtDesc(rows).map(publicQuiz));
    }

    // Student: open quizzes in their cohort
    const student = await data.getById<any>(COLLECTIONS.users, user.userId);
    if (!student?.cohortId) return json([]);

    const rows = await data.findMany<QuizDoc>(COLLECTIONS.quizzes, {
      where: [
        ["cohortId", "==", student.cohortId],
        ["status", "==", "open"],
      ],
    });

    const myAttempts = await data.findMany<QuizAttempt>(COLLECTIONS.quizAttempts, {
      where: [["studentId", "==", user.userId]],
    });
    const attemptMap = new Map(myAttempts.map((a) => [a.quizId, a]));

    return json(
      sortByCreatedAtDesc(rows).map((q) => {
        const a = attemptMap.get(q.id) ?? null;
        return {
          ...publicQuiz(q),
          myAttempt: a ? maskAttemptForStudent(a, isReleased(a, q)) : null,
        };
      }),
    );
  },

  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const quiz = await data.getById<QuizDoc>(COLLECTIONS.quizzes, params.id);
    if (!quiz) return json({ error: "Quiz not found." }, 404);

    if (isStaff(user.role)) {
      if (quiz.createdBy !== user.userId) return json({ error: "Quiz not found." }, 404);
      return json({ ...publicQuiz(quiz), questions: quiz.questions });
    }

    // Student
    const student = await data.getById<any>(COLLECTIONS.users, user.userId);
    if (!student || student.cohortId !== quiz.cohortId) {
      return json({ error: "Quiz not found." }, 404);
    }
    const myAttempt = await data.findOne<QuizAttempt>(COLLECTIONS.quizAttempts, [
      ["quizId", "==", quiz.id],
      ["studentId", "==", user.userId],
    ]);
    return json({
      ...publicQuiz(quiz),
      myAttempt: myAttempt ? maskAttemptForStudent(myAttempt, isReleased(myAttempt, quiz)) : null,
    });
  },

  async update(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "quizzes.manage")) return json({ error: "Access denied." }, 403);

    const existing = await data.getById<QuizDoc>(COLLECTIONS.quizzes, params.id);
    if (!existing || existing.createdBy !== user.userId) return json({ error: "Quiz not found." }, 404);

    const body = await parseJson<CreateBody>(request);
    const update: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const t = body.title.trim();
      if (!t) return json({ error: "Title cannot be empty." }, 400);
      update.title = t;
    }
    if (body.description !== undefined) update.description = body.description?.trim() || "";

    if (body.cohortId !== undefined) {
      const cohortCheck = await ensureCohort(body.cohortId);
      if (!cohortCheck.ok) return json({ error: cohortCheck.error }, 400);
      update.cohortId = cohortCheck.cohort.id;
    }

    if (body.questionsJson !== undefined || body.questions !== undefined) {
      const existingAttempts = await data.findMany<QuizAttempt>(COLLECTIONS.quizAttempts, {
        where: [["quizId", "==", existing.id]],
      });
      if (existingAttempts.length > 0) {
        return json({ error: "Questions are locked once attempts have been recorded." }, 409);
      }
      const parsed = parseQuestionsInput(body.questionsJson ?? body.questions);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      update.questions = parsed.questions;
    }

    if (body.secondsPerQuestion !== undefined) {
      update.secondsPerQuestion = Math.min(600, Math.max(3, Math.floor(Number(body.secondsPerQuestion))));
    }
    if (body.leaveThreshold !== undefined) {
      update.leaveThreshold = Math.max(1, Math.floor(Number(body.leaveThreshold)));
    }
    if (body.penaltyPerLeave !== undefined) {
      update.penaltyPerLeave = Math.max(0, Math.floor(Number(body.penaltyPerLeave)));
    }
    if (body.status !== undefined) {
      if (!["draft", "open", "closed"].includes(body.status)) {
        return json({ error: "Invalid status." }, 400);
      }
      update.status = body.status;
    }

    if (Object.keys(update).length === 0) return json(publicQuiz(existing));
    const updated = await data.update<QuizDoc>(COLLECTIONS.quizzes, existing.id, update);
    audit({
      actorId: user.userId,
      actorEmail: user.email,
      action: "quiz.update",
      targetType: "quiz",
      targetId: existing.id,
      details: { fields: Object.keys(update) },
    });
    return json({ ...publicQuiz(updated as QuizDoc), questions: (updated as QuizDoc).questions });
  },

  async remove(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "quizzes.manage")) return json({ error: "Access denied." }, 403);

    const quiz = await data.getById<QuizDoc>(COLLECTIONS.quizzes, params.id);
    if (!quiz || quiz.createdBy !== user.userId) return json({ error: "Quiz not found." }, 404);

    await data.delMany(COLLECTIONS.quizAttempts, [["quizId", "==", quiz.id]]);
    await data.del(COLLECTIONS.quizzes, quiz.id);
    audit({
      actorId: user.userId,
      actorEmail: user.email,
      action: "quiz.delete",
      targetType: "quiz",
      targetId: quiz.id,
      details: { title: quiz.title },
    });
    return json({ deleted: true });
  },

  async startAttempt(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "student") return json({ error: "Only students can take quizzes." }, 403);

    const quiz = await data.getById<QuizDoc>(COLLECTIONS.quizzes, params.id);
    if (!quiz) return json({ error: "Quiz not found." }, 404);
    if (quiz.status !== "open") return json({ error: "This quiz is not open." }, 400);

    const student = await data.getById<any>(COLLECTIONS.users, user.userId);
    if (!student || student.cohortId !== quiz.cohortId) {
      return json({ error: "Quiz not found." }, 404);
    }

    const existing = await data.findOne<QuizAttempt>(COLLECTIONS.quizAttempts, [
      ["quizId", "==", quiz.id],
      ["studentId", "==", user.userId],
    ]);
    if (existing) {
      if (existing.status === "in_progress") {
        return json({
          attempt: existing,
          quiz: publicQuiz(quiz),
          questions: sanitizedQuestionsForStudent(quiz),
        });
      }
      return json({ error: "You have already completed this quiz." }, 409);
    }

    const id = randomUUID();
    const attempt = await data.insert<QuizAttempt>(COLLECTIONS.quizAttempts, id, {
      quizId: quiz.id,
      studentId: user.userId,
      startedAt: new Date(),
      submittedAt: null,
      answers: {},
      leaveCount: 0,
      rawScore: 0,
      penalty: 0,
      finalScore: 0,
      totalQuestions: quiz.questions.length,
      status: "in_progress",
    });

    audit({
      actorId: user.userId,
      actorEmail: user.email,
      action: "quiz.attempt.start",
      targetType: "quiz",
      targetId: quiz.id,
      details: { attemptId: id },
    });

    return json({
      attempt,
      quiz: publicQuiz(quiz),
      questions: sanitizedQuestionsForStudent(quiz),
    });
  },

  async registerLeave(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "student") return json({ error: "Only students." }, 403);

    const attempt = await data.getById<QuizAttempt>(COLLECTIONS.quizAttempts, params.attemptId);
    if (!attempt || attempt.studentId !== user.userId) return json({ error: "Attempt not found." }, 404);
    if (attempt.quizId !== params.id) return json({ error: "Attempt does not belong to this quiz." }, 400);
    if (attempt.status !== "in_progress") return json({ leaveCount: attempt.leaveCount, status: attempt.status });

    const updated = await data.update<QuizAttempt>(COLLECTIONS.quizAttempts, attempt.id, {
      leaveCount: (attempt.leaveCount ?? 0) + 1,
    });
    return json({ leaveCount: updated?.leaveCount ?? attempt.leaveCount + 1, status: updated?.status ?? "in_progress" });
  },

  async submitAttempt(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "student") return json({ error: "Only students can submit attempts." }, 403);

    const attempt = await data.getById<QuizAttempt>(COLLECTIONS.quizAttempts, params.attemptId);
    if (!attempt || attempt.studentId !== user.userId) return json({ error: "Attempt not found." }, 404);
    if (attempt.quizId !== params.id) return json({ error: "Attempt does not belong to this quiz." }, 400);
    if (attempt.status !== "in_progress") return json({ error: "This attempt has already been submitted." }, 409);

    const quiz = await data.getById<QuizDoc>(COLLECTIONS.quizzes, attempt.quizId);
    if (!quiz) return json({ error: "Quiz not found." }, 404);

    const body = await parseJson<{ answers?: Record<string, unknown>; auto?: boolean }>(request);
    const submittedAnswers = (body.answers && typeof body.answers === "object") ? body.answers : {};
    const auto = body.auto === true;

    // Score server-side using stored correctIndex
    const answers: Record<string, number> = {};
    let rawScore = 0;
    for (const q of quiz.questions) {
      const raw = submittedAnswers[q.id];
      const idx = typeof raw === "number" && Number.isInteger(raw) ? raw : -1;
      if (idx >= 0 && idx < q.options.length) {
        answers[q.id] = idx;
        if (idx === q.correctIndex) rawScore += 1;
      }
    }

    const leaveCount = attempt.leaveCount ?? 0;
    const penalty = leaveCount * quiz.penaltyPerLeave;
    const finalScore = Math.max(0, rawScore - penalty);

    const updated = await data.update<QuizAttempt>(COLLECTIONS.quizAttempts, attempt.id, {
      answers,
      submittedAt: new Date(),
      rawScore,
      penalty,
      finalScore,
      status: auto ? "auto_submitted" : "submitted",
    });

    audit({
      actorId: user.userId,
      actorEmail: user.email,
      action: auto ? "quiz.attempt.auto_submit" : "quiz.attempt.submit",
      targetType: "quiz",
      targetId: quiz.id,
      details: { attemptId: attempt.id, rawScore, penalty, finalScore, leaveCount },
    });

    // Don't reveal score/answers to the student until the teacher releases results.
    return json(maskAttemptForStudent(updated as QuizAttempt, isReleased(updated as QuizAttempt, quiz)));
  },

  async myAttempt(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "student") return json({ error: "Only students." }, 403);

    const quiz = await data.getById<QuizDoc>(COLLECTIONS.quizzes, params.id);
    if (!quiz) return json({ error: "Quiz not found." }, 404);

    const attempt = await data.findOne<QuizAttempt>(COLLECTIONS.quizAttempts, [
      ["quizId", "==", quiz.id],
      ["studentId", "==", user.userId],
    ]);
    if (!attempt) return json(null);

    const released = isReleased(attempt, quiz);

    // Once submitted AND results have been released (quiz-wide or for this
    // attempt), expose questions + correct answers so the student can review.
    // Until then, hide everything (chosen answers, scores, correct answers).
    if (attempt.status !== "in_progress") {
      if (released) {
        return json({ attempt, quiz: { ...publicQuiz(quiz), questions: quiz.questions } });
      }
      return json({ attempt: maskAttemptForStudent(attempt, false), quiz: publicQuiz(quiz) });
    }
    return json({ attempt, quiz: publicQuiz(quiz) });
  },

  async releaseResults(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "quizzes.manage")) return json({ error: "Access denied." }, 403);

    const quiz = await data.getById<QuizDoc>(COLLECTIONS.quizzes, params.id);
    if (!quiz || quiz.createdBy !== user.userId) return json({ error: "Quiz not found." }, 404);
    if (quiz.resultsReleased) {
      return json({ ...publicQuiz(quiz), alreadyReleased: true });
    }

    const releasedAt = new Date();
    const updated = await data.update<QuizDoc>(COLLECTIONS.quizzes, quiz.id, {
      resultsReleased: true,
      resultsReleasedAt: releasedAt,
    });

    // Email students with a submitted attempt that hasn't already been released
    // individually (those students got their own email when per-attempt release fired).
    const attempts = await data.findMany<QuizAttempt>(COLLECTIONS.quizAttempts, {
      where: [["quizId", "==", quiz.id]],
    });
    const submittedStudentIds = [...new Set(
      attempts
        .filter((a) => a.status !== "in_progress" && !a.released)
        .map((a) => a.studentId),
    )];
    const students = await Promise.all(
      submittedStudentIds.map((id) => data.getById<any>(COLLECTIONS.users, id)),
    );
    const recipients = students
      .filter((s) => s && s.email && !String(s.email).endsWith("@historical.reviewai.local") && s.passwordHash !== "INVITE_PENDING")
      .map((s) => ({ email: s.email as string, fullName: (s.fullName as string) || "Student" }));

    let jobId: string | null = null;
    if (recipients.length > 0) {
      const job = await enqueueEmailJob({
        kind: "quiz_results",
        recipients,
        payload: { id: quiz.id, title: quiz.title },
        actorId: user.userId,
        idempotencyKey: `quiz_results:${quiz.id}`,
      });
      jobId = job.id;
    }

    audit({
      actorId: user.userId,
      actorEmail: user.email,
      action: "quiz.results.release",
      targetType: "quiz",
      targetId: quiz.id,
      details: { recipients: recipients.length, jobId },
    });

    return json({ ...publicQuiz(updated as QuizDoc), notified: recipients.length, jobId });
  },

  async releaseAttempt(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "quizzes.manage")) return json({ error: "Access denied." }, 403);

    const quiz = await data.getById<QuizDoc>(COLLECTIONS.quizzes, params.id);
    if (!quiz || quiz.createdBy !== user.userId) return json({ error: "Quiz not found." }, 404);

    const attempt = await data.getById<QuizAttempt>(COLLECTIONS.quizAttempts, params.attemptId);
    if (!attempt || attempt.quizId !== quiz.id) return json({ error: "Attempt not found." }, 404);
    if (attempt.status === "in_progress") {
      return json({ error: "This attempt hasn't been submitted yet." }, 400);
    }
    if (attempt.released || quiz.resultsReleased) {
      return json({ ...attempt, alreadyReleased: true });
    }

    const releasedAt = new Date();
    const updated = await data.update<QuizAttempt>(COLLECTIONS.quizAttempts, attempt.id, {
      released: true,
      releasedAt,
    });

    const student = await data.getById<any>(COLLECTIONS.users, attempt.studentId);
    let jobId: string | null = null;
    if (
      student &&
      student.email &&
      !String(student.email).endsWith("@historical.reviewai.local") &&
      student.passwordHash !== "INVITE_PENDING"
    ) {
      const job = await enqueueEmailJob({
        kind: "quiz_results",
        recipients: [{ email: student.email, fullName: student.fullName || "Student" }],
        payload: { id: quiz.id, title: quiz.title },
        actorId: user.userId,
        idempotencyKey: `quiz_results:${quiz.id}:${attempt.id}`,
      });
      jobId = job.id;
    }

    audit({
      actorId: user.userId,
      actorEmail: user.email,
      action: "quiz.attempt.release",
      targetType: "quiz",
      targetId: quiz.id,
      details: { attemptId: attempt.id, studentId: attempt.studentId, jobId },
    });

    return json({ ...(updated as QuizAttempt), jobId });
  },

  async listAttempts(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "quizzes.manage")) return json({ error: "Access denied." }, 403);

    const quiz = await data.getById<QuizDoc>(COLLECTIONS.quizzes, params.id);
    if (!quiz || quiz.createdBy !== user.userId) return json({ error: "Quiz not found." }, 404);

    const attempts = await data.findMany<QuizAttempt>(COLLECTIONS.quizAttempts, {
      where: [["quizId", "==", quiz.id]],
    });

    const studentIds = [...new Set(attempts.map((a) => a.studentId))];
    const students = await Promise.all(studentIds.map((id) => data.getById<any>(COLLECTIONS.users, id)));
    const sMap = new Map(students.filter(Boolean).map((s) => [s!.id, s]));

    const rows = attempts
      .map((a) => ({
        attempt: a,
        studentName: sMap.get(a.studentId)?.fullName || null,
        studentEmail: sMap.get(a.studentId)?.email || null,
      }))
      .sort((a, b) => {
        const ad = a.attempt.submittedAt ? new Date(a.attempt.submittedAt).getTime() : 0;
        const bd = b.attempt.submittedAt ? new Date(b.attempt.submittedAt).getTime() : 0;
        return bd - ad;
      });

    return json({ quiz: { ...publicQuiz(quiz), questions: quiz.questions }, attempts: rows });
  },
};
