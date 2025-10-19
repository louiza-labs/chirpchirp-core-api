# Use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies (with cache mount for better performance)
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source code
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Production image
FROM base AS release
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./

# Run as non-root user for security
USER bun

# Expose the port the app runs on (Google Cloud Run uses PORT env var)
EXPOSE 8080

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["bun", "run", "src/index.ts"]

