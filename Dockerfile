# ── STAGE 1: Build Next.js App ───────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── STAGE 2: Production Environment ──────────────────────────────────────────
# node:24-bookworm-slim ships Node.js 24 out of the box — no manual NodeSource
# dance needed, saving ~50 MB and removing the external curl/GPG dependency.
FROM node:24-bookworm-slim AS runner

# Prevent interactive prompts during apt-get
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV HOME=/home/node

# Install TeX Live (English-only) and required system dependencies.
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core utilities
    curl \
    ca-certificates \
    perl \
    python3-pygments \
    ghostscript \
    imagemagick \
    poppler-utils \
    tini \
    # TeX Live — engines + collections
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-plain-generic \
    texlive-xetex \
    texlive-luatex \
    texlive-science \
    texlive-pictures \
    texlive-pstricks \
    texlive-bibtex-extra \
    texlive-publishers \
    biber \
    latexmk \
    # Fonts — TeX bundled (essential for academic papers)
    texlive-fonts-recommended \
    texlive-fonts-extra \
    # Fonts — system (XeTeX/LuaTeX load these natively)
    fonts-liberation \
    fonts-liberation2 \
    fonts-lmodern \
    fonts-noto \
    fonts-open-sans \
    fonts-urw-base35 \
    # Font subsystem
    fontconfig \
    libfontconfig1 \
    libfreetype6 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Rebuild font caches — required for XeTeX/LuaTeX to find system fonts.
# --update (without --force) only refreshes stale entries, much faster than
# forcing a full re-download of the LuaTeX font database every build.
RUN fc-cache -fv \
    && luaotfload-tool --update \
    && mktexlsr

# Install TexLab LSP server (detecting system architecture for multi-arch / ARM support)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        TEXLAB_ARCH="x86_64"; \
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        TEXLAB_ARCH="aarch64"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl -L "https://github.com/latex-lsp/texlab/releases/download/v5.12.3/texlab-${TEXLAB_ARCH}-linux.tar.gz" | tar -xz -C /usr/local/bin && \
    chmod +x /usr/local/bin/texlab

WORKDIR /app

# Copy Next.js standalone build and static files (with node ownership)
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/.next/standalone ./
COPY --chown=node:node --from=builder /app/.next/static ./.next/static

# Copy the TexLab bridge (with node ownership)
COPY --chown=node:node texlab-bridge.js ./

# texlab-bridge.js only requires 'ws' (plus Node built-ins).
# Copy it directly from the builder — no network call needed at image build time.
COPY --chown=node:node --from=builder /app/node_modules/ws ./node_modules/ws

# Create startup script that runs the bridge and Next.js, and passes signals cleanly
RUN printf '#!/bin/sh\nnode texlab-bridge.js &\nexec node server.js\n' > start.sh \
    && chmod +x start.sh \
    && chown node:node start.sh

# Cloud Run expects the app to listen on the port defined by $PORT (default 8080)
ENV PORT=8080
EXPOSE 8080
EXPOSE 3100

# Run container as a secure, non-privileged user
USER node

# Health check to ensure the Next.js server is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/auth/session || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./start.sh"]
