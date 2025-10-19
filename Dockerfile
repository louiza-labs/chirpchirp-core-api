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
ENV PORT=8080

# Health check for Google Cloud Run
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the application
CMD ["bun", "run", "src/index.ts"]

