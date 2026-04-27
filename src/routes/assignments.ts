import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../db/connection";
import { assignments, reviews, submissionOverrides, submissions, users } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";
import { sendAssignmentNotification } from "../services/email";
import { json, parseJson } from "../utils/json";

type AssignmentBody = {
  title?: string;
  description?: string;
  rubric?: string;
  maxScore?: number;
  sourceType?: "manual" | "markdown" | "notion" | "mixed";
  sourceMarkdown?: string;
  sourceUrl?: string;
  opensAt?: string;
  closesAt?: string;
  allowGithub?: boolean;
  allowFileUpload?: boolean;
  defaultProvider?: "gemini";
  classNotes?: string;
};

export const assignmentRoutes = {
  async create(request: Request) {
    const user = (request as AuthenticatedRequest).user;

    if (user.role !== "teacher") {
      return json({ error: "Only teachers can create assignments." }, 403);
    }

    const body = await parseJson<AssignmentBody>(request);

    if (!body.title || !body.closesAt) {
      return json({ error: "Missing required assignment fields." }, 400);
    }

    const opensAt = body.opensAt ? new Date(body.opensAt) : new Date();
    const closesAt = new Date(body.closesAt);

    if (Number.isNaN(closesAt.getTime()) || closesAt <= new Date()) {
      return json({ error: "Please provide a valid deadline in the future." }, 400);
    }

    if (body.allowGithub === false && body.allowFileUpload === false) {
      return json({ error: "At least one submission method must be enabled." }, 400);
    }

    const [assignment] = await db
      .insert(assignments)
      .values({
        title: body.title.trim(),
        description: body.description?.trim() || "",
        rubric: body.rubric?.trim() || "",
        sourceType: body.sourceType || "manual",
        sourceMarkdown: body.sourceMarkdown?.trim() || null,
        sourceUrl: body.sourceUrl?.trim() || null,
        createdBy: user.userId,
        opensAt,
        closesAt,
        maxScore: body.maxScore && body.maxScore > 0 ? Math.round(body.maxScore) : 100,
        allowGithub: body.allowGithub ?? true,
        allowFileUpload: body.allowFileUpload ?? true,
        defaultProvider: "gemini",
        classNotes: body.classNotes?.trim() || null,
      })
      .returning();

    // Notify all active students if assignment is already open
    if (opensAt <= new Date()) {
      const students = await db
        .select({ email: users.email, fullName: users.fullName })
        .from(users)
        .where(and(eq(users.role, "student"), ne(users.passwordHash, "INVITE_PENDING")));

      const real = students.filter((s) => !s.email.endsWith("@historical.reviewai.local"));
      if (real.length > 0) {
        sendAssignmentNotification(real, { ...assignment, closesAt: new Date(assignment.closesAt) }).catch(console.error);
      }
    }

    return json(assignment, 201);
  },

  async list(request: Request) {
    const user = (request as AuthenticatedRequest).user;

    const rows = user.role === "teacher"
      ? await db
          .select()
          .from(assignments)
          .where(eq(assignments.createdBy, user.userId))
          .orderBy(desc(assignments.createdAt))
      : await db.select().from(assignments).orderBy(desc(assignments.createdAt));

    return json(rows);
  },

  async remove(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can delete assignments." }, 403);

    const [assignment] = await db
      .select()
      .from(assignments)
      .where(and(eq(assignments.id, params.id), eq(assignments.createdBy, user.userId)))
      .limit(1);

    if (!assignment) return json({ error: "Assignment not found." }, 404);

    const body = await parseJson<{
      action?: "delete_all" | "move";
      targetAssignmentId?: string;
      newAssignmentTitle?: string;
    }>(request);

    const action = body.action || "delete_all";

    // Gather all submissions for this assignment
    const sourceSubs = await db.select().from(submissions).where(eq(submissions.assignmentId, assignment.id));

    if (action === "move") {
      let targetId = body.targetAssignmentId?.trim();

      // Create a new assignment if a title was provided instead
      if (!targetId && body.newAssignmentTitle?.trim()) {
        const [created] = await db
          .insert(assignments)
          .values({
            title: body.newAssignmentTitle.trim(),
            description: assignment.description,
            rubric: assignment.rubric,
            sourceType: assignment.sourceType,
            sourceMarkdown: assignment.sourceMarkdown,
            sourceUrl: assignment.sourceUrl,
            createdBy: user.userId,
            opensAt: assignment.opensAt,
            closesAt: assignment.closesAt,
            maxScore: assignment.maxScore,
            allowGithub: assignment.allowGithub,
            allowFileUpload: assignment.allowFileUpload,
            defaultProvider: assignment.defaultProvider,
            classNotes: assignment.classNotes,
          })
          .returning({ id: assignments.id });
        targetId = created.id;
      }

      if (!targetId) return json({ error: "Provide targetAssignmentId or newAssignmentTitle to move submissions." }, 400);

      const [targetAssignment] = await db.select({ id: assignments.id }).from(assignments).where(eq(assignments.id, targetId)).limit(1);
      if (!targetAssignment) return json({ error: "Target assignment not found." }, 404);

      // Find which students already have a submission in the target (conflict)
      const targetSubs = await db.select({ studentId: submissions.studentId }).from(submissions).where(eq(submissions.assignmentId, targetId));
      const targetStudentIds = new Set(targetSubs.map((s) => s.studentId));

      let moved = 0;
      let skipped = 0;
      for (const sub of sourceSubs) {
        if (!targetStudentIds.has(sub.studentId)) {
          await db.update(submissions).set({ assignmentId: targetId }).where(eq(submissions.id, sub.id));
          moved++;
        } else {
          // Delete the conflicting source submission
          await db.delete(reviews).where(eq(reviews.submissionId, sub.id));
          await db.delete(submissions).where(eq(submissions.id, sub.id));
          skipped++;
        }
      }

      // Move overrides
      const sourceOverrides = await db.select().from(submissionOverrides).where(eq(submissionOverrides.assignmentId, assignment.id));
      for (const override of sourceOverrides) {
        await db.insert(submissionOverrides)
          .values({ studentId: override.studentId, assignmentId: targetId, grantedBy: override.grantedBy })
          .onConflictDoNothing();
      }
    } else {
      // delete_all: delete reviews → submissions → overrides for this assignment
      for (const sub of sourceSubs) {
        await db.delete(reviews).where(eq(reviews.submissionId, sub.id));
      }
      await db.delete(submissions).where(eq(submissions.assignmentId, assignment.id));
    }

    // Always clean up overrides and then the assignment itself
    await db.delete(submissionOverrides).where(eq(submissionOverrides.assignmentId, assignment.id));
    await db.delete(assignments).where(eq(assignments.id, assignment.id));

    return json({ deleted: true, title: assignment.title });
  },

  async update(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;

    if (user.role !== "teacher") {
      return json({ error: "Only teachers can edit assignments." }, 403);
    }

    const [existing] = await db
      .select()
      .from(assignments)
      .where(and(eq(assignments.id, params.id), eq(assignments.createdBy, user.userId)))
      .limit(1);

    if (!existing) return json({ error: "Assignment not found." }, 404);

    const body = await parseJson<AssignmentBody>(request);

    const newAllowGithub = body.allowGithub !== undefined ? body.allowGithub : existing.allowGithub;
    const newAllowFileUpload = body.allowFileUpload !== undefined ? body.allowFileUpload : existing.allowFileUpload;
    if (!newAllowGithub && !newAllowFileUpload) {
      return json({ error: "At least one submission method must be enabled." }, 400);
    }

    type AssignmentUpdate = {
      title?: string;
      description?: string;
      rubric?: string;
      sourceType?: string;
      sourceMarkdown?: string | null;
      sourceUrl?: string | null;
      allowGithub?: boolean;
      allowFileUpload?: boolean;
      maxScore?: number;
      classNotes?: string | null;
      closesAt?: Date;
    };

    const updateValues: AssignmentUpdate = {};

    if (body.title !== undefined) updateValues.title = body.title.trim();
    if (body.description !== undefined) updateValues.description = body.description?.trim() ?? "";
    if (body.rubric !== undefined) updateValues.rubric = body.rubric?.trim() ?? "";
    if (body.sourceType !== undefined) updateValues.sourceType = body.sourceType;
    if (body.sourceMarkdown !== undefined) updateValues.sourceMarkdown = body.sourceMarkdown?.trim() || null;
    if (body.sourceUrl !== undefined) updateValues.sourceUrl = body.sourceUrl?.trim() || null;
    if (body.allowGithub !== undefined) updateValues.allowGithub = body.allowGithub;
    if (body.allowFileUpload !== undefined) updateValues.allowFileUpload = body.allowFileUpload;
    if (body.maxScore !== undefined) updateValues.maxScore = body.maxScore > 0 ? Math.round(body.maxScore) : 100;
    if (body.classNotes !== undefined) updateValues.classNotes = body.classNotes?.trim() || null;

    if (body.closesAt !== undefined) {
      const newClosesAt = new Date(body.closesAt);
      if (Number.isNaN(newClosesAt.getTime())) {
        return json({ error: "Please provide a valid deadline." }, 400);
      }
      const existingClosesAt = new Date(existing.closesAt);
      if (newClosesAt.getTime() !== existingClosesAt.getTime() && newClosesAt <= new Date()) {
        return json({ error: "Please provide a valid deadline in the future." }, 400);
      }
      updateValues.closesAt = newClosesAt;
    }

    if (Object.keys(updateValues).length === 0) return json(existing);

    const [updated] = await db
      .update(assignments)
      .set(updateValues)
      .where(eq(assignments.id, params.id))
      .returning();

    return json(updated);
  },

  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;

    const [assignment] = await db
      .select()
      .from(assignments)
      .where(
        user.role === "teacher"
          ? and(eq(assignments.id, params.id), eq(assignments.createdBy, user.userId))
          : eq(assignments.id, params.id),
      )
      .limit(1);

    if (!assignment) {
      return json({ error: "Assignment not found." }, 404);
    }

    return json(assignment);
  },
};
