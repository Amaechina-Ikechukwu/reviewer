import { mkdirSync } from "node:fs";
import { startReminderJobV2 } from "./v2/jobs/reminders";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import mime from "mime-types";
import { normalize, resolve } from "node:path";
import type { AuthenticatedRequest } from "./middleware/auth";
import { verifyAuth } from "./middleware/auth";
import { audit } from "./services/audit";
import { v2Routes } from "./v2";

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

for (const r of v2Routes) {
  addRoute(r.method, r.path, r.handler, r.requiresAuth);
}

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
        const rawMessage = error instanceof Error ? error.message : "Unexpected server error";
        console.error(`[${request.method} ${pathname}]`, rawMessage);
        const user = (routeRequest as AuthenticatedRequest).user;
        audit({
          actorId: user?.userId ?? null,
          actorEmail: user?.email ?? null,
          action: `ERROR ${request.method} ${pathname}`,
          targetType: "server_error",
          details: { error: rawMessage.slice(0, 500), method: request.method, path: pathname },
        });

        return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (pathname.startsWith("/api/") || pathname.startsWith("/v2/api/")) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return serveStatic(pathname);
  },
});

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
mkdirSync(UPLOAD_DIR, { recursive: true });

startReminderJobV2();
console.log(`Reviewer app listening on port ${port}`);
