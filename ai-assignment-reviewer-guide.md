# AI Assignment Review Platform — Full Build Guide

**Stack:** Bun + React + PostgreSQL + Claude API
**Codename:** `codegrade`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project Structure](#2-project-structure)
3. [Database Schema](#3-database-schema)
4. [Environment Setup](#4-environment-setup)
5. [Backend — Bun Server](#5-backend--bun-server)
6. [Authentication](#6-authentication)
7. [API Routes](#7-api-routes)
8. [AI Review Engine](#8-ai-review-engine)
9. [Frontend — React on Bun](#9-frontend--react-on-bun)
10. [Code Preview / Sandbox](#10-code-preview--sandbox)
11. [GitHub Integration](#11-github-integration)
12. [File Upload Handling](#12-file-upload-handling)
13. [Deployment](#13-deployment)
14. [Step-by-Step Build Instructions](#14-step-by-step-build-instructions)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (React)                  │
│  Student Portal          │     Teacher Dashboard     │
│  - Login                 │     - Login               │
│  - View assignments      │     - Create assignments  │
│  - Submit (GitHub/ZIP)   │     - View submissions    │
│  - View scores/feedback  │     - Trigger AI review   │
│                          │     - Override scores      │
└────────────┬─────────────┴────────────┬──────────────┘
             │           HTTP/REST      │
             ▼                          ▼
┌─────────────────────────────────────────────────────┐
│                  BUN SERVER (API)                     │
│  - Auth (JWT)                                        │
│  - Assignment CRUD                                   │
│  - Submission handling (file upload + GitHub clone)   │
│  - AI review orchestration                           │
│  - Serves React static files                         │
└──────────┬───────────────────┬───────────────────────┘
           │                   │
           ▼                   ▼
┌──────────────────┐  ┌────────────────────┐
│   PostgreSQL     │  │   Claude API       │
│   - Users        │  │   - Code review    │
│   - Assignments  │  │   - Scoring        │
│   - Submissions  │  │   - Feedback       │
│   - Reviews      │  │                    │
└──────────────────┘  └────────────────────┘
           │
           ▼
┌──────────────────┐
│  File Storage    │
│  ./uploads/      │
│  (extracted code)│
└──────────────────┘
```

**Key flows:**

- **Student submits** → Server validates deadline → Stores submission (clones repo or extracts ZIP) → Saves to DB
- **Teacher clicks "Review"** → Server reads student code files → Sends code + rubric to Claude API → Stores score + feedback → Displays results
- **Teacher views dashboard** → Sees all submissions for a date range, grouped by assignment → Clicks into each to see AI review or trigger one

---

## 2. Project Structure

```
codegrade/
├── bun.lock
├── package.json
├── tsconfig.json
├── .env
├── drizzle.config.ts
│
├── src/
│   ├── index.ts                    # Bun server entry point
│   ├── db/
│   │   ├── connection.ts           # PostgreSQL connection (drizzle)
│   │   ├── schema.ts               # Drizzle ORM schema
│   │   └── migrate.ts              # Migration runner
│   │
│   ├── routes/
│   │   ├── auth.ts                 # Login, register
│   │   ├── assignments.ts          # CRUD for assignments
│   │   ├── submissions.ts          # Submit, list, get
│   │   └── reviews.ts              # Trigger AI review, get results
│   │
│   ├── services/
│   │   ├── ai-reviewer.ts          # Claude API integration
│   │   ├── github.ts               # Clone GitHub repos
│   │   ├── file-extractor.ts       # Extract ZIP uploads
│   │   └── code-reader.ts          # Read code files from disk
│   │
│   ├── middleware/
│   │   └── auth.ts                 # JWT verification middleware
│   │
│   └── utils/
│       ├── jwt.ts                  # Sign/verify JWT tokens
│       ├── password.ts             # Hash/verify passwords
│       └── deadline.ts             # Submission window logic
│
├── client/                         # React frontend
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api.ts                  # Fetch wrapper
│   │   ├── context/
│   │   │   └── AuthContext.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── StudentDashboard.tsx
│   │   │   ├── SubmitAssignment.tsx
│   │   │   ├── StudentResults.tsx
│   │   │   ├── TeacherDashboard.tsx
│   │   │   ├── CreateAssignment.tsx
│   │   │   ├── SubmissionsList.tsx
│   │   │   └── ReviewSubmission.tsx
│   │   └── components/
│   │       ├── CodePreview.tsx
│   │       ├── ScoreCard.tsx
│   │       ├── SubmissionCard.tsx
│   │       └── AssignmentCard.tsx
│   ├── vite.config.ts
│   └── package.json
│
├── uploads/                        # Extracted student code
│   └── {submission_id}/
│       ├── index.html
│       ├── style.css
│       └── script.js
│
└── drizzle/                        # Generated migrations
    └── 0000_initial.sql
```

---

## 3. Database Schema

Using **Drizzle ORM** with PostgreSQL.

### Schema Definition (`src/db/schema.ts`)

```typescript
import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

// Enums
export const userRoleEnum = pgEnum("user_role", ["student", "teacher"]);
export const submissionTypeEnum = pgEnum("submission_type", [
  "github",
  "file_upload",
]);
export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "reviewing",
  "completed",
  "failed",
]);

// ─── USERS ───
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("student"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── ASSIGNMENTS ───
// The teacher creates assignments with a submission window.
// Pattern: created Monday → due end of Tuesday, or created Wednesday → due Thursday, etc.
export const assignments = pgTable("assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").notNull(), // What students should build
  rubric: text("rubric").notNull(), // Scoring criteria for AI
  createdBy: uuid("created_by")
    .references(() => users.id)
    .notNull(),
  opensAt: timestamp("opens_at").notNull(), // When students can start submitting
  closesAt: timestamp("closes_at").notNull(), // Deadline
  maxScore: integer("max_score").notNull().default(100),
  allowGithub: boolean("allow_github").notNull().default(true),
  allowFileUpload: boolean("allow_file_upload").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── SUBMISSIONS ───
// Each student submits once per assignment (upsert — latest wins before deadline).
export const submissions = pgTable("submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  assignmentId: uuid("assignment_id")
    .references(() => assignments.id)
    .notNull(),
  studentId: uuid("student_id")
    .references(() => users.id)
    .notNull(),
  submissionType: submissionTypeEnum("submission_type").notNull(),
  githubUrl: varchar("github_url", { length: 1000 }), // If GitHub submission
  filePath: text("file_path"), // Local path to extracted code
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  isLate: boolean("is_late").notNull().default(false),
});

// ─── REVIEWS ───
// AI-generated review for each submission.
export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .references(() => submissions.id)
    .notNull(),
  status: reviewStatusEnum("status").notNull().default("pending"),
  aiScore: integer("ai_score"), // Score assigned by AI
  maxScore: integer("max_score"), // Max possible
  teacherOverrideScore: integer("teacher_override_score"), // If teacher overrides
  feedback: jsonb("feedback"), // Structured feedback from AI
  // feedback shape:
  // {
  //   summary: string,
  //   criteria: [
  //     { name: string, score: number, maxScore: number, comment: string }
  //   ],
  //   suggestions: string[],
  //   codeQualityNotes: string
  // }
  rawAiResponse: text("raw_ai_response"), // Full AI response for debugging
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### SQL (for manual setup or reference)

```sql
-- Run these in order

CREATE TYPE user_role AS ENUM ('student', 'teacher');
CREATE TYPE submission_type AS ENUM ('github', 'file_upload');
CREATE TYPE review_status AS ENUM ('pending', 'reviewing', 'completed', 'failed');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'student',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  rubric TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  opens_at TIMESTAMP NOT NULL,
  closes_at TIMESTAMP NOT NULL,
  max_score INTEGER NOT NULL DEFAULT 100,
  allow_github BOOLEAN NOT NULL DEFAULT true,
  allow_file_upload BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id),
  student_id UUID NOT NULL REFERENCES users(id),
  submission_type submission_type NOT NULL,
  github_url VARCHAR(1000),
  file_path TEXT,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  is_late BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(assignment_id, student_id)  -- One submission per student per assignment
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id),
  status review_status NOT NULL DEFAULT 'pending',
  ai_score INTEGER,
  max_score INTEGER,
  teacher_override_score INTEGER,
  feedback JSONB,
  raw_ai_response TEXT,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX idx_submissions_student ON submissions(student_id);
CREATE INDEX idx_submissions_date ON submissions(submitted_at);
CREATE INDEX idx_reviews_submission ON reviews(submission_id);
CREATE INDEX idx_assignments_dates ON assignments(opens_at, closes_at);
```

---

## 4. Environment Setup

### `.env`

```env
# Database
DATABASE_URL=postgresql://codegrade:yourpassword@localhost:5432/codegrade

# Auth
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx

# Server
PORT=3000
NODE_ENV=development

# File uploads
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800  # 50MB
```

### `package.json`

```json
{
  "name": "codegrade",
  "version": "1.0.0",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "dev:client": "cd client && bun run dev",
    "build:client": "cd client && bun run build",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun src/db/migrate.ts",
    "db:push": "drizzle-kit push",
    "start": "bun src/index.ts"
  },
  "dependencies": {
    "drizzle-orm": "^0.35.0",
    "postgres": "^3.4.0",
    "@anthropic-ai/sdk": "^0.30.0",
    "jsonwebtoken": "^9.0.0",
    "extract-zip": "^2.0.1",
    "mime-types": "^2.1.35"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/jsonwebtoken": "^9.0.0",
    "drizzle-kit": "^0.28.0",
    "typescript": "^5.0.0"
  }
}
```

### `drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"]
}
```

---

## 5. Backend — Bun Server

### `src/index.ts` — Main Server Entry

```typescript
import { authRoutes } from "./routes/auth";
import { assignmentRoutes } from "./routes/assignments";
import { submissionRoutes } from "./routes/submissions";
import { reviewRoutes } from "./routes/reviews";
import { verifyAuth } from "./middleware/auth";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PORT = process.env.PORT || 3000;
const CLIENT_DIST = join(import.meta.dir, "../client/dist");

// Simple router
type RouteHandler = (req: Request, params: Record<string, string>) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
  requiresAuth: boolean;
}

const routes: Route[] = [];

function addRoute(
  method: string,
  path: string,
  handler: RouteHandler,
  requiresAuth = true
) {
  // Convert /api/assignments/:id to regex
  const paramNames: string[] = [];
  const pattern = path.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  routes.push({
    method,
    pattern: new RegExp(`^${pattern}$`),
    paramNames,
    handler,
    requiresAuth,
  });
}

// ─── Register Routes ───

// Auth (no auth required)
addRoute("POST", "/api/auth/register", authRoutes.register, false);
addRoute("POST", "/api/auth/login", authRoutes.login, false);
addRoute("GET", "/api/auth/me", authRoutes.me, true);

// Assignments
addRoute("POST", "/api/assignments", assignmentRoutes.create);
addRoute("GET", "/api/assignments", assignmentRoutes.list);
addRoute("GET", "/api/assignments/:id", assignmentRoutes.get);

// Submissions
addRoute("POST", "/api/submissions", submissionRoutes.create);
addRoute("GET", "/api/submissions", submissionRoutes.list); // ?assignment_id=&date=
addRoute("GET", "/api/submissions/:id", submissionRoutes.get);
addRoute("GET", "/api/submissions/:id/files", submissionRoutes.getFiles);

// Reviews
addRoute("POST", "/api/reviews/:submissionId/run", reviewRoutes.run);
addRoute("GET", "/api/reviews/:submissionId", reviewRoutes.get);
addRoute("PATCH", "/api/reviews/:submissionId/override", reviewRoutes.override);

// Serve static preview files (student code)
addRoute(
  "GET",
  "/api/preview/:submissionId/:filename",
  async (req, params) => {
    const filePath = join(
      process.env.UPLOAD_DIR || "./uploads",
      params.submissionId,
      params.filename
    );
    if (!existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }
    const file = Bun.file(filePath);
    return new Response(file);
  },
  true
);

// ─── Server ───

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // API routes
    if (url.pathname.startsWith("/api/")) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const match = url.pathname.match(route.pattern);
        if (!match) continue;

        // Extract params
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });

        // Auth check
        if (route.requiresAuth) {
          const authResult = await verifyAuth(req);
          if (!authResult.ok) {
            return new Response(
              JSON.stringify({ error: "Unauthorized" }),
              { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          // Attach user to request via header trick (Bun doesn't have req.locals)
          // We'll pass it through by extending the request
          (req as any).user = authResult.user;
        }

        try {
          const response = await route.handler(req, params);
          // Add CORS headers to response
          const newHeaders = new Headers(response.headers);
          Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
          return new Response(response.body, {
            status: response.status,
            headers: newHeaders,
          });
        } catch (err: any) {
          console.error("Route error:", err);
          return new Response(
            JSON.stringify({ error: err.message || "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Serve React SPA
    let filePath = join(CLIENT_DIST, url.pathname);
    if (existsSync(filePath) && !Bun.file(filePath).name?.endsWith("/")) {
      return new Response(Bun.file(filePath));
    }
    // Fallback to index.html for SPA routing
    const indexPath = join(CLIENT_DIST, "index.html");
    if (existsSync(indexPath)) {
      return new Response(Bun.file(indexPath));
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`🚀 CodeGrade server running at http://localhost:${PORT}`);
```

### `src/db/connection.ts`

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

### `src/db/migrate.ts`

```typescript
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./connection";

async function main() {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

---

## 6. Authentication

### `src/utils/jwt.ts`

```typescript
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret";

export interface TokenPayload {
  userId: string;
  email: string;
  role: "student" | "teacher";
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}
```

### `src/utils/password.ts`

```typescript
export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}
```

### `src/middleware/auth.ts`

```typescript
import { verifyToken, type TokenPayload } from "../utils/jwt";

interface AuthResult {
  ok: boolean;
  user?: TokenPayload;
}

export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false };
  }

  try {
    const token = authHeader.slice(7);
    const user = verifyToken(token);
    return { ok: true, user };
  } catch {
    return { ok: false };
  }
}
```

### `src/routes/auth.ts`

```typescript
import { db } from "../db/connection";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const authRoutes = {
  async register(req: Request) {
    const body = await req.json();
    const { email, password, fullName, role } = body;

    if (!email || !password || !fullName) {
      return json({ error: "Missing required fields" }, 400);
    }

    // Check if user exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return json({ error: "Email already registered" }, 409);
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        fullName,
        role: role || "student",
      })
      .returning();

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } });
  },

  async login(req: Request) {
    const { email, password } = await req.json();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return json({ error: "Invalid credentials" }, 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return json({ error: "Invalid credentials" }, 401);
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } });
  },

  async me(req: Request) {
    const user = (req as any).user;
    return json({ user });
  },
};
```

---

## 7. API Routes

### `src/utils/deadline.ts`

```typescript
/**
 * Check if a submission is within the allowed window.
 *
 * Your pattern:
 *   Monday assignment    → submit before end of Tuesday
 *   Wednesday assignment → submit before end of Thursday
 *   Friday assignment    → submit before end of Sunday
 *
 * This is handled by the opens_at / closes_at timestamps set when
 * creating the assignment. This utility just validates against those.
 */
export function isWithinDeadline(opensAt: Date, closesAt: Date): {
  canSubmit: boolean;
  reason?: string;
} {
  const now = new Date();

  if (now < opensAt) {
    return {
      canSubmit: false,
      reason: `Submissions open at ${opensAt.toLocaleString()}`,
    };
  }

  if (now > closesAt) {
    return {
      canSubmit: false,
      reason: `Deadline passed at ${closesAt.toLocaleString()}`,
    };
  }

  return { canSubmit: true };
}

/**
 * Helper to calculate closes_at based on your day patterns.
 * Given a day the assignment is created, returns the deadline.
 */
export function calculateDeadline(createdDay: Date, pattern: string): Date {
  const deadline = new Date(createdDay);

  switch (pattern) {
    case "mon-tue": // Monday → end of Tuesday
      deadline.setDate(deadline.getDate() + 1);
      break;
    case "wed-thu": // Wednesday → end of Thursday
      deadline.setDate(deadline.getDate() + 1);
      break;
    case "fri-sun": // Friday → end of Sunday
      deadline.setDate(deadline.getDate() + 2);
      break;
    default:
      deadline.setDate(deadline.getDate() + 1); // Default: next day
  }

  // Set to end of day (11:59 PM)
  deadline.setHours(23, 59, 59, 999);
  return deadline;
}
```

### `src/routes/assignments.ts`

```typescript
import { db } from "../db/connection";
import { assignments } from "../db/schema";
import { eq, desc } from "drizzle-orm";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const assignmentRoutes = {
  // POST /api/assignments — Teacher creates an assignment
  async create(req: Request) {
    const user = (req as any).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can create assignments" }, 403);
    }

    const body = await req.json();
    const {
      title,
      description,
      rubric,
      opensAt,
      closesAt,
      maxScore,
      allowGithub,
      allowFileUpload,
    } = body;

    if (!title || !description || !rubric || !opensAt || !closesAt) {
      return json({ error: "Missing required fields" }, 400);
    }

    const [assignment] = await db
      .insert(assignments)
      .values({
        title,
        description,
        rubric,
        createdBy: user.userId,
        opensAt: new Date(opensAt),
        closesAt: new Date(closesAt),
        maxScore: maxScore || 100,
        allowGithub: allowGithub ?? true,
        allowFileUpload: allowFileUpload ?? true,
      })
      .returning();

    return json(assignment, 201);
  },

  // GET /api/assignments — List all assignments
  async list(req: Request) {
    const url = new URL(req.url);
    const role = (req as any).user.role;

    const allAssignments = await db
      .select()
      .from(assignments)
      .orderBy(desc(assignments.createdAt));

    // For students, only show assignments that are currently open or past
    if (role === "student") {
      const now = new Date();
      const visible = allAssignments.filter(
        (a) => new Date(a.opensAt) <= now
      );
      return json(visible);
    }

    return json(allAssignments);
  },

  // GET /api/assignments/:id
  async get(req: Request, params: Record<string, string>) {
    const [assignment] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, params.id))
      .limit(1);

    if (!assignment) {
      return json({ error: "Assignment not found" }, 404);
    }

    return json(assignment);
  },
};
```

### `src/routes/submissions.ts`

```typescript
import { db } from "../db/connection";
import { submissions, assignments, users } from "../db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { isWithinDeadline } from "../utils/deadline";
import { cloneGithubRepo } from "../services/github";
import { extractZip } from "../services/file-extractor";
import { readCodeFiles } from "../services/code-reader";
import { join } from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const submissionRoutes = {
  // POST /api/submissions
  async create(req: Request) {
    const user = (req as any).user;
    if (user.role !== "student") {
      return json({ error: "Only students can submit" }, 403);
    }

    const contentType = req.headers.get("content-type") || "";
    let assignmentId: string;
    let submissionType: "github" | "file_upload";
    let githubUrl: string | null = null;
    let filePath: string | null = null;

    const submissionId = randomUUID();

    if (contentType.includes("multipart/form-data")) {
      // File upload
      const formData = await req.formData();
      assignmentId = formData.get("assignmentId") as string;
      submissionType = "file_upload";

      const file = formData.get("file") as File;
      if (!file) {
        return json({ error: "No file uploaded" }, 400);
      }

      // Save and extract
      const destDir = join(UPLOAD_DIR, submissionId);
      await extractZip(file, destDir);
      filePath = destDir;
    } else {
      // JSON body (GitHub URL)
      const body = await req.json();
      assignmentId = body.assignmentId;
      submissionType = "github";
      githubUrl = body.githubUrl;

      if (!githubUrl) {
        return json({ error: "GitHub URL is required" }, 400);
      }

      // Clone the repo
      const destDir = join(UPLOAD_DIR, submissionId);
      await cloneGithubRepo(githubUrl, destDir);
      filePath = destDir;
    }

    // Check assignment exists and deadline
    const [assignment] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    if (!assignment) {
      return json({ error: "Assignment not found" }, 404);
    }

    const deadlineCheck = isWithinDeadline(assignment.opensAt, assignment.closesAt);

    // Allow late submissions but flag them
    const isLate = !deadlineCheck.canSubmit && new Date() > assignment.closesAt;

    if (!deadlineCheck.canSubmit && !isLate) {
      return json({ error: deadlineCheck.reason }, 400);
    }

    // Upsert: delete previous submission by this student for this assignment
    await db
      .delete(submissions)
      .where(
        and(
          eq(submissions.assignmentId, assignmentId),
          eq(submissions.studentId, user.userId)
        )
      );

    const [submission] = await db
      .insert(submissions)
      .values({
        id: submissionId,
        assignmentId,
        studentId: user.userId,
        submissionType,
        githubUrl,
        filePath,
        isLate,
      })
      .returning();

    return json(submission, 201);
  },

  // GET /api/submissions?assignment_id=xxx&date=2025-04-01
  async list(req: Request) {
    const url = new URL(req.url);
    const user = (req as any).user;
    const assignmentId = url.searchParams.get("assignment_id");
    const date = url.searchParams.get("date"); // YYYY-MM-DD

    let query = db
      .select({
        submission: submissions,
        studentName: users.fullName,
        studentEmail: users.email,
      })
      .from(submissions)
      .leftJoin(users, eq(submissions.studentId, users.id))
      .orderBy(desc(submissions.submittedAt));

    const conditions: any[] = [];

    // Students only see their own submissions
    if (user.role === "student") {
      conditions.push(eq(submissions.studentId, user.userId));
    }

    if (assignmentId) {
      conditions.push(eq(submissions.assignmentId, assignmentId));
    }

    if (date) {
      const startOfDay = new Date(date + "T00:00:00");
      const endOfDay = new Date(date + "T23:59:59");
      conditions.push(gte(submissions.submittedAt, startOfDay));
      conditions.push(lte(submissions.submittedAt, endOfDay));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return json(results);
  },

  // GET /api/submissions/:id
  async get(req: Request, params: Record<string, string>) {
    const [result] = await db
      .select({
        submission: submissions,
        studentName: users.fullName,
        studentEmail: users.email,
      })
      .from(submissions)
      .leftJoin(users, eq(submissions.studentId, users.id))
      .where(eq(submissions.id, params.id))
      .limit(1);

    if (!result) {
      return json({ error: "Submission not found" }, 404);
    }

    return json(result);
  },

  // GET /api/submissions/:id/files — List code files in the submission
  async getFiles(req: Request, params: Record<string, string>) {
    const [submission] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, params.id))
      .limit(1);

    if (!submission || !submission.filePath) {
      return json({ error: "Submission files not found" }, 404);
    }

    const files = await readCodeFiles(submission.filePath);
    return json(files);
  },
};
```

### `src/routes/reviews.ts`

```typescript
import { db } from "../db/connection";
import { reviews, submissions, assignments } from "../db/schema";
import { eq } from "drizzle-orm";
import { reviewCode } from "../services/ai-reviewer";
import { readCodeFiles } from "../services/code-reader";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const reviewRoutes = {
  // POST /api/reviews/:submissionId/run — Trigger AI review
  async run(req: Request, params: Record<string, string>) {
    const user = (req as any).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can trigger reviews" }, 403);
    }

    const { submissionId } = params;

    // Get submission + assignment
    const [submission] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!submission) {
      return json({ error: "Submission not found" }, 404);
    }

    const [assignment] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, submission.assignmentId))
      .limit(1);

    if (!assignment) {
      return json({ error: "Assignment not found" }, 404);
    }

    // Create or update review record
    let [existingReview] = await db
      .select()
      .from(reviews)
      .where(eq(reviews.submissionId, submissionId))
      .limit(1);

    if (!existingReview) {
      [existingReview] = await db
        .insert(reviews)
        .values({
          submissionId,
          status: "reviewing",
          maxScore: assignment.maxScore,
        })
        .returning();
    } else {
      await db
        .update(reviews)
        .set({ status: "reviewing" })
        .where(eq(reviews.id, existingReview.id));
    }

    // Read the student's code files
    const codeFiles = await readCodeFiles(submission.filePath!);

    // Run AI review
    try {
      const result = await reviewCode({
        assignmentTitle: assignment.title,
        assignmentDescription: assignment.description,
        rubric: assignment.rubric,
        maxScore: assignment.maxScore,
        codeFiles,
      });

      await db
        .update(reviews)
        .set({
          status: "completed",
          aiScore: result.totalScore,
          feedback: result.feedback,
          rawAiResponse: result.rawResponse,
          reviewedAt: new Date(),
        })
        .where(eq(reviews.id, existingReview.id));

      const [updated] = await db
        .select()
        .from(reviews)
        .where(eq(reviews.id, existingReview.id))
        .limit(1);

      return json(updated);
    } catch (err: any) {
      await db
        .update(reviews)
        .set({ status: "failed", rawAiResponse: err.message })
        .where(eq(reviews.id, existingReview.id));

      return json({ error: "AI review failed", details: err.message }, 500);
    }
  },

  // GET /api/reviews/:submissionId
  async get(req: Request, params: Record<string, string>) {
    const [review] = await db
      .select()
      .from(reviews)
      .where(eq(reviews.submissionId, params.submissionId))
      .limit(1);

    if (!review) {
      return json({ error: "Review not found" }, 404);
    }

    return json(review);
  },

  // PATCH /api/reviews/:submissionId/override — Teacher overrides score
  async override(req: Request, params: Record<string, string>) {
    const user = (req as any).user;
    if (user.role !== "teacher") {
      return json({ error: "Only teachers can override scores" }, 403);
    }

    const { score } = await req.json();

    const [updated] = await db
      .update(reviews)
      .set({ teacherOverrideScore: score })
      .where(eq(reviews.submissionId, params.submissionId))
      .returning();

    if (!updated) {
      return json({ error: "Review not found" }, 404);
    }

    return json(updated);
  },
};
```

---

## 8. AI Review Engine

### `src/services/ai-reviewer.ts`

This is the core. It sends the student's code + assignment rubric to Claude and gets back structured scoring.

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface CodeFile {
  filename: string;
  content: string;
  language: string;
}

interface ReviewInput {
  assignmentTitle: string;
  assignmentDescription: string;
  rubric: string;
  maxScore: number;
  codeFiles: CodeFile[];
}

interface ReviewCriterion {
  name: string;
  score: number;
  maxScore: number;
  comment: string;
}

interface ReviewFeedback {
  summary: string;
  criteria: ReviewCriterion[];
  suggestions: string[];
  codeQualityNotes: string;
}

interface ReviewResult {
  totalScore: number;
  feedback: ReviewFeedback;
  rawResponse: string;
}

export async function reviewCode(input: ReviewInput): Promise<ReviewResult> {
  const { assignmentTitle, assignmentDescription, rubric, maxScore, codeFiles } = input;

  // Build the code section
  const codeSection = codeFiles
    .map((f) => `--- ${f.filename} (${f.language}) ---\n${f.content}`)
    .join("\n\n");

  const systemPrompt = `You are an experienced frontend engineering instructor reviewing a student's code submission. You must evaluate the code against the assignment requirements and rubric, then provide a structured score and feedback.

You are fair but thorough. You check for:
- Whether the assignment requirements are actually met
- Code correctness (does it work as expected?)
- Code quality (clean, readable, well-structured)
- Best practices (semantic HTML, proper CSS usage, clean JS)
- Whether the student clearly understands the concepts or just copied code

Be encouraging but honest. Students learn from specific, actionable feedback.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no backticks, no extra text.`;

  const userPrompt = `## Assignment: ${assignmentTitle}

### Description
${assignmentDescription}

### Rubric (Total: ${maxScore} points)
${rubric}

### Student's Submitted Code
${codeSection}

---

Evaluate this submission against the rubric. Return your evaluation as JSON in this exact format:

{
  "summary": "2-3 sentence overall assessment",
  "criteria": [
    {
      "name": "Criterion name from rubric",
      "score": <number>,
      "maxScore": <number>,
      "comment": "Specific feedback for this criterion"
    }
  ],
  "suggestions": ["Specific improvement suggestion 1", "Suggestion 2"],
  "codeQualityNotes": "Notes on code style, structure, best practices",
  "totalScore": <number out of ${maxScore}>
}

Make sure the criteria match what's in the rubric. The scores for each criterion should add up to totalScore.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawResponse =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Parse AI response
  try {
    // Clean potential markdown fences
    const cleaned = rawResponse
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      totalScore: parsed.totalScore,
      feedback: {
        summary: parsed.summary,
        criteria: parsed.criteria,
        suggestions: parsed.suggestions,
        codeQualityNotes: parsed.codeQualityNotes,
      },
      rawResponse,
    };
  } catch (parseErr) {
    console.error("Failed to parse AI response:", rawResponse);
    throw new Error("AI returned invalid JSON. Raw response saved for debugging.");
  }
}
```

### `src/services/code-reader.ts`

```typescript
import { readdir, readFile } from "fs/promises";
import { join, extname } from "path";

interface CodeFile {
  filename: string;
  content: string;
  language: string;
}

const LANGUAGE_MAP: Record<string, string> = {
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".js": "javascript",
  ".ts": "typescript",
  ".jsx": "jsx",
  ".tsx": "tsx",
  ".json": "json",
  ".md": "markdown",
  ".svg": "svg",
};

// File extensions to include
const ALLOWED_EXTENSIONS = new Set(Object.keys(LANGUAGE_MAP));

// Directories to skip
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".vscode",
  "__pycache__",
]);

export async function readCodeFiles(
  dirPath: string,
  basePath?: string
): Promise<CodeFile[]> {
  const files: CodeFile[] = [];
  const base = basePath || dirPath;

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const subFiles = await readCodeFiles(fullPath, base);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;

        const content = await readFile(fullPath, "utf-8");
        const relativePath = fullPath.replace(base + "/", "");

        files.push({
          filename: relativePath,
          content,
          language: LANGUAGE_MAP[ext] || "text",
        });
      }
    }
  } catch (err) {
    console.error(`Error reading code files from ${dirPath}:`, err);
  }

  return files;
}
```

### `src/services/github.ts`

```typescript
import { mkdir } from "fs/promises";
import { existsSync } from "fs";

/**
 * Clone a public GitHub repo into the target directory.
 * Uses `git clone --depth 1` for speed.
 */
export async function cloneGithubRepo(
  url: string,
  destDir: string
): Promise<void> {
  // Validate URL is a GitHub URL
  if (!url.match(/^https?:\/\/(www\.)?github\.com\//)) {
    throw new Error("Invalid GitHub URL");
  }

  // Clean the URL (remove trailing .git if present, ensure https)
  let cleanUrl = url.trim();
  if (!cleanUrl.endsWith(".git")) {
    cleanUrl += ".git";
  }

  // Ensure destination directory exists
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }

  // Clone with depth=1 (only latest commit)
  const proc = Bun.spawn(
    ["git", "clone", "--depth", "1", cleanUrl, destDir],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Git clone failed: ${stderr}`);
  }
}
```

### `src/services/file-extractor.ts`

```typescript
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

/**
 * Extract uploaded ZIP file to destination directory.
 * Uses Bun's built-in zip handling or falls back to unzip command.
 */
export async function extractZip(file: File, destDir: string): Promise<void> {
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }

  // Save the file first
  const tempPath = join(destDir, "__upload.zip");
  const buffer = await file.arrayBuffer();
  await writeFile(tempPath, Buffer.from(buffer));

  // Extract using unzip command
  const proc = Bun.spawn(["unzip", "-o", tempPath, "-d", destDir], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Extraction failed: ${stderr}`);
  }

  // Clean up the zip file
  await Bun.spawn(["rm", tempPath]).exited;

  // If zip contained a single top-level folder, move contents up
  // (common with GitHub downloads: repo-main/index.html)
  const { readdir } = await import("fs/promises");
  const entries = await readdir(destDir);
  const dirs = entries.filter((e) => !e.startsWith(".") && !e.startsWith("__"));

  if (dirs.length === 1) {
    const innerDir = join(destDir, dirs[0]);
    const stat = await Bun.file(innerDir).exists();
    // Move contents of inner dir to destDir
    const proc2 = Bun.spawn(["sh", "-c", `mv ${innerDir}/* ${destDir}/ 2>/dev/null; rmdir ${innerDir} 2>/dev/null`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc2.exited;
  }
}
```

---

## 9. Frontend — React on Bun

### Client Setup

```bash
# From project root
cd client
bun create vite . --template react-ts
bun install
bun add react-router-dom
```

### `client/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
```

### `client/src/api.ts` — API Helper

```typescript
const API_BASE = "/api";

let authToken: string | null = localStorage.getItem("token");

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }
}

export function getToken() {
  return authToken;
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
```

### `client/src/context/AuthContext.tsx`

```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api, setToken, getToken } from "../api";

interface User {
  userId: string;
  email: string;
  role: "student" | "teacher";
  fullName?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, role: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if already logged in
    if (getToken()) {
      api("/auth/me")
        .then((data) => setUser(data.user))
        .catch(() => {
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (
    email: string,
    password: string,
    fullName: string,
    role: string
  ) => {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName, role }),
    });
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### `client/src/App.tsx`

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import SubmitAssignment from "./pages/SubmitAssignment";
import StudentResults from "./pages/StudentResults";
import TeacherDashboard from "./pages/TeacherDashboard";
import CreateAssignment from "./pages/CreateAssignment";
import SubmissionsList from "./pages/SubmissionsList";
import ReviewSubmission from "./pages/ReviewSubmission";

function ProtectedRoute({
  children,
  allowedRole,
}: {
  children: React.ReactNode;
  allowedRole?: "student" | "teacher";
}) {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedRole && user.role !== allowedRole)
    return <Navigate to="/" />;

  return <>{children}</>;
}

function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (user.role === "teacher") return <Navigate to="/teacher" />;
  return <Navigate to="/student" />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleRedirect />} />

          {/* Student Routes */}
          <Route path="/student" element={
            <ProtectedRoute allowedRole="student">
              <StudentDashboard />
            </ProtectedRoute>
          } />
          <Route path="/student/submit/:assignmentId" element={
            <ProtectedRoute allowedRole="student">
              <SubmitAssignment />
            </ProtectedRoute>
          } />
          <Route path="/student/results" element={
            <ProtectedRoute allowedRole="student">
              <StudentResults />
            </ProtectedRoute>
          } />

          {/* Teacher Routes */}
          <Route path="/teacher" element={
            <ProtectedRoute allowedRole="teacher">
              <TeacherDashboard />
            </ProtectedRoute>
          } />
          <Route path="/teacher/create" element={
            <ProtectedRoute allowedRole="teacher">
              <CreateAssignment />
            </ProtectedRoute>
          } />
          <Route path="/teacher/submissions/:assignmentId" element={
            <ProtectedRoute allowedRole="teacher">
              <SubmissionsList />
            </ProtectedRoute>
          } />
          <Route path="/teacher/review/:submissionId" element={
            <ProtectedRoute allowedRole="teacher">
              <ReviewSubmission />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

### Key Pages (Summarized)

#### `client/src/pages/Login.tsx`

```tsx
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("student");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (isRegister) {
        await register(email, password, fullName, role);
      } else {
        await login(email, password);
      }
      navigate("/");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "100px auto", padding: 20 }}>
      <h1>{isRegister ? "Register" : "Login"} — CodeGrade</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        {isRegister && (
          <>
            <div>
              <label>Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </div>
          </>
        )}
        <div>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit">{isRegister ? "Register" : "Login"}</button>
      </form>

      <p>
        <button onClick={() => setIsRegister(!isRegister)} style={{ background: "none", border: "none", color: "blue", cursor: "pointer" }}>
          {isRegister ? "Already have an account? Login" : "Need an account? Register"}
        </button>
      </p>
    </div>
  );
}
```

#### `client/src/pages/TeacherDashboard.tsx`

```tsx
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { Link, useNavigate } from "react-router-dom";

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [filterDate, setFilterDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    api("/assignments").then(setAssignments);
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Teacher Dashboard</h1>
        <div>
          <span>{user?.email}</span>
          <button onClick={logout} style={{ marginLeft: 10 }}>Logout</button>
        </div>
      </header>

      <div style={{ margin: "20px 0" }}>
        <Link to="/teacher/create">
          <button>+ Create Assignment</button>
        </Link>
      </div>

      <h2>Assignments</h2>
      {assignments.map((a) => (
        <div key={a.id} style={{ border: "1px solid #ddd", padding: 16, marginBottom: 12, borderRadius: 8 }}>
          <h3>{a.title}</h3>
          <p style={{ color: "#666", fontSize: 14 }}>
            Opens: {new Date(a.opensAt).toLocaleString()} — 
            Closes: {new Date(a.closesAt).toLocaleString()}
          </p>
          <p>{a.description.substring(0, 150)}...</p>
          <Link to={`/teacher/submissions/${a.id}`}>
            <button>View Submissions</button>
          </Link>
        </div>
      ))}
    </div>
  );
}
```

#### `client/src/pages/ReviewSubmission.tsx`

This is the most important teacher page — where AI review happens.

```tsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

export default function ReviewSubmission() {
  const { submissionId } = useParams();
  const [submission, setSubmission] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [review, setReview] = useState<any>(null);
  const [reviewing, setReviewing] = useState(false);
  const [activeFile, setActiveFile] = useState<string>("");
  const [overrideScore, setOverrideScore] = useState("");

  useEffect(() => {
    // Load submission details
    api(`/submissions/${submissionId}`).then((data) => {
      setSubmission(data);
    });

    // Load code files
    api(`/submissions/${submissionId}/files`).then((data) => {
      setFiles(data);
      if (data.length > 0) setActiveFile(data[0].filename);
    });

    // Load existing review if any
    api(`/reviews/${submissionId}`)
      .then(setReview)
      .catch(() => {}); // No review yet
  }, [submissionId]);

  const runReview = async () => {
    setReviewing(true);
    try {
      const result = await api(`/reviews/${submissionId}/run`, {
        method: "POST",
      });
      setReview(result);
    } catch (err: any) {
      alert("Review failed: " + err.message);
    }
    setReviewing(false);
  };

  const handleOverride = async () => {
    if (!overrideScore) return;
    const result = await api(`/reviews/${submissionId}/override`, {
      method: "PATCH",
      body: JSON.stringify({ score: parseInt(overrideScore) }),
    });
    setReview(result);
  };

  const activeFileContent = files.find((f) => f.filename === activeFile);

  // Build preview HTML from student files
  const previewHtml = (() => {
    const htmlFile = files.find(
      (f) => f.filename.endsWith(".html") || f.filename.endsWith(".htm")
    );
    if (!htmlFile) return null;

    let html = htmlFile.content;

    // Inline CSS files
    files
      .filter((f) => f.filename.endsWith(".css"))
      .forEach((cssFile) => {
        html = html.replace(
          new RegExp(
            `<link[^>]*href=["']${cssFile.filename}["'][^>]*>`,
            "gi"
          ),
          `<style>${cssFile.content}</style>`
        );
      });

    // Inline JS files
    files
      .filter((f) => f.filename.endsWith(".js"))
      .forEach((jsFile) => {
        html = html.replace(
          new RegExp(
            `<script[^>]*src=["']${jsFile.filename}["'][^>]*></script>`,
            "gi"
          ),
          `<script>${jsFile.content}</script>`
        );
      });

    return html;
  })();

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
      <h1>Review Submission</h1>

      {submission && (
        <div style={{ marginBottom: 20, padding: 12, background: "#f5f5f5", borderRadius: 8 }}>
          <p><strong>Student:</strong> {submission.studentName} ({submission.studentEmail})</p>
          <p><strong>Submitted:</strong> {new Date(submission.submission.submittedAt).toLocaleString()}</p>
          <p><strong>Type:</strong> {submission.submission.submissionType}</p>
          {submission.submission.isLate && (
            <p style={{ color: "red" }}><strong>LATE SUBMISSION</strong></p>
          )}
        </div>
      )}

      {/* Two-panel layout: Code + Preview */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Code Panel */}
        <div>
          <h3>Code Files</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {files.map((f) => (
              <button
                key={f.filename}
                onClick={() => setActiveFile(f.filename)}
                style={{
                  padding: "4px 12px",
                  background: activeFile === f.filename ? "#333" : "#eee",
                  color: activeFile === f.filename ? "#fff" : "#333",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {f.filename}
              </button>
            ))}
          </div>
          {activeFileContent && (
            <pre style={{
              background: "#1e1e1e",
              color: "#d4d4d4",
              padding: 16,
              borderRadius: 8,
              overflow: "auto",
              maxHeight: 500,
              fontSize: 13,
              lineHeight: 1.5,
            }}>
              <code>{activeFileContent.content}</code>
            </pre>
          )}
        </div>

        {/* Preview Panel */}
        <div>
          <h3>Live Preview</h3>
          {previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              style={{
                width: "100%",
                height: 500,
                border: "1px solid #ddd",
                borderRadius: 8,
                background: "#fff",
              }}
              sandbox="allow-scripts"
              title="Student Code Preview"
            />
          ) : (
            <p style={{ color: "#999" }}>No HTML file found to preview.</p>
          )}
        </div>
      </div>

      {/* AI Review Section */}
      <div style={{ borderTop: "2px solid #eee", paddingTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h2 style={{ margin: 0 }}>AI Review</h2>
          <button
            onClick={runReview}
            disabled={reviewing}
            style={{
              padding: "8px 24px",
              background: reviewing ? "#999" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: reviewing ? "default" : "pointer",
              fontSize: 16,
            }}
          >
            {reviewing
              ? "Reviewing..."
              : review
              ? "Re-run Review"
              : "Run AI Review"}
          </button>
        </div>

        {review && review.status === "completed" && review.feedback && (
          <div style={{ marginTop: 20 }}>
            {/* Score */}
            <div style={{
              fontSize: 48,
              fontWeight: "bold",
              color: review.aiScore >= review.maxScore * 0.7 ? "#16a34a" : review.aiScore >= review.maxScore * 0.5 ? "#ca8a04" : "#dc2626",
            }}>
              {review.teacherOverrideScore ?? review.aiScore} / {review.maxScore}
              {review.teacherOverrideScore && (
                <span style={{ fontSize: 14, color: "#999", marginLeft: 8 }}>
                  (AI: {review.aiScore}, Override: {review.teacherOverrideScore})
                </span>
              )}
            </div>

            {/* Summary */}
            <p style={{ fontSize: 16, marginTop: 12 }}>{review.feedback.summary}</p>

            {/* Criteria Breakdown */}
            <h3>Score Breakdown</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  <th style={{ padding: 8, textAlign: "left" }}>Criterion</th>
                  <th style={{ padding: 8, textAlign: "center" }}>Score</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Comment</th>
                </tr>
              </thead>
              <tbody>
                {review.feedback.criteria?.map((c: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8, fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: 8, textAlign: "center" }}>
                      {c.score}/{c.maxScore}
                    </td>
                    <td style={{ padding: 8 }}>{c.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Suggestions */}
            {review.feedback.suggestions?.length > 0 && (
              <>
                <h3>Suggestions for Improvement</h3>
                <ul>
                  {review.feedback.suggestions.map((s: string, i: number) => (
                    <li key={i} style={{ marginBottom: 6 }}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {/* Code Quality */}
            {review.feedback.codeQualityNotes && (
              <>
                <h3>Code Quality Notes</h3>
                <p>{review.feedback.codeQualityNotes}</p>
              </>
            )}

            {/* Teacher Override */}
            <div style={{ marginTop: 24, padding: 16, background: "#fefce8", borderRadius: 8 }}>
              <h3 style={{ margin: "0 0 8px" }}>Override Score</h3>
              <p style={{ color: "#666", fontSize: 14 }}>
                If the AI score doesn't seem right, you can override it.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(e.target.value)}
                  placeholder={`0-${review.maxScore}`}
                  min={0}
                  max={review.maxScore}
                  style={{ padding: 8, width: 100 }}
                />
                <button onClick={handleOverride}>Save Override</button>
              </div>
            </div>
          </div>
        )}

        {review && review.status === "failed" && (
          <p style={{ color: "red", marginTop: 12 }}>
            Review failed. You can try again.
          </p>
        )}
      </div>
    </div>
  );
}
```

#### `client/src/pages/SubmitAssignment.tsx`

```tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function SubmitAssignment() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<any>(null);
  const [submissionType, setSubmissionType] = useState<"github" | "file_upload">("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/assignments/${assignmentId}`).then(setAssignment);
  }, [assignmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      if (submissionType === "github") {
        await api("/submissions", {
          method: "POST",
          body: JSON.stringify({ assignmentId, githubUrl }),
        });
      } else {
        if (!file) {
          setError("Please select a file");
          setSubmitting(false);
          return;
        }
        const formData = new FormData();
        formData.append("assignmentId", assignmentId!);
        formData.append("file", file);

        await api("/submissions", {
          method: "POST",
          body: formData,
        });
      }
      navigate("/student");
    } catch (err: any) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  if (!assignment) return <p>Loading...</p>;

  const now = new Date();
  const isOpen = now >= new Date(assignment.opensAt) && now <= new Date(assignment.closesAt);

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: 20 }}>
      <h1>Submit: {assignment.title}</h1>
      <p>{assignment.description}</p>

      <div style={{ padding: 12, background: isOpen ? "#f0fdf4" : "#fef2f2", borderRadius: 8, marginBottom: 20 }}>
        <p>
          <strong>Deadline:</strong> {new Date(assignment.closesAt).toLocaleString()}
        </p>
        {!isOpen && <p style={{ color: "red" }}>Submissions are closed for this assignment.</p>}
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label>Submission Type:</label>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            {assignment.allowGithub && (
              <button
                type="button"
                onClick={() => setSubmissionType("github")}
                style={{
                  padding: "8px 16px",
                  background: submissionType === "github" ? "#333" : "#eee",
                  color: submissionType === "github" ? "#fff" : "#333",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                GitHub Link
              </button>
            )}
            {assignment.allowFileUpload && (
              <button
                type="button"
                onClick={() => setSubmissionType("file_upload")}
                style={{
                  padding: "8px 16px",
                  background: submissionType === "file_upload" ? "#333" : "#eee",
                  color: submissionType === "file_upload" ? "#fff" : "#333",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Upload ZIP
              </button>
            )}
          </div>
        </div>

        {submissionType === "github" ? (
          <div>
            <label>GitHub Repository URL</label>
            <input
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/username/repo"
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
        ) : (
          <div>
            <label>Upload Project (ZIP file)</label>
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
              style={{ marginTop: 4 }}
            />
          </div>
        )}

        {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: 20,
            padding: "10px 32px",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          {submitting ? "Submitting..." : "Submit Assignment"}
        </button>
      </form>
    </div>
  );
}
```

#### `client/src/pages/SubmissionsList.tsx`

```tsx
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";

export default function SubmissionsList() {
  const { assignmentId } = useParams();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [assignment, setAssignment] = useState<any>(null);
  const [filterDate, setFilterDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    api(`/assignments/${assignmentId}`).then(setAssignment);
  }, [assignmentId]);

  useEffect(() => {
    api(`/submissions?assignment_id=${assignmentId}&date=${filterDate}`).then(
      setSubmissions
    );
  }, [assignmentId, filterDate]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <h1>Submissions{assignment ? `: ${assignment.title}` : ""}</h1>

      <div style={{ marginBottom: 20 }}>
        <label>Filter by date: </label>
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
        />
      </div>

      <p>{submissions.length} submission(s) found</p>

      <div>
        {submissions.map((s) => (
          <div
            key={s.submission.id}
            style={{
              border: "1px solid #ddd",
              padding: 16,
              marginBottom: 12,
              borderRadius: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>{s.studentName}</h3>
              <p style={{ color: "#666", margin: "4px 0", fontSize: 14 }}>
                {s.studentEmail}
              </p>
              <p style={{ fontSize: 13, color: "#999" }}>
                Submitted: {new Date(s.submission.submittedAt).toLocaleString()}
                {" | "}
                Type: {s.submission.submissionType}
                {s.submission.isLate && (
                  <span style={{ color: "red", marginLeft: 8 }}>LATE</span>
                )}
              </p>
            </div>
            <Link to={`/teacher/review/${s.submission.id}`}>
              <button
                style={{
                  padding: "8px 20px",
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Review
              </button>
            </Link>
          </div>
        ))}

        {submissions.length === 0 && (
          <p style={{ color: "#999", textAlign: "center", padding: 40 }}>
            No submissions found for this date.
          </p>
        )}
      </div>
    </div>
  );
}
```

#### `client/src/pages/StudentDashboard.tsx`

```tsx
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { Link } from "react-router-dom";

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    api("/assignments").then(setAssignments);
  }, []);

  const now = new Date();

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>My Assignments</h1>
        <div>
          <span>{user?.email}</span>
          <button onClick={logout} style={{ marginLeft: 10 }}>Logout</button>
        </div>
      </header>

      <Link to="/student/results" style={{ display: "inline-block", marginBottom: 20 }}>
        View My Scores
      </Link>

      {assignments.map((a) => {
        const isOpen = now >= new Date(a.opensAt) && now <= new Date(a.closesAt);
        const isPast = now > new Date(a.closesAt);

        return (
          <div key={a.id} style={{ border: "1px solid #ddd", padding: 16, marginBottom: 12, borderRadius: 8 }}>
            <h3>{a.title}</h3>
            <p>{a.description.substring(0, 200)}...</p>
            <p style={{ fontSize: 13, color: "#666" }}>
              Deadline: {new Date(a.closesAt).toLocaleString()}
              {isOpen && <span style={{ color: "green", marginLeft: 8 }}>OPEN</span>}
              {isPast && <span style={{ color: "red", marginLeft: 8 }}>CLOSED</span>}
            </p>
            {isOpen && (
              <Link to={`/student/submit/${a.id}`}>
                <button style={{ padding: "6px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6 }}>
                  Submit
                </button>
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

#### `client/src/pages/StudentResults.tsx`

```tsx
import { useState, useEffect } from "react";
import { api } from "../api";

export default function StudentResults() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Record<string, any>>({});

  useEffect(() => {
    api("/submissions").then(async (subs) => {
      setSubmissions(subs);
      // Fetch reviews for each submission
      const reviewMap: Record<string, any> = {};
      for (const s of subs) {
        try {
          const review = await api(`/reviews/${s.submission.id}`);
          reviewMap[s.submission.id] = review;
        } catch {
          // No review yet
        }
      }
      setReviews(reviewMap);
    });
  }, []);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 20 }}>
      <h1>My Scores</h1>

      {submissions.map((s) => {
        const review = reviews[s.submission.id];
        const score = review?.teacherOverrideScore ?? review?.aiScore;

        return (
          <div key={s.submission.id} style={{ border: "1px solid #ddd", padding: 16, marginBottom: 12, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, color: "#666" }}>
                  Submitted: {new Date(s.submission.submittedAt).toLocaleString()}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                {review?.status === "completed" ? (
                  <p style={{
                    fontSize: 28,
                    fontWeight: "bold",
                    color: score >= review.maxScore * 0.7 ? "#16a34a" : score >= review.maxScore * 0.5 ? "#ca8a04" : "#dc2626"
                  }}>
                    {score}/{review.maxScore}
                  </p>
                ) : (
                  <p style={{ color: "#999" }}>
                    {review ? review.status : "Awaiting review"}
                  </p>
                )}
              </div>
            </div>

            {review?.feedback?.summary && (
              <p style={{ marginTop: 8 }}>{review.feedback.summary}</p>
            )}

            {review?.feedback?.suggestions?.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", color: "#2563eb" }}>View feedback</summary>
                <ul style={{ marginTop: 8 }}>
                  {review.feedback.suggestions.map((s: string, i: number) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

#### `client/src/pages/CreateAssignment.tsx`

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function CreateAssignment() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rubric, setRubric] = useState("");
  const [maxScore, setMaxScore] = useState(100);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await api("/assignments", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          rubric,
          maxScore,
          opensAt: new Date(opensAt).toISOString(),
          closesAt: new Date(closesAt).toISOString(),
        }),
      });
      navigate("/teacher");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const rubricPlaceholder = `Example rubric:

1. Correct use of CSS Flexbox (20 points)
   - Uses display:flex on the container
   - Proper use of justify-content and align-items
   - Responsive flex-wrap

2. Semantic HTML (20 points)
   - Uses proper heading hierarchy
   - Uses nav, main, section, article, footer
   - No div soup

3. JavaScript DOM Manipulation (30 points)
   - Correctly selects elements
   - Dynamically creates/modifies elements
   - Clean, readable JS code

4. Visual Accuracy (20 points)
   - Matches the mockup/description
   - Proper spacing, colors, typography

5. Code Quality (10 points)
   - Well-organized file structure
   - Meaningful class/id names
   - No console errors`;

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", padding: 20 }}>
      <h1>Create Assignment</h1>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label><strong>Title</strong></label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Week 3: CSS Flexbox Layout"
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label><strong>Description</strong></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what students should build..."
            required
            rows={6}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label><strong>Rubric (Scoring Criteria)</strong></label>
          <textarea
            value={rubric}
            onChange={(e) => setRubric(e.target.value)}
            placeholder={rubricPlaceholder}
            required
            rows={12}
            style={{ width: "100%", padding: 8, marginTop: 4, fontFamily: "monospace" }}
          />
          <p style={{ fontSize: 12, color: "#666" }}>
            Be specific — the AI will score against these criteria exactly.
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label><strong>Max Score</strong></label>
          <input
            type="number"
            value={maxScore}
            onChange={(e) => setMaxScore(parseInt(e.target.value))}
            style={{ width: 100, padding: 8, marginTop: 4 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label><strong>Opens At</strong></label>
            <input
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div>
            <label><strong>Closes At (Deadline)</strong></label>
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
        </div>

        <button
          type="submit"
          style={{
            padding: "10px 32px",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 16,
          }}
        >
          Create Assignment
        </button>
      </form>
    </div>
  );
}
```

---

## 10. Code Preview / Sandbox

The preview is handled in `ReviewSubmission.tsx` using a **sandboxed iframe** with `srcDoc`. The approach:

1. Read the student's HTML file content
2. Find any CSS/JS files referenced in the HTML
3. Inline the CSS as `<style>` tags and JS as `<script>` tags
4. Render the combined HTML in an `<iframe srcDoc="..." sandbox="allow-scripts">`

The `sandbox="allow-scripts"` attribute is important — it lets JS execute but prevents the iframe from accessing the parent page, making forms, or navigating away. This is safe for previewing student code.

For cases where students use external assets (images, fonts), you'd also need `sandbox="allow-scripts allow-same-origin"` and serve the student's files from a `/api/preview/:submissionId/` endpoint (already included in the server).

---

## 11. GitHub Integration

Already covered in `src/services/github.ts`. The flow is:

1. Student pastes their GitHub repo URL
2. Server validates it's a GitHub URL
3. Server runs `git clone --depth 1` to grab only the latest commit
4. Code is stored in `./uploads/{submission_id}/`
5. The commit hash is locked at submission time (no sneaky edits after)

**Requirements:** `git` must be installed on the server.

---

## 12. File Upload Handling

Covered in `src/services/file-extractor.ts`. The flow:

1. Student uploads a `.zip` file via the form
2. Server saves the zip to a temp location
3. Server extracts it using `unzip`
4. If the zip has a single top-level folder (common with GitHub downloads), contents are moved up one level
5. Extracted files live in `./uploads/{submission_id}/`

**Requirements:** `unzip` must be installed on the server.

---

## 13. Deployment

### Production Checklist

1. **Build the React client:** `cd client && bun run build`
2. **Set environment variables** (especially `ANTHROPIC_API_KEY`, `JWT_SECRET`, `DATABASE_URL`)
3. **Run migrations:** `bun src/db/migrate.ts`
4. **Start the server:** `bun src/index.ts`

The Bun server serves both the API and the React static files from `client/dist/`.

### Docker (Optional)

```dockerfile
FROM oven/bun:latest

RUN apt-get update && apt-get install -y git unzip && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production

COPY . .
RUN cd client && bun install && bun run build

EXPOSE 3000
CMD ["bun", "src/index.ts"]
```

### With a Process Manager

```bash
# Using pm2 with bun
bunx pm2 start src/index.ts --interpreter bun --name codegrade
```

---

## 14. Step-by-Step Build Instructions

Follow these in order to get the platform running from scratch.

### Step 1: Initialize the Project

```bash
mkdir codegrade && cd codegrade
bun init -y

# Install backend dependencies
bun add drizzle-orm postgres @anthropic-ai/sdk jsonwebtoken
bun add -d drizzle-kit @types/jsonwebtoken typescript

# Create directory structure
mkdir -p src/{db,routes,services,middleware,utils}
mkdir -p uploads
```

### Step 2: Set Up PostgreSQL

```bash
# If using Docker for Postgres:
docker run -d \
  --name codegrade-db \
  -e POSTGRES_USER=codegrade \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=codegrade \
  -p 5432:5432 \
  postgres:16

# Or create the database manually:
# psql -U postgres
# CREATE DATABASE codegrade;
# CREATE USER codegrade WITH PASSWORD 'yourpassword';
# GRANT ALL PRIVILEGES ON DATABASE codegrade TO codegrade;
```

### Step 3: Create the `.env` File

```bash
cat > .env << 'EOF'
DATABASE_URL=postgresql://codegrade:yourpassword@localhost:5432/codegrade
JWT_SECRET=change-this-to-a-random-string-at-least-32-chars
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=3000
UPLOAD_DIR=./uploads
EOF
```

### Step 4: Create All Backend Files

Copy each file from the sections above into its respective path:

```
src/db/schema.ts          → Section 3
src/db/connection.ts      → Section 5
src/db/migrate.ts         → Section 5
src/utils/jwt.ts          → Section 6
src/utils/password.ts     → Section 6
src/utils/deadline.ts     → Section 7
src/middleware/auth.ts     → Section 6
src/routes/auth.ts        → Section 6
src/routes/assignments.ts → Section 7
src/routes/submissions.ts → Section 7
src/routes/reviews.ts     → Section 7
src/services/ai-reviewer.ts   → Section 8
src/services/code-reader.ts   → Section 8
src/services/github.ts        → Section 8
src/services/file-extractor.ts → Section 8
src/index.ts              → Section 5
drizzle.config.ts         → Section 4
tsconfig.json             → Section 4
```

### Step 5: Run Database Migrations

```bash
bunx drizzle-kit generate
bun src/db/migrate.ts
```

### Step 6: Test the Backend

```bash
bun --watch src/index.ts

# In another terminal, test:

# Register a teacher
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@test.com","password":"test123","fullName":"Mr. Robinson","role":"teacher"}'

# Register a student
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"student@test.com","password":"test123","fullName":"Chidi","role":"student"}'
```

### Step 7: Set Up the React Frontend

```bash
cd client
bun create vite . --template react-ts
bun add react-router-dom
```

Copy each frontend file from Section 9 into its path, then:

```bash
# client/vite.config.ts → Section 9
# client/src/api.ts
# client/src/context/AuthContext.tsx
# client/src/App.tsx
# client/src/pages/Login.tsx
# client/src/pages/StudentDashboard.tsx
# client/src/pages/SubmitAssignment.tsx
# client/src/pages/StudentResults.tsx
# client/src/pages/TeacherDashboard.tsx
# client/src/pages/CreateAssignment.tsx
# client/src/pages/SubmissionsList.tsx
# client/src/pages/ReviewSubmission.tsx
```

### Step 8: Run in Development

```bash
# Terminal 1: Backend
bun --watch src/index.ts

# Terminal 2: Frontend (with proxy to backend)
cd client && bun run dev
```

Open `http://localhost:5173` in your browser.

### Step 9: Build for Production

```bash
cd client && bun run build
cd ..
bun src/index.ts
# Now everything is served from http://localhost:3000
```

### Step 10: Create Your First Assignment (via the UI)

1. Login as teacher
2. Click "Create Assignment"
3. Fill in:
   - **Title:** "Week 1: HTML & CSS Personal Portfolio"
   - **Description:** "Build a single-page portfolio website with a header, about section, skills list, and contact form. Use semantic HTML and CSS Flexbox for layout."
   - **Rubric:**
     ```
     1. Semantic HTML Structure (20 points)
        - Uses header, nav, main, section, footer
        - Proper heading hierarchy (h1 > h2 > h3)
        - Form uses proper labels and input types

     2. CSS Flexbox Layout (25 points)
        - Navigation uses flexbox
        - Skills section uses flex-wrap
        - Responsive layout that works on mobile

     3. Visual Design (20 points)
        - Consistent color scheme
        - Readable typography
        - Proper spacing and alignment

     4. Code Quality (20 points)
        - Clean indentation
        - Meaningful class names
        - No inline styles
        - External CSS file

     5. Completeness (15 points)
        - All required sections present
        - Contact form with all fields
        - No broken links or images
     ```
   - **Max Score:** 100
   - **Opens At:** Now
   - **Closes At:** Tomorrow 11:59 PM

4. Students submit their GitHub links or zip files
5. You click into each submission → Click "Run AI Review"
6. AI scores appear with detailed feedback per criterion
7. Override the score if needed

---

## Notes & Future Enhancements

**Things to consider adding later:**

- **Batch review:** Button to run AI review on ALL submissions for an assignment at once
- **Email notifications:** Notify students when their review is ready
- **Plagiarism detection:** Compare code similarity across submissions using AST diffing
- **Assignment templates:** Save rubrics you use frequently
- **Bulk student registration:** Upload a CSV of student emails
- **Export grades:** Download a CSV of all scores for an assignment
- **Rate limiting:** Throttle Claude API calls to manage costs
- **WebSocket updates:** Show real-time review progress instead of polling

**Cost considerations:** Each AI review uses roughly 2,000–4,000 tokens. With Claude Sonnet, that's very affordable — roughly $0.01–0.03 per review. For a class of 30 students with weekly assignments, you're looking at about $1–4/month in API costs.
