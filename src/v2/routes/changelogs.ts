import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { json, parseJson } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";
import { sendChangelogNotification } from "../../services/email";

type ChangelogItem = {
  icon: string;
  heading: string;
  detail: string;
  category: "backend" | "frontend" | "infra" | "feature";
};

type ChangelogBody = {
  version?: string;
  date?: string;
  label?: "latest" | "stable" | "major";
  title?: string;
  summary?: string;
  motivation?: string;
  deepDive?: string;
  items?: ChangelogItem[];
};

const VALID_LABELS = ["latest", "stable", "major"] as const;
const VALID_CATEGORIES = ["backend", "frontend", "infra", "feature"] as const;

export const changelogRoutes = {
  async list() {
    const entries = await data.findMany<any>(COLLECTIONS.changelogs, {
      orderBy: ["createdAt", "desc"],
    });
    return json(entries);
  },

  async create(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "owner" && user.role !== "admin") {
      return json({ error: "Only owners and admins can create changelog entries." }, 403);
    }

    const body = await parseJson<ChangelogBody>(request);
    if (!body.version?.trim()) return json({ error: "Version is required." }, 400);
    if (!body.title?.trim()) return json({ error: "Title is required." }, 400);
    if (!body.summary?.trim()) return json({ error: "Summary is required." }, 400);
    if (!VALID_LABELS.includes(body.label as any)) {
      return json({ error: "Label must be one of: latest, stable, major." }, 400);
    }

    const items = (body.items || []).filter((item) => {
      if (!item.heading?.trim()) return false;
      if (!item.detail?.trim()) return false;
      if (!VALID_CATEGORIES.includes(item.category as any)) return false;
      return true;
    });

    const id = randomUUID();
    const entry = await data.insert<any>(COLLECTIONS.changelogs, id, {
      version: body.version.trim(),
      date: body.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long" }),
      label: body.label || "latest",
      title: body.title.trim(),
      summary: body.summary.trim(),
      motivation: body.motivation?.trim() || "",
      deepDive: body.deepDive?.trim() || "",
      items,
    });

    const allUsers = await data.findMany<any>(COLLECTIONS.users, {});
    const recipients = allUsers
      .filter((u: any) => u.email && !u.email.endsWith("@historical.reviewai.local") && u.passwordHash !== "INVITE_PENDING")
      .map((u: any) => ({ email: u.email, fullName: u.fullName }));
    if (recipients.length > 0) {
      sendChangelogNotification(recipients, {
        version: entry.version,
        title: entry.title,
        summary: entry.summary,
        items: entry.items || [],
      }).catch((err) => console.error("Failed to send changelog notification:", err));
    }

    return json(entry, 201);
  },

  async update(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "owner" && user.role !== "admin") {
      return json({ error: "Only owners and admins can update changelog entries." }, 403);
    }

    const { id } = params;
    const existing = await data.getById<any>(COLLECTIONS.changelogs, id);
    if (!existing) return json({ error: "Entry not found." }, 404);

    const body = await parseJson<ChangelogBody>(request);
    const patch: Record<string, any> = {};

    if (body.version?.trim()) patch.version = body.version.trim();
    if (body.date?.trim()) patch.date = body.date.trim();
    if (body.label && VALID_LABELS.includes(body.label as any)) patch.label = body.label;
    if (body.title?.trim()) patch.title = body.title.trim();
    if (body.summary?.trim()) patch.summary = body.summary.trim();
    if (body.motivation !== undefined) patch.motivation = body.motivation.trim();
    if (body.deepDive !== undefined) patch.deepDive = body.deepDive.trim();
    if (body.items !== undefined) {
      patch.items = body.items.filter((item) => {
        if (!item.heading?.trim()) return false;
        if (!item.detail?.trim()) return false;
        if (!VALID_CATEGORIES.includes(item.category as any)) return false;
        return true;
      });
    }

    const updated = await data.update<any>(COLLECTIONS.changelogs, id, patch);
    return json(updated);
  },

  async remove(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "owner" && user.role !== "admin") {
      return json({ error: "Only owners and admins can delete changelog entries." }, 403);
    }

    const { id } = params;
    const existing = await data.getById<any>(COLLECTIONS.changelogs, id);
    if (!existing) return json({ error: "Entry not found." }, 404);

    await data.del(COLLECTIONS.changelogs, id);
    return json({ deleted: true });
  },
};
