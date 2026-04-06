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

COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY --from=client-build /app/client/dist ./client/dist

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
