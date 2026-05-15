import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { json, parseJson } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { audit } from "../services/audit";

type Track = "frontend" | "backend" | "data_analytics" | "product_design" | "digital_marketing" | "cyber_security";

const VALID_TRACKS: Track[] = ["frontend", "backend", "data_analytics", "product_design", "digital_marketing", "cyber_security"];

type CohortBody = {
  name?: string;
  track?: Track;
  description?: string | null;
};

export const cohortRoutes = {
  async list(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const cohorts = await data.findMany<any>(COLLECTIONS.cohorts, { orderBy: ["createdAt", "desc"] });

    // Attach student counts
    const allStudents = await data.findMany<any>(COLLECTIONS.users, { where: [["role", "==", "student"]] });
    const countMap = new Map<string, number>();
    for (const s of allStudents) {
      if (s.cohortId) countMap.set(s.cohortId, (countMap.get(s.cohortId) ?? 0) + 1);
    }

    return json(cohorts.map((c: any) => ({ ...c, studentCount: countMap.get(c.id) ?? 0 })));
  },

  async create(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const body = await parseJson<CohortBody>(request);
    const name = body.name?.trim();
    if (!name) return json({ error: "Cohort name is required." }, 400);
    if (!body.track || !VALID_TRACKS.includes(body.track)) {
      return json({ error: "A valid track is required." }, 400);
    }

    const id = randomUUID();
    const cohort = await data.insert<any>(COLLECTIONS.cohorts, id, {
      name,
      track: body.track,
      description: body.description?.trim() || null,
      createdBy: user.userId,
    });

    audit({ actorId: user.userId, actorEmail: user.email, action: "cohort.create", targetType: "cohort", targetId: id, details: { name, track: body.track } });
    return json(cohort, 201);
  },

  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const cohort = await data.getById<any>(COLLECTIONS.cohorts, params.id);
    if (!cohort) return json({ error: "Cohort not found." }, 404);

    const students = await data.findMany<any>(COLLECTIONS.users, {
      where: [["cohortId", "==", cohort.id], ["role", "==", "student"]],
    });

    return json({
      ...cohort,
      students: students.map(({ passwordHash, ...s }: any) => ({
        id: s.id, email: s.email, fullName: s.fullName, role: s.role, createdAt: s.createdAt,
        pending: passwordHash === "INVITE_PENDING",
      })),
    });
  },

  async update(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const cohort = await data.getById<any>(COLLECTIONS.cohorts, params.id);
    if (!cohort) return json({ error: "Cohort not found." }, 404);

    const body = await parseJson<CohortBody>(request);
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.description !== undefined) update.description = body.description?.trim() || null;
    if (body.track !== undefined) {
      if (!VALID_TRACKS.includes(body.track)) return json({ error: "Invalid track." }, 400);
      update.track = body.track;
    }
    if (Object.keys(update).length === 0) return json(cohort);

    const updated = await data.update<any>(COLLECTIONS.cohorts, cohort.id, update);
    audit({ actorId: user.userId, actorEmail: user.email, action: "cohort.update", targetType: "cohort", targetId: cohort.id, details: update });
    return json(updated);
  },

  async remove(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const cohort = await data.getById<any>(COLLECTIONS.cohorts, params.id);
    if (!cohort) return json({ error: "Cohort not found." }, 404);

    // Remove cohort reference from students
    const students = await data.findMany<any>(COLLECTIONS.users, {
      where: [["cohortId", "==", cohort.id]],
    });
    await Promise.all(students.map((s: any) => data.update(COLLECTIONS.users, s.id, { cohortId: null })));

    await data.del(COLLECTIONS.cohorts, cohort.id);
    audit({ actorId: user.userId, actorEmail: user.email, action: "cohort.delete", targetType: "cohort", targetId: cohort.id, details: { name: cohort.name } });
    return json({ deleted: true });
  },

  async addStudent(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const cohort = await data.getById<any>(COLLECTIONS.cohorts, params.id);
    if (!cohort) return json({ error: "Cohort not found." }, 404);

    const body = await parseJson<{ studentId?: string; studentIds?: string[] }>(request);
    const ids = body.studentIds?.length ? body.studentIds : body.studentId ? [body.studentId] : [];
    if (!ids.length) return json({ error: "studentId or studentIds is required." }, 400);

    for (const sid of ids) {
      const student = await data.getById<any>(COLLECTIONS.users, sid);
      if (!student || student.role !== "student") continue;
      await data.update(COLLECTIONS.users, sid, { cohortId: cohort.id });
    }
    audit({ actorId: user.userId, actorEmail: user.email, action: "cohort.add_students", targetType: "cohort", targetId: cohort.id, details: { studentIds: ids } });
    return json({ added: true, count: ids.length });
  },

  async removeStudent(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const cohort = await data.getById<any>(COLLECTIONS.cohorts, params.id);
    if (!cohort) return json({ error: "Cohort not found." }, 404);

    const student = await data.getById<any>(COLLECTIONS.users, params.studentId);
    if (!student || student.role !== "student") return json({ error: "Student not found." }, 404);
    if (student.cohortId !== cohort.id) return json({ error: "Student is not in this cohort." }, 400);

    await data.update(COLLECTIONS.users, params.studentId, { cohortId: null });
    audit({ actorId: user.userId, actorEmail: user.email, action: "cohort.remove_student", targetType: "cohort", targetId: cohort.id, details: { studentId: params.studentId } });
    return json({ removed: true });
  },
};
