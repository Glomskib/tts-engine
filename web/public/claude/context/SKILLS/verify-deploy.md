# Skill: verify a deploy

When you push code, the next step is ALWAYS verifying it reached production. Don't skip this.

## Steps

```bash
# 1. Get the commit you just pushed
cd ~/<repo>
GIT_HEAD=$(git rev-parse --short HEAD)
echo "expecting: $GIT_HEAD"

# 2. Hit the health endpoint
curl -s https://<url>/api/health | python3 -m json.tool
# Look for the "version" or "sha" field

# 3. Loop until it matches (or 4 minutes pass)
for i in 1 2 3 4 5 6 7 8; do
  sleep 30
  v=$(curl -s --max-time 5 https://<url>/api/health 2>/dev/null | python3 -c "import sys, json; d = json.load(sys.stdin); print(d.get('version', 'unknown'))" 2>/dev/null)
  echo "[${i}*30s] version: $v"
  [ "$v" = "$GIT_HEAD" ] && echo "✓ deployed" && break
done
```

## URL → Repo map

| URL | Repo | Path |
|---|---|---|
| https://mc.flashflowai.com | mission-control | `~/mission-control` |
| https://flashflowai.com | tts-engine | `~/tts-engine` |
| https://makingmilesmatter.org | mmm-event-os | `~/projects/mmm-event-os` |
| (Zebby's deploy) | zebbys-world | `~/projects/zebbys-world` |

## What to do if it doesn't match within 4 min

See `diagnose-vercel-build.md` and `recover-from-stuck-deploy.md`.

Don't keep pushing more commits. The pipe is broken — fix it first.
