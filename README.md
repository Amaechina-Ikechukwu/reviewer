# Reviewer

AI-powered assignment review platform for teachers. Create assignments, invite students, and get Gemini-generated code reviews — all in one place.

---

## Features

- **Assignment creation** — source from a Markdown file or Notion link; generates a shareable student submission link
- **Student invites** — add students by email; they set their own password via an invite link
- **Submissions** — students submit via GitHub repo or ZIP upload within the assignment window
- **Gemini review** — automated code review with per-file scores, structure analysis, and suggestions
- **Teacher override** — manually adjust scores and write final feedback before releasing grades
- **Historical import** — paste or upload a list of student names and GitHub links to backfill submissions
- **Email notifications** — assignment alerts, deadline reminders (24h and 1h), invite and reset emails via ZeptoMail
- **Auto-merge** — when an invited student sets up their account, historical submissions under their name are automatically linked

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Backend | TypeScript, custom HTTP router |
| Database | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team) |
| Frontend | React 18, TypeScript, Vite, React Router |
| AI | Google Gemini (`@google/genai`) |
| Email | Nodemailer + ZeptoMail SMTP |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- PostgreSQL database
- Google Gemini API key
- ZeptoMail account (for email)

### 1. Clone and install

```bash
git clone <repo-url>
cd reviewer
bun install
cd client && bun install && cd ..
```

### 2. Configure environment

Copy `.env` and fill in the values:

```env
DATABASE_URL=postgres://user:password@localhost:5432/reviewer
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
PORT=3000

# Google Gemini
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash

# Email (ZeptoMail)
SMTP_HOST=smtp.zeptomail.com
SMTP_PORT=587
SMTP_USER=emailapikey
SMTP_PASS=your-zeptomail-api-key
FROM_EMAIL=noreply@yourdomain.com
APP_URL=https://your-app-url.com
```

### 3. Set up the database

```bash
bun run db:push
```

### 4. Run in development

```bash
# Terminal 1 — backend
bun run dev

# Terminal 2 — frontend
bun run dev:client
```

Backend runs on `http://localhost:3000`, frontend on `http://localhost:5173`.

### 5. Build for production

```bash
bun run build:client
bun run start
```

The server serves the built client from `client/dist` and the API on the same port.

---

## Project Structure

```
reviewer/
├── src/
│   ├── db/
│   │   ├── schema.ts          # Drizzle table definitions
│   │   ├── connection.ts      # Postgres connection
│   │   └── migrate.ts         # Migration runner
│   ├── middleware/
│   │   └── auth.ts            # JWT auth middleware
│   ├── routes/
│   │   ├── auth.ts            # Login, register, invite, reset
│   │   ├── assignments.ts     # Assignment CRUD
│   │   ├── submissions.ts     # Submission create, import, list
│   │   ├── reviews.ts         # Gemini review, score override
│   │   └── students.ts        # Student management, invite, reset
│   ├── services/
│   │   ├── email.ts           # ZeptoMail email sender
│   │   ├── github.ts          # GitHub repo cloning
│   │   ├── file-extractor.ts  # ZIP extraction
│   │   └── ai/
│   │       └── gemini-provider.ts
│   ├── jobs/
│   │   └── reminders.ts       # Deadline reminder background job
│   └── index.ts               # Server entry point
└── client/
    └── src/
        ├── pages/
        │   ├── TeacherDashboard.tsx
        │   ├── CreateAssignment.tsx
        │   ├── SubmissionsList.tsx
        │   ├── ReviewSubmission.tsx
        │   ├── StudentsPage.tsx
        │   ├── ImportSubmissions.tsx
        │   ├── SetupAccount.tsx   # Student invite flow
        │   ├── ResetPassword.tsx  # Password reset flow
        │   ├── StudentDashboard.tsx
        │   ├── SubmitAssignment.tsx
        │   └── StudentResults.tsx
        ├── components/
        │   ├── TeacherShell.tsx
        │   └── StudentShell.tsx
        ├── styles.css
        └── App.tsx
```

---

## Usage

### Teacher workflow

1. **Register** as a teacher at `/login`
2. **Create an assignment** — give it a name, attach a Markdown file or Notion link, set a deadline
3. **Share the link** — after creation a submission link is shown; send it to students
4. **Add students** — go to Students, add by name and email; they receive an invite to set their password
5. **Review submissions** — open any submission to see the code, run Gemini review, adjust the score, and release the grade

### Student workflow

1. **Accept invite** — click the email link, set a password, land on the student dashboard
2. **Submit** — open the assignment link, submit a GitHub repo URL or ZIP file before the deadline
3. **See results** — after the teacher releases the grade, view score and feedback on the results page

### Import historical submissions

Go to **Import** in the sidebar, paste a document with student names and GitHub links (supports `owner/repo` shorthand), select an assignment, and click Import. If a student later signs up with a matching name, their submissions are automatically linked.

---

## Database Schema

| Table | Purpose |
|---|---|
| `users` | Teachers and students; `INVITE_PENDING` hash for uninvited students |
| `assignments` | Assignment config, source content, submission window |
| `submissions` | One per student per assignment; GitHub URL or file path |
| `reviews` | Gemini output, AI score, teacher override score |
| `auth_tokens` | Invite and reset tokens with expiry |

---

## Email Events

| Trigger | Recipient | Expiry |
|---|---|---|
| Student added | Student | Invite link valid 48h |
| Teacher requests reset | Student | Reset link valid 2h |
| Assignment created (open now) | All active students | — |
| 24h before deadline | Students who haven't submitted | — |
| 1h before deadline | Students who haven't submitted | — |

---

## Scripts

```bash
bun run dev           # Start backend with hot reload
bun run dev:client    # Start frontend dev server
bun run build:client  # Build frontend for production
bun run start         # Start production server
bun run db:push       # Push schema changes to database
bun run db:generate   # Generate migration files
bun run typecheck     # TypeScript type check
```

---

## Deploying to a VPS with Dokploy

[Dokploy](https://dokploy.com) is a self-hosted PaaS that runs on your VPS and deploys Docker-based apps from Git.

### Prerequisites

- A VPS with Dokploy installed ([install guide](https://docs.dokploy.com/docs/core))
- This repo pushed to GitHub / GitLab / Bitbucket
- A domain pointing to your VPS

---

### Step 1 — Create a PostgreSQL service in Dokploy

1. Open your Dokploy dashboard → **Project** → **Create Service** → **Database**
2. Choose **PostgreSQL**
3. Set a database name (e.g. `reviewer`), username, and password
4. Click **Deploy**
5. Copy the internal connection string — it looks like:
   ```
   postgresql://username:password@dokploy-postgres:5432/reviewer
   ```
   > Use the **internal** hostname (not the public one) so the app container talks to the DB over the private network.

---

### Step 2 — Create the app service

1. **Create Service** → **Application**
2. **Source** → Git → connect your GitHub/GitLab account and select the repo
3. **Branch** → `main` (or whichever branch you deploy from)
4. **Build type** → **Dockerfile** — Dokploy will use the `Dockerfile` at the repo root automatically

---

### Step 3 — Set environment variables

In the app service → **Environment** tab, add:

```env
DATABASE_URL=postgresql://username:password@dokploy-postgres:5432/reviewer
JWT_SECRET=<generate a strong random string>
JWT_EXPIRES_IN=7d
PORT=3000

GEMINI_API_KEY=<your key>
GEMINI_MODEL=gemini-2.5-flash

SMTP_HOST=smtp.zeptomail.com
SMTP_PORT=587
SMTP_USER=emailapikey
SMTP_PASS=<your ZeptoMail API key>
FROM_EMAIL=noreply@yourdomain.com
APP_URL=https://yourdomain.com
```

---

### Step 4 — Set the port

In the app service → **General** tab:

- **Port** → `3000`

---

### Step 5 — Run the database migration

After the first deploy completes, open the app service → **Terminal** tab and run:

```bash
bun run db:push
```

This creates all tables. You only need to do this once (and again after any schema changes).

---

### Step 6 — Add a domain

1. App service → **Domains** tab → **Add Domain**
2. Enter your domain (e.g. `reviewer.yourdomain.com`)
3. Enable **HTTPS** — Dokploy provisions a Let's Encrypt certificate automatically
4. Update `APP_URL` in your environment variables to match:
   ```
   APP_URL=https://reviewer.yourdomain.com
   ```
5. Redeploy so the invite/reset email links use the correct URL

---

### Step 7 — Deploy

Click **Deploy** in the app service. Dokploy will:

1. Clone the repo
2. Build the Docker image (frontend Vite build + Bun backend)
3. Start the container
4. Route traffic from your domain through its Traefik reverse proxy

---

### Subsequent deploys

Push to your deploy branch — then either:
- **Trigger manually** in Dokploy dashboard → **Deploy**
- **Enable auto-deploy** (Dokploy → app service → **General** → Auto Deploy) to deploy on every push automatically

---

### Uploads directory

If students submit ZIP files, uploaded files are stored in `./uploads` inside the container. This directory is ephemeral by default — add a **Volume** in Dokploy to persist it:

- App service → **Volumes** → **Add Volume**
- Container path: `/app/uploads`
- Choose a named volume or host path
