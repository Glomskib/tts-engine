# FLASHFLOW AI - DEVELOPMENT RULES

**READ THIS FIRST. FOLLOW THESE RULES. NO EXCEPTIONS.**

---

## RULE 1: AUDIT BEFORE YOU BUILD

**Never write new code without first understanding what exists.**

```bash
# ALWAYS run these searches first
grep -r "[feature_keyword]" --include="*.ts" --include="*.tsx" -l
find app -name "*.tsx" -exec grep -l "[feature_keyword]" {} \;
```

Before implementing anything:
1. Search for existing related code
2. List what will be replaced or removed
3. Identify duplicate functionality
4. Check for dead imports

**If you skip this step, you will create a mess.**

---

## RULE 2: REMOVE BEFORE YOU ADD

**Clean up old code BEFORE adding new code. Never leave two versions of the same thing.**

Commit order:
1. `"Remove deprecated [X] code"` ← FIRST
2. `"Create [feature] module structure"`
3. `"Add [feature] implementation"`
4. `"Integrate [feature] into [system]"`

**If old code does the same thing as new code, delete the old code.**

---

## RULE 3: DEPTH OVER FUNCTION

**Every system must be built with DEEP INTUITION, not just basic functionality.**

### ❌ UNACCEPTABLE (Shallow):
```typescript
function generateScript(product: string, tone: string) {
  return `Write a script about ${product} in ${tone} tone.`;
}
```

### ✅ REQUIRED (Deep):
```typescript
function generateScript(params: ScriptParams) {
  return buildPrompt({
    persona: buildPersonaContext(params.persona),           // WHO speaks
    audience: buildAudienceContext(params.audience),        // WHO listens
    creative: buildCreativeContext(params.controls),        // HOW it's delivered
    intelligence: buildWinnersIntelligence(params.userId),  // WHAT worked before
    compliance: buildComplianceRules(params.riskTier),      // WHAT to avoid
    output: buildOutputStructure(params.format),            // WHAT format
  });
}
```

**Every feature needs multiple layers of context and reasoning.**

---

## RULE 4: INTUITIVE NAMING - NO JARGON

**Every user-facing label must be immediately understandable to a non-technical person.**

| ❌ WRONG | ✅ RIGHT |
|----------|----------|
| chaos_level | Plot Style |
| intensity | Comedy Intensity |
| persona | Creator Voice |
| risk_tier | Content Safety Level |
| retention_3s | Watched Past 3 Seconds |
| engagement_rate | Engagement % |

**If a normal person wouldn't understand it, rename it.**

---

## RULE 5: EVERY CONTROL NEEDS CONTEXT

**No naked inputs. Every control needs:**

1. **Clear label** - What is this?
2. **Current value indicator** - What's selected?
3. **Range labels** - What do the extremes mean?
4. **Description** - When should I use each setting?

```tsx
<div className="space-y-2">
  <div className="flex justify-between">
    <label className="font-medium">Plot Style</label>
    <span className="text-zinc-400">{getPlotStyleLabel(value)}</span>
  </div>
  <input type="range" min="0" max="100" value={value} />
  <div className="flex justify-between text-xs text-zinc-500">
    <span>Realistic & Relatable</span>
    <span>Wild & Over-the-Top</span>
  </div>
  <p className="text-xs text-zinc-500">
    How grounded should the scenario be? Realistic = everyday life. 
    Over-the-top = absurdity and unexpected twists.
  </p>
</div>
```

**If a user has to guess what a control does, you failed.**

---

## RULE 6: AI PROMPTS NEED STRUCTURE

**Every AI prompt must have explicit labeled sections:**

```
=== CREATOR VOICE ===
[Full persona with vocabulary, patterns, examples]

=== TARGET AUDIENCE ===
[Demographics, psychographics, pain points, language]

=== CREATIVE PARAMETERS ===
[All controls with current values and what they mean]

=== WINNERS INTELLIGENCE ===
[What worked before, patterns to follow, what to avoid]

=== COMPLIANCE RULES ===
[Hard limits, forbidden words, never do this]

=== OUTPUT FORMAT ===
[Exact JSON structure required]

CRITICAL: [Most important instruction]
NEVER: [Hard boundaries]
ALWAYS: [Required elements]
```

**Vague prompts produce vague results.**

---

## RULE 7: ORGANIZE FILES PROPERLY

```
app/
  admin/
    [feature]/
      page.tsx              # Main page
      [id]/page.tsx         # Detail page
  api/
    [feature]/
      route.ts              # GET list, POST create
      [id]/route.ts         # GET, PATCH, DELETE single

components/
  [feature]/                # Feature-specific components

lib/
  [feature]/
    types.ts                # TypeScript interfaces
    api.ts                  # API functions
    utils.ts                # Utilities
    constants.ts            # Constants
```

**No dumping everything in one file. No random file locations.**

---

## RULE 8: VERIFY BEFORE DONE

**After every implementation:**

```bash
npm run build  # Must pass with ZERO errors
```

Check:
- [ ] No duplicate functions (old + new doing same thing)
- [ ] No orphaned files (old pages not used)
- [ ] No unused imports
- [ ] Navigation/sidebar updated
- [ ] Mobile responsive
- [ ] Empty states handled
- [ ] Error states handled
- [ ] Loading states shown

**If build fails or checklist incomplete, you're not done.**

---

## RULE 9: DOCUMENT THE WHY

**Comments explain WHY, not WHAT.**

```typescript
// ❌ BAD - explains what (obvious from code)
// Sort winners by score
winners.sort((a, b) => b.score - a.score);

// ✅ GOOD - explains why (not obvious)
// Sort by performance_score DESC because engagement alone doesn't capture 
// watch-time value - high views with low engagement can still indicate 
// strong hooks worth learning from
winners.sort((a, b) => b.performance_score - a.performance_score);
```

**Future you (and others) need to understand your reasoning.**

---

## RULE 10: THINK LIKE THE USER

Before building any feature, ask:

1. **What is the user trying to accomplish?**
2. **What do they need to see to make a decision?**
3. **What would confuse them?**
4. **What would delight them?**

Build for the user, not for the code.

**If you wouldn't want to use it yourself, rebuild it.**

---

## QUICK CHECKLIST

Copy this into every implementation prompt:

```
BEFORE STARTING:
□ Searched for existing related code
□ Listed what to remove/replace
□ Planned file structure

DURING BUILD:
□ Removed old code first
□ Built with full depth (multiple context layers)
□ Used intuitive naming
□ Added descriptions to all controls
□ Structured AI prompts with labeled sections

AFTER BUILD:
□ npm run build passes
□ No duplicate/orphaned code
□ Navigation updated
□ Mobile responsive
□ Empty/error/loading states work
□ Would I want to use this? Yes
```

---

**These rules exist because we're building a professional product, not a prototype. Follow them.**
