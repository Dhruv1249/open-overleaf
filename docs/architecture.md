# Open Overleaf Architecture

## Goal

Build a single-user, self-hosted Overleaf-style LaTeX workspace with GitHub as the source of truth, Monaco in the browser, LaTeX LSP support, automatic compilation, and PDF backup to Google Drive.

This design is optimized for deployment on Cloud Run with a 2 GB service and no external database.

## Core Corrections

### 1. No external database is fine for the MVP

Use GitHub as the canonical store for:

- project files
- project settings
- project manifests
- history via commits

Store metadata inside each repository, for example:

- `.open-overleaf/project.json`
- `.open-overleaf/state.json`
- `.open-overleaf/templates/`

This keeps the app portable, recoverable, and aligned with the GitHub-first requirement.

### 2. Do not compile LaTeX inside the main Cloud Run web service

Cloud Run with 2 GB RAM is suitable for the web app and API layer, but not for running arbitrary LaTeX compilation in the same process.

Use a separate compile worker service or job with:

- isolated container execution
- memory and CPU limits
- timeout protection
- queue-based execution
- read-only source checkout plus writable build scratch space

### 3. Monaco plus LSP, not VS Code extensions

Monaco runs in the browser. LaTeX intelligence should come from a language server bridge, not from embedding VS Code extensions directly.

Use TexLab or a compatible LaTeX language server exposed through a backend proxy/WebSocket channel.

## Recommended Cloud Run Topology

### Web App Service

Responsibilities:

- Next.js frontend and server actions/routes
- GitHub OAuth login
- repo browser and project dashboard
- file tree and editor state
- GitHub API orchestration
- Google Drive backup requests
- compile job submission and result tracking

Suggested runtime characteristics:

- 1 instance minimum for always-on single-user access
- 2 GB memory
- 1 vCPU is likely enough for the web tier
- autoscaling allowed, but keep max instances low for cost control

### Compile Worker Service

Responsibilities:

- fetch project snapshot from GitHub
- run LaTeX inside a locked-down container
- generate PDF and log artifacts
- emit build status and diagnostics
- optionally upload PDF backup to Drive after success

Suggested runtime characteristics:

- separate image from the web app
- 2 GB or more depending on project size
- short-lived execution
- queue-backed concurrency of 1 per user/project for the MVP

### Optional LSP Worker

If TexLab cannot be run reliably inside the web container, split it into a third service. For the MVP, it is acceptable to run the language server in the web tier if memory remains stable.

## Data Model Without an External DB

Use repo files plus GitHub metadata.

### Repository shape

Each GitHub repo is both the project and the persisted document store. A recommended layout is:

- `main.tex` or a configured entrypoint under the project root
- `figures/` for images and generated assets
- `bib/` for bibliography files
- `.open-overleaf/` for app-managed metadata
- `.open-overleaf/project.json` for canonical settings
- `.open-overleaf/state.json` for last-opened file, layout, and UI hints
- `.open-overleaf/build.json` for the latest build status and PDF metadata

The app should never require a hidden server database to reconstruct a project.

### Per-project manifest

`.open-overleaf/project.json` should contain:

- project name
- description
- default branch
- compiler configuration
- bibliography engine
- auto-compile mode
- debounce delay
- PDF backup settings
- folder for the main TeX entrypoint
- optional template information
- GitHub repository id and default branch
- optional local project aliases or display labels

Example:

```json
{
  "name": "Thesis",
  "description": "Personal dissertation project",
  "branch": "main",
  "entrypoint": "paper/thesis.tex",
  "compiler": "xelatex",
  "bibliography": "biber",
  "shellEscape": false,
  "synctex": true,
  "autoCompileMode": "debounced",
  "debounceSeconds": 2,
  "repo": {
    "owner": "dhruv",
    "name": "thesis"
  },
  "driveBackup": {
    "enabled": true,
    "mode": "latest-only"
  }
}
```

### Build state

` .open-overleaf/build.json ` should track only derived state, such as:

- last successful build id
- last failed build id
- current compiler engine
- output PDF path
- SyncTeX path
- build timestamp
- last log summary

### UI state

` .open-overleaf/state.json ` should hold transient UX preferences, such as:

- current file
- active tab order
- split layout ratio
- sidebar width
- preview zoom
- theme

Keeping UI state in-repo makes the app recoverable across deployments without introducing a database.

### Ephemeral cache only

Optional in-memory cache or local disk cache can be used for:

- recent repos
- file tree snapshots
- compiled PDF bytes
- LSP index hints

Do not treat the cache as the source of truth.

## GitHub Integration Model

GitHub is the storage, history, and collaboration boundary, even though the app is single-user.

### File operations

Every create, rename, move, delete, or upload operation should become a Git commit.

Implementation approach:

- read repo contents via GitHub Contents API or Git data API
- apply file mutations in a temporary working tree representation
- write back changes as a commit
- update branch pointer or create a new commit on the branch

### History viewer

The history view should read:

- commit author
- commit date
- commit message
- changed paths
- diff preview

Restore/revert actions should create new commits rather than rewriting history.

## Authentication

Use GitHub OAuth login.

Access control rules:

- allow exactly one GitHub user ID by default
- optionally support a local admin bypass flag for emergency access
- reject all other users even if GitHub OAuth succeeds

Store the allowlist in environment variables or a small config file, not in a database.

## Frontend Structure

### Layout

- top bar for repo/project controls
- left pane for file tree and search
- center pane for Monaco editor
- right pane for PDF preview
- bottom panel for problems, logs, and history

### Key UI capabilities

- tabs
- split editor
- draggable panel resizing
- persistent layout state
- light and dark themes
- command palette
- keyboard shortcuts matching VS Code where practical

## LSP and Editor Layer

The browser editor should feel like Overleaf for LaTeX, but the implementation should stay closer to a modern web IDE than a full desktop editor clone.

### Editor shell

The Monaco container should support:

- file tabs with unsaved state indicators
- split editor groups
- command palette actions
- inline diff and compare views
- read-only preview tabs for PDFs, logs, and history

### Workspace model

Treat the open project as a workspace with a small number of live documents. The app should only load the active file and neighboring metadata by default, then hydrate more content on demand.

### Monaco responsibilities

- syntax highlighting
- bracket matching
- code folding
- multi-cursor editing
- find and replace
- tab management
- selection tracking for SyncTeX
- diagnostics decoration rendering
- search result highlights

### LSP responsibilities

- autocomplete
- hover
- diagnostics
- jump to definition
- references
- citation completion
- label completion
- snippets

### LSP transport

Recommended approach:

- start the language server from the backend using the project workspace as input
- expose editor requests over WebSocket or server events
- multiplex requests by project id and file path
- keep diagnostics and completions cached per open document

### LSP fallback strategy

If the language server is unavailable, the editor should still provide:

- Monaco syntax highlighting
- file tree navigation
- compile-based error reporting
- simple regex search

If the full LSP experience is too heavy for the web tier, degrade gracefully and keep editor editing stable first.

## PDF Compilation and Preview

The compile system should be deterministic, sandboxed, and observable. The web app should submit jobs; the worker should do all LaTeX execution.

### Compile modes

- manual compile only
- compile on save
- debounced compile after typing stops

Suggested user-facing behavior:

- manual mode never compiles without an explicit action
- save mode compiles after each successful file write
- debounced mode resets the timer on each relevant edit

Recommended MVP default:

- debounced compile with a 2 second delay

Recommended configurable debounce values:

- 1 second
- 2 seconds
- 3 seconds
- 5 seconds

### Compiler support

- pdflatex
- xelatex
- lualatex
- latexmk
- bibtex
- biber

### Worker contract

The compile worker should receive:

- repository id
- branch or commit sha
- entrypoint path
- compiler settings
- backup settings
- requested output format

The worker should return:

- build id
- success or failure state
- compiler log
- diagnostics
- PDF artifact location
- SyncTeX artifact location

### Sandbox rules

Use an isolated container per build or per short-lived worker slot with:

- no host filesystem writes outside the scratch directory
- no access to other projects
- memory caps
- CPU caps
- network disabled unless package fetching is explicitly needed
- hard timeouts

### Build pipeline

1. Fetch the repository snapshot.
2. Materialize a temporary workspace.
3. Run the selected compiler chain.
4. Capture logs, warnings, and errors.
5. Store the resulting PDF artifact.
6. Refresh the preview pane.
7. If enabled, upload the PDF to Google Drive.

### Incremental build strategy

For large projects, prefer a stable incremental path rather than recompiling everything on every keystroke:

- cache previous successful build metadata
- reuse auxiliary files when the compiler supports it
- debounce compile triggers
- avoid duplicate builds for the same commit sha

### SyncTeX

Support source-to-PDF and PDF-to-source navigation by retaining synctex output from the build worker.

## Google Drive Backup

Drive is backup-only for PDFs.

### Backup policy

Drive integration should not affect editing or compilation success. If backup fails, the PDF build still counts as successful.

Backup modes:

- latest only
- keep all versions
- daily snapshots

Implementation:

- OAuth connect to Drive
- pick a backup folder
- upload PDF after successful compile
- replace the latest file or create a versioned copy depending on mode

### Suggested Drive naming scheme

Use a stable project folder plus deterministic filenames:

- `ProjectName/thesis.pdf`
- `ProjectName/thesis-2026-06-05.pdf`

### Backup metadata

Store the last synced Drive file id and timestamp in `.open-overleaf/build.json` or `.open-overleaf/state.json` so the app can resume without a database.

## Search and File Management

The file explorer should support:

- create folder
- rename folder
- move folder
- delete folder
- create .tex and .bib files
- upload images and PDFs
- drag and drop reorganization
- context menus
- search

Search should include:

- workspace-wide text search
- regex
- case sensitivity
- replace in file
- replace in project

## Performance Strategy

For large projects:

- lazy load tree nodes
- avoid loading entire repo contents at once
- cache file metadata
- keep compile jobs isolated
- debounce search indexing
- stream logs rather than buffering everything in memory
- cap open document count in memory
- virtualize file trees and search results
- dedupe file content requests

### Suggested caching layers

- GitHub metadata cache in memory with short TTL
- file content cache for active documents only
- build artifact cache keyed by commit sha
- search index cache keyed by repository revision

## Suggested API Surface

### Auth

- `POST /api/auth/github/callback`
- `POST /api/auth/logout`
- `GET /api/auth/session`

### Projects

- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/clone`
- `POST /api/projects/:id/archive`
- `DELETE /api/projects/:id`

### Files

- `GET /api/projects/:id/tree`
- `GET /api/projects/:id/file?path=`
- `PUT /api/projects/:id/file`
- `POST /api/projects/:id/folder`
- `POST /api/projects/:id/move`
- `DELETE /api/projects/:id/path`

### Builds

- `POST /api/projects/:id/build`
- `GET /api/projects/:id/builds`
- `GET /api/projects/:id/builds/:buildId`
- `GET /api/projects/:id/builds/:buildId/pdf`

### Drive

- `POST /api/integrations/drive/connect`
- `POST /api/projects/:id/drive-backup`

## Deployment Recommendation

### MVP deployment on GCP

- Cloud Run for the web app
- Cloud Run or Cloud Run Jobs for compile workers
- Secret Manager for OAuth and API secrets
- Artifact Registry for container images
- GitHub as persistent project storage

### What to avoid in the MVP

- a separate external SQL database
- a shared filesystem as source of truth
- running LaTeX inside the web container
- collaborative editing protocols

## Build Phases

### Phase 1

- GitHub login
- single-user gate
- project dashboard
- repo browser
- file tree
- Monaco editor shell
- GitHub-backed file writes

### Phase 2

- commit history viewer
- rename/move/delete flows
- search and replace
- project settings
- branch selection

### Phase 3

- compile worker
- PDF preview
- auto-compile modes
- SyncTeX navigation
- build logs and diagnostics

### Phase 4

- Google Drive backup
- templates
- keyboard shortcuts
- performance hardening
- production monitoring

## Main Risks

- LaTeX builds can exceed Cloud Run memory if handled in the wrong service.
- GitHub write latency may make save behavior feel slower than local-only editors.
- Very large image collections can make repo-based storage expensive if uploads are too frequent.
- GitHub API rate limits and file-size limits may require careful batching.
- LSP quality may vary depending on how TexLab is hosted.
- Repo-as-database works well for a single user, but not for multi-user editing.

### Mitigations

- keep the main app write path batch-friendly
- commit only on meaningful save events in auto mode
- upload binaries only when they change
- surface pending GitHub writes in the UI
- keep the worker service separate from the web tier

## Recommendation

Your instinct is mostly correct: no external DB is a good fit for this single-user app, as long as GitHub remains the source of truth and you accept a small amount of state in project manifests.

The one hard correction is compilation: separate the compile pipeline from the web app before shipping anything production-like.

## Summary Of Build Phases

### Phase 1

- authenticated single-user access
- GitHub repository browser
- project dashboard
- file tree
- Monaco editor shell
- GitHub-backed reads and writes

### Phase 2

- file rename, move, delete, restore
- history viewer with diffs
- search and replace
- project settings manifest editing
- layout persistence

### Phase 3

- LSP bridge
- compile worker
- auto-compile modes
- PDF preview with SyncTeX
- build logs and diagnostics

### Phase 4

- Google Drive backup
- project templates
- keyboard shortcuts and command palette polish
- performance hardening
- deployment observability