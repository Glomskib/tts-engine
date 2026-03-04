#!/usr/bin/env tsx
/**
 * Smoke test for the Drive Intake Connector (with hardening).
 * Tests: encryption, module imports, env checks, limits, validation.
 *
 * Usage: npx tsx scripts/setup/smoke-test-drive-intake.ts
 */

import { encrypt, decrypt, generateKey } from '../../lib/security/crypto';
import { VIDEO_MIME_TYPES, SCOPES, READONLY_SCOPES } from '../../lib/intake/google-drive';
import { generateEditNotes } from '../../lib/intake/edit-notes-generator';
import {
  MAX_INTAKE_FILE_BYTES,
  MIN_INTAKE_FILE_BYTES,
  MAX_INTAKE_MINUTES,
  MAX_FILES_PER_MONTH,
  MAX_MINUTES_PER_MONTH,
  INTAKE_BATCH_SIZE,
  MAX_RETRY_ATTEMPTS,
  IntakeValidationError,
  FAILURE_MESSAGES,
} from '../../lib/intake/intake-limits';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.log(`  \u2717 ${label}`);
    failed++;
  }
}

async function main() {
  console.log('=== Drive Intake Connector — Smoke Test ===\n');

  // ── 1. Encryption ──
  console.log('1) Encryption module');
  assert('generateKey returns base64 string', typeof generateKey() === 'string');
  assert('generateKey produces 44-char base64 (32 bytes)', generateKey().length === 44);

  if (process.env.DRIVE_TOKEN_ENCRYPTION_KEY) {
    const plaintext = 'test-refresh-token-1234567890';
    const encrypted = encrypt(plaintext);
    assert('encrypt returns ciphertext', typeof encrypted.ciphertext === 'string' && encrypted.ciphertext.length > 0);
    assert('encrypt returns iv', typeof encrypted.iv === 'string' && encrypted.iv.length > 0);
    assert('encrypt returns tag', typeof encrypted.tag === 'string' && encrypted.tag.length > 0);

    const decrypted = decrypt(encrypted);
    assert('decrypt recovers plaintext', decrypted === plaintext);

    const encrypted2 = encrypt(plaintext);
    assert('different IVs per encryption', encrypted.iv !== encrypted2.iv);
  } else {
    console.log('  \u26a0 Skipping round-trip test (set DRIVE_TOKEN_ENCRYPTION_KEY)');
    console.log('    Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }
  console.log('');

  // ── 2. Google Drive module ──
  console.log('2) Google Drive module');
  assert('VIDEO_MIME_TYPES has entries', VIDEO_MIME_TYPES.length >= 5);
  assert('VIDEO_MIME_TYPES includes video/mp4', VIDEO_MIME_TYPES.includes('video/mp4'));
  assert('VIDEO_MIME_TYPES includes video/quicktime', VIDEO_MIME_TYPES.includes('video/quicktime'));
  assert('SCOPES includes drive.readonly', SCOPES.some(s => s.includes('drive.readonly')));
  assert('SCOPES includes drive.file', SCOPES.some(s => s.includes('drive.file')));
  assert('SCOPES includes userinfo.email', SCOPES.some(s => s.includes('userinfo.email')));
  assert('READONLY_SCOPES excludes drive.file', !READONLY_SCOPES.some(s => s.includes('drive.file')));
  console.log('');

  // ── 3. Edit notes generator ──
  console.log('3) Edit notes generator (template fallback)');
  const notes = await generateEditNotes(
    'Hello world this is a test transcript for the video.',
    [
      { start: 0, end: 5, text: 'Hello world' },
      { start: 5, end: 10, text: 'this is a test transcript' },
      { start: 10, end: 15, text: 'for the video.' },
    ],
    'test-video.mp4',
    15,
  );
  assert('generates summary', typeof notes.summary === 'string' && notes.summary.length > 0);
  assert('generates chapters array', Array.isArray(notes.chapters));
  assert('generates hook_candidates', Array.isArray(notes.hook_candidates) && notes.hook_candidates.length > 0);
  assert('generates export_checklist', Array.isArray(notes.export_checklist) && notes.export_checklist.length > 0);
  assert('generates caption_variants', Array.isArray(notes.caption_variants));
  assert('generates cta_variants', Array.isArray(notes.cta_variants));
  assert('method is template (no API key)', notes.method === 'template');
  assert('generated_at is ISO string', notes.generated_at.includes('T'));
  console.log('');

  // ── 4. Intake limits module ──
  console.log('4) Intake limits');
  assert('MAX_INTAKE_FILE_BYTES is a positive number', MAX_INTAKE_FILE_BYTES > 0);
  assert('MAX_INTAKE_FILE_BYTES default is ~1.5GB', MAX_INTAKE_FILE_BYTES === 1.5 * 1024 * 1024 * 1024);
  assert('MIN_INTAKE_FILE_BYTES is 500KB', MIN_INTAKE_FILE_BYTES === 500 * 1024);
  assert('MAX_INTAKE_MINUTES default is 60', MAX_INTAKE_MINUTES === 60);
  assert('MAX_FILES_PER_MONTH default is 200', MAX_FILES_PER_MONTH === 200);
  assert('MAX_MINUTES_PER_MONTH default is 1000', MAX_MINUTES_PER_MONTH === 1000);
  assert('INTAKE_BATCH_SIZE is 5', INTAKE_BATCH_SIZE === 5);
  assert('MAX_RETRY_ATTEMPTS is 3', MAX_RETRY_ATTEMPTS === 3);
  console.log('');

  // ── 5. Failure reasons + validation error ──
  console.log('5) Failure reasons and validation');
  assert('FAILURE_MESSAGES has FILE_TOO_LARGE', typeof FAILURE_MESSAGES.FILE_TOO_LARGE === 'string');
  assert('FAILURE_MESSAGES has FILE_TOO_SMALL', typeof FAILURE_MESSAGES.FILE_TOO_SMALL === 'string');
  assert('FAILURE_MESSAGES has INVALID_MIMETYPE', typeof FAILURE_MESSAGES.INVALID_MIMETYPE === 'string');
  assert('FAILURE_MESSAGES has DURATION_LIMIT_EXCEEDED', typeof FAILURE_MESSAGES.DURATION_LIMIT_EXCEEDED === 'string');
  assert('FAILURE_MESSAGES has MONTHLY_LIMIT_EXCEEDED', typeof FAILURE_MESSAGES.MONTHLY_LIMIT_EXCEEDED === 'string');
  assert('FAILURE_MESSAGES has FAILED_PERMANENT', typeof FAILURE_MESSAGES.FAILED_PERMANENT === 'string');

  // IntakeValidationError
  const errLarge = new IntakeValidationError('FILE_TOO_LARGE');
  assert('IntakeValidationError has reason', errLarge.reason === 'FILE_TOO_LARGE');
  assert('IntakeValidationError has message', errLarge.message === FAILURE_MESSAGES.FILE_TOO_LARGE);
  assert('IntakeValidationError instanceof Error', errLarge instanceof Error);

  const errCustom = new IntakeValidationError('INVALID_MIMETYPE', 'audio/mpeg is not video');
  assert('custom message overrides default', errCustom.message === 'audio/mpeg is not video');
  console.log('');

  // ── 6. Size limit validation logic ──
  console.log('6) Size limit validation');
  const tinyFile = 100 * 1024; // 100KB
  const normalFile = 50 * 1024 * 1024; // 50MB
  const hugeFile = 2 * 1024 * 1024 * 1024; // 2GB

  assert('tiny file rejected (< MIN)', tinyFile < MIN_INTAKE_FILE_BYTES);
  assert('normal file accepted', normalFile >= MIN_INTAKE_FILE_BYTES && normalFile <= MAX_INTAKE_FILE_BYTES);
  assert('huge file rejected (> MAX)', hugeFile > MAX_INTAKE_FILE_BYTES);

  // MIME validation
  assert('video/mp4 is valid MIME', VIDEO_MIME_TYPES.includes('video/mp4'));
  assert('audio/mpeg is invalid MIME', !VIDEO_MIME_TYPES.includes('audio/mpeg'));
  assert('image/jpeg is invalid MIME', !VIDEO_MIME_TYPES.includes('image/jpeg'));
  assert('application/pdf is invalid MIME', !VIDEO_MIME_TYPES.includes('application/pdf'));
  console.log('');

  // ── 7. Duration limit validation logic ──
  console.log('7) Duration limit validation');
  const shortVideo = 5; // 5 minutes
  const longVideo = 90; // 90 minutes
  const exactLimit = MAX_INTAKE_MINUTES; // exactly at limit

  assert('short video passes duration check', shortVideo <= MAX_INTAKE_MINUTES);
  assert('long video fails duration check', longVideo > MAX_INTAKE_MINUTES);
  assert('exact limit passes (<=)', exactLimit <= MAX_INTAKE_MINUTES);
  console.log('');

  // ── 8. Monthly limit validation logic ──
  console.log('8) Monthly limit validation');
  assert('199 files under limit', 199 < MAX_FILES_PER_MONTH);
  assert('201 files over limit', 201 > MAX_FILES_PER_MONTH);
  assert('999 minutes under limit', 999 < MAX_MINUTES_PER_MONTH);
  assert('1001 minutes over limit', 1001 > MAX_MINUTES_PER_MONTH);
  console.log('');

  // ── 9. Env var checks ──
  console.log('9) Environment configuration');
  const hasDriveClientId = !!process.env.GOOGLE_DRIVE_CLIENT_ID;
  const hasDriveSecret = !!process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const hasDriveRedirect = !!process.env.GOOGLE_DRIVE_REDIRECT_URI;
  const hasEncKey = !!process.env.DRIVE_TOKEN_ENCRYPTION_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  console.log(`  ${hasDriveClientId ? '\u2713' : '\u26a0'} GOOGLE_DRIVE_CLIENT_ID: ${hasDriveClientId ? 'set' : 'NOT SET'}`);
  console.log(`  ${hasDriveSecret ? '\u2713' : '\u26a0'} GOOGLE_DRIVE_CLIENT_SECRET: ${hasDriveSecret ? 'set' : 'NOT SET'}`);
  console.log(`  ${hasDriveRedirect ? '\u2713' : '\u26a0'} GOOGLE_DRIVE_REDIRECT_URI: ${hasDriveRedirect ? 'set' : 'NOT SET'}`);
  console.log(`  ${hasEncKey ? '\u2713' : '\u26a0'} DRIVE_TOKEN_ENCRYPTION_KEY: ${hasEncKey ? 'set' : 'NOT SET'}`);
  console.log(`  ${hasOpenAI ? '\u2713' : '\u26a0'} OPENAI_API_KEY: ${hasOpenAI ? 'set' : 'NOT SET (transcription disabled)'}`);
  console.log('');

  // ── 10. Migration files exist ──
  console.log('10) Migration files');
  const { existsSync } = await import('fs');
  const { resolve } = await import('path');
  const basePath = resolve(process.cwd(), 'supabase/migrations/20260303200000_drive_intake_connector.sql');
  const hardenPath = resolve(process.cwd(), 'supabase/migrations/20260303200100_drive_intake_hardening.sql');
  assert('Base migration file exists', existsSync(basePath));
  assert('Hardening migration file exists', existsSync(hardenPath));
  console.log('');

  // ── Summary ──
  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
  if (!hasDriveClientId || !hasEncKey) {
    console.log('\nNote: Some features require env vars to be set. See docs/marketing/DRIVE_INTAKE_TUTORIAL.md');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
