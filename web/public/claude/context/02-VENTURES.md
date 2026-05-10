# The 7 ventures

Priority ordering reflects Brandon's stated focus this week (HHH/MMM first). Goals + halt conditions live in `~/Documents/MacBook Pro VAULT/00-System/goals.yaml` — single source of truth.

---

## 1. HHH 2026 — Hancock Horizontal Hundred

**What:** Cycling event Sept 12, 2026 in Findlay, OH. 100/62/30/15 mile distances + FREE Family Tour.

**Goal:** 400 riders registered + $50k sponsor revenue by event day (2026-09-12).

**Halt:** Registration page broken OR sponsor outreach response rate <5% over 14 days.

**Confirmed partners:**
- BVHS (Blanchard Valley Health System) — title sponsor
- Hancock Hotel — riders housing
- False Chord — opens at 2 for the food event
- Arlyns — vendor partner
- Tiger Lilly — breakfast morning-of
- PT Link Findlay — PTs onsite morning-of

**Repo/site:** `~/projects/shopify-theme-endurance-events` → Shopify store

**Standing tasks:** sponsor outreach drafts (#85), volunteer signup (#113), registration + Stripe (#112), route maps per distance (#115), day-of comms (#114)

---

## 2. Making Miles Matter (MMM)

**What:** Nonprofit ops platform. Hosts HHH and other events. White-label-able for other nonprofits.

**Goal:** Live + Stripe-funded membership tiers by 2026-06-01. Site at makingmilesmatter.org.

**Halt:** Stripe webhook failing >24h OR donations not reconciling.

**Email canonical:** miles@makingmilesmatter.com — every HHH/MMM email goes through this. Never spiderbuttons@gmail.com.

**Repo:** `~/projects/mmm-event-os` (Glomskib/mmm-event-os)

**Standing tasks:** hub copy/photos pass (#83), tone rewrite (#103), membership tiers + pricing (#109), domain forwarding fix (#116), MMM Flyer Studio white-label (#117)

---

## 3. FlashFlow AI

**What:** TikTok Shop creator content engine. Transcribes, AI-edits, auto-posts. Positioned as "the content engine for TikTok Shop sellers" — not generic AI editor.

**Goal:** 100 paying users + $5k MRR by 2026-08-01. flashflowai.com.

**Halt:** No signups in 14 consecutive days.

**Repo:** `~/tts-engine` (Glomskib/tts-engine, public)

**Known issues right now:**
- 413 error on AI Editor uploads (fix = TUS resumable, in progress as #72)
- Several UX bugs (#99, #122)
- Vercel deploy pipeline may be stuck (#133)

**Standing tasks:** TUS upload fix (#72), onboarding + analytics (#86), trust+legal+pricing (#87), acquisition first-10-users (#88), email sequences (#90), homepage rebuild (#124), /create flow polish (#125)

---

## 4. Zebby's World

**What:** EDS chronic-illness app + media. Spoonie-native — DEEPLY EDS-aware, not generic. Wife Katlyn is primary user.

**Goal:** Closed beta with 50 EDS users by 2026-07-01.

**Halt:** Any clinical content goes live without Brandon AND Katlyn approval.

**Auto-ship gate:** RED. All medical content must be reviewed by both.

**Repo:** `~/projects/zebbys-world` (Glomskib/zebbys-world)

**Differentiator:** spoonie validation tone, doctor-prep mode, RAG over EDS Society, no other chronic-illness app has this depth.

---

## 5. TCG Buying Group (CCW TCG)

**What:** Trading card buying group. Members pool money, group buys at discount, gets pro-rata allocation. Transparency engine via invoices + member balances.

**Goal:** Phase 1 ledger live + 5 paying members by 2026-07-01.

**Halt:** Ledger reconciliation drifts >$1.

**Standing tasks:** TCG operator dashboard + ledger Phase 1 (#84), transparency invoices + allocation engine (#65)

---

## 6. Mission Control (MC)

**What:** Agent ops layer. mc.flashflowai.com. The foundation that runs everything else — task board, fleet status, briefs queue, comms hub.

**Goal:** Bookshelf live + auto-decomposer firing + fleet health visible by 2026-05-15.

**Halt:** Auto-decomposer emits >50 tasks in 1h (runaway).

**Repo:** `~/mission-control` (Glomskib/mission-control, private)

**Current critical gap:** Vercel deploy pipeline stuck. Production at version 7e8c5e8 while origin/main is 5+ commits ahead. Brandon needs to check Vercel dashboard.

**Critical gap (UX):** Workspace switcher only changes color, doesn't filter data. Wired in latest commit but not deployed yet.

**Critical gap (UX):** Task detail page lacks assignee picker + file upload + comments thread. Comments thread shipped in latest commit, awaiting deploy.

---

## 7. Digital Assets

**What:** Productized AI agents / niche templates / digital products Brandon can sell.

**Goal:** 1 income asset shipped + first sale by 2026-06-01.

**Halt:** No buyers after 30 days of marketing.

**Sunday auto-spawn:** Each Sunday, AI proposes one new income/asset opportunity with a pre-built MVP.
