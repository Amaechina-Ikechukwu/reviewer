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
RUN bun install --frozen-lockfile

# Stage 3: Runtime
FROM oven/bun:1 AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
COPY drizzle/ ./drizzle/
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY --from=client-build /app/client/dist ./client/dist

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
