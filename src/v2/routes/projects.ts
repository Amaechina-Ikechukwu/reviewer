import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { json, parseJson } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS, storageDownload, storageUpload } from "../firebase";
import { audit } from "../services/audit";
import { enqueueEmailJob } from "../services/emailJobs";

/**
 * A plain student may always create/edit/delete their own solo project (no
 * permission needed for that, same as submitting an assignment) — but a
 * staff-role user needs actual "projects.manage" in their resolved
 * permissions, same as the dispatcher would enforce, so a staff member whose
 * access has been narrowed away from projects still can't touch others'.
 */
function canManageProjects(user: { role: string; permissions?: readonly string[] | null }): boolean {
  if (!isStaff(user.role)) return true;
  return !!user.permissions?.includes("projects.manage");
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes("://")) return trimmed;
  return `https://${trimmed}`;
}

type ProjectStatus = "active" | "completed" | "archived";

const VALID_STATUSES: ProjectStatus[] = ["active", "completed", "archived"];
const MAX_BRIEF_SIZE = 100 * 1024 * 1024; // 100 MB

type ProjectBody = {
  title?: string;
  description?: string | null;
  studentIds?: string[];
  status?: ProjectStatus;
  deadline?: string | null;
  deployedUrl?: string | null;
  briefPdfPath?: string | null;
};

export const projectRoutes = {
  async create(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!canManageProjects(user)) return json({ error: "You do not have access to do that." }, 403);

    const body = await parseJson<ProjectBody>(request);
    const title = body.title?.trim();
    if (!title) return json({ error: "Project title is required." }, 400);

    let studentIds = body.studentIds?.filter(Boolean) ?? [];
    let assignedBy = user.fullName;

    // Students can create projects; they are auto-added as a member.
    // Staff can create and optionally assign other students.
    if (!isStaff(user.role)) {
      studentIds = [user.userId];
      assignedBy = user.fullName;
    }

    const id = randomUUID();
    const project = await data.insert<any>(COLLECTIONS.projects, id, {
      title,
      description: body.description?.trim() ?? null,
      studentIds,
      status: "active",
      deadline: body.deadline ?? null,
      briefPdfPath: body.briefPdfPath || null,
      createdBy: user.userId,
      createdByName: user.fullName,
    });

    if (studentIds.length > 0 && isStaff(user.role)) {
      const students = await data.findMany<any>(COLLECTIONS.users, {
        where: [["role", "==", "student"]],
      });
      const assigned = students.filter((s: any) => studentIds.includes(s.id));
      if (assigned.length > 0) {
        const recipients = assigned.map((s: any) => ({ email: s.email, fullName: s.fullName }));
        enqueueEmailJob({
          kind: "project_assignment",
          recipients,
          payload: {
            project: { id, title, description: body.description ?? null, deadline: body.deadline ?? null },
            assignedBy,
          },
          actorId: user.userId,
        });
      }
    }

    audit({ actorId: user.userId, actorEmail: user.email, action: "project.create", targetType: "project", targetId: id, details: { title, studentIds } });
    return json(project, 201);
  },

  async list(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    const url = new URL(request.url);
    const studentId = url.searchParams.get("studentId");

    if (isStaff(user.role) && studentId) {
      const projects = await data.findMany<any>(COLLECTIONS.projects, {
        where: [["studentIds", "array-contains", studentId]],
      });
      projects.sort((a: any, b: any) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return db - da;
      });
      return json(projects);
    }

    const projects = isStaff(user.role)
      ? await data.findMany<any>(COLLECTIONS.projects)
      : await data.findMany<any>(COLLECTIONS.projects, {
          where: [["studentIds", "array-contains", user.userId]],
        });

    projects.sort((a: any, b: any) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });

    return json(projects);
  },

  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const project = await data.getById<any>(COLLECTIONS.projects, params.id);
    if (!project) return json({ error: "Project not found." }, 404);

    if (!isStaff(user.role) && !project.studentIds?.includes(user.userId)) {
      return json({ error: "Access denied." }, 403);
    }

    if (project.studentIds?.length > 0) {
      const students = await data.findMany<any>(COLLECTIONS.users, {
        where: [["role", "==", "student"]],
      });
      const assignedStudents = students.filter((s: any) => project.studentIds.includes(s.id));
      project.students = assignedStudents.map((s: any) => ({
        id: s.id, email: s.email, fullName: s.fullName,
      }));
    } else {
      project.students = [];
    }

    return json(project);
  },

  async update(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;

    const project = await data.getById<any>(COLLECTIONS.projects, params.id);
    if (!project) return json({ error: "Project not found." }, 404);

    const isCreator = project.createdBy === user.userId;
    const staffAllowed = isStaff(user.role) && canManageProjects(user);
    if (!staffAllowed && !isCreator) return json({ error: "Access denied." }, 403);

    const body = await parseJson<ProjectBody>(request);
    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = body.title.trim();
    if (body.description !== undefined) update.description = body.description?.trim() ?? null;
    if (body.deadline !== undefined) update.deadline = body.deadline ?? null;
    if (body.briefPdfPath !== undefined) update.briefPdfPath = body.briefPdfPath || null;
    if (body.status !== undefined) {
      if (!isStaff(user.role)) return json({ error: "Only staff can change project status." }, 403);
      if (!VALID_STATUSES.includes(body.status)) return json({ error: "Invalid status." }, 400);
      update.status = body.status;
    }
    // Only staff can change student assignments via update
    if (body.studentIds !== undefined && isStaff(user.role)) {
      update.studentIds = body.studentIds.filter(Boolean);
    }

    if (Object.keys(update).length === 0) return json(project);

    const updated = await data.update<any>(COLLECTIONS.projects, project.id, update);
    audit({ actorId: user.userId, actorEmail: user.email, action: "project.update", targetType: "project", targetId: project.id, details: update });
    return json(updated);
  },

  async remove(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;

    const project = await data.getById<any>(COLLECTIONS.projects, params.id);
    if (!project) return json({ error: "Project not found." }, 404);

    const isCreator = project.createdBy === user.userId;
    const staffAllowed = isStaff(user.role) && canManageProjects(user);
    if (!staffAllowed && !isCreator) return json({ error: "Access denied." }, 403);

    await data.del(COLLECTIONS.projects, project.id);
    audit({ actorId: user.userId, actorEmail: user.email, action: "project.delete", targetType: "project", targetId: project.id });
    return json({ deleted: true });
  },

  /** Anyone signed in can stage a PDF before a project exists yet (or before
   * editing one) — same self-service model as creating the project itself.
   * The returned briefId is only wired to a real project once create/update
   * stores it, so an abandoned upload just sits unreferenced in storage. */
  async uploadBrief(request: Request) {
    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) return json({ error: "Multipart form data required." }, 400);

    const fd = await request.formData();
    const file = fd.get("file") as File | null;
    if (!file) return json({ error: "No file provided." }, 400);

    if (!file.name.toLowerCase().endsWith(".pdf")) return json({ error: "Only PDF files are accepted." }, 400);
    if (file.size > MAX_BRIEF_SIZE) return json({ error: "File must be under 100 MB." }, 400);

    const briefId = randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());
    await storageUpload(`briefs/${briefId}.pdf`, buffer, "application/pdf");

    return json({ briefId });
  },

  async getBrief(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const project = await data.getById<any>(COLLECTIONS.projects, params.id);
    if (!project) return new Response("Not found", { status: 404 });

    if (!isStaff(user.role) && !project.studentIds?.includes(user.userId)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (!project.briefPdfPath) return new Response("Brief not found", { status: 404 });

    const buffer = await storageDownload(`briefs/${project.briefPdfPath}.pdf`).catch(() => null);
    if (!buffer) return new Response("Brief not found", { status: 404 });

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      },
    });
  },

  async assignStudents(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const project = await data.getById<any>(COLLECTIONS.projects, params.id);
    if (!project) return json({ error: "Project not found." }, 404);

    const body = await parseJson<{ studentIds: string[] }>(request);
    const studentIds = body.studentIds?.filter(Boolean) ?? [];
    if (studentIds.length === 0) return json({ error: "At least one studentId is required." }, 400);

    const existing = new Set<string>(project.studentIds ?? []);
    for (const id of studentIds) existing.add(id);
    const mergedStudentIds = Array.from(existing);

    const updated = await data.update<any>(COLLECTIONS.projects, project.id, { studentIds: mergedStudentIds });

    const students = await data.findMany<any>(COLLECTIONS.users, {
      where: [["role", "==", "student"]],
    });
    const assigned = students.filter((s: any) => studentIds.includes(s.id));
    if (assigned.length > 0) {
      const recipients = assigned.map((s: any) => ({ email: s.email, fullName: s.fullName }));
      enqueueEmailJob({
        kind: "project_assignment",
        recipients,
        payload: {
          project: { id: project.id, title: project.title, description: project.description, deadline: project.deadline },
          assignedBy: user.fullName,
        },
        actorId: user.userId,
      });
    }

    audit({ actorId: user.userId, actorEmail: user.email, action: "project.assign_students", targetType: "project", targetId: project.id, details: { studentIds } });
    return json(updated);
  },

  async removeStudent(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const project = await data.getById<any>(COLLECTIONS.projects, params.id);
    if (!project) return json({ error: "Project not found." }, 404);

    const currentIds = project.studentIds ?? [];
    const updatedIds = currentIds.filter((id: string) => id !== params.studentId);
    if (updatedIds.length === currentIds.length) {
      return json({ error: "Student is not assigned to this project." }, 400);
    }

    const updated = await data.update<any>(COLLECTIONS.projects, project.id, { studentIds: updatedIds });
    audit({ actorId: user.userId, actorEmail: user.email, action: "project.remove_student", targetType: "project", targetId: project.id, details: { studentId: params.studentId } });
    return json(updated);
  },

  async submit(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;

    const project = await data.getById<any>(COLLECTIONS.projects, params.id);
    if (!project) return json({ error: "Project not found." }, 404);

    if (!project.studentIds?.includes(user.userId)) {
      return json({ error: "You are not a member of this project." }, 403);
    }

    if (project.status === "completed" && project.reviewStatus !== "declined") {
      return json({ error: "Project is already submitted." }, 400);
    }

    const body = await parseJson<{ deployedUrl: string }>(request);
    if (!body.deployedUrl?.trim()) return json({ error: "Deployed URL is required." }, 400);

    const deployedUrl = normalizeUrl(body.deployedUrl);

    const submittedAt = new Date().toISOString();

    const updated = await data.update<any>(COLLECTIONS.projects, project.id, {
      status: "completed",
      deployedUrl,
      submittedAt,
      reviewStatus: null,
      reviewComment: null,
    });

    // Notify staff via email
    const allUsers = await data.findMany<any>(COLLECTIONS.users, {});
    const staff = allUsers.filter((u: any) => isStaff(u.role) && u.email && !u.email.endsWith("@historical.reviewai.local"));

    if (staff.length > 0) {
      const recipients = staff.map((s: any) => ({ email: s.email, fullName: s.fullName }));
      enqueueEmailJob({
        kind: "project_submission",
        recipients,
        payload: {
          project: { id: project.id, title: project.title, deployedUrl },
          studentName: user.fullName,
        },
        actorId: user.userId,
      });
    }

    // Create in-app notifications for all staff
    const notificationId = randomUUID();
    await data.insert(COLLECTIONS.inAppNotifications, notificationId, {
      recipientId: null, // null = all staff; could expand to per-user later
      type: "project_submission",
      title: "Project submitted",
      body: `${user.fullName} submitted "${project.title}"`,
      link: `/teacher/projects/${project.id}`,
      read: false,
      forRole: "staff",
    });

    audit({ actorId: user.userId, actorEmail: user.email, action: "project.submit", targetType: "project", targetId: project.id, details: { deployedUrl } });
    return json(updated);
  },

  async review(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const project = await data.getById<any>(COLLECTIONS.projects, params.id);
    if (!project) return json({ error: "Project not found." }, 404);

    if (project.status !== "completed") {
      return json({ error: "Project has not been submitted yet." }, 400);
    }

    const body = await parseJson<{ action: "accepted" | "declined"; comment?: string }>(request);
    if (!["accepted", "declined"].includes(body.action)) {
      return json({ error: "Invalid action. Must be 'accepted' or 'declined'." }, 400);
    }

    const accepted = body.action === "accepted";

    const update: Record<string, unknown> = {
      reviewStatus: body.action,
    };
    if (body.comment) update.reviewComment = body.comment;
    if (!accepted) update.status = "active";

    const updated = await data.update<any>(COLLECTIONS.projects, project.id, update);

    // Notify the project members
    const allUsers = await data.findMany<any>(COLLECTIONS.users, {});
    const members = allUsers.filter((u: any) => project.studentIds?.includes(u.id));
    const recipients = members
      .filter((u: any) => u.email && !u.email.endsWith("@historical.reviewai.local"))
      .map((u: any) => ({ email: u.email, fullName: u.fullName }));

    if (recipients.length > 0) {
      enqueueEmailJob({
        kind: "project_review",
        recipients,
        payload: {
          project: { id: project.id, title: project.title },
          action: body.action,
          comment: body.comment ?? null,
          reviewedBy: user.fullName,
        },
        actorId: user.userId,
      });
    }

    // In-app notification for project members
    for (const member of members) {
      const notifId = randomUUID();
      const actionLabel = accepted ? "Accepted" : "Declined";
      await data.insert(COLLECTIONS.inAppNotifications, notifId, {
        recipientId: member.id,
        type: "project_review",
        title: `Project ${actionLabel.toLowerCase()}`,
        body: accepted
          ? `"${project.title}" was accepted by ${user.fullName}`
          : `"${project.title}" was declined by ${user.fullName}${body.comment ? `: ${body.comment}` : ""}`,
        link: `/student/projects/${project.id}`,
        read: false,
        forRole: "student",
      });
    }

    audit({ actorId: user.userId, actorEmail: user.email, action: "project.review", targetType: "project", targetId: project.id, details: { action: body.action, comment: body.comment } });
    return json(updated);
  },
};
