# FlashFlow AI — Full QA Test Report
Date: April 8, 2026
Tested by: Claude (automated browser testing)
App URL: https://flashflowai.com
## Summary
Tested all major features. Score: 11/15 working. 5 bugs found.
## Features Working
1. Command Center - loads correctly, stats visible
1. Today View - daily briefing, quick-create buttons work
1. Content Studio - full AI generation works, 3 scored script variants in ~8s, Talk Through It, platform/content type selectors all functional
1. Hook Generator - generates 4 typed hooks with visual/text/verbal components
1. Content Pack - parallel generation of hooks+script+visual ideas+captions in ~18s
1. Comment Replies Tool - TikTok sticker PNG creator, live preview works
1. Video Breakdown - URL analysis tool, proper error handling for invalid URLs
1. Script Library - 83 scripts, all filters work, search works
1. Comment Miner - loads, empty state correct
1. Production Console - shows 30 overdue items, today's work counts
1. Individual Pipeline Video Detail pages - loads correctly
1. Creator Dashboard (My Studio) - weekly goal, last 7 days stats
1. Settings - all 6 tabs work (Account, Subscription, Notifications, Preferences, API Keys, Webhooks)
1. Light/Dark mode toggle
1. Notifications panel, User menu, Support widget
## Bugs Found
### BUG 1 - CRITICAL: New Campaign crashes
Page: /admin/campaigns/new
Error: TypeError: ea.map is not a function
Cause: API returns non-array for reference data. Component calls .map() without null check.
Fix: Change ea.map(...) to (ea || []).map(...) and fix API to always return array.
### BUG 2 - CRITICAL: Pipeline/Production Board crashes
Page: /admin/pipeline (and all ?status= variants)
Error: Minified React error #310 + "Failed to fetch reference data: TypeError: r.data.map is not a function"
Cause: Same root cause as Bug 1 - reference data API returns non-array, causes hooks order violation
Fix: Fix API to return { data: [] } on empty. Add (r.data ?? []).map(...) guard. Individual pipeline item pages (/admin/pipeline/:id) work fine.
### BUG 3 - MEDIUM: Pack Library fails to load
Page: /admin/content-packs
Error: Toast "Failed to load content packs"
Content packs generated in /admin/content-pack don't appear in library.
Fix: Check save step in generation flow. Fix list API to return array.
### BUG 4 - MEDIUM: Global Search (Cmd+K) returns no results
Searched "Big Boy" - 0 results despite 54 matching scripts.
Fix: Fix search index/API - scripts, hooks, products, brands need to be indexed.
### BUG 5 - MEDIUM: Scroll bug causes blank/black page on long pages
Affected: Content Studio advanced mode, Script Library, Hook Generator
When a form element near bottom of page gains focus, the page scrolls to a black void.
Fix: The html element is the scroll container but layout CSS conflicts. Set height:100vh + overflow-y:auto on the main content wrapper instead.
## Priority Recommendations
1. Fix Bugs 1 & 2 together (same root cause) - add (data ?? []).map() guards everywhere
1. Fix scroll bug - affects core Content Studio workflow
1. Fix Pack Library persistence
1. Fix Global Search indexing
1. Add loading skeleton states
1. Add onboarding for Opportunities page (empty without product signals)
## What Works Great
* Content Studio AI generation is fast and high-quality
* Content Pack parallel generation is impressive
* Hook Generator output quality is strong
* Talk Through It voice-to-form is innovative
* Comment Reply sticker tool is polished
* Overall UI/UX is clean and intuitive
* API Keys management is well-built
