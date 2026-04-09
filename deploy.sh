#!/usr/bin/env bash
# DominoClub — production deploy script
# Milestone 5
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh            # full deploy (build + migrate + restart)
#   ./deploy.sh --migrate  # run migrations only
#   ./deploy.sh --rollback # roll back to the previous Docker image tag
#
# Prerequisites:
#   - Docker + Docker Compose v2 installed
#   - .env file present (copy from apps/backend/.env.example and fill in secrets)
#   - SSL certificates in place (see nginx/nginx.conf)
#
# The script will:
#   1. Validate that required env vars are set
#   2. Pull the latest code from git
#   3. Build Docker images (parallel where possible)
#   4. Run Prisma migrations against the live database
#   5. Do a rolling restart: bring up new containers before stopping old ones
#   6. Reload nginx

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*" >&2; exit 1; }

# ── Argument parsing ──────────────────────────────────────────────────────────
MIGRATE_ONLY=false
ROLLBACK=false
for arg in "$@"; do
  case "$arg" in
    --migrate)  MIGRATE_ONLY=true ;;
    --rollback) ROLLBACK=true ;;
    *) error "Unknown argument: $arg" ;;
  esac
done

# ── Rollback ──────────────────────────────────────────────────────────────────
if $ROLLBACK; then
  warn "Rolling back to previous image tags…"
  docker compose down --remove-orphans
  # Re-tag previous images as current (assumes you saved them with :prev tag)
  docker tag dominoclub-backend:prev dominoclub-backend:latest 2>/dev/null || true
  docker tag dominoclub-admin:prev    dominoclub-admin:latest    2>/dev/null || true
  docker compose up -d
  info "Rollback complete."
  exit 0
fi

# ── Env validation ────────────────────────────────────────────────────────────
info "Validating environment…"
REQUIRED_VARS=(
  DATABASE_URL
  REDIS_URL
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  ADMIN_PASSWORD
  ADMIN_JWT_SECRET
)
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    error "Required env var $var is not set. Copy apps/backend/.env.example and fill in all secrets."
  fi
done

# Reject known-weak defaults
if [[ "${JWT_ACCESS_SECRET}" == "dev_access_secret_min_32_chars_here" ]]; then
  error "JWT_ACCESS_SECRET is still the default dev value — set a strong secret before deploying."
fi
if [[ "${ADMIN_PASSWORD}" == "changeme_in_production" ]]; then
  error "ADMIN_PASSWORD is still the default — set a strong password before deploying."
fi

# ── Git pull ──────────────────────────────────────────────────────────────────
if [[ -d .git ]]; then
  info "Pulling latest code…"
  git pull --ff-only
fi

# ── Migrate only ─────────────────────────────────────────────────────────────
if $MIGRATE_ONLY; then
  info "Running database migrations…"
  docker compose run --rm backend sh -c "npx prisma migrate deploy"
  info "Migrations complete."
  exit 0
fi

# ── Save current images as :prev for rollback ─────────────────────────────────
info "Tagging current images as :prev for rollback…"
docker tag dominoclub-mobile-game-backend:latest dominoclub-backend:prev 2>/dev/null || true
docker tag dominoclub-mobile-game-admin:latest   dominoclub-admin:prev   2>/dev/null || true

# ── Build ─────────────────────────────────────────────────────────────────────
info "Building Docker images…"
docker compose build --parallel

# ── Database migrations ───────────────────────────────────────────────────────
info "Running database migrations…"
# Bring up only postgres/redis to run migrations before starting the app
docker compose up -d postgres redis
# Wait for postgres to be healthy
RETRIES=20
until docker compose exec postgres pg_isready -U dominoclub > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then error "PostgreSQL did not become healthy in time."; fi
  echo "  Waiting for PostgreSQL… ($RETRIES retries left)"
  sleep 3
done
docker compose run --rm backend sh -c "npx prisma migrate deploy"
info "Migrations complete."

# ── Rolling restart ───────────────────────────────────────────────────────────
info "Restarting services…"
docker compose up -d --remove-orphans

# ── Nginx reload ──────────────────────────────────────────────────────────────
if command -v nginx &>/dev/null; then
  info "Reloading nginx…"
  nginx -t && nginx -s reload
elif systemctl is-active --quiet nginx 2>/dev/null; then
  info "Reloading nginx via systemctl…"
  systemctl reload nginx
else
  warn "nginx not found on the host — skipping reload (nginx may be running in a container)."
fi

# ── Health check ──────────────────────────────────────────────────────────────
info "Waiting for backend health check…"
RETRIES=15
until curl -sf http://localhost:3001/health > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then
    error "Backend did not become healthy after restart. Check: docker compose logs backend"
  fi
  echo "  Waiting… ($RETRIES retries left)"
  sleep 4
done

info "Deploy complete. Backend is healthy."
info "  API:   https://api.YOUR_DOMAIN"
info "  Admin: https://admin.YOUR_DOMAIN"
