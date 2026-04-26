import { mkdirSync } from "node:fs";
import { ensureSchema } from "./db/ensure-schema";
import { startReminderJob } from "./jobs/reminders";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import mime from "mime-types";
import { normalize, resolve } from "node:path";
import type { AuthenticatedRequest } from "./middleware/auth";
import { verifyAuth } from "./middleware/auth";
import { audit } from "./services/audit";
import { assignmentRoutes } from "./routes/assignments";
import { classNoteRoutes } from "./routes/classNotes";
import { auditLogRoutes } from "./routes/auditLogs";
import { authRoutes } from "./routes/auth";
import { gradebookRoutes } from "./routes/gradebook";
import { reviewRoutes } from "./routes/reviews";
import { studentRoutes } from "./routes/students";
import { submissionRoutes } from "./routes/submissions";
import { teacherRoutes } from "./routes/teachers";

type RouteHandler = (request: Request, params: Record<string, string>) => Promise<Response> | Response;

type Route = {
  method: string;
  regex: RegExp;
  paramNames: string[];
  handler: RouteHandler;
  requiresAuth: boolean;
};

const routes: Route[] = [];
const clientDist = resolve(process.cwd(), "client", "dist");

function addRoute(method: string, path: string, handler: RouteHandler, requiresAuth = true) {
  const paramNames: string[] = [];
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/:([A-Za-z0-9_]+)/g, (_match, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });

  routes.push({
    method,
    regex: new RegExp(`^${pattern}$`),
    paramNames,
    handler,
    requiresAuth,
  });
}

function matchRoute(method: string, pathname: string) {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }

    const match = pathname.match(route.regex);
    if (!match) {
      continue;
    }

    const params = route.paramNames.reduce<Record<string, string>>((acc, paramName, index) => {
      acc[paramName] = decodeURIComponent(match[index + 1]);
      return acc;
    }, {});

    return { route, params };
  }

  return null;
}

async function serveStatic(pathname: string) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const requestedPath = resolve(clientDist, `.${normalized}`);
  const filePath = existsSync(requestedPath) ? requestedPath : resolve(clientDist, "index.html");

  if (!filePath.startsWith(clientDist) || !existsSync(filePath)) {
    return new Response("Client build not found. Run the frontend build first.", { status: 404 });
  }

  const body = await readFile(filePath);
  const contentType = mime.lookup(filePath) || "application/octet-stream";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
    },
  });
}

addRoute("POST", "/api/auth/register", authRoutes.register, false);
addRoute("POST", "/api/auth/login", authRoutes.login, false);
addRoute("GET", "/api/auth/me", authRoutes.me);
addRoute("GET", "/api/auth/token/:token", authRoutes.validateToken, false);
addRoute("POST", "/api/auth/invite/:token", authRoutes.acceptInvite, false);
addRoute("POST", "/api/auth/reset/:token", authRoutes.resetPassword, false);

addRoute("POST", "/api/assignments", assignmentRoutes.create);
addRoute("GET", "/api/assignments", assignmentRoutes.list);
addRoute("GET", "/api/assignments/:id", assignmentRoutes.get);
addRoute("DELETE", "/api/assignments/:id", assignmentRoutes.remove);

addRoute("POST", "/api/submissions", submissionRoutes.create);
addRoute("POST", "/api/submissions/import", submissionRoutes.import);
addRoute("GET", "/api/submissions", submissionRoutes.list);
addRoute("GET", "/api/submissions/:id", submissionRoutes.get);
addRoute("GET", "/api/submissions/:id/files", submissionRoutes.getFiles);

addRoute("POST", "/api/submissions/submit-for-student", submissionRoutes.submitForStudent);
addRoute("GET", "/api/students", studentRoutes.list);
addRoute("GET", "/api/students/my-overrides", studentRoutes.myOverrides);
addRoute("POST", "/api/students", studentRoutes.create);
addRoute("POST", "/api/students/merge", studentRoutes.merge);
addRoute("POST", "/api/students/reset-password", studentRoutes.resetPassword);
addRoute("PATCH", "/api/students/:studentId", studentRoutes.update);
addRoute("DELETE", "/api/students/:studentId", studentRoutes.delete);
addRoute("POST", "/api/students/:studentId/open-submission", studentRoutes.openSubmission);

addRoute("GET", "/api/audit-logs", auditLogRoutes.list);
addRoute("GET", "/api/gradebook", gradebookRoutes.get);

addRoute("GET", "/api/teachers/join-link", teacherRoutes.getJoinLink);
addRoute("GET", "/api/teachers/join/:code", teacherRoutes.getTeacherByCode, false);
addRoute("POST", "/api/teachers/join/:code", teacherRoutes.joinViaLink, false);

addRoute("POST", "/api/class-notes", classNoteRoutes.upload);
addRoute("GET", "/api/class-notes", classNoteRoutes.list);
addRoute("GET", "/api/class-notes/:id", classNoteRoutes.get);
addRoute("DELETE", "/api/class-notes/:id", classNoteRoutes.remove);

addRoute("POST", "/api/reviews/:submissionId/run", reviewRoutes.run);
addRoute("GET", "/api/reviews/:submissionId", reviewRoutes.get);
addRoute("PATCH", "/api/reviews/:submissionId/override", reviewRoutes.override);

const port = Number(process.env.PORT || 3000);

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = normalize(url.pathname).replace(/\\/g, "/");
    const matched = matchRoute(request.method, pathname);

    if (matched) {
      const { route, params } = matched;
      let routeRequest = request;

      if (route.requiresAuth) {
        const authResult = verifyAuth(request);
        if (authResult instanceof Response) {
          return authResult;
        }

        routeRequest = Object.assign(request, {
          user: authResult,
        }) as AuthenticatedRequest;
      }

      try {
        const response = await route.handler(routeRequest, params);

        // Audit every API response
        const user = (routeRequest as AuthenticatedRequest).user;
        const status = response.status;
        if (status >= 400) {
          audit({
            actorId: user?.userId ?? null,
            actorEmail: user?.email ?? null,
            action: `${request.method} ${pathname}`,
            targetType: "api_error",
            details: { status, method: request.method, path: pathname },
          });
        } else if (request.method !== "GET") {
          audit({
            actorId: user?.userId ?? null,
            actorEmail: user?.email ?? null,
            action: `${request.method} ${pathname}`,
            targetType: "api_success",
            details: { status, method: request.method, path: pathname },
          });
        }

        return response;
      } catch (error) {
        // Sanitize DB errors — never expose SQL to users
        const rawMessage = error instanceof Error ? error.message : "Unexpected server error";
        const isDbError = rawMessage.includes("Failed query")
          || rawMessage.includes("violates unique constraint")
          || rawMessage.includes("violates foreign key")
          || rawMessage.includes("relation ")
          || rawMessage.includes("column ");

        let userMessage = rawMessage;
        let status = 500;

        if (rawMessage.includes("violates unique constraint") && rawMessage.includes("uniq_submissions_assignment_student")) {
          userMessage = "You have already submitted for this assignment.";
          status = 409;
        } else if (rawMessage.includes("violates unique constraint")) {
          userMessage = "A record with this information already exists.";
          status = 409;
        } else if (isDbError) {
          userMessage = "Something went wrong. Please try again or contact your teacher.";
        }

        // Log the full error server-side with Postgres error details
        const pgCode = (error as any)?.code;
        const pgDetail = (error as any)?.detail;
        const pgConstraint = (error as any)?.constraint;
        const pgTable = (error as any)?.table;
        console.error(`[${request.method} ${pathname}]`, rawMessage, { pgCode, pgDetail, pgConstraint, pgTable });
        const user = (routeRequest as AuthenticatedRequest).user;
        audit({
          actorId: user?.userId ?? null,
          actorEmail: user?.email ?? null,
          action: `ERROR ${request.method} ${pathname}`,
          targetType: "server_error",
          details: { error: rawMessage.slice(0, 500), pgCode, pgDetail, pgConstraint, pgTable, method: request.method, path: pathname },
        });

        return new Response(JSON.stringify({ error: userMessage }), {
          status,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }
    }

    if (pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return serveStatic(pathname);
  },
});

// Ensure upload directory exists (important on Cloud Run where UPLOAD_DIR=/tmp/uploads)
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
mkdirSync(UPLOAD_DIR, { recursive: true });

// Sync schema on startup (idempotent — safe to run every deploy)
ensureSchema().then(() => {
  startReminderJob();
  console.log(`Reviewer app listening on port ${port}`);
});
