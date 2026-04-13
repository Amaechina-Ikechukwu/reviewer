# Stage 1: Build the React frontend
FROM node:20-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install --frozen-lockfile
COPY client/ .
RUN npm run build

# Stage 2: Install backend dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Stage 3: Runtime
FROM oven/bun:1 AS runner
WORKDIR /app

# git is required for GitHub repo cloning at review time
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
COPY drizzle/ ./drizzle/
COPY tsconfig.json ./
COPY --from=client-build /app/client/dist ./client/dist

# Cloud Run sets PORT dynamically (default 8080)
ENV PORT=8080
# Use /tmp for uploads — Cloud Run filesystem is ephemeral.
# For persistent file uploads wire GCS_BUCKET instead (see .env.example).
ENV UPLOAD_DIR=/tmp/uploads

EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]
