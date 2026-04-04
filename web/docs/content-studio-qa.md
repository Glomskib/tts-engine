# Content Studio QA Checklist

Manual QA for the creation workspace after the UX consolidation pass.

## Content Studio (`/admin/content-studio`)

- [ ] Page loads, title shows "Content Studio"
- [ ] Subtitle says "Write scripts for any content type — pick a format, add your product, and go"
- [ ] Header shows: Talk Through It, What should I film today?, **Hooks** link, **Library** link
- [ ] Hooks link navigates to `/admin/hook-generator`
- [ ] Library link navigates to `/admin/script-library`
- [ ] Mode toggle shows "Write with AI" (not "AI Generate")
- [ ] Simple mode helper text: "Pick a product, choose a style, and go."
- [ ] Generate button says "Write Script (X credits)"
- [ ] Loading state says "Writing..." (not "Generating...")
- [ ] Mobile fixed bottom bar button says "Write Script"
- [ ] Empty state says "Select a product to start" (not "to generate")
- [ ] Welcome banner says "hit Write Script to get your first script"
- [ ] AI chat nudge says "Make the CTA hit harder" (not "compelling")
- [ ] Results → script displays correctly
- [ ] "Approve & Send" workflow completes without error
- [ ] "Save to Library" workflow completes

## Hooks (`/admin/hook-generator`)

- [ ] Page title: "Hooks"
- [ ] Subtitle: "Make hooks that stop the scroll — visual, text, and verbal, ready to film"
- [ ] Cross-link to Content Studio visible at top
- [ ] Button says "Make Hooks"
- [ ] Loading state says "Making hooks..." (not "Generating...")
- [ ] Toast on success: "X hooks ready"
- [ ] Toast on error: "Hooks failed — try again"
- [ ] Results header: "X Hooks" (not "X Hooks Generated")
- [ ] Each hook card shows "Use in Studio" button (violet)
- [ ] "Use in Studio" navigates to Content Studio with hook pre-filled
- [ ] "Copy" button works with 2-second feedback

## Saved Scripts (`/admin/script-library`)

- [ ] Page title: "Saved Scripts"
- [ ] Breadcrumb: "Admin / Saved Scripts"
- [ ] Subtitle: "Your saved scripts — browse, reuse, or turn into videos"
- [ ] Empty state title: "Your Saved Scripts"
- [ ] Empty state CTA: "Write a Script" → `/admin/content-studio`
- [ ] "Transcribe a Winner" link → `/admin/transcribe`

## Comment Replies (`/admin/tools/tok-comment`)

- [ ] Page title: "Comment Replies"
- [ ] Subtitle: "Make a comment reply sticker — transparent PNG, ready for your video overlay"
- [ ] Cross-links visible: Content Studio, Hooks
- [ ] TokCommentTool renders and works

## Transcriber (`/admin/transcribe`)

- [ ] YouTube link visible at top: "Need to transcribe a YouTube video instead?"
- [ ] Link navigates to `/admin/youtube-transcribe`
- [ ] TranscriberWorkspace loads
- [ ] Paste TikTok URL → transcript appears
- [ ] "Write Script" toggle opens Script Writer panel
- [ ] Panel header says "Script Writer" (not "Script Generator")
- [ ] Script button says "Write Script" / "Rewrite Script" / "Writing..."
- [ ] Error message: "Script failed — try again" (not "Failed to generate script")
- [ ] "Chat With Transcript" opens chat panel
- [ ] Chat greeting says "Write a new script" (not "Generate")
- [ ] Vibe Analysis Card loads after clicking "Analyze"
- [ ] "Write In This Style" button works (not "Generate In This Style")
- [ ] Vibe badge shows "Writing in style: ..." (not "Generating in style")
- [ ] Save to Content Item works
- [ ] "Write Script From This" button works in concept suggestions

## YouTube Transcriber (`/admin/youtube-transcribe`)

- [ ] Cross-links visible at top: TikTok Transcriber, Content Studio
- [ ] YouTubeTranscriberCore loads and transcribes

## Public Pages

- [ ] `/script-generator` — headline: "Write TikTok scripts that actually convert"
- [ ] `/script-generator` — button: "Write My Script" / "Writing your script..."
- [ ] `/script-generator` — "Write Another" button
- [ ] `/script-generator` — FAQ uses creator-native language
- [ ] `/transcribe` — subtitle no "AI-powered"
- [ ] `/transcribe` — CTA says "Write a Script Free"
- [ ] `/youtube-transcribe` — subtitle no "AI-powered"
- [ ] `/youtube-transcribe` — CTA says "Write a Script Free"

## Navigation

- [ ] CREATE section shows 5 items: Content Studio, Hooks, Saved Scripts, Comment Replies, Transcriber
- [ ] "YT Transcriber" is NOT in navigation
- [ ] `/admin/youtube-transcribe` route still works when accessed directly
- [ ] All nav items navigate correctly

## Cross-Links (Route Coherence)

- [ ] Content Studio → Hooks link works
- [ ] Content Studio → Library link works
- [ ] Hooks → Content Studio link works
- [ ] Hooks → "Use in Studio" per hook works
- [ ] Saved Scripts → Content Studio (Write a Script) works
- [ ] Saved Scripts → Transcriber (Transcribe a Winner) works
- [ ] Comment Replies → Content Studio link works
- [ ] Comment Replies → Hooks link works
- [ ] Transcriber → YouTube Transcriber link works
- [ ] YouTube Transcriber → TikTok Transcriber link works
- [ ] YouTube Transcriber → Content Studio link works

## Mobile

- [ ] Content Studio form stacks properly on mobile
- [ ] Content Studio bottom bar shows "Write Script" button
- [ ] Hook Generator form and results stack properly
- [ ] Transcriber input and results stack properly
- [ ] Nav items accessible from mobile sidebar
