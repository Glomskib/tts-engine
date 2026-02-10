#!/usr/bin/env python3
"""
FlashFlow Voice Handler for Telegram
Processes voice messages sent to the Telegram bot.

Flow:
1. Listens for voice messages from Telegram
2. Downloads the .ogg voice file
3. Transcribes using OpenAI Whisper API (or local whisper.cpp)
4. Sends transcription to OpenClaw gateway as a text message
5. Returns Bolt's response

Usage:
    python3 voice-handler.py

Environment variables:
    TELEGRAM_BOT_TOKEN - Telegram bot API token
    OPENAI_API_KEY - OpenAI API key (for Whisper + TTS)
    OPENCLAW_GATEWAY_URL - OpenClaw gateway URL (default: http://localhost:3579)
    FLASHFLOW_CHAT_ID - Telegram chat ID for FlashFlow
    USE_LOCAL_WHISPER - Set to "true" to use local whisper.cpp instead of API
"""

import os
import sys
import json
import tempfile
import subprocess
import asyncio
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('voice-handler')

# Config
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
OPENCLAW_GATEWAY_URL = os.environ.get('OPENCLAW_GATEWAY_URL', 'http://localhost:3579')
FLASHFLOW_CHAT_ID = os.environ.get('FLASHFLOW_CHAT_ID', '8287880388')
USE_LOCAL_WHISPER = os.environ.get('USE_LOCAL_WHISPER', 'false').lower() == 'true'

try:
    import httpx
except ImportError:
    logger.error("httpx not installed. Run: pip install httpx")
    sys.exit(1)


async def download_voice_file(file_id: str) -> Path:
    """Download a voice message file from Telegram."""
    async with httpx.AsyncClient() as client:
        # Get file path
        resp = await client.get(
            f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getFile',
            params={'file_id': file_id}
        )
        data = resp.json()
        if not data.get('ok'):
            raise ValueError(f"Failed to get file: {data}")

        file_path = data['result']['file_path']

        # Download file
        resp = await client.get(
            f'https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path}'
        )

        # Save to temp file
        tmp = Path(tempfile.mktemp(suffix='.ogg'))
        tmp.write_bytes(resp.content)
        return tmp


async def transcribe_openai(audio_path: Path) -> str:
    """Transcribe audio using OpenAI Whisper API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        with open(audio_path, 'rb') as f:
            resp = await client.post(
                'https://api.openai.com/v1/audio/transcriptions',
                headers={'Authorization': f'Bearer {OPENAI_API_KEY}'},
                files={'file': ('audio.ogg', f, 'audio/ogg')},
                data={'model': 'whisper-1', 'language': 'en'},
            )

        if resp.status_code != 200:
            raise ValueError(f"Whisper API error: {resp.text}")

        return resp.json().get('text', '')


def transcribe_local(audio_path: Path) -> str:
    """Transcribe audio using local whisper.cpp."""
    # Convert OGG to WAV (whisper.cpp needs WAV)
    wav_path = audio_path.with_suffix('.wav')

    try:
        subprocess.run(
            ['ffmpeg', '-i', str(audio_path), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', str(wav_path)],
            capture_output=True, check=True
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        logger.error(f"ffmpeg conversion failed: {e}")
        raise

    try:
        result = subprocess.run(
            ['whisper-cpp', '--model', 'base.en', '--no-timestamps', str(wav_path)],
            capture_output=True, text=True, check=True
        )
        return result.stdout.strip()
    except FileNotFoundError:
        logger.error("whisper-cpp not found. Install: brew install whisper-cpp")
        raise
    finally:
        wav_path.unlink(missing_ok=True)


async def transcribe(audio_path: Path) -> str:
    """Transcribe audio using configured method."""
    if USE_LOCAL_WHISPER:
        return transcribe_local(audio_path)
    return await transcribe_openai(audio_path)


async def generate_tts(text: str) -> Path | None:
    """Generate TTS audio using OpenAI API."""
    if not OPENAI_API_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                'https://api.openai.com/v1/audio/speech',
                headers={
                    'Authorization': f'Bearer {OPENAI_API_KEY}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': 'tts-1',
                    'input': text[:4096],  # API limit
                    'voice': 'alloy',
                    'response_format': 'opus',
                },
            )

            if resp.status_code != 200:
                logger.error(f"TTS API error: {resp.text}")
                return None

            tmp = Path(tempfile.mktemp(suffix='.opus'))
            tmp.write_bytes(resp.content)
            return tmp
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        return None


async def send_to_openclaw(text: str) -> str:
    """Send text to OpenClaw gateway and get response."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f'{OPENCLAW_GATEWAY_URL}/api/agents/flashflow-work/message',
            json={'message': text, 'source': 'telegram-voice'},
        )

        if resp.status_code != 200:
            logger.error(f"OpenClaw error: {resp.text}")
            return "Sorry, I couldn't process that. The gateway returned an error."

        data = resp.json()
        return data.get('response', data.get('message', 'No response'))


async def send_telegram_message(chat_id: str, text: str):
    """Send a text message via Telegram."""
    async with httpx.AsyncClient() as client:
        await client.post(
            f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage',
            json={'chat_id': chat_id, 'text': text, 'parse_mode': 'Markdown'},
        )


async def send_telegram_voice(chat_id: str, audio_path: Path):
    """Send a voice message via Telegram."""
    async with httpx.AsyncClient() as client:
        with open(audio_path, 'rb') as f:
            await client.post(
                f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendVoice',
                data={'chat_id': chat_id},
                files={'voice': ('response.opus', f, 'audio/opus')},
            )


async def handle_voice_message(message: dict):
    """Process a voice message from Telegram."""
    chat_id = str(message['chat']['id'])
    voice = message.get('voice', {})
    file_id = voice.get('file_id')

    if not file_id:
        await send_telegram_message(chat_id, "Couldn't read the voice message.")
        return

    logger.info(f"Processing voice message from chat {chat_id}, duration: {voice.get('duration', 0)}s")

    # Acknowledge receipt
    await send_telegram_message(chat_id, "🎙️ Got your voice message, transcribing...")

    audio_path = None
    tts_path = None

    try:
        # Download and transcribe
        audio_path = await download_voice_file(file_id)
        transcript = await transcribe(audio_path)

        if not transcript.strip():
            await send_telegram_message(chat_id, "Couldn't make out what you said. Try again?")
            return

        logger.info(f"Transcript: {transcript}")
        await send_telegram_message(chat_id, f"📝 Heard: \"{transcript}\"\n\nProcessing...")

        # Send to OpenClaw
        response = await send_to_openclaw(transcript)

        # Send text response
        await send_telegram_message(chat_id, response)

        # Optionally send voice response for important messages
        if len(response) < 500 and any(kw in transcript.lower() for kw in ['brief', 'status', 'summary', 'pipeline']):
            tts_path = await generate_tts(response)
            if tts_path:
                await send_telegram_voice(chat_id, tts_path)

    except Exception as e:
        logger.error(f"Voice processing error: {e}")
        await send_telegram_message(chat_id, f"Error processing voice: {str(e)}")
    finally:
        if audio_path:
            audio_path.unlink(missing_ok=True)
        if tts_path:
            tts_path.unlink(missing_ok=True)


async def poll_updates():
    """Long-poll Telegram for voice messages."""
    offset = 0
    logger.info("Starting voice handler polling...")

    async with httpx.AsyncClient(timeout=60.0) as client:
        while True:
            try:
                resp = await client.get(
                    f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates',
                    params={'offset': offset, 'timeout': 30, 'allowed_updates': json.dumps(['message'])},
                )

                data = resp.json()
                if not data.get('ok'):
                    logger.error(f"Telegram poll error: {data}")
                    await asyncio.sleep(5)
                    continue

                for update in data.get('result', []):
                    offset = update['update_id'] + 1
                    message = update.get('message', {})

                    # Only handle voice messages
                    if 'voice' in message:
                        await handle_voice_message(message)

            except httpx.TimeoutException:
                continue
            except Exception as e:
                logger.error(f"Poll error: {e}")
                await asyncio.sleep(5)


def main():
    if not TELEGRAM_BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN not set")
        sys.exit(1)

    if not OPENAI_API_KEY and not USE_LOCAL_WHISPER:
        logger.error("OPENAI_API_KEY not set and USE_LOCAL_WHISPER is false")
        sys.exit(1)

    logger.info(f"Voice handler starting (whisper: {'local' if USE_LOCAL_WHISPER else 'openai-api'})")
    asyncio.run(poll_updates())


if __name__ == '__main__':
    main()
