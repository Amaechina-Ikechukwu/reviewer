import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { isStaff } from "../../utils/jwt";
import { json } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS, storageUpload, storageDownload, storageDelete } from "../firebase";

const ALLOWED_TYPES = [".md", ".pdf", ".docx"] as const;
const MAX_SIZE = 10 * 1024 * 1024;

function getFileType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "md") return "md";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  return "md";
}

export const classNoteRoutes = {
  async upload(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const customTitle = (formData.get("title") as string | null)?.trim();

    if (!file || !(file instanceof File)) return json({ error: "No file provided." }, 400);

    const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
    if (!(ALLOWED_TYPES as readonly string[]).includes(ext)) {
      return json({ error: "Only .md, .pdf, and .docx files are accepted." }, 400);
    }
    if (file.size > MAX_SIZE) return json({ error: "File too large. Max 10 MB." }, 400);

    const fileType = getFileType(file.name);
    const title = customTitle || file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    const id = randomUUID();

    if (fileType === "md") {
      const content = await file.text();
      const note = await data.insert<any>(COLLECTIONS.classNoteFiles, id, {
        title, filename: file.name, fileType, content, createdBy: user.userId,
      });
      return json(note, 201);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `class-notes/${id}/${file.name}`;
    await storageUpload(storagePath, buffer, file.type || "application/octet-stream");

    const note = await data.insert<any>(COLLECTIONS.classNoteFiles, id, {
      title, filename: file.name, fileType, storagePath, createdBy: user.userId,
    });
    return json(note, 201);
  },

  async list() {
    const notes = await data.findMany<any>(COLLECTIONS.classNoteFiles, { orderBy: ["createdAt", "desc"] });
    return json(
      notes.map((n) => ({
        id: n.id, title: n.title, filename: n.filename,
        fileType: n.fileType || "md",
        createdAt: n.createdAt,
      })),
    );
  },

  async get(_request: Request, params: Record<string, string>) {
    const note = await data.getById<any>(COLLECTIONS.classNoteFiles, params.id);
    if (!note) return json({ error: "Note not found." }, 404);
    return json(note);
  },

  async download(_request: Request, params: Record<string, string>) {
    const note = await data.getById<any>(COLLECTIONS.classNoteFiles, params.id);
    if (!note) return json({ error: "Note not found." }, 404);
    if (!note.storagePath) return json({ error: "No file available for this note." }, 404);

    try {
      const buffer = await storageDownload(note.storagePath);
      const contentType = note.filename.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${note.filename}"`,
        },
      });
    } catch {
      return json({ error: "File not found in storage." }, 404);
    }
  },

  async remove(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (!isStaff(user.role)) return json({ error: "Access denied." }, 403);

    const note = await data.getById<any>(COLLECTIONS.classNoteFiles, params.id);
    if (!note) return json({ error: "Note not found." }, 404);

    if (note.storagePath) {
      await storageDelete(note.storagePath).catch(() => {});
    }

    await data.del(COLLECTIONS.classNoteFiles, params.id);
    return json({ deleted: true });
  },
};
