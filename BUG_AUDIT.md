# FlashFlow AI — Complete Bug Audit

**Date:** February 9, 2026  
**Tester:** Brandon Glomski (Admin)  
**Account:** admin; Brandon@communitycorewholesale.com  
**Overall Status:** Pipeline functionality BROKEN. UX issues widespread. AI output quality low (5/10).

---

## 🔴 CRITICAL BUGS (BLOCKING PIPELINE)

### 1. Approve and Send to Pipeline → 404 Error
**Severity:** CRITICAL  
**Impact:** Scripts cannot move from Skit Test to Pipeline. Entire workflow blocked.  
**Error:** "This page is not available"  
**Expected behavior:** Script should move to Pipeline queue, ready for VA assignment.  
**Workaround:** None. Pipeline integration is completely broken.  
**Fix:** Check `/app/pipeline` routing. Verify database save on approve action. Test form submission.

---

### 2. Add Winner (Script Library) → 404 Error
**Severity:** CRITICAL  
**Impact:** Cannot flag winning scripts. Winners Bank can't populate automatically.  
**Error:** "This page is not available"  
**Expected behavior:** Click "Add Winner" → script moves to Winners Bank with flag.  
**Workaround:** None.  
**Fix:** Check route `/app/winners`. Verify button click handler.

---

### 3. Pipeline Integration Broken
**Severity:** CRITICAL  
**Impact:** Scripts can't flow from generation → approval → pipeline → VA assignment.  
**Status:** "Approve and send to Pipeline" fails. "Add Winner" fails. Winners Bank doesn't auto-populate.  
**Expected workflow:**
```
Generate script (Skit Test) 
  → Approve and send to Pipeline (404)
  → Pipeline page shows pending scripts
  → VA can see assignment queue
  → Script tracks to completion
```
**Current state:** Pipeline page is unreachable. VA has no work queue.  
**Fix:** Audit entire pipeline flow. Check database schema. Test end-to-end.

---

### 4. Hook Saving Broken
**Severity:** HIGH  
**Impact:** Hooks appear to save but are lost. Cannot build hook library.  
**Issue:** Click "Save" → toast says "Saved" → no evidence of persistence.  
**Expected behavior:** Saved hooks appear in a Hook Library or persist on next visit.  
**Workaround:** Manually copy/paste hooks.  
**Fix:** Check database save logic. Verify hooks table. Add visual confirmation (saved hooks list).

---

## 🟠 HIGH PRIORITY (UX/WORKFLOW BLOCKERS)

### 5. Can't Edit Scripts After Generation
**Severity:** HIGH  
**Impact:** One-shot scripts. No iteration. Quality suffers.  
**Missing features:**
- ❌ Regenerate button (was there, now gone)
- ❌ AI chat within script (edit hook, adjust scenes, etc.)
- ❌ Scene-by-scene editing

**Expected behavior:**  
- User generates script  
- User regenerates variations  
- User talks to AI to adjust hook, length, tone, etc.  
- Output improves through iteration

**Current state:** Single output only. No improvement path.  
**Impact on pipeline:** Low-quality first-pass scripts (5/10 rating) need to be manually edited or discarded. VA rejects them.  
**Fix:** Restore regenerate button. Restore AI chat widget. Implement in-script adjustment flow.

---

### 6. AI Output Quality Too Low (5/10)
**Severity:** HIGH  
**Impact:** Generated scripts are weak. VA rejects them. Pipeline stalls.  
**Issue:** "Overall output from a human standpoint - 5/10 rating as far as the cleverness and overall results given"  
**Problem areas:**
- Hooks aren't compelling
- Copy doesn't match painpoints
- Variations are too similar
- Doesn't address selected painpoints clearly

**Example need:**  
- **Selected painpoint:** "Turmeric supplements are low quality"  
- **Script should show:** How THIS brand is different (curcumin testing, sourcing, etc.)  
- **Current script:** Generic "try this supplement" (5/10)

**Fix:** Improve prompt engineering. Add painpoint context to generation. Add "how painpoint is addressed" section to output.

---

### 7. Painpoints Not Reflected in Scripts
**Severity:** HIGH  
**Impact:** Scripts don't match selected painpoints. Confusing for user.  
**Issue:** User selects painpoints but they're not shown in final script or how they're addressed.  
**Example:**
```
User selects: "Low quality turmeric", "Expensive competitors", "No absorption guide"
Script generated doesn't mention any of these specifically
→ User doesn't see connection between painpoints and script content
```

**Expected behavior:** Script should show:
- Which painpoints it addresses
- HOW it addresses each (different color text? recap section? AI score breakdown?)
- Confidence score per painpoint addressed

**Fix:** Add painpoint callouts in script output. Visual highlight of which lines address which painpoints. Recap section.

---

## 🟡 MEDIUM PRIORITY (UX IMPROVEMENTS)

### 8. Content Studio — Filter Bar Confusing
**Severity:** MEDIUM  
**Issue:** Top filter bar looks identical to items below. Unclear what it filters vs what it displays.  
**Expected behavior:** Clear visual hierarchy. Filter section should be distinct (different background color, size, etc.)  
**Fix:** Redesign filter bar. Add visual separator. Test with users.

---

### 9. Skit Test — Missing Export Options
**Severity:** MEDIUM  
**Status:** Copy/Download TXT work ✅  
**Missing:** Google Docs export (was available, removed)  
**Expected:** Multiple export formats (TXT, Google Doc, PDF)  
**Fix:** Restore Google Docs export. Add PDF option.

---

### 10. Templates — Can't Add New or Save Generated Scripts as Templates
**Severity:** MEDIUM  
**Impact:** No template reuse. Scripts can't become repeatable patterns.  
**Expected workflow:**
```
Generate great script
  → Save as Template
  → Future scripts can use that template
  → Variations are generated from template
```
**Current state:** Can only view existing templates. No save option.  
**Fix:** Add "Save as Template" button. Allow custom template creation. Show template usage stats.

---

### 11. Script Library — Filters Too Limited
**Severity:** MEDIUM  
**Issue:** "Filters work but are incredibly limited and can be made way better"  
**Example current filters:** Probably just category/date.  
**Needed filters:**
- By painpoint addressed
- By product/brand
- By performance (winners vs losers)
- By script type (UGC, problem-solution, testimonial, etc.)
- By status (approved, pending, testing, winner)
- By engagement rate (if integrated with TikTok analytics)

**Fix:** Expand filter system. Add combo filters. Better sorting (by relevance, performance, date).

---

### 12. Winners Bank — Doesn't Auto-Add
**Severity:** MEDIUM  
**Issue:** Winners Bank doesn't auto-populate based on high ratings.  
**Expected workflow:**
```
Script rated 9+/10 in Script Library
  → Auto-add to Winners Bank
  → Mark as proven
  → Ready for reuse across accounts
```
**Current state:** Manual process. Requires "Add Winner" button (which has 404 error).  
**Fix:** Implement auto-add logic based on rating threshold. Or: fix "Add Winner" 404 and make it obvious when to use it.

---

### 13. Script Imports for Testing
**Severity:** MEDIUM  
**Issue:** Can't import other people's winning scripts to test/remix.  
**Need:** "Import from Discord/external source → analyze → adapt for Brandon's products → add to pipeline"  
**Current:** No import mechanism for external scripts.  
**Fix:** Add import flow. Allow pasting script content → FlashFlow analyzes → suggests adaptations → queues for VA.

---

### 14. Products Page — Can't Add Brand Inline
**Severity:** LOW-MEDIUM  
**Issue:** Can't add new brand from Products page. Must go to separate "Add Brand" page.  
**Expected:** Inline "Add Brand" button on Products page.  
**Current:** Must navigate away.  
**Fix:** Add inline modal or quick-add form.

---

### 15. Products Page — Missing Filter/Sort
**Severity:** LOW-MEDIUM  
**Issue:** No way to filter or sort products by brand, category, performance, etc.  
**Fix:** Add filter bar. Sort by revenue, clicks, impressions, etc.

---

### 16. Retainer Tracking Section (NEW FEATURE)
**Severity:** LOW  
**Issue:** Not requested yet, but needed for future.  
**Spec:**
```
Retainer section (if enabled):
  - Monthly budget input
  - Quota system (e.g., "10 scripts/month for $500")
  - Cumulative usage tracker
  - Progress bar (% of quota used)
  - Status (on-track, behind, completed)
```
**Use case:** Track supplier/vendor commitments.  
**Priority:** Later. After pipeline is fixed.

---

## 🟠 HIGH PRIORITY (CONTINUED)

### 17. A/B Test Section — Fails to Create Tests
**Severity:** HIGH  
**Issue:** "A/B test section - Fails to create tests"  
**Problem:** Without constant API tracking of TikTok performance data, A/B testing is ineffective. Current implementation doesn't pull real performance metrics.  
**Expected behavior:**
```
User creates A/B test
  → FlashFlow variants (hook A vs hook B)
  → Posts both versions
  → Tracks views, engagement, CTR per variant
  → Reports winner
```
**Current state:** Test creation fails. No performance tracking. Feature is non-functional.  
**Fix:** Either:
- **Option A:** Remove feature until TikTok API integration is built
- **Option B:** Build TikTok Analytics API integration (pull video performance, track variants)

**Recommendation:** Remove for now. Build after pipeline is stable.

---

### 18. Personas — Non-functional, Needs Scope Clarification
**Severity:** MEDIUM-HIGH  
**Issue:** "Personas - Does nothing and needs to only live in the script generator unless you will store them here and associate them with the products that generated them"  
**Current:** Personas section exists but doesn't integrate with script generation.  
**Options:**
- **Option A (Simplify):** Remove from main app. Move to script generator only (inline persona selector).
- **Option B (Enhance):** Keep personas here. Store them. Associate with products. Add rating system (which personas sell best).

**Recommendation:** Go with Option B. Add:
- Association with products (which persona works for turmeric vs cycling gear?)
- Rating system (track which personas convert best)
- Auto-suggest persona based on selected product/painpoints

---

### 19. Personas — Add Rating System
**Severity:** MEDIUM  
**Feature request:** Rate personas based on performance.  
**Use case:**
```
Generated script using "Persona: Health-conscious mom"
→ Script performed well (high engagement)
→ Rate persona 9/10
→ System learns which personas are most effective
→ Future scripts prioritize high-rated personas
```
**Impact:** Over time, identifies which audience personas actually sell.

---

## 🟡 MEDIUM PRIORITY (CLEANUP)

### 20. Performance Section → Rename to "AI Insights"
**Severity:** MEDIUM  
**Issue:** "Performance - Not sure how it does what it does but the clawbot insights seem to do something. Needs renamed to just AI insights"  
**Current:** "ClawBot Insights" label is confusing. Function unclear.  
**Fix:**
- Rename to "AI Insights"
- Clarify what metrics it shows (script effectiveness? audience fit? trending alignment?)
- Add human-readable explanations

---

### 21. AI Insights — Add Email Reporting
**Severity:** MEDIUM  
**Feature request:** "give real actionable feedback and the ability to send reports automatically to emails on certain intervals"  
**Example:**
```
Scheduled report (daily/weekly/monthly)
  → Top-performing scripts
  → Best personas
  → Trending painpoints
  → Recommendations for next content
  → Send to Brandon's email
```
**Impact:** Brandon can review insights without opening app.

---

### 22. Activity Log — Non-functional, Should Be Removed
**Severity:** MEDIUM  
**Issue:** "Activity Log - Has never shown anything. Needs removed"  
**Current:** Empty section. Never populated.  
**Fix:** Remove from UI. Don't show unfinished features.

---

### 23. Video Portal — Entire Section Is Pointless
**Severity:** MEDIUM  
**Issue:** "Every section under 'Video Portal' Seems pointless unless it serves a 'client Manager' in some way. Also directs to a different UI and UX than everything else in this web app. Every section has been empty since it was made."  
**Current state:** Separate UI/UX. Always empty. Confusing navigation.  
**Options:**
- **Option A (Remove):** Delete Video Portal entirely. It's not used.
- **Option B (Repurpose):** Make it a Client Management module (for future when Brandon has clients).

**Recommendation:** Remove for MVP. Add back later if Brandon needs client management.

---

### 24. Client Management — Not Production Ready
**Severity:** MEDIUM  
**Issue:** "The Client Management section has potential but is not anywhere near production level. Needs to be robust and insightful at a high level."  
**Current state:** Empty, non-functional, confusing UX.  
**Needed for production:**
- Role-based access (admin, team member, view-only)
- Client dashboard (high-level overview of their content)
- Billing integration (if clients pay for service)
- Reporting (automated emails with performance summaries)
- Audit trail (who did what, when)

**Fix:** Don't ship until these are built. For now: remove from UI.

---

### 25. Settings — Messy and Confusing UX
**Severity:** MEDIUM  
**Issue:** "Settings are messy and weird for a normal user. Maybe theirs will be different but look at how we can normalize this."  
**Current state:** Unclear organization. Unclear what each setting does.  
**Fix:** Reorganize into logical sections:
- Account (email, password)
- Billing (subscription, payment method)
- Integrations (TikTok, Shopify, etc.)
- Notifications (email frequency, preferences)
- Team (role assignment, permissions)
- Branding (custom logo, domain)

**Test with users before shipping.**

---

### 26. Role Assignment — Can't Be on Signup
**Severity:** MEDIUM  
**Issue:** "Team members section says... User assignment on signup doesn't work. It can't be on the signup. Maybe it's either you are the admin level on signup and you can invite roles/permissions to emails."  
**Current flow:** Signup → unclear how to assign roles  
**Needed flow:**
```
Brandon (Admin) signs up
  → Gets admin dashboard
  → Invites team members via email
  → Team members click invite link
  → Get assigned role (editor, approver, viewer)
  → Access granted to specific features
```
**Fix:** Implement role invitation system. Remove role selection from signup.

---

### 27. Subscription Gating — Disabled
**Severity:** MEDIUM  
**Issue:** "Team members section says - Subscription Gating: Disabled - All users have full access (set SUBSCRIPTION_GATING_ENABLED=true to enable)"  
**Current:** Everyone has full access regardless of subscription tier.  
**Needed:** Enable gating to enforce feature limits by plan (free vs pro vs enterprise).  
**Fix:** Set `SUBSCRIPTION_GATING_ENABLED=true`. Test feature access per plan.

---

### 28. Notifications — Never Populated
**Severity:** MEDIUM  
**Issue:** "Notifications - It's always been empty. I haven't received any. They may need configured."  
**Current:** Notification section exists but is always empty.  
**Examples of notifications needed:**
- Script approved and sent to pipeline
- VA assigned a video for editing
- Script won (high performance)
- Daily digest summary
- Team activity (member edited a script, etc.)

**Fix:** Configure notification triggers. Test email/in-app delivery.

---

## 🔵 LOW PRIORITY (BRANDING/LEGAL)

### 29. Branding — Potential Trademark Conflicts
**Severity:** MEDIUM (Legal)  
**Issue:** "Branding - Check out if we need to rebrand to avoid issues with these guys"  
**Competitors with "FlashFlow" name:**
1. https://flashflowtech.com/index.php/services/ (FlashFlow Tech — appears to be workflow/document tool)
2. https://www.facebook.com/iotstellar/ (IOTStellar video mentions FlashFlow AI writing coach)

**Risk:** Trademark/brand confusion. Potential legal issues if names are too similar.  
**Action items:**
- [ ] Search USPTO trademark database for "FlashFlow"
- [ ] Check if existing FlashFlow brands are in similar space (TikTok, content creation)
- [ ] Consult with lawyer if necessary
- [ ] Consider rebranding if conflicts exist (e.g., "ScriptFlow", "ContentFlow", "PipelineAI")

**Recommendation:** Do a full trademark search before scaling. Rebranding would be expensive later.

---

## 📊 SUMMARY (UPDATED)

| Category | Count | Status |
|----------|-------|--------|
| Critical (pipeline broken) | 4 | 🔴 MUST FIX |
| High (major UX issues) | 5 | 🟠 MUST FIX |
| Medium (improvements) | 19 | 🟡 SHOULD FIX |
| Low (nice-to-have) | 4 | 🔵 COULD FIX |
| Legal (trademark) | 1 | ⚠️ URGENT |

---

## 🎯 PRIORITY ORDER FOR FIXES

**LEGAL (Before marketing/scaling):**
- [ ] Check trademark conflicts (FlashFlow Tech, IOTStellar)
- [ ] Search USPTO database
- [ ] Decide: keep name or rebrand

**Phase 1 (Pipeline restoration — CRITICAL):**
1. Fix "Approve and send to Pipeline" 404 → enables script → pipeline flow
2. Fix "Add Winner" 404 → enables Winners Bank population
3. Fix Hook saving → enables hook library
4. Restore AI chat + regenerate → improves script quality before pipeline

**Phase 2 (Quality improvements — HIGH):**
5. Improve AI output quality (5/10 → 8/10)
6. Show how painpoints are addressed in scripts
7. Expand Script Library filters
8. Persona integration with script generator + rating system
9. Performance section → rename to AI Insights + email reporting

**Phase 3 (Cleanup — MEDIUM):**
10. Remove/hide non-functional sections (Activity Log, Video Portal, A/B test)
11. Fix Settings UX (reorganize into logical sections)
12. Implement role invitation system (admin invites team)
13. Enable Subscription Gating
14. Configure Notifications
15. Fix UI confusion (Content Studio filter bar)
16. Add template save/reuse
17. Add script import for external content
18. Improve Products page (inline brand add, filters)

**Phase 4 (Future — After MVP stability):**
19. Build Client Management (if needed for SaaS sales)
20. Export formats (Google Docs, PDF)
21. Winners Bank auto-add logic
22. Retainer tracking (future)
23. A/B test API integration (with TikTok analytics)

---

## ACTION ITEMS

**Immediate (Before any dev work):**
- [ ] **LEGAL:** Search trademark database for "FlashFlow" conflicts
  - Check: flashflowtech.com, IOTStellar video
  - Consult lawyer if needed
  - Decision: keep name or rebrand

**For Claude Code (Phase 1 — Route via TASK_QUEUE.md):**
1. Fix "Approve and send to Pipeline" 404 error
2. Fix "Add Winner" 404 error
3. Fix Hook saving (persistence)
4. Restore AI chat widget + Regenerate button

**For Brandon (Product decisions):**
1. Do you want Personas in script generator only (remove from main) OR keep + enhance with rating system?
2. Should we remove Video Portal + Activity Log sections (empty, non-functional)?
3. Should we disable A/B test feature until TikTok API integration is built?
4. Do you need Client Management now, or can we remove it and add back later?

---

## NEXT STEPS

**Brandon's call:**
- Confirm Phase 1 priority
- Make decision on Legal (trademark search) — this should happen FIRST
- Approve product decisions above
- Then I route to Claude Code via TASK_QUEUE.md

Once Phase 1 is fixed, we test pipeline with VA, then tackle Phase 2 (quality improvements).