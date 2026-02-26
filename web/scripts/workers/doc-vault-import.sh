#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Worker-4 "Doc Vault Importer" — ONE-SHOT
#
# The second-brain system has NO backfill endpoint. It reads
# live from the filesystem at:
#   $HOME/.openclaw/agents/flashflow-work/workspace/second-brain/
#
# This script verifies the doc-vault list endpoint works on
# both local and prod, and prints stats.
#
# Auth: These endpoints require a Supabase session cookie.
#       Without one we expect 401 — that confirms the route
#       is up and guarded. We report that cleanly.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

LOCAL_URL="http://localhost:3105"
PROD_URL="https://flashflowai.com"
VAULT_PATH="${HOME:-/Users/brandonglomski}/.openclaw/agents/flashflow-work/workspace/second-brain"

echo "═══════════════════════════════════════════════"
echo "  Doc Vault Importer — ONE-SHOT"
echo "═══════════════════════════════════════════════"
echo ""

# ── 1. Filesystem check ─────────────────────────────────────
echo "▸ Vault path: $VAULT_PATH"
if [ -d "$VAULT_PATH" ]; then
  MD_COUNT=$(find "$VAULT_PATH" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  FOLDER_COUNT=$(find "$VAULT_PATH" -type d 2>/dev/null | wc -l | tr -d ' ')
  echo "  ✓ Exists — $MD_COUNT .md files in $FOLDER_COUNT folders"
else
  echo "  ✗ Not found — vault directory does not exist locally"
  echo "  EXPECTED: prod cannot access local vault"
  echo "  (second-brain reads from local filesystem, not a database)"
fi
echo ""

# ── 2. Local server check ───────────────────────────────────
echo "▸ LOCAL ($LOCAL_URL)"
if curl -s --connect-timeout 2 "$LOCAL_URL" >/dev/null 2>&1; then
  echo "  Server: UP"

  # Try documents endpoint
  HTTP_CODE=$(curl -s -o /tmp/docvault-local-docs.json -w "%{http_code}" \
    "$LOCAL_URL/api/second-brain/documents" 2>/dev/null || echo "000")
  echo "  GET /api/second-brain/documents → HTTP $HTTP_CODE"

  if [ "$HTTP_CODE" = "200" ]; then
    TOTAL=$(cat /tmp/docvault-local-docs.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))" 2>/dev/null || echo "?")
    echo "  Documents found: $TOTAL"
  elif [ "$HTTP_CODE" = "401" ]; then
    echo "  (401 = auth required — route is live and guarded, no session cookie)"
  else
    echo "  Response: $(head -c 200 /tmp/docvault-local-docs.json 2>/dev/null)"
  fi

  # Try tags endpoint
  HTTP_CODE=$(curl -s -o /tmp/docvault-local-tags.json -w "%{http_code}" \
    "$LOCAL_URL/api/second-brain/tags" 2>/dev/null || echo "000")
  echo "  GET /api/second-brain/tags → HTTP $HTTP_CODE"

  if [ "$HTTP_CODE" = "200" ]; then
    TAG_COUNT=$(cat /tmp/docvault-local-tags.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tags',[])))" 2>/dev/null || echo "?")
    FOLDER_COUNT=$(cat /tmp/docvault-local-tags.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('folders',[])))" 2>/dev/null || echo "?")
    echo "  Tags: $TAG_COUNT, Folders: $FOLDER_COUNT"
  elif [ "$HTTP_CODE" = "401" ]; then
    echo "  (401 = auth required — route is live and guarded)"
  fi
else
  echo "  Server: DOWN (not running on :3105)"
fi
echo ""

# ── 3. Prod server check ────────────────────────────────────
echo "▸ PROD ($PROD_URL)"

# Documents endpoint
HTTP_CODE=$(curl -s -o /tmp/docvault-prod-docs.json -w "%{http_code}" \
  "$PROD_URL/api/second-brain/documents" 2>/dev/null || echo "000")
echo "  GET /api/second-brain/documents → HTTP $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
  TOTAL=$(cat /tmp/docvault-prod-docs.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))" 2>/dev/null || echo "?")
  echo "  Documents found: $TOTAL"
  if [ "$TOTAL" = "0" ]; then
    echo "  EXPECTED: prod cannot access local vault"
    echo "  (Vercel serverless has no filesystem access to the Obsidian vault)"
  fi
elif [ "$HTTP_CODE" = "401" ]; then
  echo "  (401 = auth required — route is live and guarded on prod)"
  echo "  EXPECTED: prod cannot access local vault"
  echo "  (Even with auth, Vercel has no filesystem path to the vault)"
else
  echo "  Response: $(head -c 200 /tmp/docvault-prod-docs.json 2>/dev/null)"
fi

# Tags endpoint
HTTP_CODE=$(curl -s -o /tmp/docvault-prod-tags.json -w "%{http_code}" \
  "$PROD_URL/api/second-brain/tags" 2>/dev/null || echo "000")
echo "  GET /api/second-brain/tags → HTTP $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
  TAG_COUNT=$(cat /tmp/docvault-prod-tags.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tags',[])))" 2>/dev/null || echo "?")
  echo "  Tags: $TAG_COUNT"
elif [ "$HTTP_CODE" = "401" ]; then
  echo "  (401 = auth required — route is live and guarded)"
fi

echo ""

# ── 4. Summary ──────────────────────────────────────────────
echo "═══════════════════════════════════════════════"
echo "  SUMMARY"
echo "═══════════════════════════════════════════════"
echo "  System:    second-brain (filesystem-based, no DB)"
echo "  Backfill:  N/A — no import/backfill endpoint exists"
echo "  Reads from: \$HOME/.openclaw/agents/flashflow-work/workspace/second-brain/"
echo "  Auth:      Supabase session cookie required"
echo "  Local vault: $([ -d "$VAULT_PATH" ] && echo "EXISTS" || echo "NOT FOUND")"
echo "  Endpoints: /api/second-brain/documents (GET/POST)"
echo "             /api/second-brain/documents/[filename] (GET)"
echo "             /api/second-brain/tags (GET)"
echo "═══════════════════════════════════════════════"

# Cleanup
rm -f /tmp/docvault-local-docs.json /tmp/docvault-local-tags.json
rm -f /tmp/docvault-prod-docs.json /tmp/docvault-prod-tags.json

echo ""
echo "Done. Exiting."
