# FlashFlow Dev Task Queue

**Created:** February 9, 2026  
**Status:** ACTIVE  
**Owner:** Claude Code  
**Priority:** Phase 1 — Pipeline Restoration (CRITICAL)

---

## TASK 1: Fix "Approve and send to Pipeline" 404 Error

**Priority:** 1/4 (FIRST)  
**Severity:** CRITICAL  
**Status:** QUEUED

### Problem
User clicks "Approve and send to Pipeline" button in Skit Test page → page returns 404 error → script cannot move to Pipeline queue.

### Current Behavior
- User generates script in Skit Test section
- Clicks "Approve and send to Pipeline" button
- Page returns: "This page is not available"
- Script stays in Skit Test, never reaches Pipeline

### Expected Behavior
- User clicks button
- Script saves to database with status `approved`
- Script appears in Pipeline page (queue of pending scripts)
- Returns to Skit Test with success message
- VA can see script in Pipeline and assign for editing

### Files to Check/Modify
- [ ] `/app/skit-test/page.tsx` — Button click handler
- [ ] `/app/pipeline/page.tsx` — Route definition
- [ ] `/app/api/scripts/approve.ts` — API endpoint (likely missing)
- [ ] Database schema — scripts table, status field
- [ ] `/lib/api-calls.ts` — Approval API call function

### Technical Approach
1. Verify `/app/pipeline` route exists and renders properly
2. Check if `/app/api/scripts/approve` endpoint exists
3. If not, create endpoint:
   ```
   POST /app/api/scripts/approve
   Body: { scriptId: string, status: 'approved' }
   Response: { ok: true, scriptId, redirectUrl: '/pipeline' }
   ```
4. Verify approval function in Skit Test page sends to correct endpoint
5. Test: Generate script → click approve → verify appears in Pipeline page

### Testing Checklist
- [ ] Skit Test page loads without errors
- [ ] Click "Approve and send to Pipeline" button
- [ ] No 404 error
- [ ] Script appears in Pipeline page with status `approved`
- [ ] Success toast message displays

**Estimated time:** 30-45 minutes

---

## TASK 2: Fix "Add Winner" 404 Error

**Priority:** 2/4 (SECOND)  
**Severity:** CRITICAL  
**Status:** QUEUED (after Task 1)

### Problem
User clicks "Add Winner" button in Script Library → 404 error → script cannot be moved to Winners Bank.

### Current Behavior
- User views script in Script Library
- Clicks "Add Winner" button
- Page returns: "This page is not available"
- Script remains in Library, not moved to Winners Bank

### Expected Behavior
- User clicks button
- Script is flagged as "winner" (status: `winner`)
- Script appears in Winners Bank page
- Script is marked for high-volume reuse across all 6 accounts
- Returns to Script Library with success message

### Files to Check/Modify
- [ ] `/app/script-library/page.tsx` — Button click handler
- [ ] `/app/winners-bank/page.tsx` — Route definition
- [ ] `/app/api/scripts/add-winner.ts` — API endpoint (likely missing)
- [ ] Database schema — scripts table, winner flag/status
- [ ] `/lib/api-calls.ts` — Add winner function

### Technical Approach
1. Verify `/app/winners-bank` route exists
2. Check if `/app/api/scripts/add-winner` endpoint exists
3. If not, create endpoint:
   ```
   POST /app/api/scripts/add-winner
   Body: { scriptId: string }
   Response: { ok: true, scriptId, movedToWinnerBank: true }
   ```
4. Verify Script Library page calls correct endpoint
5. Test: Flag high-performing script as winner → verify in Winners Bank

### Testing Checklist
- [ ] Script Library page loads without errors
- [ ] Click "Add Winner" button on any script
- [ ] No 404 error
- [ ] Script appears in Winners Bank page with "winner" badge
- [ ] Success toast message displays

**Estimated time:** 30-45 minutes

---

## TASK 3: Fix Hook Saving Persistence

**Priority:** 3/4 (THIRD)  
**Severity:** CRITICAL  
**Status:** QUEUED (after Task 2)

### Problem
User clicks "Save" on hook → toast says "Saved" → hook is not persisted → cannot retrieve later.

### Current Behavior
- User generates hook in script
- Clicks "Save Hook" button
- Toast message: "Hook saved"
- Page refresh or next visit: hook is gone
- No hook library or saved hooks list visible

### Expected Behavior
- User saves hook
- Toast confirms: "Hook saved to library"
- Saved hooks appear in a "Hook Library" section (dropdown or page)
- User can click saved hook to use in new scripts
- Hooks persist across sessions
- Should show count of saved hooks

### Files to Check/Modify
- [ ] `/app/skit-test/page.tsx` — Hook save button handler
- [ ] `/app/api/hooks/save.ts` — Hook save endpoint (likely missing)
- [ ] `/app/hooks-library/page.tsx` OR dropdown component (may not exist)
- [ ] Database schema — hooks table with fields: id, hookText, userId, createdAt, rating
- [ ] `/lib/api-calls.ts` — Save hook function

### Technical Approach
1. Create hooks database table if missing:
   ```sql
   CREATE TABLE hooks (
     id UUID PRIMARY KEY,
     userId UUID NOT NULL,
     hookText TEXT NOT NULL,
     rating INT DEFAULT 0,
     createdAt TIMESTAMP DEFAULT NOW(),
     FOREIGN KEY (userId) REFERENCES users(id)
   )
   ```
2. Create endpoint `/app/api/hooks/save`:
   ```
   POST /app/api/hooks/save
   Body: { hookText: string }
   Response: { ok: true, hookId, message: "Hook saved" }
   ```
3. Create Hook Library UI (dropdown or page to view saved hooks)
4. Modify Skit Test page: add "Hook Save" button that calls endpoint
5. Test: Save hook → refresh page → verify hook still accessible

### Testing Checklist
- [ ] Click "Save Hook" button in Skit Test
- [ ] No database errors
- [ ] Toast: "Hook saved to library"
- [ ] Refresh page
- [ ] Saved hook is still accessible
- [ ] Can see count of saved hooks
- [ ] Can reuse saved hooks in new scripts

**Estimated time:** 45-60 minutes

---

## TASK 4: Restore AI Chat + Regenerate Button

**Priority:** 4/4 (FOURTH)  
**Severity:** CRITICAL  
**Status:** QUEUED (after Task 3)

### Problem
User cannot iterate on generated scripts. Missing features:
- Regenerate button (was there, removed)
- AI chat widget (was there, removed) to adjust hook, length, tone, etc.

### Current Behavior
- User generates script in Skit Test
- Script appears as final output
- No "Regenerate" button
- No AI chat for refinement
- One-shot output only
- User cannot improve script before pipeline

### Expected Behavior
- User generates script
- "Regenerate" button available to generate new variations
- AI chat widget at bottom to adjust:
  - Hook (make it punchier, longer, shorter)
  - Scene details (add this painpoint, remove that)
  - Tone (more funny, more serious, more professional)
  - Copy length (tighten it up, expand it)
- Chat saves context (user doesn't lose previous adjustments)
- Final script is refined before sending to Pipeline

### Files to Check/Modify
- [ ] `/app/skit-test/page.tsx` — Add Regenerate button + AI chat component
- [ ] `/app/api/scripts/regenerate.ts` — Regenerate endpoint (may exist or be broken)
- [ ] `/app/api/scripts/adjust.ts` — Chat adjustment endpoint (may not exist)
- [ ] `/components/AIChat.tsx` — Chat widget component (may be removed or broken)
- [ ] `/lib/ai-prompts.ts` — Regenerate + adjust prompts

### Technical Approach
1. Check if `/app/api/scripts/regenerate` endpoint exists and works
2. If broken/missing, fix it to generate new script variations based on same inputs
3. Create/restore `/app/api/scripts/adjust` endpoint for AI chat:
   ```
   POST /app/api/scripts/adjust
   Body: { scriptId: string, userRequest: string }
   Response: { ok: true, adjustedScript: string }
   ```
4. Restore/create AIChat component with:
   - Text input for user requests
   - Regenerate button
   - Display adjusted script
   - Save context across turns
5. Add to Skit Test page UI

### Example Flow
```
User: "Can you make the hook more punchy?"
AI: [adjusts hook, shows updated script]
User: "Perfect. Now add how we address the quality painpoint"
AI: [adds painpoint callout, shows updated script]
User: "Great. Send to Pipeline"
```

### Testing Checklist
- [ ] Skit Test page shows "Regenerate" button
- [ ] Click Regenerate → generates new variations
- [ ] AI Chat widget appears at bottom
- [ ] Type request ("make hook funnier") → AI adjusts script
- [ ] Adjustments persist (don't lose previous changes)
- [ ] Final refined script can be sent to Pipeline
- [ ] No errors in console

**Estimated time:** 1.5-2 hours (this is most complex)

---

## SUMMARY

| Task | Bug | Fix | Time |
|------|-----|-----|------|
| 1 | Approve/Pipeline 404 | Create API endpoint, fix route | 30-45 min |
| 2 | Add Winner 404 | Create API endpoint, create Winners page | 30-45 min |
| 3 | Hook saving fails | Create hooks table, endpoint, library UI | 45-60 min |
| 4 | AI chat + Regenerate | Restore/fix endpoints, create chat component | 1.5-2 hours |

**Total estimated time:** 3.5-4.5 hours

**Start order:** Task 1 → 2 → 3 → 4 (each builds on previous)

**Blocking:** None of these are blocked. Can start immediately.

**Testing:** Test each task before moving to next. Run full pipeline test once all 4 are complete.

---

## DONE CHECKLIST

- [ ] Task 1: Approve/Pipeline 404 fixed ✅
- [ ] Task 2: Add Winner 404 fixed ✅
- [ ] Task 3: Hook saving working ✅
- [ ] Task 4: AI chat + Regenerate working ✅
- [ ] Full pipeline test: Script → Generate → Approve → Pipeline → VA queue ✅
- [ ] Commit to git with descriptive messages ✅

**Once all 4 are done:** Test with Brandon + VA. Then Phase 2 (quality improvements).