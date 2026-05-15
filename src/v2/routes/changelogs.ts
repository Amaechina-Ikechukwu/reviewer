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

    return json(entry, 201);
  },

  async notify(request: Request, params: Record<string, string>) {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "owner" && user.role !== "admin") {
      return json({ error: "Only owners and admins can send changelog notifications." }, 403);
    }

    const entry = await data.getById<any>(COLLECTIONS.changelogs, params.id);
    if (!entry) return json({ error: "Entry not found." }, 404);

    const body = await parseJson<{ target?: string; cohortId?: string; recipientIds?: string[]; dryRun?: boolean; heading?: string }>(request);
    if (body.dryRun) return json({ dryRun: true });
    const target = body.target || "all";
    const validTargets = ["all", "students", "staff", "cohort", "individual"];
    if (!validTargets.includes(target)) return json({ error: "Invalid target audience." }, 400);

    let users: any[] = [];
    const allUsers = await data.findMany<any>(COLLECTIONS.users, {});

    if (target === "all") {
      users = allUsers;
    } else if (target === "students") {
      users = allUsers.filter((u: any) => u.role === "student");
    } else if (target === "staff") {
      users = allUsers.filter((u: any) => ["teacher", "owner", "admin", "manager", "instructor"].includes(u.role));
    } else if (target === "cohort") {
      if (!body.cohortId) return json({ error: "Cohort ID is required." }, 400);
      users = allUsers.filter((u: any) => u.cohortId === body.cohortId);
    } else if (target === "individual") {
      if (!body.recipientIds || body.recipientIds.length === 0) return json({ error: "At least one recipient is required." }, 400);
      users = allUsers.filter((u: any) => body.recipientIds!.includes(u.id));
    }

    const recipients = users
      .filter((u: any) => u.email && !u.email.endsWith("@historical.reviewai.local") && u.passwordHash !== "INVITE_PENDING")
      .map((u: any) => ({ email: u.email, fullName: u.fullName }));

    if (recipients.length === 0) {
      return json({ sent: 0, failed: 0, total: 0, message: "No eligible recipients found." });
    }

    const emailHeading = body.heading?.trim() || "New Update";
    const { sent, failed } = await sendChangelogNotification(recipients, {
      version: entry.version,
      title: entry.title,
      heading: emailHeading,
      summary: entry.summary,
      items: entry.items || [],
    });

    return json({ sent, failed, total: recipients.length });
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
