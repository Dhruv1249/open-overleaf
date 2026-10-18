# Open Overleaf

Open Overleaf is a self-hosted LaTeX IDE and document automation service designed to run database-free. It uses a single GitHub repository as its canonical storage and versioning engine, hosts Monaco Editor with a live TexLab Language Server Protocol (LSP) WebSocket bridge, provides native multi-engine TeX Live compilation (XeLaTeX, pdfLaTeX, LuaLaTeX), and exposes a Model Context Protocol (MCP) server for programmatic document management by AI agents.

---

## Architecture Overview

The system runs as a multi-process architecture co-located inside a single container or development environment:

- Web Application: Next.js App Router on port 8080 (exposed on port 3201 in Docker Compose) providing the Monaco editing workspace, project explorer, PDF viewer, version history, and Google Drive sync.
- TexLab LSP Bridge: Node.js WebSocket proxy on port 3100 connecting the Monaco editor in the browser to the native TexLab LSP binary for real-time autocompletion, diagnostics, symbol definitions, and chktex linting.
- Model Context Protocol (MCP) Server: Standalone TypeScript server on port 3202 exposing LaTeX workspace tools over HTTP/SSE and stdio for AI agent workflows.
- Git Storage Engine: All projects are maintained as subdirectories inside a single GitHub repository. File modifications trigger automated Git commits and pushes via deploy key authentication.
- Ephemeral Compilation Pipeline: In-memory editor buffers compile in temporary sandboxes (/tmp/oo-compile), decoupling live preview latency from Git commit network roundtrips.

---

## System Requirements

### Hardware

- Architecture: x86_64 (amd64) or aarch64 (arm64).
- Memory: Minimum 2 GB RAM. The container is configured with a 2 GB memory limit suitable for standard cloud instances (such as Oracle Cloud Always Free Tier).
- Storage: Minimum 10 GB free disk space to accommodate TeX Live packages, fonts, and build artifacts.
- CPU: 1 core minimum, 2 or more cores recommended for parallel TeX compilation passes.

### Software (Containerized Deployment)

- Docker Engine: Version 24.0.0 or higher.
- Docker Compose: Compose V2 (docker compose CLI plugin).
- Git: Version 2.30 or higher.
- OpenSSH: Client installed on the host to generate deploy keys.

### Software (Manual Local Development Without Docker)

If running directly on the host without Docker, the following dependencies must be installed:

- Node.js: Version 20.0.0 or higher (Node.js 24 recommended).
- Package Manager: npm 10 or higher.
- TeX Live: Full or extensive distribution including texlive-latex-base, texlive-latex-recommended, texlive-latex-extra, texlive-xetex, texlive-luatex, texlive-fonts-recommended, texlive-fonts-extra, texlive-bibtex-extra, biber, latexmk, and chktex.
- TexLab LSP: Version 5.12.3 installed to PATH (/usr/local/bin/texlab).
- Utilities: ghostscript, imagemagick, poppler-utils, curl, fontconfig, and Microsoft TrueType core fonts (msttcorefonts).

---

## Required Accounts and Credentials

Before running the application, configure the following external resources:

1. GitHub LaTeX Storage Repository: A dedicated private or public GitHub repository where all LaTeX projects, files, and templates will be committed.
2. SSH Deploy Key: A dedicated SSH key pair with write access to the LaTeX storage repository.
3. GitHub OAuth Application: For user login and authentication.
4. Google Cloud Platform OAuth Credentials (Optional): Required only if utilizing the Google Drive PDF synchronization feature.
5. Gemini API Key (Optional): Required only for the AI Copilot chat drawer inside the web editor.

---

## Environment Variables Reference

Create a configuration file named `.env.local` in the project root. The following table details every supported variable:

### Core and Session Security

- SESSION_SECRET: Required. A 64-character random hex string used to sign session JWTs. Generate with `openssl rand -hex 32`.
- APP_URL: The public-facing origin of the application (for example, `https://latex.example.com`). Leave empty or omit during local development to default to the browser origin.
- PORT: The internal port for the Next.js server. Defaults to 8080.
- HOSTNAME: Host interface to bind the Next.js server. Defaults to 0.0.0.0.

### GitHub Authentication and Storage

- GITHUB_CLIENT_ID: Required. The Client ID from your GitHub OAuth application.
- GITHUB_CLIENT_SECRET: Required. The Client Secret from your GitHub OAuth application.
- ALLOW_GITHUB_USERNAME: Required. Your exact GitHub username. Restricts access exclusively to this single user to secure the instance.
- GITHUB_SINGLE_REPO_OWNER: Required. GitHub username or organization owning the storage repository.
- GITHUB_SINGLE_REPO_NAME: Required. Name of the storage repository (for example, `my-latex-projects`).
- DEFAULT_BRANCH: The default branch for the storage repository. Defaults to `main`.
- DEPLOY_KEY_PATH: Absolute path to the private SSH deploy key. Inside Docker, this defaults to `/run/secrets/deploy_key`. On host, specify the local path.
- GIT_AUTHOR_NAME: Git author name used for automated commits. Defaults to `open-overleaf`.
- GIT_AUTHOR_EMAIL: Git author email used for automated commits. Defaults to `webui@open-overleaf.local`.

### Model Context Protocol (MCP)

- MCP_PORT: Port for the internal Model Context Protocol HTTP/SSE server. Defaults to 3202.
- OVERLEAF_MCP_TOKEN: Optional static bearer token required for agent authentication against the MCP server.
- OVERLEAF_MCP_SECRET: Optional secret string used to derive HMAC bearer tokens for agent access. If omitted, SESSION_SECRET is used.

### AI Copilot and External Integrations

- GEMINI_API_KEY: Optional. Google Gemini API key used by the editor's built-in AI Copilot assistant.
- GEMINI_MODELS: Optional. Comma-separated list of Gemini model identifiers for fallback cascading (for example, `gemini-2.5-flash,gemini-1.5-flash`).
- GOOGLE_CLIENT_ID: Optional. Google OAuth Client ID for Google Drive synchronization.
- GOOGLE_CLIENT_SECRET: Optional. Google OAuth Client Secret for Google Drive synchronization.

---

## Step-by-Step Setup Guide

### Step 1: Create the Storage Repository and SSH Deploy Key

1. Create a new repository on GitHub (for example, `latex-storage-vault`). You can keep it private.
2. Initialize the repository with an initial commit containing a `README.md` or `.gitignore` so that the default branch (`main`) exists.
3. On your host machine, generate a dedicated SSH key pair without a passphrase:

```bash
ssh-keygen -t ed25519 -C "open-overleaf-deploy-key" -f ./deploy_key -N ""
```

4. Add the public key (`deploy_key.pub`) to your GitHub storage repository:
   - Navigate to Repository Settings > Deploy Keys > Add deploy key.
   - Title: Open Overleaf Deploy Key.
   - Key: Paste the entire content of `deploy_key.pub`.
   - Check the box: Allow write access.
   - Click Add key.
5. Move the private key (`deploy_key`) to a secure location on your host system:

```bash
sudo mkdir -p /opt/open-overleaf-secrets
sudo mv ./deploy_key /opt/open-overleaf-secrets/deploy_key
sudo chmod 600 /opt/open-overleaf-secrets/deploy_key
```

### Step 2: Register a GitHub OAuth Application

1. Open GitHub Developer Settings at `https://github.com/settings/developers`.
2. Click New OAuth App.
3. Configure the application:
   - Application name: Open Overleaf
   - Homepage URL: `https://<your-domain>` (or `http://localhost:3201` for local testing)
   - Authorization callback URL: `https://<your-domain>/api/auth/github/callback` (or `http://localhost:3201/api/auth/github/callback` for local testing)
4. Click Register application.
5. Generate a new Client Secret and record both the Client ID and Client Secret.

### Step 3: Configure Environment Variables

Create `.env.local` in the project root:

```bash
SESSION_SECRET=$(openssl rand -hex 32)
APP_URL=https://latex.example.com

GITHUB_CLIENT_ID=your_oauth_client_id
GITHUB_CLIENT_SECRET=your_oauth_client_secret
ALLOW_GITHUB_USERNAME=your_github_username

GITHUB_SINGLE_REPO_OWNER=your_github_username
GITHUB_SINGLE_REPO_NAME=latex-storage-vault
DEFAULT_BRANCH=main

GEMINI_API_KEY=your_gemini_api_key_optional
```

---

## Running with Docker Compose (Recommended)

Docker Compose provides the complete production runtime with TeX Live pre-installed, fonts cached, TexLab LSP configured, and tini process management.

1. Ensure the secret deploy key exists on the host filesystem:

```bash
ls -l /opt/open-overleaf-secrets/deploy_key
```

2. Build and start the container in detached mode:

```bash
docker compose up -d --build
```

3. Monitor container startup and initial repository clone:

```bash
docker compose logs -f open-overleaf
```

During startup, the container performs the following operations:
- Validates the deploy key permissions.
- Checks whether `/app/projects/.git` exists.
- If not present, clones `git@github.com:${GITHUB_SINGLE_REPO_OWNER}/${GITHUB_SINGLE_REPO_NAME}.git` into `/app/projects`.
- Spawns `texlab-bridge.js` in the background on port 3100.
- Spawns `mcp-server.ts` in the background on port 3202.
- Executes `server.js` (Next.js standalone runtime) on port 8080.

4. Verify health status:

```bash
docker compose ps
```

The container includes a built-in healthcheck probing `http://localhost:8080/api/auth/session` every 30 seconds.

5. Stop the service:

```bash
docker compose down
```

---

## Running for Local Development Without Docker

If modifying the user interface or testing code without container overhead, run the application directly on the host:

1. Install project dependencies:

```bash
npm ci
```

2. Ensure TeX Live and TexLab are accessible:

```bash
which xelatex pdflatex lualatex latexmk chktex texlab
```

3. Export required development environment variables:

```bash
export SESSION_SECRET="dev-secret-string-at-least-32-chars-long"
export GITHUB_CLIENT_ID="your_client_id"
export GITHUB_CLIENT_SECRET="your_client_secret"
export ALLOW_GITHUB_USERNAME="your_username"
export GITHUB_SINGLE_REPO_OWNER="your_username"
export GITHUB_SINGLE_REPO_NAME="latex-storage-vault"
export DEPLOY_KEY_PATH="$HOME/.ssh/id_ed25519"
export PROJECTS_DIR="$(pwd)/projects"
```

4. Initialize the local projects directory if not already cloned:

```bash
git clone git@github.com:${GITHUB_SINGLE_REPO_OWNER}/${GITHUB_SINGLE_REPO_NAME}.git ./projects
```

5. Start the TexLab LSP WebSocket bridge:

```bash
node texlab-bridge.js &
```

6. Start the MCP server:

```bash
node --experimental-strip-types mcp-server.ts &
```

7. Start the Next.js development server:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Reverse Proxy Configuration

When hosting Open Overleaf behind a reverse proxy (such as Nginx, Caddy, or Traefik), ensure both WebSocket upgrades and Server-Sent Events (SSE) are configured.

### Nginx Example Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name latex.example.com;

    ssl_certificate /etc/letsencrypt/live/latex.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/latex.example.com/privkey.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3201;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /lsp {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location /sse {
        proxy_pass http://127.0.0.1:3202;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
    }
}
```

---

## Model Context Protocol (MCP) Integration

Open Overleaf exposes 20 tools over MCP on port 3202 (or through the authenticated HTTP endpoint at `/api/mcp/tool`).

Supported tools include:
- Workspace Inspection: `list_projects`, `list_files`, `read_project_file`, `read_file_lines`, `search_in_project`.
- Workspace Mutation: `create_file`, `write_project_file`, `apply_patch`, `delete_file`, `rename_file`.
- TeX Compilation and Validation: `compile_project`, `get_compilation_log`, `validate_tex`, `get_project_pdf`, `get_project_preview_image`.
- Profile and Cloud Operations: `get_user_profile`, `sync_to_drive`, `get_file_history`, `get_file_at_revision`, `get_project_settings`, `update_project_settings`.

To connect an AI agent:
- Transport: SSE endpoint at `http://<host>:3202/sse` or HTTP POST endpoint at `http://<host>:3201/api/mcp/tool`.
- Authentication: Pass `Authorization: Bearer <token>` where `<token>` matches `OVERLEAF_MCP_TOKEN` or `SESSION_SECRET`.

---

## Operational Troubleshooting

- SSH Deploy Key Permission Denied:
  Verify that the deploy key has write permissions in the GitHub repository settings. Check that `/opt/open-overleaf-secrets/deploy_key` is owned by user ID 1000 (node user) or readable with mode 600/400.
- Out of Memory During TeX Live Compilation:
  Large documents compiling with XeLaTeX or LuaLaTeX with high-resolution graphics may approach the container memory ceiling. If compilation fails with error code 137, increase the memory limit in `docker-compose.yml` from `2G` to `3G` or `4G`.
- Ulimit Errors:
  If the container logs indicate too many open files during TexLab LSP indexing, verify that the `nofile` soft and hard limits in `docker-compose.yml` are set to at least 5120.
- LaTeX Font Cache Refresh:
  If custom fonts fail to load, enter the container and rebuild font caches:
  `docker compose exec open-overleaf luaotfload-tool --update` and `docker compose exec open-overleaf fc-cache -fv`.
