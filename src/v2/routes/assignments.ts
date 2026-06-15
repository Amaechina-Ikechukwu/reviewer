import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { enqueueEmailJob } from "../services/emailJobs";
import { json, parseJson } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS, storageUpload, storageDownload } from "../firebase";

type Track = "frontend" | "backend" | "data_analytics" | "product_design" | "digital_marketing" | "cyber_security";
const CODE_TRACKS: Track[] = ["frontend", "backend", "cyber_security"];
function trackAllowsGithub(track?: Track | null): boolean {
  if (!track) return true;
  return CODE_TRACKS.includes(track);
}

const MAX_BRIEF_SIZE = 20 * 1024 * 1024; // 20 MB

type AssignmentBody = {
  title?: string;
  description?: string;
  rubric?: string;
  maxScore?: number;
  sourceType?: "manual" | "markdown" | "notion" | "mixed" | "pdf";
  sourceMarkdown?: string;
  sourceUrl?: string;
  sourcePdfPath?: string | null;
  opensAt?: string;
  closesAt?: string;
  allowGithub?: boolean;
  allowFileUpload?: boolean;
  defaultProvider?: "openrouter";
  classNotes?: string;
  isGroupAssignment?: boolean;
  groupCount?: number;
  groupQuestionMode?: "same" | "per_group";
  track?: Track | null;
  cohortId?: string | null;
  questions?: string | null;
};

function validateAssignmentSource(sourceType: string | undefined, sourceMarkdown: string | null | undefined, sourceUrl: string | null | undefined, sourcePdfPath: string | null | undefined): string | null {
  if (sourceType === "pdf" && !sourcePdfPath) return "Please upload a PDF brief before creating the assignment.";
  if (sourceType === "markdown" && !(sourceMarkdown && sourceMarkdown.trim())) return "Please provide markdown content for the assignment brief.";
  if (sourceType === "notion" && !(sourceUrl && sourceUrl.trim())) return "Please provide a Notion URL for the assignment brief.";
  return null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type GroupDraft = {
  name?: string;
  memberIds?: string[];
  description?: string | null;
  rubric?: string | null;
  sourceType?: "markdown" | "link" | "pdf" | null;
  sourceUrl?: string | null;
  sourcePdfPath?: string | null;
};

async function autoCreateGroups(assignmentId: string, groupCount: number, cohortId: string | null, drafts?: GroupDraft[]) {
  const groups: { id: string; name: string; memberIds: string[] }[] = [];

  const draftedMemberIds = new Set<string>();
  if (drafts && drafts.length > 0) {
    for (const d of drafts) {
      for (const m of d.memberIds || []) draftedMemberIds.add(m);
    }
  }

  // If drafts contain explicit member assignments, trust them; otherwise round-robin all students.
  const useDraftMembers = draftedMemberIds.size > 0;

  let distributed: string[][] = Array.from({ length: groupCount }, () => []);
  if (useDraftMembers) {
    for (let i = 0; i < groupCount; i++) {
      distributed[i] = (drafts?.[i]?.memberIds || []).filter(Boolean);
    }
  } else {
    const studentWhere: any[] = [["role", "==", "student"]];
    if (cohortId) studentWhere.push(["cohortId", "==", cohortId]);
    const allStudents = await data.findMany<any>(COLLECTIONS.users, { where: studentWhere });
    const real = allStudents.filter((s) => s.passwordHash !== "INVITE_PENDING");
    const shuffled = shuffle(real);
    shuffled.forEach((student, idx) => {
      distributed[idx % groupCount].push(student.id);
    });
  }

  for (let i = 0; i < groupCount; i++) {
    const d = drafts?.[i];
    groups.push({
      id: randomUUID(),
      name: d?.name?.trim() || `Group ${i + 1}`,
      memberIds: distributed[i],
    });
    await data.insert(COLLECTIONS.assignmentGroups, groups[i].id, {
      assignmentId,
      name: groups[i].name,
      memberIds: groups[i].memberIds,
      description: d?.description ?? null,
      rubric: d?.rubric ?? null,
      sourceType: d?.sourceType ?? null,
      sourceUrl: d?.sourceUrl ?? null,
      sourcePdfPath: d?.sourcePdfPath ?? null,
    });
  }
  return groups;
}

async function notifyGroupMembers(
  assignment: { id: string; title: string },
  groups: { name: string; memberIds: string[] }[],
) {
  const allMemberIds = [...new Set(groups.flatMap((g) => g.memberIds))];
  if (allMemberIds.length === 0) return;
  const users = await Promise.all(
    allMemberIds.map((id) => data.getById<any>(COLLECTIONS.users, id)),
  );
  const userMap = new Map(
    users
      .filter((u): u is any => Boolean(u) && u.passwordHash !== "INVITE_PENDING")
      .filter((u) => !String(u.email).endsWith("@historical.reviewai.local"))
      .map((u) => [u.id, u]),
  );

  for (const g of groups) {
    const members = g.memberIds
      .map((id) => userMap.get(id))
      .filter(Boolean) as Array<{ email: string; fullName: string; id: string }>;
    if (members.length === 0) continue;
    for (const member of members) {
      const teammates = members.filter((m) => m.id !== member.id).map((m) => m.fullName);
      await enqueueEmailJob({
        kind: "group_assignment",
        recipients: [{ email: member.email, fullName: member.fullName }],
        payload: { assignment, groupName: g.name, teammates },
        idempotencyKey: `group:${assignment.id}:${g.name}:${member.id}`,
      });
    }
  }
}

export const assignmentRoutes = {
  async create(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Only staff can create assignments." }, 403);

    const body = await parseJson<AssignmentBody>(request);
    if (!body.title || !body.closesAt) return json({ error: "Missing required assignment fields." }, 400);

    const sourceErr = validateAssignmentSource(body.sourceType, body.sourceMarkdown, body.sourceUrl, body.sourcePdfPath);
    if (sourceErr) return json({ error: sourceErr }, 400);

    const opensAt = body.opensAt ? new Date(body.opensAt) : new Date();
    const closesAt = new Date(body.closesAt);
    if (Number.isNaN(closesAt.getTime()) || closesAt <= new Date()) {
      return json({ error: "Please provide a valid deadline in the future." }, 400);
    }

    // Non-code tracks cannot use GitHub submissions
    const track = body.track || null;
    if (track && !trackAllowsGithub(track) && body.allowGithub) {
      return json({ error: "GitHub submissions are not available for this track." }, 400);
    }

    const effectiveAllowGithub = track && !trackAllowsGithub(track) ? false : (body.allowGithub ?? true);

    if (effectiveAllowGithub === false && body.allowFileUpload === false) {
      return json({ error: "At least one submission method must be enabled." }, 400);
    }

    const isGroupAssignment = body.isGroupAssignment === true;
    const groupCount = isGroupAssignment ? Math.max(1, Math.min(50, Math.round(body.groupCount ?? 0))) : 0;
    if (isGroupAssignment && groupCount < 1) {
      return json({ error: "Please provide a valid number of groups." }, 400);
    }
    const groupQuestionMode: "same" | "per_group" =
      isGroupAssignment && body.groupQuestionMode === "per_group" ? "per_group" : "same";

    const id = randomUUID();
    const assignment = await data.insert<any>(COLLECTIONS.assignments, id, {
      title: body.title.trim(),
      description: body.description?.trim() || "",
      rubric: body.rubric?.trim() || "",
      sourceType: body.sourceType || "manual",
      sourceMarkdown: body.sourceMarkdown?.trim() || null,
      sourceUrl: body.sourceUrl?.trim() || null,
      sourcePdfPath: body.sourcePdfPath || null,
      createdBy: user.userId,
      opensAt,
      closesAt,
      maxScore: body.maxScore && body.maxScore > 0 ? Math.round(body.maxScore) : 100,
      allowGithub: effectiveAllowGithub,
      allowFileUpload: body.allowFileUpload ?? true,
      defaultProvider: "openrouter",
      classNotes: body.classNotes?.trim() || null,
      questions: body.questions?.trim() || null,
      isGroupAssignment,
      groupCount,
      groupQuestionMode,
      track: track || null,
      cohortId: body.cohortId?.trim() || null,
    });

    if (isGroupAssignment) {
      const drafts = Array.isArray((body as any).groupDrafts) ? ((body as any).groupDrafts as GroupDraft[]) : undefined;
      const createdGroups = await autoCreateGroups(id, groupCount, body.cohortId?.trim() || null, drafts);
      notifyGroupMembers({ id, title: assignment.title }, createdGroups).catch(console.error);
    }

    if (opensAt <= new Date()) {
      const studentWhere: any[] = [["role", "==", "student"]];
      if (body.cohortId?.trim()) studentWhere.push(["cohortId", "==", body.cohortId.trim()]);
      const allStudents = await data.findMany<any>(COLLECTIONS.users, { where: studentWhere });
      const real = allStudents
        .filter((s) => s.passwordHash !== "INVITE_PENDING")
        .filter((s) => !String(s.email).endsWith("@historical.reviewai.local"))
        .map((s) => ({ email: s.email, fullName: s.fullName }));
      if (real.length > 0) {
        await enqueueEmailJob({
          kind: "assignment",
          recipients: real,
          payload: { ...assignment, closesAt: new Date(assignment.closesAt).toISOString() },
          actorId: user.userId,
          idempotencyKey: `assignment:${id}`,
        });
      }
    }

    return json(assignment, 201);
  },

  async list(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (isStaff(user.role)) {
      let where: any = undefined;
      if (["instructor", "teacher", "manager"].includes(user.role)) {
        where = [["createdBy", "==", user.userId]];
      }
      const rows = await data.findMany<any>(COLLECTIONS.assignments, { where, orderBy: ["createdAt", "desc"] });
      return json(rows);
    }

    // Student: only show assignments for their cohort + global assignments (no cohortId)
    const student = await data.getById<any>(COLLECTIONS.users, user.userId);
    if (student?.cohortId) {
      const [cohortRows, globalRows] = await Promise.all([
        data.findMany<any>(COLLECTIONS.assignments, {
          where: [["cohortId", "==", student.cohortId]],
          orderBy: ["createdAt", "desc"],
        }),
        data.findMany<any>(COLLECTIONS.assignments, {
          where: [["cohortId", "==", null]],
          orderBy: ["createdAt", "desc"],
        }),
      ]);
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const r of cohortRows) { seen.add(r.id); merged.push(r); }
      for (const r of globalRows) { if (!seen.has(r.id)) merged.push(r); }
      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return json(merged);
    }

    // No cohort: show only global assignments
    const rows = await data.findMany<any>(COLLECTIONS.assignments, {
      where: [["cohortId", "==", null]],
      orderBy: ["createdAt", "desc"],
    });
    return json(rows);
  },

  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const a = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!a) return json({ error: "Assignment not found." }, 404);
    if (["instructor", "teacher", "manager"].includes(user.role) && a.createdBy !== user.userId) {
      return json({ error: "Assignment not found." }, 404);
    }
    // Student: ensure the assignment belongs to their cohort or is global (no cohort)
    if (!isStaff(user.role) && a.cohortId) {
      const student = await data.getById<any>(COLLECTIONS.users, user.userId);
      if (student?.cohortId !== a.cohortId) {
        return json({ error: "Assignment not found." }, 404);
      }
    }
    return json(a);
  },

  async update(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Only staff can edit assignments." }, 403);

    const existing = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!existing || existing.createdBy !== user.userId) return json({ error: "Assignment not found." }, 404);

    const body = await parseJson<AssignmentBody>(request);

    const newAllowGithub = body.allowGithub !== undefined ? body.allowGithub : existing.allowGithub;
    const newAllowFileUpload = body.allowFileUpload !== undefined ? body.allowFileUpload : existing.allowFileUpload;
    if (!newAllowGithub && !newAllowFileUpload) {
      return json({ error: "At least one submission method must be enabled." }, 400);
    }

    const nextSourceType = body.sourceType !== undefined ? body.sourceType : existing.sourceType;
    const nextSourceMarkdown = body.sourceMarkdown !== undefined ? (body.sourceMarkdown?.trim() || null) : existing.sourceMarkdown;
    const nextSourceUrl = body.sourceUrl !== undefined ? (body.sourceUrl?.trim() || null) : existing.sourceUrl;
    const nextSourcePdfPath = body.sourcePdfPath !== undefined ? (body.sourcePdfPath || null) : existing.sourcePdfPath;
    const sourceErr = validateAssignmentSource(nextSourceType, nextSourceMarkdown, nextSourceUrl, nextSourcePdfPath);
    if (sourceErr) return json({ error: sourceErr }, 400);

    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = body.title.trim();
    if (body.description !== undefined) update.description = body.description?.trim() ?? "";
    if (body.rubric !== undefined) update.rubric = body.rubric?.trim() ?? "";
    if (body.sourceType !== undefined) update.sourceType = body.sourceType;
    if (body.sourceMarkdown !== undefined) update.sourceMarkdown = body.sourceMarkdown?.trim() || null;
    if (body.sourceUrl !== undefined) update.sourceUrl = body.sourceUrl?.trim() || null;
    if (body.sourcePdfPath !== undefined) update.sourcePdfPath = body.sourcePdfPath || null;
    if (body.allowGithub !== undefined) update.allowGithub = body.allowGithub;
    if (body.allowFileUpload !== undefined) update.allowFileUpload = body.allowFileUpload;
    if (body.maxScore !== undefined) update.maxScore = body.maxScore > 0 ? Math.round(body.maxScore) : 100;
    if (body.classNotes !== undefined) update.classNotes = body.classNotes?.trim() || null;
    if (body.questions !== undefined) update.questions = body.questions?.trim() || null;
    if (body.cohortId !== undefined) update.cohortId = body.cohortId?.trim() || null;

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
    if (!isStaff(user.role)) return json({ error: "Only staff can delete assignments." }, 403);

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
    if (!isStaff(user.role)) return json({ error: "Only staff can edit groups." }, 403);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment || assignment.createdBy !== user.userId) return json({ error: "Assignment not found." }, 404);
    if (!assignment.isGroupAssignment) return json({ error: "This assignment is not a group project." }, 400);

    const body = await parseJson<{
      groups?: { id?: string; name?: string; memberIds?: string[]; description?: string | null; rubric?: string | null; sourceType?: string | null; sourceUrl?: string | null; sourcePdfPath?: string | null }[];
    }>(request);
    const incoming = body.groups || [];
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return json({ error: "Provide at least one group." }, 400);
    }

    const seen = new Set<string>();
    for (const g of incoming) {
      for (const m of g.memberIds || []) {
        if (seen.has(m)) return json({ error: "A student cannot be in more than one group." }, 400);
        seen.add(m);
      }
    }

    const previousGroups = await data.findMany<any>(COLLECTIONS.assignmentGroups, {
      where: [["assignmentId", "==", assignment.id]],
    });
    const previousMembership = new Map<string, string>();
    for (const g of previousGroups) {
      for (const m of g.memberIds || []) previousMembership.set(m, g.id);
    }

    await data.delMany(COLLECTIONS.assignmentGroups, [["assignmentId", "==", assignment.id]]);
    const created: any[] = [];
    for (let i = 0; i < incoming.length; i++) {
      const g = incoming[i];
      const id = g.id || randomUUID();
      const name = (g.name?.trim()) || `Group ${i + 1}`;
      const memberIds = Array.isArray(g.memberIds) ? g.memberIds.filter(Boolean) : [];
      const description = typeof g.description === "string" ? g.description.trim() || null : g.description ?? null;
      const rubric = typeof g.rubric === "string" ? g.rubric.trim() || null : g.rubric ?? null;
      const sourceType = g.sourceType ?? null;
      const sourceUrl = typeof g.sourceUrl === "string" ? g.sourceUrl.trim() || null : g.sourceUrl ?? null;
      const sourcePdfPath = typeof g.sourcePdfPath === "string" ? g.sourcePdfPath.trim() || null : g.sourcePdfPath ?? null;
      await data.insert(COLLECTIONS.assignmentGroups, id, {
        assignmentId: assignment.id,
        name,
        memberIds,
        description,
        rubric,
        sourceType,
        sourceUrl,
        sourcePdfPath,
      });
      created.push({ id, name, memberIds, description, rubric, sourceType, sourceUrl, sourcePdfPath });
    }

    await data.update(COLLECTIONS.assignments, assignment.id, { groupCount: created.length });

    // Notify only members whose group changed.
    const movedGroups = created
      .map((g) => ({
        name: g.name,
        memberIds: (g.memberIds as string[]).filter((m) => previousMembership.get(m) !== g.id),
      }))
      .filter((g) => g.memberIds.length > 0);
    if (movedGroups.length > 0) {
      notifyGroupMembers({ id: assignment.id, title: assignment.title }, movedGroups).catch(console.error);
    }

    return json({ groups: created });
  },

  async uploadBrief(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Only staff can upload assignment briefs." }, 403);

    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) return json({ error: "Multipart form data required." }, 400);

    const fd = await request.formData();
    const file = fd.get("file") as File | null;
    if (!file) return json({ error: "No file provided." }, 400);
    if (!file.name.toLowerCase().endsWith(".pdf")) return json({ error: "Only PDF files are accepted." }, 400);
    if (file.size > MAX_BRIEF_SIZE) return json({ error: "PDF must be under 20 MB." }, 400);

    const briefId = randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());
    await storageUpload(`briefs/${briefId}.pdf`, buffer, "application/pdf");

    return json({ briefId });
  },

  async getBrief(request: Request, params: Record<string, string>) {
    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment) return new Response("Not found", { status: 404 });

    const briefId = assignment.sourcePdfPath;
    if (!briefId) return new Response("Brief not found", { status: 404 });

    const buffer = await storageDownload(`briefs/${briefId}.pdf`).catch(() => null);
    if (!buffer) return new Response("Brief not found", { status: 404 });

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      },
    });
  },

  async regenerateGroups(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Only staff can regenerate groups." }, 403);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment || assignment.createdBy !== user.userId) return json({ error: "Assignment not found." }, 404);
    if (!assignment.isGroupAssignment) return json({ error: "This assignment is not a group project." }, 400);

    const body = await parseJson<{ groupCount?: number }>(request).catch(() => ({} as any));
    const groupCount = Math.max(1, Math.min(50, Math.round(body.groupCount ?? assignment.groupCount ?? 1)));

    await data.delMany(COLLECTIONS.assignmentGroups, [["assignmentId", "==", assignment.id]]);
    const groups = await autoCreateGroups(assignment.id, groupCount, assignment.cohortId ?? null);
    await data.update(COLLECTIONS.assignments, assignment.id, { groupCount });
    notifyGroupMembers({ id: assignment.id, title: assignment.title }, groups).catch(console.error);
    return json({ groups });
  },
};
