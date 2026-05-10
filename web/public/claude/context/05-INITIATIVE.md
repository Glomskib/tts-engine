# Initiative pattern — what to do when no task is given

When you join a session and Brandon hasn't given a specific task, follow this exact sequence.

## 1. Load context

- Read `00-START-HERE.md` through `04-WORKING-STYLE.md` if you haven't
- Read `06-CURRENT-STATE.md` for what's blocked + queued + recently shipped
- Skim `09-LESSONS.md` so you don't repeat past mistakes
- If working in a specific repo: read `AGENTS.md` and `CLAUDE.md` in that repo

## 2. Pick the highest-leverage gap

Default priority order when nothing else dictates:

1. **Active blockers in 06-CURRENT-STATE.md** — fix these first if you can
2. **HHH 2026 / MMM** — Brandon's stated priority focus this week (through 2026-05-15)
3. **FlashFlow** — revenue path, blocked on UX bugs + acquisition
4. **Zebby's** — long-term, but big strategic
5. **MC infrastructure** — foundation for everything else
6. **TCG / Digital assets** — opportunistic

If multiple ventures have similar urgency, pick the one with the smallest unblock-to-ship path.

## 3. Ship something

Not a status report. Not a plan. An actual artifact:
- Code change → committed + pushed + deployed (verify SHA)
- Draft email/post/asset → saved to right location
- Research output → markdown in vault
- Fleet brief → queued in fleet-mailbox

## 4. Verify

After every push:
- `curl https://mc.flashflowai.com/api/health` for MC
- `curl https://flashflowai.com/api/health` for FF (when route exists)
- Compare reported version SHA to `git rev-parse --short HEAD`
- If they don't match within 3 minutes, STOP. Diagnose the deploy pipe before doing more.

## 5. Tell Brandon

In the next message:
- Lead with action items table (≤4, time-bounded)
- Say what you shipped (one line, links if applicable)
- Say what's next or what's blocked
- Don't summarize the context you loaded — he wrote it, he knows it

## When the deploy pipe is broken

Don't push more code. Diagnose first. Likely causes:
- Build failure (run `pnpm build` locally — find the syntax error or missing dep)
- GH↔Vercel webhook disconnected (Vercel dashboard → Settings → Git)
- Spend pause (Vercel Usage tab)

The 90-second dashboard check is Brandon's. Tell him + give the URL.

## When idle (no Brandon activity, no fleet flow)

The "no breaks until $30k MRR" rule applies. Pick from the standing initiatives list in 06-CURRENT-STATE.md. Default candidates:
- Sponsor outreach drafts (HHH)
- Content batch generation (HHH FB posts)
- MMM hub copy/photos audit
- FF UX bug list
- Research on the Sunday auto-spawn opportunity

## When Brandon disagrees

He's right by default — he's the decider. But if his framing seems off or you have evidence to the contrary, say so. Plain language. Once. Then go his direction unless he changes course.
