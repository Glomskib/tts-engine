# FlashFlow Dashboard UX Changes

Summary of the mobile dashboard redesign and the immediate copy pass around it.

## Files changed

### Dashboard surface
- `web/app/admin/dashboard/page.tsx` — headline, subhead, stat card labels, Start Here panel copy, section comments
- `web/components/dashboard/ActionCenter.tsx` — section title + subhead, next-step option copy, empty-state header
- `web/components/dashboard/PipelineOverview.tsx` — section title + subhead, stage labels, weekly velocity label
- `web/components/dashboard/TodayAssignments.tsx` — section title, status pill labels, empty-state copy + CTA, "View all" → "See all videos"
- `web/components/dashboard/WinnersPanel.tsx` — section title, empty-state copy, "View all" → "See all ideas", fallback title
- `web/components/dashboard/QuickTools.tsx` — section title (Quick Access → Shortcuts), tool labels

### Shared next-action config
- `web/lib/videos/nextAction.ts` — all action labels (rewrites "Generate Post Package", "Edit Video", "Fix Blockers" etc.)

### Navigation
- `web/components/MobileBottomNav.tsx` — Studio → Create, Planner → Plan, Winners → Ideas, secondary labels

### Nav destinations (header + key copy only)
- `web/app/admin/content-studio/page.tsx` — H1, subhead, login error, welcome banner
- `web/app/admin/pipeline/page.tsx` — empty-state heading + CTAs
- `web/app/admin/calendar/page.tsx` — H1 + subhead
- `web/app/admin/intelligence/winners-bank/page.tsx` — H1 + subhead + detection CTA

## Major UX changes

1. **Dashboard headline shifted from admin-dashboard tone to coach tone.**
   - Before: "What's next, brandon?" / "Your content command center"
   - After: "Hey brandon — let's keep it moving" / "Here's what needs your attention today."

2. **Stat cards stopped being standalone numbers.**
   - Before: `0 Scripts` / `0 Campaigns` / `0 Posted`
   - After: `0 Scripts written` / `0 Content plans` / `0 Videos posted`

3. **Production Pipeline reframed as "Where your videos are".** Stage labels now use sentence case ("In editing", "Ready to post", "Posted this week") and match the status pills.

4. **Action cards lead with a verb.** "Generate Post Package" → "Get it ready to post". "Edit Video" → "Finish editing". "Fix Blockers" → "Fix what's missing".

5. **Empty states now explain themselves.** Each empty panel says what the section is for and what to do next, instead of a dead "No data" panel.

6. **Bottom nav is actionable.** Studio → Create, Planner → Plan, Winners → Ideas. Tab labels now match the titles of the pages they load.

7. **Quick Tools → Shortcuts.** Renamed section, retitled each shortcut to a direct action ("Create a video", "Top ideas", "My videos").

## Naming changes (quick reference)

See `FLASHFLOW_UX_COPY_REWRITE.md` for the full table. Highlights:

- Studio → Create
- Production Pipeline → Where your videos are
- Winners Bank → Top ideas
- Content Planner → Plan
- Generate Post Package → Get it ready to post
- Campaigns (on dashboard) → Content plans
- Edit Video → Finish editing
- Winning Content → Top ideas right now

## Follow-up recommendations (not in this pass)

High-impact screens that still carry residual jargon. Tackle in a second pass:

1. **`/admin/scripts`** — still references "AI-generated scripts" in empty state; fine, but review secondary CTAs.
2. **`/admin/script-library`** — still contains "Production Board" references (line ~1080) and "Content Studio" CTAs; needs a full sweep.
3. **`/admin/hook-generator`** — rename to match "Hook ideas" label used in shortcuts.
4. **`/admin/campaigns`** (page body, not just nav) — if this is really content plans, rename H1 and empty state.
5. **`/admin/transcribe`** — still shows "Content Studio" as a link label (line 27).
6. **`/admin/settings`** — check for "Content Studio" references in style-profile helper text.
7. **`/admin/billing`** and plan-gate copy — still uses "Production Board" feature-gate labels.
8. **VideoDetailSheet / VideoDrawer** — confirm status labels match the new system.
9. **Recording kit / Editing kit download flows** — check CTA verbs.
10. **Onboarding**: review "recommended next step" copy in `dashboard/_components/RecommendedNextStep.tsx` (still uses "Content Studio" and "Production Board" CTA labels).
11. **Toasts & celebrations**: audit `lib/celebrations.ts` and shared toast strings against the tone rules.
12. **Telegram notification templates** (`/admin/settings/telegram`): "Content Planner Ready" should become "Plan ready" etc.

Ship order I'd suggest:

1. This pass (dashboard + nav + core action labels) — done, in this commit.
2. Script Library + scripts page (highest traffic after dashboard).
3. Video detail / editing flow (completes the create→post journey).
4. Onboarding + recommended-next-step (first impression).
5. Settings + billing plan-gate labels.
6. Notifications + celebrations.
