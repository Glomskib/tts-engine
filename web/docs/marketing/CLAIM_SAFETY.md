# Claim Safety Guidelines — FlashFlow Marketing Engine

## Risk Levels

| Level | Score | Auto-Publish? | What Happens |
|-------|-------|---------------|-------------|
| **LOW** | 0-29 | Yes | Scheduler posts automatically |
| **MED** | 30-69 | No | Flagged `needs_review` — requires admin Approve in UI |
| **HIGH** | 70-100 | No | Auto-cancelled by scheduler — content blocked |

## Disallowed Phrases (Instant HIGH)

These phrases will **immediately block** a post (score 70+). A single match is enough.

| Pattern | Why |
|---------|-----|
| "cures cancer / diabetes / Alzheimer's" | Direct disease cure claim — FTC/FDA violation |
| "replace your medications" | Dangerous medical advice |
| "stop taking your meds" | Dangerous medical advice |
| "FDA-approved supplement" | Supplements cannot be FDA-approved (only drugs can) |
| "miracle cure / pill / supplement" | Unsubstantiated marketing |
| "scientifically proven to cure/treat" | Requires peer-reviewed evidence |
| "kills/eliminates cancer cells" | Unsubstantiated medical claim |
| "no prescription needed" | Implies pharmaceutical equivalence |

## Disclaimer-Required Phrases (Forced MED)

These topics are **OK to discuss** but require human review before publishing. The scheduler will hold them as `needs_review`.

| Pattern | Why |
|---------|-----|
| Supplement/vitamin "helps/supports/promotes" | Structure/function claims need disclaimer |
| CBD, THC, hemp, cannabis, kratom, kava | Controlled substance regulations vary by state |
| Testosterone/estrogen/hormone "boost/support" | Hormonal claims require careful wording |
| Blood sugar/pressure/cholesterol "support/reduce" | Medical metric claims need substantiation |
| Pain relief claims | OTC drug territory — needs careful framing |
| EDS/POTS/dysautonomia "helps/supports" | Condition-specific benefit claims need review |

## Safe Copy Guidelines

### DO write:
- "Join our community ride this Saturday!"
- "Staying active helps you feel great"
- "Our cycling group welcomes riders of all levels"
- "Explore new routes and make friends"
- "Share your story with the community"

### DON'T write:
- "This supplement cures [any disease]"
- "Clinically proven to [health benefit]"
- "FDA approved" (for supplements)
- "Guaranteed results" or "100% effective"
- "Stop taking your medications"
- "No side effects"
- Income claims ("make $X per day")

### CAREFUL with (requires review):
- Supplement benefit claims — use "may support" not "will cure"
- Always include: "This is not medical advice. Consult your healthcare provider."
- Avoid specific % statistics without citation
- When discussing conditions (EDS, POTS), share stories, don't make treatment claims

## How It Works in the Pipeline

1. **Content enters queue** (daily-intel, calendar, repurpose, manual)
2. **Claim risk classifier** runs automatically — assigns LOW/MED/HIGH
3. **LOW**: scheduler posts automatically on next run
4. **MED**: held as `needs_review` — visible in Admin UI with warning badge
5. **HIGH**: auto-cancelled with error message showing which flags triggered
6. **Admin Approve**: clears `needs_review` flag → scheduler picks up on next run

## Testing

```bash
# Run claim risk tests (included in smoke test suite)
npx tsx scripts/setup/smoke-test-marketing.ts

# Test specific content:
# In Node REPL:
import { classifyClaimRisk } from './lib/marketing/claim-risk';
console.log(classifyClaimRisk('your content here'));
```

## Adding New Patterns

Edit `lib/marketing/claim-risk.ts`:

- **DISALLOWED_PHRASES**: weight 70+ (instant block)
- **REQUIRES_DISCLAIMER**: weight 35 (forces review)
- **RISK_PATTERNS**: weight varies (cumulative scoring)

After adding patterns, run `npx tsx scripts/setup/smoke-test-marketing.ts` to verify.
