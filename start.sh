#!/bin/sh
set -e

export GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY_PATH -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

if [ ! -d "/app/projects/.git" ]; then
  echo "[startup] No git repo found, clearing /app/projects and cloning ${GITHUB_SINGLE_REPO_OWNER}/${GITHUB_SINGLE_REPO_NAME}"
  find /app/projects -mindepth 1 -delete 2>/dev/null || true
  git clone --branch "${DEFAULT_BRANCH:-main}" \
    "git@github.com:${GITHUB_SINGLE_REPO_OWNER}/${GITHUB_SINGLE_REPO_NAME}.git" \
    /app/projects
  git -C /app/projects config user.name "${GIT_AUTHOR_NAME:-open-overleaf}"
  git -C /app/projects config user.email "${GIT_AUTHOR_EMAIL:-mcp@open-overleaf.local}"
  echo "[startup] Clone complete"
else
  echo "[startup] Checking /app/projects status..."
  git -C /app/projects config user.name "${GIT_AUTHOR_NAME:-open-overleaf}"
  git -C /app/projects config user.email "${GIT_AUTHOR_EMAIL:-mcp@open-overleaf.local}"

  # If there are unstaged or uncommitted changes, auto-commit them first so git pull won't fail
  if [ -n "$(git -C /app/projects status --porcelain)" ]; then
    echo "[startup] Uncommitted changes detected in /app/projects, auto-committing before sync"
    git -C /app/projects add -A
    git -C /app/projects commit -m "chore: auto-commit uncommitted changes on container start" || true
  fi

  echo "[startup] Pulling latest from origin/${DEFAULT_BRANCH:-main}"
  if git -C /app/projects pull --rebase origin "${DEFAULT_BRANCH:-main}"; then
    echo "[startup] Pull complete"
    git -C /app/projects push origin "${DEFAULT_BRANCH:-main}" 2>/dev/null || true
  else
    echo "[startup] Warning: git pull --rebase failed, aborting rebase and continuing with local working tree"
    git -C /app/projects rebase --abort 2>/dev/null || true
  fi
fi

node texlab-bridge.js &
node --experimental-strip-types mcp-server.ts &
exec node server.js
