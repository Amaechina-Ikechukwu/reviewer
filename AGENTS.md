# Agent Notes for Reviewer

## Quick Commands

```bash
# Install all dependencies (root + client)
npm install && cd client && npm install && cd ..

# Run development servers (two terminals)
npm run dev        # Backend: http://localhost:3000 (tsx watch)
npm run dev:client # Frontend: http://localhost:5173

# Build & production
npm run build:client  # Build frontend
npm run start         # Run production server
npm run typecheck     # TypeScript check (root only)
```

## Architecture

- **Backend**: Custom HTTP router in `src/index.ts`, routes in `src/v2/routes/`
- **Frontend**: React 18 + Vite + React Router in `client/`
- **Database**: Firestore (via `firebase-admin`) in `src/v2/firebase.ts`
- **AI**: Google Gemini via `@google/genai` in `src/services/ai/`
- **Email**: Nodemailer queue-based system in `src/v2/services/emailJobs.ts`

## Projects Feature

- **Collection**: `projects` in Firestore
- **Permissions**: Both students and staff can create projects. Students are auto-added as members. Staff can assign other students.
- **Notifications**: Students receive email when staff assigns them to a project.
- **Student-owned**: Students can edit/delete projects they created.

## Important Quirks

1. **Drizzle requires DATABASE_URL env var** — `drizzle.config.ts` throws if not set
2. **Client runs on npm, not bun** — `dev:client` and `build:client` use `npm --prefix client`
3. **Git required at runtime** — Dockerfile installs git for GitHub repo cloning during reviews
4. **Uploads are ephemeral in Docker** — production uses `/tmp/uploads`; use volume or GCS for persistence
5. **PORT defaults to 8080 in production** — Dev uses 3000, Docker/Cloud Run uses 8080

## Package Boundaries

- Root (`/`) owns: backend, database, services, jobs, API routes
- Client (`/client`) owns: React frontend, pages, components, styling

## Env Required Variables

```
DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT,
GEMINI_API_KEY, GEMINI_MODEL,
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL, APP_URL
```