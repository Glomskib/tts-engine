# Marketing Pipeline — CLI Tools

All tools required for the FlashFlow Marketing Engine. Run `scripts/setup/marketing-clis.sh --check` to verify.

## A) Core Shell/Data Tooling

| Tool | Purpose | Install | Verify |
|------|---------|---------|--------|
| jq | JSON processing in shell scripts | `brew install jq` | `jq --version` |
| yq | YAML processing (config parsing) | `brew install yq` | `yq --version` |
| ripgrep | Fast code/log search | `brew install ripgrep` | `rg --version` |
| fd | Fast file finder | `brew install fd` | `fd --version` |
| curl | HTTP requests (pre-installed) | — | `curl --version` |
| git | Version control (pre-installed) | — | `git --version` |

## B) Media + Creative Pipeline

| Tool | Purpose | Install | Verify |
|------|---------|---------|--------|
| ffmpeg | Video/audio processing, clip extraction, resizing, format conversion | `brew install ffmpeg` | `ffmpeg -version` |
| imagemagick | Image compositing, resizing, watermarking for static creatives | `brew install imagemagick` | `magick --version` |
| exiftool | Read/write image/video metadata (EXIF, IPTC) | `brew install exiftool` | `exiftool -ver` |
| python3 | Python runtime for CLI tools | Pre-installed | `python3 --version` |
| pipx | Isolated Python CLI installs | `brew install pipx` | `pipx --version` |
| playwright | Headless browser for HTML→PNG rendering | `npx playwright install` | `npx playwright --version` |

## C) Developer/Infra Tools

| Tool | Purpose | Install | Verify |
|------|---------|---------|--------|
| gh | GitHub CLI (PRs, issues, releases) | `brew install gh` | `gh --version` |
| supabase | DB migrations, local dev, schema management | `brew install supabase/tap/supabase` | `supabase --version` |
| vercel | Deploy, env management, preview URLs | `npm install -g vercel` | `vercel --version` |
| late | Social media scheduling across 13 platforms | `npm install -g @getlatedev/cli` | `late --version` |

## D) Content Ingestion

| Tool | Purpose | Install | Verify |
|------|---------|---------|--------|
| yt-dlp | Fetch video/audio for repurpose pipelines (manual use only — respect ToS) | `brew install yt-dlp` | `yt-dlp --version` |

## Setup

```bash
# Install all missing + verify
scripts/setup/marketing-clis.sh

# Check only (no installs)
scripts/setup/marketing-clis.sh --check
```
