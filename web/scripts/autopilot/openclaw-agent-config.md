# OpenClaw Autopilot Agent Configuration

## Agent: content-autopilot

Add to `~/.openclaw/openclaw.json` agents list:

```json
{
  "id": "content-autopilot",
  "name": "content-autopilot",
  "workspace": "/Users/brandonglomski/tts-engine/web",
  "agentDir": "/Users/brandonglomski/.openclaw/agents/content-autopilot/agent",
  "identity": {
    "name": "ContentPilot",
    "theme": "rocket",
    "emoji": "🚀"
  }
}
```

## Cron Job Setup

Add to OpenClaw cron (`openclaw cron add`):

### Daily Content Ideas (7:00 AM EST)

```bash
openclaw cron add \
  --name "Daily Content Ideas" \
  --schedule "0 7 * * *" \
  --timezone "America/New_York" \
  --agent content-autopilot \
  --task "cd /Users/brandonglomski/tts-engine/web && npx ts-node scripts/autopilot/daily-content-ideas.ts <USER_ID>"
```

Replace `<USER_ID>` with the actual Supabase user UUID.

### Send Telegram Notification

After the script runs, send a summary to Telegram:

```
🚀 3 new content ideas ready in your queue:
1. Portable Blender - POV solution to meal prep (TikTok)
2. LED Strip Lights - Transform your space (YouTube Shorts)
3. Wireless Charger - Stop tangled cables (Instagram Reels)

Open FlashFlow to review and approve →
```

## Telegram Commands

Configure these commands in the main OpenClaw agent:

- `/ideas` — Trigger content idea generation on demand
- `/queue` — Show today's posting queue status
- `/autopilot on|off` — Enable/disable daily auto-generation

## Implementation Example

```typescript
// In main OpenClaw agent
if (message === '/ideas') {
  const result = await exec('npx ts-node scripts/autopilot/daily-content-ideas.ts <USER_ID>');
  const summary = JSON.parse(result.stdout);
  
  sendMessage(`🚀 Generated ${summary.count} content ideas:\n` +
    summary.ideas.map(i => `• ${i.product} - ${i.angle} (${i.platform})`).join('\n') +
    '\n\nOpen FlashFlow to review →'
  );
}
```

## Database Migration Required

The `posting_queue` table must exist in Supabase. Run this migration:

```sql
CREATE TABLE IF NOT EXISTS posting_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube_shorts', 'youtube_long', 'instagram', 'twitter')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted', 'failed')),
  script_id UUID REFERENCES saved_skits(id),
  video_id UUID REFERENCES videos(id),
  caption TEXT,
  hashtags TEXT[],
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  posted_url TEXT,
  platform_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_posting_queue_user ON posting_queue(user_id);
CREATE INDEX idx_posting_queue_status ON posting_queue(status);
CREATE INDEX idx_posting_queue_scheduled ON posting_queue(scheduled_at);

ALTER TABLE posting_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own posts" ON posting_queue
  FOR ALL USING (auth.uid() = user_id);
```

## Environment Variables Required

Ensure these are set in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

## Cost Estimate

- Claude Haiku API call: ~$0.25 per 1M tokens
- Daily generation (3 ideas): ~500 tokens = $0.0001
- Monthly cost (30 days): ~$0.003

Effectively free for daily automation.
