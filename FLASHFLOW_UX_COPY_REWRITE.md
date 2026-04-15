# FlashFlow UX Copy Rewrite

Before/after naming changes applied in this pass. The goal is plain, creator-friendly language that a first-time TikTok Shop affiliate can understand without translation.

## Mobile dashboard (`/admin/dashboard`)

| Old label | New label | Why |
|---|---|---|
| What's next, brandon? | Hey brandon — let's keep it moving | Warmer, less robotic; "keep it moving" is creator-speak and has momentum built in |
| Your content command center | Here's what needs your attention today. | Concrete and useful; "command center" is enterprise jargon |
| 3 steps to your first winning script | Start here — 3 quick steps | Action-led, shorter, obvious |
| Most creators see results within 10 minutes | Most creators post their first video within 10 minutes. | Results is vague; "post their first video" is measurable |
| Generate your first script | Write your first script | "Write" is the verb creators know |
| Check your Winners Bank | See top ideas | "Winners Bank" is internal jargon; "top ideas" is plain |
| Scripts | Scripts written | Stat needs a verb to be meaningful |
| Campaigns | Content plans | "Campaign" implies marketing agency; creators plan content |
| Posted | Videos posted | Clarifies the unit being counted |
| Where to start | Your next step · Pick one to get moving. | Directive with a subhead explaining the choice |
| Your next moves | What to do next · Pick up where you left off. | Plain-English section header with context |
| Generate a script | Write a script | Verb creators use |
| Study a winning video | Break down a TikTok | "Study" is too school-y; "break down" is native creator speak |
| See what's converting | See what's working | "Converting" is marketer-speak |
| Production Pipeline | Where your videos are · Tap a stage to jump in. | Factory jargon → plain description + nudge |
| Editing Queue | In editing | Matches pill label; no unnecessary word |
| Ready to Post | Ready to post | Sentence case |
| Posted This Week | Posted this week | Sentence case |
| Up Next | Up next today | Adds time horizon |
| Winning Content | Top ideas right now | Readable, consistent with Winners Bank rename |
| No winners yet. Post content to discover what works! | Post a few videos and we'll surface the hooks that are working best. | Empty state explains what and why |
| Quick Access | Shortcuts | One word, obvious |
| Create Content | Create a video | Tells you what you're creating |
| Hook Generator | Hook ideas | "Generator" feels mechanical |
| Winners Bank | Top ideas | Unified naming |
| Pipeline | My videos | Possessive + plain |
| Generate Content (empty-state CTA) | Create a video | Direct action |

## Next-action labels (`lib/videos/nextAction.ts`)

These drive the "What to do next" cards and buttons across the app.

| Old label | New label | Why |
|---|---|---|
| Fix Blockers | Fix what's missing | Plain; "blocker" is eng/PM jargon |
| Record Now | Record it | Less demanding, friendlier |
| Upload Footage | Upload footage | Sentence case |
| Review Edit | Review the edit | Flows better |
| Continue Draft | Finish draft | Momentum, not just "continue" |
| Edit Video | Finish editing | Progress-oriented |
| **Generate Post Package** | **Get it ready to post** | "Post package" is product-internal; "ready to post" is what it actually does |
| Post Now / Post Today | Post it / Post it today | More natural |
| Add Post URL | Add the live link | "Live link" is what creators call the TikTok URL |
| View Insights | See how it's doing | Everyday language |
| Retry | Try again | Friendlier |
| Record Next Video | Record this one | Directive, referring to the current card |
| Approve Edit | Review the edit | Already reviewed → keep consistent |

## Bottom navigation (`components/MobileBottomNav.tsx`)

| Old label | New label | Why |
|---|---|---|
| Studio | Create | Verb; matches what the tab does (make a new video) |
| Videos | Videos | Kept — clear enough |
| Planner | Plan | Shorter verb; matches page title |
| Winners | Ideas | Beginner-friendly; pairs with "Top ideas" page title |
| More | More | Kept |
| YT Transcribe | YouTube | Abbreviation was ugly |
| Library | Scripts | Library is too generic |
| Analytics | Stats | Plain |

## Page-level headers

| Screen | Old H1 | New H1 | New subhead |
|---|---|---|---|
| `/admin/content-studio` | Content Studio | Create a video | Pick a format, add your product, and we'll write the script. |
| `/admin/pipeline` (empty state) | Your Production Board | Your videos live here | Track every video from draft to posted. |
| `/admin/calendar` | Content Planner | Plan | Schedule your videos and map out the week ahead. |
| `/admin/intelligence/winners-bank` | Winners Bank | Top ideas | Hooks and formats working best right now. |
| `/admin/content-studio` (welcome banner) | Welcome to Content Studio | Welcome — let's make your first video | Type a product name, pick a style, tap Write script. |
| Winners Bank button | Run Detection | Find new ideas | — |

## Status pill labels (consistent across screens)

| Old | New |
|---|---|
| Draft | Draft |
| Editing | In editing |
| Ready | Ready to post |
| Posted | Posted |
