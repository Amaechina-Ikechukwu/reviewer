import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { sendAssignmentNotification } from "../../services/email";
import { json, parseJson } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";

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
    if (user.role !== "teacher") return json({ error: "Only teachers can create assignments." }, 403);

    const body = await parseJson<AssignmentBody>(request);
    if (!body.title || !body.closesAt) return json({ error: "Missing required assignment fields." }, 400);

    const opensAt = body.opensAt ? new Date(body.opensAt) : new Date();
    const closesAt = new Date(body.closesAt);
    if (Number.isNaN(closesAt.getTime()) || closesAt <= new Date()) {
      return json({ error: "Please provide a valid deadline in the future." }, 400);
    }

    if (body.allowGithub === false && body.allowFileUpload === false) {
      return json({ error: "At least one submission method must be enabled." }, 400);
    }

    const id = randomUUID();
    const assignment = await data.insert<any>(COLLECTIONS.assignments, id, {
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
    });

    if (opensAt <= new Date()) {
      const allStudents = await data.findMany<any>(COLLECTIONS.users, { where: [["role", "==", "student"]] });
      const real = allStudents
        .filter((s) => s.passwordHash !== "INVITE_PENDING")
        .filter((s) => !String(s.email).endsWith("@historical.reviewai.local"))
        .map((s) => ({ email: s.email, fullName: s.fullName }));
      if (real.length > 0) {
        sendAssignmentNotification(real, { ...assignment, closesAt: new Date(assignment.closesAt) }).catch(console.error);
      }
    }

    return json(assignment, 201);
  },

  async list(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    const where = user.role === "teacher" ? [["createdBy", "==", user.userId]] as any : undefined;
    const rows = await data.findMany<any>(COLLECTIONS.assignments, { where, orderBy: ["createdAt", "desc"] });
    return json(rows);
  },

  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const a = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!a) return json({ error: "Assignment not found." }, 404);
    if (user.role === "teacher" && a.createdBy !== user.userId) return json({ error: "Assignment not found." }, 404);
    return json(a);
  },

  async update(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can edit assignments." }, 403);

    const existing = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!existing || existing.createdBy !== user.userId) return json({ error: "Assignment not found." }, 404);

    const body = await parseJson<AssignmentBody>(request);

    const newAllowGithub = body.allowGithub !== undefined ? body.allowGithub : existing.allowGithub;
    const newAllowFileUpload = body.allowFileUpload !== undefined ? body.allowFileUpload : existing.allowFileUpload;
    if (!newAllowGithub && !newAllowFileUpload) {
      return json({ error: "At least one submission method must be enabled." }, 400);
    }

    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = body.title.trim();
    if (body.description !== undefined) update.description = body.description?.trim() ?? "";
    if (body.rubric !== undefined) update.rubric = body.rubric?.trim() ?? "";
    if (body.sourceType !== undefined) update.sourceType = body.sourceType;
    if (body.sourceMarkdown !== undefined) update.sourceMarkdown = body.sourceMarkdown?.trim() || null;
    if (body.sourceUrl !== undefined) update.sourceUrl = body.sourceUrl?.trim() || null;
    if (body.allowGithub !== undefined) update.allowGithub = body.allowGithub;
    if (body.allowFileUpload !== undefined) update.allowFileUpload = body.allowFileUpload;
    if (body.maxScore !== undefined) update.maxScore = body.maxScore > 0 ? Math.round(body.maxScore) : 100;
    if (body.classNotes !== undefined) update.classNotes = body.classNotes?.trim() || null;

    if (body.closesAt !== undefined) {
      const newClosesAt = new Date(body.closesAt);
      if (Number.isNaN(newClosesAt.getTime())) return json({ error: "Please provide a valid deadline." }, 400);
      const existingClosesAt = new Date(existing.closesAt);
      if (newClosesAt.getTime() !== existingClosesAt.getTime() && newClosesAt <= new Date()) {
        return json({ error: "Please provide a valid deadline in the future." }, 400);
      }
      update.closesAt = newClosesAt;
    }

    if (Object.keys(update).length === 0) return json(existing);
    const updated = await data.update<any>(COLLECTIONS.assignments, existing.id, update);
    return json(updated);
  },

  async remove(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can delete assignments." }, 403);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment || assignment.createdBy !== user.userId) return json({ error: "Assignment not found." }, 404);

    const body = await parseJson<{ action?: "delete_all" | "move"; targetAssignmentId?: string; newAssignmentTitle?: string }>(request);
    const action = body.action || "delete_all";

    const sourceSubs = await data.findMany<any>(COLLECTIONS.submissions, { where: [["assignmentId", "==", assignment.id]] });

    if (action === "move") {
      let targetId = body.targetAssignmentId?.trim();

      if (!targetId && body.newAssignmentTitle?.trim()) {
        const newId = randomUUID();
        await data.insert(COLLECTIONS.assignments, newId, {
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
        });
        targetId = newId;
      }

      if (!targetId) return json({ error: "Provide targetAssignmentId or newAssignmentTitle to move submissions." }, 400);
      const target = await data.getById<any>(COLLECTIONS.assignments, targetId);
      if (!target) return json({ error: "Target assignment not found." }, 404);

      const targetSubs = await data.findMany<any>(COLLECTIONS.submissions, { where: [["assignmentId", "==", targetId]] });
      const targetStudentIds = new Set(targetSubs.map((s) => s.studentId));

      for (const sub of sourceSubs) {
        if (!targetStudentIds.has(sub.studentId)) {
          await data.update(COLLECTIONS.submissions, sub.id, { assignmentId: targetId });
        } else {
          await data.delMany(COLLECTIONS.reviews, [["submissionId", "==", sub.id]]);
          await data.del(COLLECTIONS.submissions, sub.id);
        }
      }

      const sourceOverrides = await data.findMany<any>(COLLECTIONS.submissionOverrides, { where: [["assignmentId", "==", assignment.id]] });
      for (const ov of sourceOverrides) {
        const exists = await data.findOne<any>(COLLECTIONS.submissionOverrides, [["studentId", "==", ov.studentId], ["assignmentId", "==", targetId]]);
        if (!exists) {
          const newId = randomUUID();
          await data.insert(COLLECTIONS.submissionOverrides, newId, {
            studentId: ov.studentId,
            assignmentId: targetId,
            grantedBy: ov.grantedBy,
            closesAt: ov.closesAt ?? null,
          });
        }
      }
    } else {
      for (const sub of sourceSubs) {
        await data.delMany(COLLECTIONS.reviews, [["submissionId", "==", sub.id]]);
      }
      await data.delMany(COLLECTIONS.submissions, [["assignmentId", "==", assignment.id]]);
    }

    await data.delMany(COLLECTIONS.submissionOverrides, [["assignmentId", "==", assignment.id]]);
    await data.del(COLLECTIONS.assignments, assignment.id);

    return json({ deleted: true, title: assignment.title });
  },
};
