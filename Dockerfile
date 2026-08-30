# Step 1: Dependencies Stage
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package manifests and install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Step 2: Production Runner Stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Create a non-root user for security
USER node

# Copy dependencies and application code
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node server.js ./
COPY --chown=node:node src/ ./src/

EXPOSE 5000

# Healthcheck to monitor API node availability
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "server.js"]
