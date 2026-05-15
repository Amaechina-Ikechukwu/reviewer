# Agent Notes for Reviewer

## Quick Commands

```bash
# Install all dependencies (root + client)
bun install && cd client && bun install && cd ..

# Run development servers (two terminals)
bun run dev        # Backend: http://localhost:3000
bun run dev:client # Frontend: http://localhost:5173

# Database
bun run db:push      # Push schema changes (use for dev)
bun run db:generate  # Generate migration files

# Build & production
bun run build:client  # Build frontend
bun run start         # Run production server
bun run typecheck     # TypeScript check (root only)
```

## Architecture

- **Backend**: Custom HTTP router in `src/index.ts`, routes in `src/routes/`
- **Frontend**: React 18 + Vite + React Router in `client/`
- **Database**: Drizzle ORM with PostgreSQL in `src/db/`
- **AI**: Google Gemini via `@google/genai` in `src/services/ai/`

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