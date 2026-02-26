#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Worker-3: Feedback Smoke Harness
# Submits 2 feedback items, reads them back, prints triage results.
# Runs ONCE and exits. Logs to logs/workers/feedback-smoke.log.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$SCRIPT_DIR/logs/workers/feedback-smoke.log"
mkdir -p "$(dirname "$LOG")"

exec > >(tee "$LOG") 2>&1

echo "═══════════════════════════════════════════════════════"
echo "  FEEDBACK SMOKE HARNESS — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "═══════════════════════════════════════════════════════"

# ── Load env ──────────────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env.local"
if [ ! -f "$ENV_FILE" ]; then echo "FATAL: $ENV_FILE not found"; exit 1; fi

get_env() {
  grep "^${1}=" "$ENV_FILE" | head -1 | sed "s/^${1}=//" | sed 's/^"//;s/"$//' | sed "s/^'//;s/'$//"
}

SUPABASE_URL="$(get_env NEXT_PUBLIC_SUPABASE_URL)"
SERVICE_KEY="$(get_env SUPABASE_SERVICE_ROLE_KEY)"

if [ -z "$SUPABASE_URL" ]; then echo "FATAL: NEXT_PUBLIC_SUPABASE_URL missing"; exit 1; fi
if [ -z "$SERVICE_KEY" ]; then echo "FATAL: SUPABASE_SERVICE_ROLE_KEY missing"; exit 1; fi

SB="$SUPABASE_URL/rest/v1"
RUN_TAG="smoke_$(date +%s)"

echo ""
echo "Supabase: $SUPABASE_URL"
echo "Run tag:  $RUN_TAG"
echo ""

sb_post() {
  curl -s -X POST "$SB/$1" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d @-
}

sb_get() {
  curl -s "$SB/$1" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY"
}

extract_id() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) else d.get('id','ERROR'))"
}

# ── Submit Feedback A: P1 bug ─────────────────────────────────
# Insert directly into ff_feedback_items (no FK constraints)
echo "─── Submitting Feedback A (P1 bug) ───"

FF_A_RESP=$(cat <<JSONEOF | sb_post "ff_feedback_items"
{
  "source": "api",
  "type": "bug",
  "title": "App crashes when I try to upload a video on mobile",
  "description": "Every time I open the upload screen on iPhone 15, the app freezes for about 3 seconds then crashes completely. Happens on Safari and Chrome. Started after the last update. This is blocking my workflow.",
  "page": "/smoke-test",
  "device": "CLI",
  "reporter_email": "smoke-test@internal",
  "status": "new",
  "priority": 3,
  "raw_json": {"run_tag": "$RUN_TAG"}
}
JSONEOF
)
FF_A_ID=$(echo "$FF_A_RESP" | extract_id 2>/dev/null) || FF_A_ID="ERROR"

if [ "$FF_A_ID" = "ERROR" ]; then
  echo "  AUTH BLOCKED or INSERT FAILED"
  echo "  Response: $FF_A_RESP"
  echo ""
  echo "  Required headers for Supabase REST API:"
  echo "    apikey: <SUPABASE_SERVICE_ROLE_KEY>"
  echo "    Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>"
  echo "    Content-Type: application/json"
  echo "    Prefer: return=representation"
else
  echo "  ff_feedback_items: $FF_A_ID"
fi
echo ""

# ── Submit Feedback B: feature/ux ────────────────────────────
echo "─── Submitting Feedback B (feature/ux) ───"

FF_B_RESP=$(cat <<JSONEOF | sb_post "ff_feedback_items"
{
  "source": "api",
  "type": "feature",
  "title": "Would be nice to have dark mode",
  "description": "The app is very bright, especially at night. A dark mode toggle in settings would make it much more comfortable to use during evening editing sessions.",
  "page": "/smoke-test",
  "device": "CLI",
  "reporter_email": "smoke-test@internal",
  "status": "new",
  "priority": 3,
  "raw_json": {"run_tag": "$RUN_TAG"}
}
JSONEOF
)
FF_B_ID=$(echo "$FF_B_RESP" | extract_id 2>/dev/null) || FF_B_ID="ERROR"

if [ "$FF_B_ID" = "ERROR" ]; then
  echo "  AUTH BLOCKED or INSERT FAILED"
  echo "  Response: $FF_B_RESP"
else
  echo "  ff_feedback_items: $FF_B_ID"
fi
echo ""

# ── Wait ──────────────────────────────────────────────────────
echo "Waiting 2s for async settle..."
sleep 2

# ── Read back triage results ─────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  TRIAGE RESULTS"
echo "═══════════════════════════════════════════════════════"
echo ""

# ff_feedback_items
echo "─── ff_feedback_items (Command Center inbox) ───"
ITEMS=$(sb_get "ff_feedback_items?reporter_email=eq.smoke-test%40internal&order=created_at.desc&limit=5")

export ITEMS_JSON="$ITEMS"
python3 << 'PYEOF'
import json, os
raw = os.environ.get("ITEMS_JSON", "[]")
try:
    items = json.loads(raw)
except:
    items = []
if not items:
    print("  No ff_feedback_items found for smoke-test@internal")
    print("  (Table may not exist or no matching rows)")
else:
    print(f"  Found {len(items)} item(s) in Command Center inbox:")
    print()
    for i, item in enumerate(items):
        idx = chr(65 + i)
        title = (item.get("title") or "?")[:60]
        print(f"  [{idx}] {title}")
        print(f"      category:       {item.get('type', '?')}")
        print(f"      status:         {item.get('status', '?')}")
        print(f"      priority:       {item.get('priority', '?')}")
        print(f"      assignee:       {item.get('assignee') or '(unassigned)'}")
        print(f"      tags:           {item.get('tags') or '[]'}")
        raw_json = item.get("raw_json") or {}
        run = raw_json.get("run_tag") or "(none)"
        linked = raw_json.get("linked_task_id") or "(none)"
        print(f"      run_tag:        {run}")
        print(f"      linked_task_id: {linked}")
        print()
PYEOF

# ff_issue_reports
echo "─── Issue Reports (AI triage queue) ───"
ISSUES=$(sb_get "ff_issue_reports?source=eq.feedback&order=created_at.desc&limit=5")
export ISSUES_JSON="$ISSUES"
python3 << 'PYEOF'
import json, os
raw = os.environ.get("ISSUES_JSON", "[]")
try:
    issues = json.loads(raw)
except:
    issues = []
if not issues:
    print("  No ff_issue_reports from feedback source")
    print("  (Direct DB inserts skip issue intake; use API route for full flow)")
else:
    for issue in issues[:3]:
        msg = (issue.get("message_text") or "")[:60]
        sev = issue.get("severity") or "(not triaged)"
        st = issue.get("status", "?")
        print(f"  - {msg}")
        print(f"    severity={sev}  status={st}")
print()
PYEOF

echo "═══════════════════════════════════════════════════════"
echo "  DONE — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "═══════════════════════════════════════════════════════"
