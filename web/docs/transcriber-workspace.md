# Transcriber Workspace

## Overview

Upgrades the Transcriber page from a standalone utility into a source-to-script workspace. Users can go from transcript to script to revisions to content item without leaving the page.

## Architecture

```
Admin Transcribe Page
  → TranscriberWorkspace (layout wrapper)
    → TranscriberCore (existing 1982-line component, unchanged except event dispatch)
    → Side Panel (420px, slides open on transcript ready)
      → Script Tab: full script generation from transcript context
      → Chat Tab: transcript-grounded AI chat for iteration
```

## Workflow

1. User pastes a TikTok URL and transcribes
2. TranscriberCore dispatches `transcriber:result` custom event with transcript + analysis
3. Workspace side panel auto-opens
4. User can:
   - **Script tab**: Configure angle/persona/tone/length, generate a production script, save to Content Studio
   - **Chat tab**: Ask questions about the transcript, get hook alternatives, iterate on scripts

## Script Generator

Generates original scripts inspired by the transcript. Powered by Claude Sonnet for quality.

### Configuration Options
- **Angle**: Educational, Testimonial, Story, Problem/Solution, Hot Take, Listicle, Before/After
- **Persona**: Skeptic, Educator, Hype Man, Honest Reviewer, Relatable Friend, Storyteller
- **Tone**: Conversational, High Energy, Empathetic, Authoritative, Raw & Authentic
- **Length**: 15s, 30s, 45s, 60s
- **Product**: Optional product to promote
- **Instructions**: Free-text additional direction

### Output
- Hook, Setup, Body, CTA (structured sections)
- Full spoken script (complete voiceover)
- On-screen text overlays
- Filming notes
- Estimated video length

### Save Flow
Generated scripts can be saved as content items via `POST /api/content-items` with:
- `source_type: 'script_generator'`
- `status: 'scripted'`
- `primary_hook`, `script_text`, `creative_notes`

## AI Chat

Transcript-grounded chat assistant. Has full context of:
- Original transcript (up to 3000 chars)
- Video analysis (hook, format, pacing, key phrases, triggers)
- Any active rewrite from TranscriberCore
- Any generated script from the Script tab
- Conversation history (last 10 messages)

Uses Claude Haiku for fast responses. Includes quick-prompt buttons for common questions.

## API Endpoints

### POST /api/transcribe/generate-script
Generates a production-ready script from transcript context.

**Request:**
```json
{
  "transcript": "string (required)",
  "analysis": { ... },
  "angle": "problem_solution",
  "persona": "skeptic",
  "tone": "conversational",
  "targetLength": "30_sec",
  "productName": "optional string",
  "instructions": "optional string"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "hook": "string",
    "setup": "string",
    "body": "string",
    "cta": "string",
    "full_script": "string",
    "on_screen_text": ["string"],
    "filming_notes": "string",
    "estimated_length": "string",
    "angle_used": "string",
    "persona_used": "string",
    "tone_used": "string"
  }
}
```

### POST /api/transcribe/workspace-chat
Transcript-grounded AI chat.

**Request:**
```json
{
  "message": "string (required)",
  "transcript": "string (required)",
  "analysis": { ... },
  "rewriteResult": { ... },
  "generatedScript": "string",
  "history": [{ "role": "user|assistant", "content": "string" }]
}
```

**Response:**
```json
{
  "ok": true,
  "response": "string"
}
```

## Key Files

| File | Purpose |
|------|---------|
| `components/TranscriberWorkspace.tsx` | Workspace layout with side panel |
| `components/TranscriberCore.tsx` | Original component (added event dispatch) |
| `app/admin/transcribe/page.tsx` | Admin page using workspace |
| `app/api/transcribe/generate-script/route.ts` | Script generation API |
| `app/api/transcribe/workspace-chat/route.ts` | Grounded chat API |

## Design Decisions

- **Event-based integration**: TranscriberCore dispatches a `transcriber:result` CustomEvent rather than requiring a prop-based refactor of the 1982-line component. Clean, minimal change.
- **Side panel**: 420px fixed panel that slides open — keeps the main transcriber experience intact while adding workspace tools.
- **Sonnet for scripts, Haiku for chat**: Scripts need quality (Sonnet), chat needs speed (Haiku).
- **Public pages unaffected**: Only the admin transcribe page uses the workspace. Public pages still render TranscriberCore directly.
