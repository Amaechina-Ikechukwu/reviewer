import { randomBytes, randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { enqueueEmailJob } from "../services/emailJobs";
import { json, parseJson } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS, storageUpload, storageDownload } from "../firebase";
import { isStaffOrGranted } from "../../utils/permissions";

type Track = "frontend" | "backend" | "data_analytics" | "product_design" | "digital_marketing" | "cyber_security";
const CODE_TRACKS: Track[] = ["frontend", "backend", "cyber_security"];
function trackAllowsGithub(track?: Track | null): boolean {
  if (!track) return true;
  return CODE_TRACKS.includes(track);
}

const MAX_BRIEF_SIZE = 100 * 1024 * 1024; // 100 MB

type AssignmentBody = {
  title?: string;
  description?: string;
  rubric?: string;
  maxScore?: number;
  sourceType?: "manual" | "markdown" | "notion" | "mixed" | "pdf" | "docx" | "link";
  sourceMarkdown?: string;
  sourceUrl?: string;
  sourcePdfPath?: string | null;
  sourceDocxPath?: string | null;
  opensAt?: string;
  closesAt?: string;
  allowGithub?: boolean;
  allowFileUpload?: boolean;
  defaultProvider?: "openrouter";
  classNotesType?: "markdown" | "pdf" | "docx" | "link" | null;
  classNotes?: string;
  classNotesUrl?: string | null;
  classNotesPdfPath?: string | null;
  classNotesDocxPath?: string | null;
  isGroupAssignment?: boolean;
  groupCount?: number;
  groupQuestionMode?: "same" | "per_group";
  track?: Track | null;
  cohortId?: string | null;
  questions?: string | null;
  excludedStudentIds?: string[];
};

function validateAssignmentSource(sourceType: string | undefined, sourceMarkdown: string | null | undefined, sourceUrl: string | null | undefined, sourcePdfPath: string | null | undefined, sourceDocxPath: string | null | undefined): string | null {
  if (sourceType === "pdf" && !sourcePdfPath) return "Please upload a PDF brief before creating the assignment.";
  if (sourceType === "docx" && !sourceDocxPath) return "Please upload a DOCX brief before creating the assignment.";
  if (sourceType === "markdown" && !(sourceMarkdown && sourceMarkdown.trim())) return "Please provide markdown content for the assignment brief.";
  if ((sourceType === "notion" || sourceType === "link") && !(sourceUrl && sourceUrl.trim())) return "Please provide a valid URL for the assignment brief.";
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
  assets?: GroupAssetInput[];
};

type GroupAssetInput = {
  id?: string;
  name?: string;
  kind?: "file" | "link";
  ext?: string | null;
  url?: string | null;
};

const GROUP_ASSET_EXTS: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const MAX_GROUP_ASSETS = 20;

function sanitizeGroupAssets(input: unknown): { id: string; name: string; kind: "file" | "link"; ext: string | null; url: string | null }[] {
  if (!Array.isArray(input)) return [];
  const out: { id: string; name: string; kind: "file" | "link"; ext: string | null; url: string | null }[] = [];
  for (const raw of input as GroupAssetInput[]) {
    if (out.length >= MAX_GROUP_ASSETS) break;
    if (!raw || typeof raw !== "object") continue;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : "";
    if (raw.kind === "link") {
      const url = typeof raw.url === "string" ? raw.url.trim() : "";
      if (!/^https?:\/\//i.test(url)) continue;
      out.push({ id: typeof raw.id === "string" && raw.id ? raw.id : randomUUID(), name: name || url, kind: "link", ext: null, url });
    } else if (raw.kind === "file") {
      const id = typeof raw.id === "string" ? raw.id : "";
      const ext = typeof raw.ext === "string" ? raw.ext.toLowerCase() : "";
      if (!/^[a-z0-9-]{10,64}$/i.test(id) || !GROUP_ASSET_EXTS[ext]) continue;
      out.push({ id, name: name || `asset.${ext}`, kind: "file", ext, url: null });
    }
  }
  return out;
}

async function autoCreateGroups(
  assignmentId: string,
  groupCount: number,
  cohortId: string | null,
  drafts?: GroupDraft[],
  excludedStudentIds: string[] = [],
) {
  const groups: { id: string; name: string; memberIds: string[] }[] = [];
  const excluded = new Set(excludedStudentIds);

  const draftedMemberIds = new Set<string>();
  if (drafts && drafts.length > 0) {
    for (const d of drafts) {
      for (const m of d.memberIds || []) if (!excluded.has(m)) draftedMemberIds.add(m);
    }
  }

  // If drafts contain explicit member assignments, trust them; otherwise round-robin all students.
  const useDraftMembers = draftedMemberIds.size > 0;

  let distributed: string[][] = Array.from({ length: groupCount }, () => []);
  if (useDraftMembers) {
    for (let i = 0; i < groupCount; i++) {
      distributed[i] = (drafts?.[i]?.memberIds || []).filter((m) => Boolean(m) && !excluded.has(m));
    }
  } else {
    const studentWhere: any[] = [["role", "==", "student"]];
    if (cohortId) studentWhere.push(["cohortId", "==", cohortId]);
    const allStudents = await data.findMany<any>(COLLECTIONS.users, { where: studentWhere });
    const real = allStudents.filter((s) => s.passwordHash !== "INVITE_PENDING" && !excluded.has(s.id));
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
      assets: sanitizeGroupAssets(d?.assets),
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
    if (!isStaffOrGranted(user, "assignments.manage")) return json({ error: "Only staff can create assignments." }, 403);

    const body = await parseJson<AssignmentBody>(request);
    if (!body.title || !body.closesAt) return json({ error: "Missing required assignment fields." }, 400);

    const sourceErr = validateAssignmentSource(body.sourceType, body.sourceMarkdown, body.sourceUrl, body.sourcePdfPath, body.sourceDocxPath);
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
      sourceDocxPath: body.sourceDocxPath || null,
      createdBy: user.userId,
      opensAt,
      closesAt,
      maxScore: body.maxScore && body.maxScore > 0 ? Math.round(body.maxScore) : 100,
      allowGithub: effectiveAllowGithub,
      allowFileUpload: body.allowFileUpload ?? true,
      defaultProvider: "openrouter",
      classNotesType: body.classNotesType || null,
      classNotes: body.classNotes?.trim() || null,
      classNotesUrl: body.classNotesUrl?.trim() || null,
      classNotesPdfPath: body.classNotesPdfPath || null,
      classNotesDocxPath: body.classNotesDocxPath || null,
      questions: body.questions?.trim() || null,
      isGroupAssignment,
      groupCount,
      groupQuestionMode,
      track: track || null,
      cohortId: body.cohortId?.trim() || null,
      excludedStudentIds: Array.isArray(body.excludedStudentIds) ? body.excludedStudentIds.filter((s) => typeof s === "string") : [],
    });

    if (isGroupAssignment) {
      const drafts = Array.isArray((body as any).groupDrafts) ? ((body as any).groupDrafts as GroupDraft[]) : undefined;
      const createdGroups = await autoCreateGroups(id, groupCount, body.cohortId?.trim() || null, drafts, assignment.excludedStudentIds);
      notifyGroupMembers({ id, title: assignment.title }, createdGroups).catch(console.error);
    }

    if (opensAt <= new Date()) {
      if (body.cohortId?.trim()) {
        const studentWhere: any[] = [
          ["role", "==", "student"],
          ["cohortId", "==", body.cohortId.trim()],
        ];
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

  // Unauthenticated: returns only the brief-facing fields so the assignment
  // brief can be shared with anyone via a public link, without exposing
  // teacher-only data (rubric, createdBy, cohortId, etc).
  async getPublicBrief(request: Request, params: Record<string, string>) {
    const a = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!a) return json({ error: "Assignment not found." }, 404);
    return json({
      id: a.id,
      title: a.title,
      description: a.description,
      sourceType: a.sourceType,
      sourceMarkdown: a.sourceMarkdown,
      sourceUrl: a.sourceUrl,
      sourcePdfPath: a.sourcePdfPath,
      sourceDocxPath: a.sourceDocxPath,
      maxScore: a.maxScore,
      closesAt: a.closesAt,
      track: a.track,
      isGroupAssignment: Boolean(a.isGroupAssignment),
      groupCount: a.groupCount ?? 0,
    });
  },

  async update(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "assignments.manage")) return json({ error: "Only staff can edit assignments." }, 403);

    const existing = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!existing || existing.createdBy !== user.userId) return json({ error: "Assignment not found." }, 404);

    const body = await parseJson<AssignmentBody>(request);

    const newAllowGithub = body.allowGithub !== undefined ? body.allowGithub : existing.allowGithub;
    const newAllowFileUpload = body.allowFileUpload !== undefined ? body.allowFileUpload : existing.allowFileUpload;

    const nextTrack = body.track !== undefined ? (body.track || null) : existing.track;
    if (nextTrack && !trackAllowsGithub(nextTrack as Track) && newAllowGithub) {
      return json({ error: "GitHub submissions are not available for this track." }, 400);
    }

    const nextSourceType = body.sourceType !== undefined ? body.sourceType : existing.sourceType;
    const nextSourceMarkdown = body.sourceMarkdown !== undefined ? (body.sourceMarkdown?.trim() || null) : existing.sourceMarkdown;
    const nextSourceUrl = body.sourceUrl !== undefined ? (body.sourceUrl?.trim() || null) : existing.sourceUrl;
    const nextSourcePdfPath = body.sourcePdfPath !== undefined ? (body.sourcePdfPath || null) : existing.sourcePdfPath;
    const nextSourceDocxPath = body.sourceDocxPath !== undefined ? (body.sourceDocxPath || null) : existing.sourceDocxPath;
    const sourceErr = validateAssignmentSource(nextSourceType, nextSourceMarkdown, nextSourceUrl, nextSourcePdfPath, nextSourceDocxPath);
    if (sourceErr) return json({ error: sourceErr }, 400);

    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = body.title.trim();
    if (body.description !== undefined) update.description = body.description?.trim() ?? "";
    if (body.rubric !== undefined) update.rubric = body.rubric?.trim() ?? "";
    if (body.sourceType !== undefined) update.sourceType = body.sourceType;
    if (body.sourceMarkdown !== undefined) update.sourceMarkdown = body.sourceMarkdown?.trim() || null;
    if (body.sourceUrl !== undefined) update.sourceUrl = body.sourceUrl?.trim() || null;
    if (body.sourcePdfPath !== undefined) update.sourcePdfPath = body.sourcePdfPath || null;
    if (body.sourceDocxPath !== undefined) update.sourceDocxPath = body.sourceDocxPath || null;
    if (body.allowGithub !== undefined) update.allowGithub = body.allowGithub;
    if (body.allowFileUpload !== undefined) update.allowFileUpload = body.allowFileUpload;
    if (body.maxScore !== undefined) update.maxScore = body.maxScore > 0 ? Math.round(body.maxScore) : 100;
    if (body.classNotesType !== undefined) update.classNotesType = body.classNotesType || null;
    if (body.classNotes !== undefined) update.classNotes = body.classNotes?.trim() || null;
    if (body.classNotesUrl !== undefined) update.classNotesUrl = body.classNotesUrl?.trim() || null;
    if (body.classNotesPdfPath !== undefined) update.classNotesPdfPath = body.classNotesPdfPath || null;
    if (body.classNotesDocxPath !== undefined) update.classNotesDocxPath = body.classNotesDocxPath || null;
    if (body.questions !== undefined) update.questions = body.questions?.trim() || null;
    if (body.cohortId !== undefined) update.cohortId = body.cohortId?.trim() || null;
    if (body.track !== undefined) update.track = body.track || null;

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
    if (!isStaffOrGranted(user, "assignments.delete")) return json({ error: "Only staff can delete assignments." }, 403);

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

    // Students only ever see their own group — other teams' briefs, rubrics and
    // assets stay private to their members.
    if (user.role === "student") {
      const myGroup = groups.find((g) => (g.memberIds || []).includes(user.userId)) || null;
      if (!myGroup) return json({ groups: [], members: {}, myGroupId: null });
      const myMembers: typeof members = {};
      for (const id of myGroup.memberIds || []) if (members[id]) myMembers[id] = members[id];
      return json({ groups: [myGroup], members: myMembers, myGroupId: myGroup.id });
    }

    return json({ groups, members });
  },

  async updateGroups(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "assignments.manage")) return json({ error: "Only staff can edit groups." }, 403);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment || assignment.createdBy !== user.userId) return json({ error: "Assignment not found." }, 404);
    if (!assignment.isGroupAssignment) return json({ error: "This assignment is not a group project." }, 400);

    const body = await parseJson<{
      groups?: { id?: string; name?: string; memberIds?: string[]; description?: string | null; rubric?: string | null; sourceType?: string | null; sourceUrl?: string | null; sourcePdfPath?: string | null; assets?: GroupAssetInput[] }[];
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
    const previousShareTokens = new Map<string, string>();
    for (const g of previousGroups) {
      for (const m of g.memberIds || []) previousMembership.set(m, g.id);
      if (g.shareToken) previousShareTokens.set(g.id, g.shareToken);
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
      const assets = sanitizeGroupAssets(g.assets);
      await data.insert(COLLECTIONS.assignmentGroups, id, {
        assignmentId: assignment.id,
        name,
        memberIds,
        description,
        rubric,
        sourceType,
        sourceUrl,
        sourcePdfPath,
        assets,
        // Saving rewrites the group docs; keep any existing public link alive.
        shareToken: previousShareTokens.get(id) ?? null,
      });
      created.push({
        id, name, memberIds, description, rubric, sourceType, sourceUrl, sourcePdfPath, assets,
        shareToken: previousShareTokens.get(id) ?? null,
      });
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
    if (!isStaffOrGranted(user, "assignments.manage")) return json({ error: "Only staff can upload assignment files." }, 403);

    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) return json({ error: "Multipart form data required." }, 400);

    const fd = await request.formData();
    const file = fd.get("file") as File | null;
    if (!file) return json({ error: "No file provided." }, 400);
    
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    const isDocx = file.name.toLowerCase().endsWith(".docx");
    if (!isPdf && !isDocx) return json({ error: "Only PDF and DOCX files are accepted." }, 400);
    if (file.size > MAX_BRIEF_SIZE) return json({ error: "File must be under 100 MB." }, 400);

    const briefId = randomUUID();
    const ext = isPdf ? "pdf" : "docx";
    const buffer = Buffer.from(await file.arrayBuffer());
    await storageUpload(`briefs/${briefId}.${ext}`, buffer, isPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    return json({ briefId, ext });
  },

  async uploadGroupAsset(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "assignments.manage")) return json({ error: "Only staff can upload group assets." }, 403);

    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) return json({ error: "Multipart form data required." }, 400);

    const fd = await request.formData();
    const file = fd.get("file") as File | null;
    if (!file) return json({ error: "No file provided." }, 400);

    const ext = file.name.toLowerCase().split(".").pop() || "";
    const contentType = GROUP_ASSET_EXTS[ext];
    if (!contentType) return json({ error: "Only PDF and image files (PNG, JPG, GIF, WEBP) are accepted." }, 400);
    if (file.size > MAX_BRIEF_SIZE) return json({ error: "File must be under 100 MB." }, 400);

    const assetId = randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());
    await storageUpload(`group-assets/${assetId}.${ext}`, buffer, contentType);

    return json({ assetId, ext, name: file.name });
  },

  async getGroupAsset(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const group = await data.getById<any>(COLLECTIONS.assignmentGroups, params.groupId);
    if (!group || group.assignmentId !== params.id) return new Response("Not found", { status: 404 });
    if (!isStaff(user.role) && !(group.memberIds || []).includes(user.userId)) {
      return new Response("Not found", { status: 404 });
    }

    const asset = (group.assets || []).find((a: any) => a.id === params.assetId && a.kind === "file");
    if (!asset || !GROUP_ASSET_EXTS[asset.ext]) return new Response("Not found", { status: 404 });

    const buffer = await storageDownload(`group-assets/${asset.id}.${asset.ext}`).catch(() => null);
    if (!buffer) return new Response("Not found", { status: 404 });

    return new Response(buffer as unknown as BodyInit, {
      headers: { "Content-Type": GROUP_ASSET_EXTS[asset.ext], "Content-Disposition": "inline" },
    });
  },

  async shareGroup(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "assignments.manage")) return json({ error: "Only staff can share groups." }, 403);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment) return json({ error: "Assignment not found." }, 404);
    if (["instructor", "teacher", "manager"].includes(user.role) && assignment.createdBy !== user.userId) {
      return json({ error: "Assignment not found." }, 404);
    }

    const group = await data.getById<any>(COLLECTIONS.assignmentGroups, params.groupId);
    if (!group || group.assignmentId !== assignment.id) return json({ error: "Group not found." }, 404);
    if (group.shareToken) return json({ shareToken: group.shareToken });

    const shareToken = randomBytes(16).toString("base64url");
    await data.update(COLLECTIONS.assignmentGroups, group.id, { shareToken, sharedAt: new Date() });
    return json({ shareToken });
  },

  async unshareGroup(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "assignments.manage")) return json({ error: "Only staff can unshare groups." }, 403);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment) return json({ error: "Assignment not found." }, 404);
    if (["instructor", "teacher", "manager"].includes(user.role) && assignment.createdBy !== user.userId) {
      return json({ error: "Assignment not found." }, 404);
    }

    const group = await data.getById<any>(COLLECTIONS.assignmentGroups, params.groupId);
    if (!group || group.assignmentId !== assignment.id) return json({ error: "Group not found." }, 404);

    await data.update(COLLECTIONS.assignmentGroups, group.id, { shareToken: null, sharedAt: null });
    return json({ shareToken: null });
  },

  // Unauthenticated read of a shared group. Exposes the team's brief, resources
  // and member names — never emails, rubric-only teacher notes or other teams.
  async getPublicGroup(_request: Request, params: Record<string, string>) {
    const token = params.token?.trim();
    if (!token) return json({ error: "Group not found." }, 404);

    const group = await data.findOne<any>(COLLECTIONS.assignmentGroups, [["shareToken", "==", token]]);
    if (!group) return json({ error: "This link is no longer available." }, 404);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, group.assignmentId);
    const members = await Promise.all(
      (group.memberIds || []).map((id: string) => data.getById<any>(COLLECTIONS.users, id)),
    );

    return json({
      name: group.name,
      description: group.description ?? null,
      rubric: group.rubric ?? null,
      sourceType: group.sourceType ?? null,
      sourceUrl: group.sourceUrl ?? null,
      hasBrief: Boolean(group.sourcePdfPath),
      assets: (group.assets || []).map((a: any) => ({ id: a.id, name: a.name, kind: a.kind, ext: a.ext, url: a.url })),
      memberNames: members.filter(Boolean).map((m: any) => m.fullName),
      assignmentTitle: assignment?.title ?? null,
      closesAt: assignment?.closesAt ?? null,
      maxScore: assignment?.maxScore ?? null,
    });
  },

  async getPublicGroupBrief(_request: Request, params: Record<string, string>) {
    const group = await data.findOne<any>(COLLECTIONS.assignmentGroups, [["shareToken", "==", params.token?.trim()]]);
    if (!group || !group.sourcePdfPath) return new Response("Not found", { status: 404 });

    const buffer = await storageDownload(`briefs/${group.sourcePdfPath}.pdf`).catch(() => null);
    if (!buffer) return new Response("Not found", { status: 404 });

    return new Response(buffer as unknown as BodyInit, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline" },
    });
  },

  async getPublicGroupAsset(_request: Request, params: Record<string, string>) {
    const group = await data.findOne<any>(COLLECTIONS.assignmentGroups, [["shareToken", "==", params.token?.trim()]]);
    if (!group) return new Response("Not found", { status: 404 });

    const asset = (group.assets || []).find((a: any) => a.id === params.assetId && a.kind === "file");
    if (!asset || !GROUP_ASSET_EXTS[asset.ext]) return new Response("Not found", { status: 404 });

    const buffer = await storageDownload(`group-assets/${asset.id}.${asset.ext}`).catch(() => null);
    if (!buffer) return new Response("Not found", { status: 404 });

    return new Response(buffer as unknown as BodyInit, {
      headers: { "Content-Type": GROUP_ASSET_EXTS[asset.ext], "Content-Disposition": "inline" },
    });
  },

  async getGroupBrief(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const group = await data.getById<any>(COLLECTIONS.assignmentGroups, params.groupId);
    if (!group || group.assignmentId !== params.id) return new Response("Not found", { status: 404 });
    if (!isStaff(user.role) && !(group.memberIds || []).includes(user.userId)) {
      return new Response("Not found", { status: 404 });
    }
    if (!group.sourcePdfPath) return new Response("Brief not found", { status: 404 });

    const buffer = await storageDownload(`briefs/${group.sourcePdfPath}.pdf`).catch(() => null);
    if (!buffer) return new Response("Brief not found", { status: 404 });

    return new Response(buffer as unknown as BodyInit, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline" },
    });
  },

  async getBrief(request: Request, params: Record<string, string>) {
    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment) return new Response("Not found", { status: 404 });

    const isDocx = assignment.sourceType === "docx";
    const briefId = isDocx ? assignment.sourceDocxPath : assignment.sourcePdfPath;
    if (!briefId) return new Response("Brief not found", { status: 404 });

    const ext = isDocx ? "docx" : "pdf";
    const buffer = await storageDownload(`briefs/${briefId}.${ext}`).catch(() => null);
    if (!buffer) return new Response("Brief not found", { status: 404 });

    const headers: Record<string, string> = {
      "Content-Type": isDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
    };
    if (isDocx) {
      headers["Content-Disposition"] = `attachment; filename="${assignment.title.replace(/[^a-z0-9]/gi, '_')}_Brief.docx"`;
    } else {
      headers["Content-Disposition"] = "inline";
    }

    return new Response(buffer as unknown as BodyInit, { headers });
  },

  async getClassNotesAsset(request: Request, params: Record<string, string>) {
    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment) return new Response("Not found", { status: 404 });

    const isDocx = assignment.classNotesType === "docx";
    const assetId = isDocx ? assignment.classNotesDocxPath : assignment.classNotesPdfPath;
    if (!assetId) return new Response("Asset not found", { status: 404 });

    const ext = isDocx ? "docx" : "pdf";
    const buffer = await storageDownload(`briefs/${assetId}.${ext}`).catch(() => null);
    if (!buffer) return new Response("Asset not found", { status: 404 });

    const headers: Record<string, string> = {
      "Content-Type": isDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
    };
    if (isDocx) {
      headers["Content-Disposition"] = `attachment; filename="${assignment.title.replace(/[^a-z0-9]/gi, '_')}_ClassNotes.docx"`;
    } else {
      headers["Content-Disposition"] = "inline";
    }

    return new Response(buffer as unknown as BodyInit, { headers });
  },

  async regenerateGroups(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "assignments.manage")) return json({ error: "Only staff can regenerate groups." }, 403);

    const assignment = await data.getById<any>(COLLECTIONS.assignments, params.id);
    if (!assignment || assignment.createdBy !== user.userId) return json({ error: "Assignment not found." }, 404);
    if (!assignment.isGroupAssignment) return json({ error: "This assignment is not a group project." }, 400);

    const body = await parseJson<{ groupCount?: number; excludedStudentIds?: string[] }>(request).catch(() => ({} as any));
    const groupCount = Math.max(1, Math.min(50, Math.round(body.groupCount ?? assignment.groupCount ?? 1)));
    const excludedStudentIds = Array.isArray(body.excludedStudentIds)
      ? body.excludedStudentIds.filter((s: unknown) => typeof s === "string")
      : (assignment.excludedStudentIds ?? []);
    if (Array.isArray(body.excludedStudentIds)) {
      await data.update(COLLECTIONS.assignments, assignment.id, { excludedStudentIds });
    }

    await data.delMany(COLLECTIONS.assignmentGroups, [["assignmentId", "==", assignment.id]]);
    const groups = await autoCreateGroups(assignment.id, groupCount, assignment.cohortId ?? null, undefined, excludedStudentIds);
    await data.update(COLLECTIONS.assignments, assignment.id, { groupCount });
    notifyGroupMembers({ id: assignment.id, title: assignment.title }, groups).catch(console.error);
    return json({ groups });
  },
};
