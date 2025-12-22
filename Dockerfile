# ══════════════════════════════════════════════════════════════════════════════
# Vesperr - Production Dockerfile
# Multi-stage build with security best practices
# ══════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    libc-dev \
    linux-headers \
    git \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --legacy-peer-deps

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Builder (if you have a build step)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run any build steps if needed (uncomment if you have build scripts)
# RUN npm run build

# Prune dev dependencies
RUN npm prune --production --legacy-peer-deps

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Production
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Labels
LABEL maintainer="your-email@example.com"
LABEL description="WhatsApp Bot with Baileys"
LABEL version="2.0.0"

# Install runtime dependencies only
RUN apk add --no-cache \
    # Required for canvas/sharp
    cairo \
    pango \
    jpeg \
    giflib \
    librsvg \
    # FFmpeg for media processing
    ffmpeg \
    # Fonts
    fontconfig \
    font-noto \
    font-noto-emoji \
    # Utilities
    curl \
    dumb-init \
    # Timezone data
    tzdata \
    # Webp support
    libwebp-tools

# Set timezone (change as needed)
ENV TZ=UTC
RUN cp /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Create non-root user for security
RUN addgroup -g 1001 -S botgroup && \
    adduser -u 1001 -S botuser -G botgroup

# Set working directory
WORKDIR /app

# Copy production files
COPY --from=builder --chown=botuser:botgroup /app/node_modules ./node_modules
COPY --chown=botuser:botgroup . .

# Create necessary directories with proper permissions
RUN mkdir -p \
    /app/session \
    /app/data \
    /app/logs \
    /app/temp \
    /app/data/backups \
    && chown -R botuser:botgroup /app

# Environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${HEALTH_PORT:-3000}/health || exit 1

# Switch to non-root user
USER botuser

# Expose health check port (optional)
EXPOSE 3000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the bot
CMD ["node", "index.js"]

# ─────────────────────────────────────────────────────────────────────────────
# Stage: Development (optional, for local dev)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS development

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    ffmpeg \
    font-noto \
    curl

WORKDIR /app

# Copy all files
COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Development user (still non-root)
RUN addgroup -g 1001 -S botgroup && \
    adduser -u 1001 -S botuser -G botgroup && \
    mkdir -p /app/session /app/data /app/logs /app/temp && \
    chown -R botuser:botgroup /app

USER botuser

ENV NODE_ENV=development

CMD ["npm", "run", "dev"]