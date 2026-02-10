# FlashFlow System Test Report

**Generated:** 2026-02-10 05:42:14
**Machine:** Brandons-Mac-mini.attlocal.net
**Python:** 3.9.6

## Summary

| Metric | Count |
|--------|-------|
| Total Tests | 35 |
| Passed | 30 |
| Failed | 2 |
| Skipped | 3 |
| Pass Rate | 30/32 (94%) |

## API Tests (14 pass, 2 fail, 0 skip)

| Status | Test | Duration | Details |
|--------|------|----------|---------|
| PASS | API: Health endpoint | 2419ms | Healthy: [{'name': 'unclaimed_backlog', 'status': 'ok', 'message': '1 videos unclaimed (healthy)', ' |
| PASS | API: Queue summary | 1712ms | Queue: {'counts_by_status': {'draft': 0, 'needs_edit': 1, 'ready_to_post': 0, 'posted': 0, 'failed': |
| PASS | API: Throughput | 1154ms | Throughput data: {'generated_at': '2026-02-10T13:42:00.895Z', 'window_days': 7, 'daily_throughput':  |
| PASS | API: Stuck videos | 992ms | Stuck videos: 4 |
| PASS | API: Get products | 645ms | Found 2 products |
| PASS | API: Get brands | 818ms | Found 2 brands |
| PASS | API: Get personas | 720ms | Found 41 personas |
| PASS | API: Get winners | 712ms | Found 0 winners |
| PASS | API: Winners intelligence | 614ms | Intelligence bundle: {} |
| FAIL | API: Get accounts | 410ms | Accounts returned 401 |
| PASS | API: Video queue | 1060ms | Found 1 videos in queue |
| PASS | API: Saved hooks | 679ms | Found 0 saved hooks |
| PASS | API: Skits library | 921ms | Found 11 skits |
| PASS | API: Admin analytics summary | 905ms | Analytics data: {'window_days': 7, 'computed_at': '2026-02-10T13:42:09.734Z', 'stage_stats': [{'stag |
| PASS | API: Batch winner detection | 733ms | Detection result: {} |
| FAIL | API: Ops metrics | 819ms | Ops metrics returned 500 |

## SCRIPTS Tests (8 pass, 0 fail, 3 skip)

| Status | Test | Duration | Details |
|--------|------|----------|---------|
| PASS | Script: research-scanner.py Reddit API | 818ms | Reddit API works. Got 3 posts from r/TikTokShop. Top: 'Scale your shop with us!' |
| PASS | Script: research-scanner.py imports | 0ms | Module loads successfully |
| PASS | Script: drive-watcher.py imports | 0ms | httpx available |
| PASS | Script: drive-watcher.py Google API | 127ms | google-api-python-client and google-auth available |
| SKIP | Script: discord-monitor.py imports | 0ms | discord.py not installed |
| SKIP | Script: tiktok-scraper.py Playwright | 0ms | Playwright not installed |
| SKIP | Script: tiktok-scraper.py browser launch | 0ms | Playwright not installed |
| PASS | Script: orchestrator.py localhost health | 32ms | Localhost command execution works |
| PASS | Script: cron-manager.py schedule parse | 0ms | cron-manager.py found and parseable |
| PASS | Script: all config examples exist | 0ms | All 6 config examples present |
| PASS | Script: all config examples valid JSON | 3ms | All 6 config files are valid JSON |

## INFRA Tests (8 pass, 0 fail, 0 skip)

| Status | Test | Duration | Details |
|--------|------|----------|---------|
| PASS | Infra: LM Studio at localhost:1234 | 96ms | LM Studio running. Models: ['llama-3.1-8b-instruct', 'google/gemma-3-4b', 'text-embedding-nomic-embe |
| PASS | Infra: LM Studio text generation | 1589ms | Generated: ' Amanda. I am a 30-year-old mother of two beautiful children and wife to an amazing' |
| PASS | Infra: OpenClaw gateway at localhost:18789 | 32ms | Gateway responded: 200 |
| PASS | Infra: OpenClaw agent configs | 0ms | All 4 agents present. FlashFlow has 9 skill files. |
| PASS | Infra: OpenClaw config valid | 0ms | Config valid. 4 agents: ['main', 'flashflow-work', 'research-bot', 'scraper-bot'] |
| PASS | Infra: Google service account credentials | 0ms | Google SA: bolt-api@flashflow-bolt.iam.gserviceaccount.com |
| PASS | Infra: Vercel deployment | 276ms | Vercel live. Response size: 16677 bytes |
| PASS | Infra: Supabase connection | 606ms | Supabase connection working (products query succeeded) |

## Failure Details

### API: Get accounts
**Error:** Accounts returned 401
```
Traceback (most recent call last):
  File "/Volumes/WorkSSD/01_ACTIVE/FlashFlow/scripts/test-full-system.py", line 81, in wrapper
    output = func()
  File "/Volumes/WorkSSD/01_ACTIVE/FlashFlow/scripts/test-full-system.py", line 200, in test_api_accounts
    assert r["ok"], f"Accounts returned {r['status']}"
AssertionError: Accounts returned 401

```

### API: Ops metrics
**Error:** Ops metrics returned 500
```
Traceback (most recent call last):
  File "/Volumes/WorkSSD/01_ACTIVE/FlashFlow/scripts/test-full-system.py", line 81, in wrapper
    output = func()
  File "/Volumes/WorkSSD/01_ACTIVE/FlashFlow/scripts/test-full-system.py", line 243, in test_api_ops_metrics
    assert r["ok"], f"Ops metrics returned {r['status']}"
AssertionError: Ops metrics returned 500

```

## Recommendations

- **3 tests skipped** — install missing dependencies or start required services
  - Playwright not installed
  - discord.py not installed
- **2 tests failed** — see failure details above for fix instructions
