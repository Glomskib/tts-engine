# Transcriber Vibe Analysis

## Overview

The Video Vibe Analysis system analyzes short-form video transcripts to detect delivery style, pacing, visual rhythm, and CTA tone. It produces human-readable labels and "Recreate This Vibe" guidance that helps creators understand WHY a video works and recreate its energy without copying.

## Architecture

### Pipeline

```
Transcription (existing)
    ↓ transcript + segments + duration
Pacing Signal Extraction (deterministic, ~1ms)
    ↓ words_per_minute, pause_frequency, hook density, etc.
AI Interpretation (Claude Haiku 4.5, ~2-5s)
    ↓ delivery_style, pacing_style, hook_energy, visual_style, etc.
Frontend Display (VibeAnalysisCard)
    ↓ labels, timing arc, recreate guidance
Generation Integration (optional)
    ↓ vibe context injected into hook/script prompts
```

### Two-Tier Approach

1. **Heuristic Classification** — Pure functions in `signals.ts` and `interpret.ts` that classify delivery style, pacing, and hook energy from transcript timing data. Instant, deterministic, no AI cost. Used as fallback if AI fails.

2. **AI Interpretation** — Claude Haiku 4.5 refines heuristic guesses and adds visual analysis, CTA tone, reveal timing, and recreate-this-vibe guidance. Multimodal (accepts frames when available).

## Files

| File | Purpose |
|------|---------|
| `lib/vibe-analysis/types.ts` | All type definitions, label records, enums |
| `lib/vibe-analysis/signals.ts` | Deterministic signal extraction from segments |
| `lib/vibe-analysis/interpret.ts` | Heuristic classifiers + AI interpretation |
| `lib/vibe-analysis/prompt-context.ts` | Builds prompt context for hook/script generation |
| `lib/vibe-analysis/index.ts` | Barrel export |
| `app/api/transcribe/vibe/route.ts` | POST endpoint for vibe analysis |
| `components/VibeAnalysisCard.tsx` | Frontend display component |

## Tools / Libraries

| Tool | Purpose | Why |
|------|---------|-----|
| Whisper segments | Transcript timing data | Already in pipeline, provides start/end/text per segment |
| ffmpeg (existing) | Frame extraction | Already installed, used by creator-style system |
| Claude Haiku 4.5 | AI interpretation | Fast, cheap, supports vision for frame analysis |
| Heuristic classifiers | Instant fallback | Zero cost, deterministic, testable |

## Normalized Labels

### Delivery Style
- `high_energy_punchy` — High-energy & punchy
- `calm_direct` — Calm & direct
- `skeptical_conversational` — Skeptical & conversational
- `deadpan_sharp` — Deadpan & sharp
- `chaotic_fast` — Chaotic & fast
- `nurturing_soft` — Nurturing & soft
- `urgent_direct` — Urgent & direct
- `playful_casual` — Playful & casual
- `authoritative_measured` — Authoritative & measured

### Pacing Style
- `fast_hook_medium_body` — Fast hook, medium body, quick CTA
- `slow_build_fast_payoff` — Slow build, fast payoff
- `steady_explainer` — Steady explainer pace
- `rapid_fire` — Rapid-fire throughout
- `punchy_short_beats` — Punchy short beats
- `conversational_flow` — Conversational flow

### Hook Energy
- `immediate` — Immediate
- `building` — Building
- `delayed` — Delayed

### Visual Style
- `talking_head`, `demo_led`, `montage_led`, `mixed`, `screen_recording`, `text_overlay_driven`

### Visual Rhythm
- `fast_cut`, `medium_cut`, `slow_cut`, `static`

### CTA Tone
- `casual_direct`, `soft_suggestive`, `aggressive_push`, `community_prompt`, `curiosity_close`, `no_cta`

### Reveal Timing
- `immediate`, `mid_video`, `delayed_payoff`

## Frontend UX

The VibeAnalysisCard appears after transcript analysis on the Transcriber page. It:
1. Shows as a collapsed card with "Video Vibe" header
2. User clicks to trigger analysis (one-click, no configuration)
3. Displays:
   - Delivery Style, Pacing, Hook Energy, Visual Rhythm (2x2 grid of labeled pills)
   - CTA Tone + Reveal Timing (side by side)
   - Timing Arc (visual bar showing hook → explain → proof → CTA proportions)
   - Recreate This Vibe (3-6 actionable bullets in plain language)
4. Optional "Generate In This Style" button for generation integration

**Frontend rules:**
- No technical jargon (no MFCC, spectral centroid, formants, RMS)
- Simple labels and descriptions only
- Creator-friendly language throughout

## Generation Integration

### Hook Generator
Pass vibe context using `buildVibePromptContext(vibe)`:
```
=== REFERENCE VIDEO VIBE (recreate this energy, NOT the words) ===
Delivery: High-energy & punchy
Pacing: Fast hook, medium body, quick CTA
Hook Energy: Immediate
Visual Rhythm: Fast-cut
CTA Tone: Casual & direct
Reveal: Immediate reveal

How to recreate this vibe:
  - Open with a blunt statement in the first 2 seconds
  - Keep cuts rapid through the hook
  - ...
===
```

### Script Generator
Same context block injected into `unified-script-generator.ts` prompt assembly.

## Storage

### Migration: `20260420100000_vibe_analysis.sql`

1. `content_item_transcripts.vibe_analysis` — JSONB column for content pipeline integration
2. `transcriber_vibe_analyses` — Standalone table for public transcriber results
   - `user_id`, `ip`, `source_url`, `transcript_text`, `duration_seconds`, `vibe_analysis`, `analysis_version`

## Current Limitations

- Visual analysis requires video frames (TikTok only in Phase 1; YouTube transcriber doesn't download video)
- Visual style/rhythm for YouTube defaults to AI text inference (no actual frame analysis)
- No audio prosody analysis (pitch, loudness) — would require audio processing library (Phase 2)
- Timing arc is AI-estimated, not precisely measured from waveform
- Cross-video vibe averaging not yet implemented (Phase 2)

## Phase Roadmap

### Phase 1 (Current)
- Transcript-based pacing/delivery analysis
- AI interpretation with optional frame analysis
- Simple vibe summary UI
- Generation integration via prompt context

### Phase 2
- Audio prosody analysis (librosa or equivalent)
- Richer voice packs tied to vibe labels
- Creator-style averaging across multiple analyzed videos
- Gesture/face/product timing detection

### Phase 3
- Full multimodal creator fingerprinting
- Cross-video style aggregation
- Premium-level style matching
- Vibe-based content recommendations
