FROM node:24-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV HOME=/home/node

RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's/Components: main/Components: main contrib/g' /etc/apt/sources.list.d/debian.sources; \
    else \
        sed -i 's/main/main contrib/g' /etc/apt/sources.list; \
    fi && \
    echo "ttf-mscorefonts-installer msttcorefontdir/accepted-mscorefonts-eula select true" | debconf-set-selections

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    perl \
    python3-pygments \
    ghostscript \
    imagemagick \
    poppler-utils \
    tini \
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
    texlive-fonts-recommended \
    texlive-fonts-extra \
    fonts-liberation \
    fonts-liberation2 \
    fonts-lmodern \
    fonts-noto \
    fonts-open-sans \
    fonts-urw-base35 \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-roboto \
    fonts-firacode \
    fonts-ebgaramond \
    fonts-texgyre \
    ttf-mscorefonts-installer \
    fontconfig \
    libfontconfig1 \
    libfreetype6 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN fc-cache -fv \
    && luaotfload-tool --update \
    && mktexlsr

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

COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/.next/standalone ./
COPY --chown=node:node --from=builder /app/.next/static ./.next/static

COPY --chown=node:node texlab-bridge.js ./
COPY --chown=node:node mcp-server.ts ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

RUN mkdir -p /app/projects && chown -R node:node /app/projects

RUN printf '#!/bin/sh\nnode texlab-bridge.js &\nnode --experimental-strip-types mcp-server.ts &\nexec node server.js\n' > start.sh \
    && chmod +x start.sh \
    && chown node:node start.sh

ENV PORT=8080
EXPOSE 8080
EXPOSE 3100
EXPOSE 3202

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/auth/session || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./start.sh"]
