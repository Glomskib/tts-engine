#!/usr/bin/env bash
# Test the /api/cron/orchestrator endpoint locally or against a deployed domain.
#
# Usage:
#   export CRON_SECRET="your-secret"
#   ./scripts/cron/test-orchestrator.sh                           # localhost:3000
#   DOMAIN="https://flashflowai.com" ./scripts/cron/test-orchestrator.sh  # prod

set -euo pipefail

if [ -z "${CRON_SECRET:-}" ]; then
  echo "ERROR: CRON_SECRET is not set."
  echo "  export CRON_SECRET=\"your-secret-here\""
  exit 1
fi

DOMAIN="${DOMAIN:-http://localhost:3000}"
URL="${DOMAIN}/api/cron/orchestrator"

echo "→ Hitting: ${URL}"
echo "→ Authorization: Bearer <REDACTED>"
echo ""

HTTP_CODE=$(curl -s -o /tmp/cron-orchestrator-response.txt -w "%{http_code}" \
  "${URL}" \
  -H "Authorization: Bearer ${CRON_SECRET}")

echo "HTTP Status: ${HTTP_CODE}"
echo "---"
head -60 /tmp/cron-orchestrator-response.txt
echo ""
echo "---"

if [ "${HTTP_CODE}" -ge 200 ] && [ "${HTTP_CODE}" -lt 300 ]; then
  echo "✓ Success"
else
  echo "✗ Failed (HTTP ${HTTP_CODE})"
  exit 1
fi
