import type { AuthenticatedRequest } from "../../middleware/auth";
import { json } from "../../utils/json";
import { data } from "../data";
import { COLLECTIONS } from "../firebase";

export const inAppNotificationRoutes = {
  async list(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    const notifications = await data.findMany<any>(COLLECTIONS.inAppNotifications, {
      orderBy: ["createdAt", "desc"],
      limit: 50,
    });
    const filtered = notifications.filter((n: any) => {
      if (n.forRole === "staff") return user.role !== "student";
      return true;
    });
    return json(filtered);
  },

  async markRead(request: Request, params: Record<string, string>) {
    const notification = await data.getById<any>(COLLECTIONS.inAppNotifications, params.id);
    if (!notification) return json({ error: "Notification not found." }, 404);
    const updated = await data.update<any>(COLLECTIONS.inAppNotifications, params.id, { read: true });
    return json(updated);
  },

  async markAllRead(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    const notifications = await data.findMany<any>(COLLECTIONS.inAppNotifications, {});
    const filtered = notifications.filter((n: any) => {
      if (n.forRole === "staff") return user.role !== "student";
      return true;
    });
    const unread = filtered.filter((n: any) => !n.read);
    for (const n of unread) {
      await data.update(COLLECTIONS.inAppNotifications, n.id, { read: true });
    }
    return json({ updated: unread.length });
  },

  async unreadCount(request: Request) {
    const user = (request as AuthenticatedRequest).user;
    const notifications = await data.findMany<any>(COLLECTIONS.inAppNotifications, {});
    const filtered = notifications.filter((n: any) => {
      if (n.forRole === "staff") return user.role !== "student";
      return true;
    });
    const count = filtered.filter((n: any) => !n.read).length;
    return json({ count });
  },
};
