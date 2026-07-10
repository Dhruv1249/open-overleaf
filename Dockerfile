# ── STAGE 1: Build Next.js App ───────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── STAGE 2: Production Environment ──────────────────────────────────────────
# node:22-bookworm-slim ships Node.js 22 out of the box — no manual NodeSource
# dance needed, saving ~50 MB and removing the external curl/GPG dependency.
FROM node:24-bookworm-slim AS runner

# Prevent interactive prompts during apt-get
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

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

# Install TexLab LSP server
RUN curl -L https://github.com/latex-lsp/texlab/releases/download/v5.12.3/texlab-x86_64-linux.tar.gz | tar -xz -C /usr/local/bin \
    && chmod +x /usr/local/bin/texlab

WORKDIR /app

# Copy Next.js standalone build and static files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy the TexLab bridge
COPY texlab-bridge.js ./

# texlab-bridge.js only requires 'ws' (plus Node built-ins).
# Copy it directly from the builder — no network call needed at image build time.
COPY --from=builder /app/node_modules/ws ./node_modules/ws

# We need a process manager or a simple script to run both Next.js and texlab-bridge
RUN printf '#!/bin/sh\nnode texlab-bridge.js &\nnode server.js\n' > start.sh \
    && chmod +x start.sh

# Cloud Run expects the app to listen on the port defined by $PORT (default 8080)
ENV PORT=8080
EXPOSE 8080
EXPOSE 3100

CMD ["./start.sh"]
