# FlashFlow Content Autopilot

## What it does

Automated content pipeline that generates daily script ideas based on:
- Your active products and brands
- Top-performing content patterns (winners bank)
- Saved pain points and customer archetypes
- Platform trends (when research bot data is available)

## How to run

### Manual

```bash
npx ts-node scripts/autopilot/daily-content-ideas.ts <user_id>
```

### Via OpenClaw

Message `@Flashflow_claw_bot` with `/ideas`

### Via Cron

Configured in OpenClaw to run daily at 7 AM EST

## Output

Content ideas are saved to `posting_queue` as drafts with:
- Platform recommendation (TikTok, YouTube Shorts, Instagram Reels)
- Content angle ("POV: You finally found...")
- Suggested hook (scroll-stopping opener)
- Caption (ready to post)
- Hashtags (5-7 relevant tags)

## Architecture

```
1. ScraperBot → finds trending products (future)
2. ResearchBot → analyzes competitor content (future)
3. ContentPilot → generates ideas + hooks + drafts ← YOU ARE HERE
4. Results land in posting_queue as drafts
5. Telegram notification sent to creator
6. Creator reviews, edits, approves in FlashFlow UI
```

## Files

- `daily-content-ideas.ts` — Main script (generates 3 ideas)
- `openclaw-agent-config.md` — OpenClaw integration guide
- `README.md` — This file

## Database Requirements

The script requires the `posting_queue` table to exist. See `openclaw-agent-config.md` for the migration SQL.

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

## Future Enhancements

- **ScraperBot**: Auto-detect trending products on TikTok Shop
- **ResearchBot**: Pull competitor scripts from transcriber data
- **Pattern Recognition**: Identify winning formulas automatically
- **Multi-day Planning**: Generate weekly content calendar
- **A/B Testing**: Create variations for each idea
- **Performance Tracking**: Close the loop — track which ideas convert

## Testing

```bash
# Test with your user ID
npx ts-node scripts/autopilot/daily-content-ideas.ts <your_user_uuid>

# Expected output:
# ✅ Autopilot Complete!
# {
#   "count": 3,
#   "ideas": [
#     {
#       "product": "Product X",
#       "angle": "POV: You found the solution",
#       "platform": "tiktok"
#     }
#   ]
# }
```

## Troubleshooting

**"ANTHROPIC_API_KEY not set"**
- Add `ANTHROPIC_API_KEY=sk-ant-...` to `.env.local`

**"products: null"**
- User has no active products — script will suggest "General niche content" instead

**"Failed to parse AI response"**
- AI returned malformed JSON — check API logs and retry

**"relation posting_queue does not exist"**
- Run the migration SQL from `openclaw-agent-config.md`
