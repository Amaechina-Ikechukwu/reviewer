import { desc, eq } from "drizzle-orm";
import { db } from "../db/connection";
import { classNoteFiles } from "../db/schema";
import type { AuthenticatedRequest } from "../middleware/auth";
import { json } from "../utils/json";

export const classNoteRoutes = {
  async upload(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can upload class notes." }, 403);
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const customTitle = (formData.get("title") as string | null)?.trim();

    if (!file || !(file instanceof File)) {
      return json({ error: "No file provided." }, 400);
    }

    if (!file.name.endsWith(".md")) {
      return json({ error: "Only .md files are accepted." }, 400);
    }

    if (file.size > 2 * 1024 * 1024) {
      return json({ error: "File too large. Max 2 MB." }, 400);
    }

    const content = await file.text();
    const title = customTitle || file.name.replace(/\.md$/, "").replace(/[-_]/g, " ");

    const [note] = await db
      .insert(classNoteFiles)
      .values({ title, filename: file.name, content, createdBy: user.userId })
      .returning();

    return json(note, 201);
  },

  async list(_request: Request) {
    const notes = await db
      .select({ id: classNoteFiles.id, title: classNoteFiles.title, filename: classNoteFiles.filename, createdAt: classNoteFiles.createdAt })
      .from(classNoteFiles)
      .orderBy(desc(classNoteFiles.createdAt));

    return json(notes);
  },

  async get(_request: Request, params: Record<string, string>) {
    const [note] = await db
      .select()
      .from(classNoteFiles)
      .where(eq(classNoteFiles.id, params.id))
      .limit(1);

    if (!note) return json({ error: "Note not found." }, 404);
    return json(note);
  },

  async remove(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can delete class notes." }, 403);
    }

    const [note] = await db
      .select({ id: classNoteFiles.id })
      .from(classNoteFiles)
      .where(eq(classNoteFiles.id, params.id))
      .limit(1);

    if (!note) return json({ error: "Note not found." }, 404);

    await db.delete(classNoteFiles).where(eq(classNoteFiles.id, params.id));
    return json({ deleted: true });
  },
};
