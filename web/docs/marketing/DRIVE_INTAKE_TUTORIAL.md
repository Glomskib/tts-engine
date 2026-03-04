# Google Drive Intake Connector — Setup & Tutorial

## Overview

The Drive Intake Connector automatically imports videos from a Google Drive folder into your FlashFlow pipeline. When you upload a video to your designated folder, FlashFlow will:

1. Detect the new video file
2. Download and store it securely
3. Transcribe the audio (OpenAI Whisper)
4. Generate editing notes (AI-powered)
5. Create a pipeline item ready for editing

## Recommended Setup

### Folder Structure

```
Google Drive/
  FlashFlow Intake/
    Raw Footage/          <-- Upload your videos HERE
```

Use the "Create Recommended Folder" button in FlashFlow to automatically create this structure.

### What Gets Created

For each video uploaded, FlashFlow creates:

| Item | Description |
|------|-------------|
| **Pipeline item** | Video row with code `INT-XXXX`, status `RECORDED` |
| **Stored video** | Securely copied to FlashFlow storage |
| **Transcript** | Full text + timestamped segments via Whisper |
| **Edit notes** | Summary, chapters, hooks, cut list, B-roll, captions, CTA variants, export checklist |

## Step-by-Step Setup

### 1. Connect Google Drive

1. Go to **Pipeline > Drive Intake** in FlashFlow
2. Click **Connect Google Drive**
3. Sign in with your Google account (Gmail or Google Workspace)
4. Grant read access to Drive files
5. You'll be redirected back to FlashFlow

### 2. Create or Select a Folder

**Option A: Create Recommended Folder** (recommended)
- Click "Create Recommended Folder"
- FlashFlow creates `FlashFlow Intake / Raw Footage` in your Drive
- The Raw Footage folder is auto-selected

**Option B: Select Existing Folder**
- Click "Select Folder"
- Search for your folder by name
- Click to select it

### 3. Upload Videos

Upload video files to your selected folder using:
- **Web**: drag-and-drop at [drive.google.com](https://drive.google.com)
- **Phone**: Google Drive app → "+" → Upload
- **Desktop**: Google Drive Desktop app (auto-sync)
- **Other apps**: "Save to Drive" feature

**Supported formats**: MP4, MOV, WebM, AVI, MKV, 3GP, WMV, MPEG
**Minimum size**: 500KB (smaller files are skipped)

### 4. Automatic Processing

FlashFlow checks your folder every 5 minutes (configurable). Processing takes 1-5 minutes per video depending on length.

### 5. Review in Pipeline

Find your videos in the [Production Board](/admin/pipeline) with code prefix `INT-`. Each item includes:
- Stored video file (streamable URL)
- Full transcript in recording notes
- AI edit notes in editor notes field

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Poll interval | 5 min | How often FlashFlow checks for new files |
| Create pipeline item | On | Auto-create video row in pipeline |
| Auto-transcribe | On | Transcribe via OpenAI Whisper |
| Generate edit notes | On | AI-powered editing brief |

## Troubleshooting

### Status shows ERROR
Your Google token may have expired. Click **Reconnect** to re-authenticate.

### Videos not appearing
- Verify files are in the **correct folder** (not a subfolder)
- Confirm file is a **video format** (not image or document)
- Files under 500KB are skipped
- Check the Activity Log for errors

### Transcription failed
- Files over 25MB audio may need processing time
- Non-English content has lower accuracy
- The video is still imported without transcript

### "Folder creation permission denied"
Click **Reconnect** and ensure you grant the folder creation permission during OAuth.

### "Drive not connected"
Go to Pipeline > Drive Intake and click Connect Google Drive.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_DRIVE_CLIENT_ID` | Yes | Google Cloud OAuth client ID |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Yes | Google Cloud OAuth client secret |
| `GOOGLE_DRIVE_REDIRECT_URI` | Yes | OAuth callback URL (e.g., `https://yourapp.com/api/intake/google/callback`) |
| `DRIVE_TOKEN_ENCRYPTION_KEY` | Yes | 32-byte base64 key for token encryption |
| `OPENAI_API_KEY` | For transcription | OpenAI API key for Whisper |
| `ANTHROPIC_API_KEY` | For edit notes | Anthropic API key for AI edit notes |

### Generate encryption key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Security

- OAuth refresh tokens are encrypted with AES-256-GCM at rest
- Tokens are only readable by server-side code (service role RLS policy)
- FlashFlow never modifies or deletes files in your Drive
- Read-only access by default; write access only used for folder creation
- Each user's data is isolated via RLS policies
