import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { json } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";

export const classNoteRoutes = {
  async upload(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can upload class notes." }, 403);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const customTitle = (formData.get("title") as string | null)?.trim();

    if (!file || !(file instanceof File)) return json({ error: "No file provided." }, 400);
    if (!file.name.endsWith(".md")) return json({ error: "Only .md files are accepted." }, 400);
    if (file.size > 2 * 1024 * 1024) return json({ error: "File too large. Max 2 MB." }, 400);

    const content = await file.text();
    const title = customTitle || file.name.replace(/\.md$/, "").replace(/[-_]/g, " ");

    const id = randomUUID();
    const note = await data.insert<any>(COLLECTIONS.classNoteFiles, id, {
      title, filename: file.name, content, createdBy: user.userId,
    });
    return json(note, 201);
  },

  async list() {
    const notes = await data.findMany<any>(COLLECTIONS.classNoteFiles, { orderBy: ["createdAt", "desc"] });
    return json(notes.map((n) => ({ id: n.id, title: n.title, filename: n.filename, createdAt: n.createdAt })));
  },

  async get(_request: Request, params: Record<string, string>) {
    const note = await data.getById<any>(COLLECTIONS.classNoteFiles, params.id);
    if (!note) return json({ error: "Note not found." }, 404);
    return json(note);
  },

  async remove(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") return json({ error: "Only teachers can delete class notes." }, 403);

    const note = await data.getById<any>(COLLECTIONS.classNoteFiles, params.id);
    if (!note) return json({ error: "Note not found." }, 404);

    await data.del(COLLECTIONS.classNoteFiles, params.id);
    return json({ deleted: true });
  },
};
