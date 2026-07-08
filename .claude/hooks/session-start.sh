#!/bin/bash
# L-TEX ecosystem — SessionStart hook.
# Prepares a fresh Claude Code (web) container so that typecheck, tests,
# prettier and builds work immediately, mirroring the CI setup.
set -euo pipefail

# Only run in Claude Code on the web (fresh remote containers).
# Local machines already have dependencies installed.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "[session-start] Installing workspace dependencies (pnpm)..."
pnpm install --frozen-lockfile

echo "[session-start] Generating Prisma client..."
pnpm --filter @ltex/db exec prisma generate

echo "[session-start] Environment ready."
