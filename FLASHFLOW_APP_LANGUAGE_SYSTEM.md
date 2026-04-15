# FlashFlow App Language System

A single source of truth for how FlashFlow talks to creators. If you're writing a new screen, button, toast, or empty state, start here.

## Who we're writing for

TikTok Shop affiliates and first-time content creators. Assume they have never used a creator tool before. Assume they skim. Assume they're on a phone. Write like a friendly, competent coach — never like a SaaS vendor.

## Core product terms (use these exact words)

| Concept | Use | Don't use |
|---|---|---|
| The thing a creator makes and posts | **Video** | content, asset, creative, submission |
| The text FlashFlow writes for a video | **Script** | copy, dialogue, voiceover text (script is familiar to affiliates) |
| Publishing a video | **Post** / **Posted** / **Ready to post** | Publish, submit, ship, go live |
| A scheduled set of videos | **Content plan** | Campaign, production batch, initiative |
| A high-performing hook or format | **Idea** / **Top idea** | Winner, winning pattern, winner asset |
| The place to make a new video | **Create** | Studio, workshop, builder |
| The page that lists their videos | **Videos** | Pipeline, production board, queue |
| The scheduling/calendar page | **Plan** | Planner, calendar, content planner |
| The page showing top hooks | **Top ideas** | Winners Bank, intelligence, insights |
| The user's connected account | **Account** | Profile, handle, channel |
| A product they're promoting | **Product** | SKU, item, offer |

## Banned terms (replace on sight)

- **command center** — enterprise software vibe
- **production pipeline / production board** — factory metaphor, not creator language
- **post package** — internal implementation term; use "ready to post"
- **generate** (as a CTA verb) — prefer "write", "create", or "make"
- **asset** — corporate
- **winner asset** / **winner pattern** — opaque
- **campaign** — only use if the user is literally running a paid promo; otherwise "content plan"
- **studio** — vague; use "Create" if you mean the make-a-video screen
- **blocker** — engineering jargon; use "what's missing" or "needs X"
- **detection** — use "find ideas"
- **conversion / converting** — use "what's working"
- **insights** (as a page name) — use "stats" or "how it's doing"

## Status labels (single system, used everywhere)

All UI surfaces (pills, filters, counts, toasts) render these labels. Backend enum values stay unchanged — this is a UI layer.

| DB value | UI label | Color family | Used for |
|---|---|---|---|
| `draft` | Draft | zinc/neutral | Not started or not yet recorded |
| `needs_edit` | In editing | blue | Footage uploaded, being edited |
| `ready_to_post` | Ready to post | emerald | Edited, awaiting caption/post |
| `posted` | Posted | purple | Live on platform |
| `failed` | Needs attention | red | Something broke |
| `archived` | Archived | zinc/muted | Hidden from flow |

## Navigation system

Bottom nav is 5 slots. First slot is always Create. Last slot is always More. Middle 3 are user-customizable, defaulting to:

1. **Create** — start a new video (`/admin/content-studio`)
2. **Videos** — all my videos (`/admin/pipeline`)
3. **Plan** — schedule (`/admin/calendar`)
4. **Ideas** — top hooks and formats (`/admin/intelligence/winners-bank`)
5. **More** — drawer for everything else

Page titles match the nav label. Never diverge.

## CTA button rules

1. **Lead with a verb.** "Write a script", not "Script generator".
2. **Use lowercase sentence case.** "Create a video", not "Create A Video".
3. **Be specific about the object.** "Post it" > "Post". "Add the live link" > "Add link".
4. **No gerunds as CTAs.** "Edit" not "Editing". Except for "Finish editing" where it describes state.
5. **No system words.** Never "Submit", "Run", "Execute", "Generate" on a user-facing button.
6. **Default to 2–3 words.** Anything longer needs a reason.

Approved CTA patterns:

- Create a video
- Write a script
- Write script (inline, when "a script" context is clear)
- Finish editing
- Review the edit
- Get it ready to post
- Post it / Post it today
- Plan content
- See top ideas
- Find new ideas
- Connect account
- Add product
- Start here

## Empty-state rules

Every empty section must answer three questions in order:

1. **What is this?** One short sentence.
2. **Why is it empty?** Acknowledge the state honestly.
3. **What do I do next?** One concrete action, usually a button.

Example (good):

> **Up next today**
> Nothing in your queue yet. Start a video and it'll show up here.
> [ Create a video ]

Example (bad — current):

> No winners yet. Post content to discover what works!

The rewrite:

> **Top ideas right now**
> Post a few videos and we'll surface the hooks that are working best.

Do not write "No data." Do not write "Empty." Do not end empty states with an exclamation mark.

## Toast & alert rules

- **Success**: past tense, specific. "Script saved." not "Success!"
- **Error**: what broke + what to try. "Couldn't save — check your connection." not "Error occurred."
- **Progress**: present continuous. "Writing your script…" not "Loading."
- **One line max.** If you need more, it belongs in an inline banner, not a toast.

## Section heading rules

- Sentence case.
- Describe what's under it, not what the system calls it.
  - Good: "Where your videos are"
  - Bad: "Production Pipeline"
- Add a 1-line subhead when the heading alone doesn't tell the user what to do.

## Tone

- Warm but not cute. No emoji salad. One emoji in a greeting is fine; never in body copy.
- Use contractions. "Let's", "we'll", "you're".
- Never "Please." Just say the thing.
- Address the user as "you". Never "the user".
- FlashFlow refers to itself as "we" only when explaining what the system does. Default is to be invisible.

## Review checklist (run before shipping any new screen)

- [ ] Would a brand-new affiliate understand every label without hovering for a tooltip?
- [ ] Is every CTA a verb + object?
- [ ] Are status labels from the system table, not ad-hoc?
- [ ] Does each empty state explain what, why, and what's next?
- [ ] No banned terms present (grep for them)?
- [ ] Page title matches the nav label that got them here?
