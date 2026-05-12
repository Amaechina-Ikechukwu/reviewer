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
  isGroupAssignment?: boolean;
  groupCount?: number;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function autoCreateGroups(assignmentId: string, groupCount: number) {
  const allStudents = await data.findMany<any>(COLLECTIONS.users, { where: [["role", "==", "student"]] });
  const real = allStudents.filter((s) => s.passwordHash !== "INVITE_PENDING");
  const shuffled = shuffle(real);
  const groups: { id: string; name: string; memberIds: string[] }[] = [];
  for (let i = 0; i < groupCount; i++) {
    groups.push({ id: randomUUID(), name: `Group ${i + 1}`, memberIds: [] });
  }
  shuffled.forEach((student, idx) => {
    groups[idx % groupCount].memberIds.push(student.id);
  });
  for (const g of groups) {
    await data.insert(COLLECTIONS.assignmentGroups, g.id, {
      assignmentId,
      name: g.name,
      memberIds: g.memberIds,
    });
  }
  return groups;
}

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

    const isGroupAssignment = body.isGroupAssignment === true;
    const groupCount = isGroupAssignment ? Math.max(1, Math.min(50, Math.round(body.groupCount ?? 0))) : 0;
    if (isGroupAssignment && groupCount < 1) {
      return json({ error: "Please provide a valid number of groups." }, 400);
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
      isGroupAssignment,
      groupCount,
    });

    if (isGroupAssignment) {
      await autoCreateGroups(id, groupCount);
    }

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
    await data.delMany(COLLECTIONS.assignmentGroups, [["assignmentId", "==", assignment.id]]);
    await data.del(COLLECTIONS.assignments, assignment.id);

    return json({ deleted: true, title: assignment.title });
  },

  async listGroups(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment) return json({ error: "Assignment not found." }, 404);
    if (!assignment.isGroupAssignment) return json({ groups: [], members: {} });

    if (user.role === "teacher" && assignment.createdBy !== user.userId) {
      return json({ error: "Assignment not found." }, 404);
    }

    const groups = await data.findMany<any>(COLLECTIONS.assignmentGroups, {
      where: [["assignmentId", "==", assignment.id]],
    });
    groups.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const memberIdSet = new Set<string>();
    for (const g of groups) for (const id of g.memberIds || []) memberIdSet.add(id);
    const members: Record<string, { id: string; fullName: string; email: string }> = {};
    await Promise.all(
      [...memberIdSet].map(async (id) => {
        const u = await data.getById<any>(COLLECTIONS.users, id);
        if (u) members[id] = { id: u.id, fullName: u.fullName, email: u.email };
      }),
    );

    if (user.role === "student") {
      const myGroup = groups.find((g) => (g.memberIds || []).includes(user.userId)) || null;
      return json({ groups, members, myGroupId: myGroup?.id ?? null });
    }

    return json({ groups, members });
  },

  async updateGroups(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can edit groups." }, 403);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment || assignment.createdBy !== user.userId) return json({ error: "Assignment not found." }, 404);
    if (!assignment.isGroupAssignment) return json({ error: "This assignment is not a group project." }, 400);

    const body = await parseJson<{ groups?: { id?: string; name?: string; memberIds?: string[] }[] }>(request);
    const incoming = body.groups || [];
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return json({ error: "Provide at least one group." }, 400);
    }

    const existingSubs = await data.findMany<any>(COLLECTIONS.submissions, {
      where: [["assignmentId", "==", assignment.id]],
    });
    if (existingSubs.length > 0) {
      return json({ error: "Groups are locked once any submission has been made." }, 409);
    }

    const seen = new Set<string>();
    for (const g of incoming) {
      for (const m of g.memberIds || []) {
        if (seen.has(m)) return json({ error: "A student cannot be in more than one group." }, 400);
        seen.add(m);
      }
    }

    await data.delMany(COLLECTIONS.assignmentGroups, [["assignmentId", "==", assignment.id]]);
    const created: any[] = [];
    for (let i = 0; i < incoming.length; i++) {
      const g = incoming[i];
      const id = g.id || randomUUID();
      const name = (g.name?.trim()) || `Group ${i + 1}`;
      const memberIds = Array.isArray(g.memberIds) ? g.memberIds.filter(Boolean) : [];
      await data.insert(COLLECTIONS.assignmentGroups, id, {
        assignmentId: assignment.id,
        name,
        memberIds,
      });
      created.push({ id, name, memberIds });
    }

    await data.update(COLLECTIONS.assignments, assignment.id, { groupCount: created.length });
    return json({ groups: created });
  },

  async regenerateGroups(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can regenerate groups." }, 403);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment || assignment.createdBy !== user.userId) return json({ error: "Assignment not found." }, 404);
    if (!assignment.isGroupAssignment) return json({ error: "This assignment is not a group project." }, 400);

    const body = await parseJson<{ groupCount?: number }>(request).catch(() => ({} as any));
    const groupCount = Math.max(1, Math.min(50, Math.round(body.groupCount ?? assignment.groupCount ?? 1)));

    const existingSubs = await data.findMany<any>(COLLECTIONS.submissions, {
      where: [["assignmentId", "==", assignment.id]],
    });
    if (existingSubs.length > 0) {
      return json({ error: "Groups are locked once any submission has been made." }, 409);
    }

    await data.delMany(COLLECTIONS.assignmentGroups, [["assignmentId", "==", assignment.id]]);
    const groups = await autoCreateGroups(assignment.id, groupCount);
    await data.update(COLLECTIONS.assignments, assignment.id, { groupCount });
    return json({ groups });
  },
};
