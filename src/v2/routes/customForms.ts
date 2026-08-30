import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaffOrGranted } from "../../utils/permissions";
import { enqueueEmailJob } from "../services/emailJobs";
import { json, parseJson } from "../../utils/json";
import { audit } from "../services/audit";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";

type FieldType = "short_text" | "long_text" | "number" | "single_choice" | "multi_choice" | "url";

type FormField = {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  helpText?: string;
};

type FormBody = {
  title?: string;
  description?: string;
  fields?: FormField[];
  status?: "draft" | "open" | "closed";
  closesAt?: string | null;
  targetType?: "all" | "specific";
  targetStudentId?: string | null;
  targetGroupId?: string | null;
  assignmentId?: string | null;
};

type ResponseBody = {
  answers?: Record<string, unknown>;
};

type DecisionBody = {
  fieldId?: string;
  decision?: "approved" | "rejected" | "pending";
  notes?: string;
};

function normalizeField(raw: any, index: number): FormField | null {
  if (!raw || typeof raw !== "object") return null;
  const label = String(raw.label ?? "").trim();
  if (!label) return null;
  const type = (["short_text", "long_text", "number", "single_choice", "multi_choice", "url"].includes(raw.type)
    ? raw.type
    : "short_text") as FieldType;
  const required = raw.required === true;
  const id = String(raw.id || `f_${index}_${randomUUID().slice(0, 8)}`);
  const options = Array.isArray(raw.options)
    ? raw.options.map((o: unknown) => String(o ?? "").trim()).filter(Boolean)
    : undefined;
  const helpText = raw.helpText ? String(raw.helpText).trim() : undefined;

  if ((type === "single_choice" || type === "multi_choice") && (!options || options.length === 0)) {
    return null;
  }

  return {
    id,
    label,
    type,
    required,
    ...(options !== undefined ? { options } : {}),
    ...(helpText ? { helpText } : {}),
  };
}

function validateAnswers(fields: FormField[], answers: Record<string, unknown>): string | null {
  for (const f of fields) {
    const value = answers[f.id];
    const isEmpty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (f.required && isEmpty) return `Please answer: ${f.label}`;
    if (isEmpty) continue;

    if (f.type === "number" && !Number.isFinite(Number(value))) return `${f.label} must be a number.`;
    if (f.type === "url") {
      try {
        new URL(String(value));
      } catch {
        return `${f.label} must be a valid URL.`;
      }
    }
    if (f.type === "single_choice" && !f.options?.includes(String(value))) {
      return `${f.label} has an invalid choice.`;
    }
    if (f.type === "multi_choice") {
      if (!Array.isArray(value)) return `${f.label} must be a list of choices.`;
      for (const v of value) {
        if (!f.options?.includes(String(v))) return `${f.label} has an invalid choice.`;
      }
    }
  }
  return null;
}

async function isFormVisibleToStudent(form: any, studentId: string): Promise<boolean> {
  if (form.targetType !== "specific") return true;
  if (form.targetStudentId) return form.targetStudentId === studentId;
  if (form.targetGroupId) {
    const group = await data.getById<any>(COLLECTIONS.assignmentGroups, form.targetGroupId);
    return !!(group && Array.isArray(group.memberIds) && group.memberIds.includes(studentId));
  }
  return true;
}

async function getFormRecipients(form: any): Promise<{ email: string; fullName: string }[]> {
  if (form.targetType === "specific" && form.targetStudentId) {
    const student = await data.getById<any>(COLLECTIONS.users, form.targetStudentId);
    if (student && student.passwordHash !== "INVITE_PENDING") {
      return [{ email: student.email, fullName: student.fullName }];
    }
    return [];
  }

  if (form.targetType === "specific" && form.targetGroupId) {
    const group = await data.getById<any>(COLLECTIONS.assignmentGroups, form.targetGroupId);
    if (group && group.memberIds) {
      const recipients: { email: string; fullName: string }[] = [];
      for (const memberId of group.memberIds) {
        const member = await data.getById<any>(COLLECTIONS.users, memberId);
        if (member && member.passwordHash !== "INVITE_PENDING") {
          recipients.push({ email: member.email, fullName: member.fullName });
        }
      }
      return recipients;
    }
    return [];
  }

  const allStudents = await data.findMany<any>(COLLECTIONS.users, { where: [["role", "==", "student"]] });
  return allStudents
    .filter((s) => s.passwordHash !== "INVITE_PENDING")
    .filter((s) => !String(s.email).endsWith("@historical.reviewai.local"))
    .map((s) => ({ email: s.email, fullName: s.fullName }));
}

export const customFormRoutes = {
  async create(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "forms.manage")) return json({ error: "Access denied." }, 403);

    const body = await parseJson<FormBody>(request);
    const title = body.title?.trim();
    if (!title) return json({ error: "A form title is required." }, 400);

    const rawFields = Array.isArray(body.fields) ? body.fields : [];
    const fields = rawFields.map(normalizeField).filter(Boolean) as FormField[];
    if (fields.length === 0) return json({ error: "Add at least one field to the form." }, 400);

    const status = body.status === "open" || body.status === "closed" ? body.status : "draft";
    const closesAt = body.closesAt ? new Date(body.closesAt) : null;
    if (closesAt && Number.isNaN(closesAt.getTime())) {
      return json({ error: "Please provide a valid closing date." }, 400);
    }

    const targetType = body.targetType === "specific" ? "specific" : "all";
    let targetStudentId: string | null = null;
    let targetGroupId: string | null = null;
    let assignmentId: string | null = null;

    if (targetType === "specific") {
      if (body.targetStudentId) {
        targetStudentId = body.targetStudentId;
      } else if (body.targetGroupId) {
        targetGroupId = body.targetGroupId;
        assignmentId = body.assignmentId || null;
      }
    }

    const id = randomUUID();
    const appUrl = process.env.APP_URL || "http://localhost:5173/v2";
    const publishedLink = `${appUrl}/student/forms/${id}`;

    const form = await data.insert<any>(COLLECTIONS.customForms, id, {
      title,
      description: body.description?.trim() || "",
      fields,
      status,
      closesAt,
      createdBy: user.userId,
      targetType,
      targetStudentId,
      targetGroupId,
      assignmentId,
      publishedLink,
    });

    if (status === "open") {
      const recipients = await getFormRecipients(form);
      if (recipients.length > 0) {
        await enqueueEmailJob({
          kind: "form",
          recipients,
          payload: form,
          actorId: user.userId,
          idempotencyKey: `form-open:${form.id}`,
        });
      }
    }

    audit({ actorId: user.userId, action: "form.created", targetType: "custom_form", targetId: id, details: { title } });
    return json(form, 201);
  },

  async list(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role === "teacher") {
      const rows = await data.findMany<any>(COLLECTIONS.customForms, {
        where: [["createdBy", "==", user.userId]],
        orderBy: ["createdAt", "desc"],
      });
      return json(rows);
    }

    // Students see open forms only — and only those targeted to them (or "all").
    const rows = await data.findMany<any>(COLLECTIONS.customForms, {
      where: [["status", "==", "open"]],
      orderBy: ["createdAt", "desc"],
    });
    const myResponses = await data.findMany<any>(COLLECTIONS.customFormResponses, {
      where: [["studentId", "==", user.userId]],
    });
    const responseMap = new Map(myResponses.map((r) => [r.formId, r]));

    const visible: any[] = [];
    for (const f of rows) {
      if (await isFormVisibleToStudent(f, user.userId)) {
        visible.push({ ...f, myResponse: responseMap.get(f.id) || null });
      }
    }
    return json(visible);
  },

  async get(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    const form = await data.getById<any>(COLLECTIONS.customForms, params.id);
    if (!form) return json({ error: "Form not found." }, 404);
    if (user.role === "teacher" && form.createdBy !== user.userId) return json({ error: "Form not found." }, 404);
    if (user.role === "student" && form.status !== "open") {
      // Allow students to view a closed/draft form only if they already responded
      const own = await data.findOne<any>(COLLECTIONS.customFormResponses, [
        ["formId", "==", form.id],
        ["studentId", "==", user.userId],
      ]);
      if (!own) return json({ error: "Form not found." }, 404);
      return json({ ...form, myResponse: own });
    }

    if (user.role === "student") {
      const own = await data.findOne<any>(COLLECTIONS.customFormResponses, [
        ["formId", "==", form.id],
        ["studentId", "==", user.userId],
      ]);
      if (!own && !(await isFormVisibleToStudent(form, user.userId))) {
        return json({ error: "Form not found." }, 404);
      }
      return json({ ...form, myResponse: own ?? null });
    }

    return json(form);
  },

  async update(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "forms.manage")) return json({ error: "Access denied." }, 403);

    const existing = await data.getById<any>(COLLECTIONS.customForms, params.id);
    if (!existing || existing.createdBy !== user.userId) return json({ error: "Form not found." }, 404);

    const body = await parseJson<FormBody>(request);
    const update: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const t = body.title.trim();
      if (!t) return json({ error: "Form title cannot be empty." }, 400);
      update.title = t;
    }
    if (body.description !== undefined) update.description = body.description?.trim() || "";

    if (body.fields !== undefined) {
      const existingResponses = await data.findMany<any>(COLLECTIONS.customFormResponses, {
        where: [["formId", "==", existing.id]],
      });
      if (existingResponses.length > 0) {
        return json({ error: "Fields are locked once responses have been submitted." }, 409);
      }
      const rawFields = Array.isArray(body.fields) ? body.fields : [];
      const fields = rawFields.map(normalizeField).filter(Boolean) as FormField[];
      if (fields.length === 0) return json({ error: "Add at least one field to the form." }, 400);
      update.fields = fields;
    }

    if (body.status !== undefined) {
      if (!["draft", "open", "closed"].includes(body.status)) {
        return json({ error: "Invalid status." }, 400);
      }
      update.status = body.status;
    }

    if (body.closesAt !== undefined) {
      if (body.closesAt === null) update.closesAt = null;
      else {
        const d = new Date(body.closesAt);
        if (Number.isNaN(d.getTime())) return json({ error: "Please provide a valid closing date." }, 400);
        update.closesAt = d;
      }
    }

    if (body.targetType !== undefined) {
      const t = body.targetType === "specific" ? "specific" : "all";
      update.targetType = t;
      if (t === "all") {
        update.targetStudentId = null;
        update.targetGroupId = null;
        update.assignmentId = null;
      } else {
        update.targetStudentId = body.targetStudentId || null;
        update.targetGroupId = body.targetStudentId ? null : (body.targetGroupId || null);
        update.assignmentId = body.assignmentId || null;
      }
    } else {
      if (body.targetStudentId !== undefined) update.targetStudentId = body.targetStudentId || null;
      if (body.targetGroupId !== undefined) update.targetGroupId = body.targetGroupId || null;
      if (body.assignmentId !== undefined) update.assignmentId = body.assignmentId || null;
    }

    if (Object.keys(update).length === 0) return json(existing);
    const updated = await data.update<any>(COLLECTIONS.customForms, existing.id, update);

    const becomingOpen = body.status === "open" && existing.status !== "open";
    if (becomingOpen) {
      const recipients = await getFormRecipients(updated);
      if (recipients.length > 0) {
        await enqueueEmailJob({
          kind: "form",
          recipients,
          payload: updated,
          actorId: user.userId,
          idempotencyKey: `form-open:${updated.id}`,
        });
      }
    }

    return json(updated);
  },

  async remove(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "forms.manage")) return json({ error: "Access denied." }, 403);

    const form = await data.getById<any>(COLLECTIONS.customForms, params.id);
    if (!form || form.createdBy !== user.userId) return json({ error: "Form not found." }, 404);

    await data.delMany(COLLECTIONS.customFormResponses, [["formId", "==", form.id]]);
    await data.del(COLLECTIONS.customForms, form.id);
    audit({ actorId: user.userId, action: "form.deleted", targetType: "custom_form", targetId: form.id, details: { title: form.title } });
    return json({ deleted: true });
  },

  async submitResponse(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "student") return json({ error: "Only students can submit responses." }, 403);

    const form = await data.getById<any>(COLLECTIONS.customForms, params.id);
    if (!form) return json({ error: "Form not found." }, 404);
    if (form.status !== "open") return json({ error: "This form is not accepting responses." }, 400);
    if (form.closesAt && new Date() > new Date(form.closesAt)) {
      return json({ error: "This form is no longer accepting responses." }, 400);
    }

    const body = await parseJson<ResponseBody>(request);
    const answers = (body.answers && typeof body.answers === "object") ? body.answers : {};

    const validationError = validateAnswers(form.fields as FormField[], answers);
    if (validationError) return json({ error: validationError }, 400);

    const previous = await data.findOne<any>(COLLECTIONS.customFormResponses, [
      ["formId", "==", form.id],
      ["studentId", "==", user.userId],
    ]);

    if (previous) {
      const fieldDecisions = (previous.fieldDecisions ?? {}) as Record<string, string>;
      const anyDecided = Object.values(fieldDecisions).some((d) => d === "approved" || d === "rejected");
      if (anyDecided) {
        return json({ error: "Your response has already been reviewed and cannot be changed." }, 409);
      }
      if ((previous.updateCount ?? 0) >= 1) {
        return json({ error: "You have already updated your response once. No further changes are allowed." }, 409);
      }
      const updated = await data.update<any>(COLLECTIONS.customFormResponses, previous.id, {
        answers,
        updatedAt: new Date(),
        updateCount: (previous.updateCount ?? 0) + 1,
      });
      audit({ actorId: user.userId, action: "form.response.updated", targetType: "custom_form_response", targetId: previous.id, details: { formId: form.id } });
      return json(updated);
    }

    const id = randomUUID();
    const response = await data.insert<any>(COLLECTIONS.customFormResponses, id, {
      formId: form.id,
      studentId: user.userId,
      answers,
      fieldDecisions: {},
      fieldNotes: {},
      reviewedBy: null,
      reviewedAt: null,
      submittedAt: new Date(),
      updateCount: 0,
    });
    audit({ actorId: user.userId, action: "form.response.submitted", targetType: "custom_form_response", targetId: id, details: { formId: form.id } });
    return json(response, 201);
  },

  async listResponses(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "forms.manage")) return json({ error: "Access denied." }, 403);

    const form = await data.getById<any>(COLLECTIONS.customForms, params.id);
    if (!form || form.createdBy !== user.userId) return json({ error: "Form not found." }, 404);

    const responses = await data.findMany<any>(COLLECTIONS.customFormResponses, {
      where: [["formId", "==", form.id]],
    });

    const studentIds = [...new Set(responses.map((r) => r.studentId))];
    const students = await Promise.all(studentIds.map((id) => data.getById<any>(COLLECTIONS.users, id)));
    const sMap = new Map(students.filter(Boolean).map((s) => [s!.id, s]));

    const rows = responses
      .map((r) => ({
        response: r,
        studentName: sMap.get(r.studentId)?.fullName || null,
        studentEmail: sMap.get(r.studentId)?.email || null,
      }))
      .sort((a, b) => {
        const ad = new Date(a.response.submittedAt).getTime();
        const bd = new Date(b.response.submittedAt).getTime();
        return bd - ad;
      });

    return json({ form, responses: rows });
  },

  async decideResponse(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaffOrGranted(user, "forms.manage")) return json({ error: "Access denied." }, 403);

    const response = await data.getById<any>(COLLECTIONS.customFormResponses, params.responseId);
    if (!response) return json({ error: "Response not found." }, 404);

    const form = await data.getById<any>(COLLECTIONS.customForms, response.formId);
    if (!form || form.createdBy !== user.userId) return json({ error: "Response not found." }, 404);

    const body = await parseJson<DecisionBody>(request);
    const fieldId = body.fieldId?.trim();
    const decision = body.decision;
    if (!fieldId) {
      return json({ error: "fieldId is required." }, 400);
    }
    if (!decision || !["approved", "rejected", "pending"].includes(decision)) {
      return json({ error: "Provide a decision of approved, rejected, or pending." }, 400);
    }
    const fieldExists = Array.isArray(form.fields) && form.fields.some((f: any) => f.id === fieldId);
    if (!fieldExists) {
      return json({ error: "Unknown field." }, 400);
    }

    const fieldDecisions: Record<string, string> = { ...(response.fieldDecisions ?? {}) };
    const fieldNotes: Record<string, string> = { ...(response.fieldNotes ?? {}) };
    fieldDecisions[fieldId] = decision;
    const noteText = body.notes?.trim() || "";
    if (noteText) fieldNotes[fieldId] = noteText;
    else delete fieldNotes[fieldId];

    const updated = await data.update<any>(COLLECTIONS.customFormResponses, response.id, {
      fieldDecisions,
      fieldNotes,
      reviewedBy: user.userId,
      reviewedAt: new Date(),
    });
    audit({
      actorId: user.userId,
      action: `form.field.${decision}`,
      targetType: "custom_form_response",
      targetId: response.id,
      details: { formId: response.formId, fieldId },
    });
    return json(updated);
  },

  async myResponses(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "student") return json({ error: "Only students can view their responses." }, 403);

    const responses = await data.findMany<any>(COLLECTIONS.customFormResponses, {
      where: [["studentId", "==", user.userId]],
    });

    const formIds = [...new Set(responses.map((r) => r.formId))];
    const forms = await Promise.all(formIds.map((id) => data.getById<any>(COLLECTIONS.customForms, id)));
    const fMap = new Map(forms.filter(Boolean).map((f) => [f!.id, f]));

    return json(
      responses
        .map((r) => ({
          response: r,
          formTitle: fMap.get(r.formId)?.title || null,
        }))
        .sort((a, b) => new Date(b.response.submittedAt).getTime() - new Date(a.response.submittedAt).getTime()),
    );
  },
};
