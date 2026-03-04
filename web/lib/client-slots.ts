/**
 * Client Slot Loader
 *
 * Provides multi-client isolation by reading slot configs from
 * config/client-slots.json. Each slot maps to a unique client_id,
 * Chrome profile directory, and TikTok username.
 *
 * Slot resolution order:
 *   1. --slot <name> CLI argument
 *   2. FF_SLOT env var
 *   3. Error — never defaults silently
 *
 * Usage:
 *   import { requireSlot } from '@/lib/client-slots';
 *   const slot = requireSlot();  // reads from --slot or FF_SLOT
 */

import * as fs from 'fs';
import * as path from 'path';

const TAG = '[client-slots]';

export interface SlotConfig {
  slot: string;
  client_id: string;
  chrome_profile_dir: string;
  tiktok_username: string;
  ri_browser_profile_dir: string | null;
}

interface SlotsFile {
  slots: SlotConfig[];
}

const CONFIG_PATH = path.join(process.cwd(), 'config', 'client-slots.json');
const EXAMPLE_PATH = path.join(process.cwd(), 'config', 'client-slots.example.json');

/**
 * Load all slots from config/client-slots.json.
 * Throws if the file is missing or malformed.
 */
export function loadAllSlots(): SlotConfig[] {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`${TAG} FATAL: ${CONFIG_PATH} not found.`);
    console.error(`${TAG} Copy the example and fill in your values:`);
    console.error(`${TAG}   cp ${EXAMPLE_PATH} ${CONFIG_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  let parsed: SlotsFile;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`${TAG} FATAL: ${CONFIG_PATH} is not valid JSON.`);
    process.exit(1);
  }

  if (!parsed.slots || !Array.isArray(parsed.slots) || parsed.slots.length === 0) {
    console.error(`${TAG} FATAL: ${CONFIG_PATH} has no "slots" array.`);
    process.exit(1);
  }

  return parsed.slots;
}

/**
 * Load a specific slot by name.
 * Throws if the slot doesn't exist.
 */
export function loadSlot(slotName: string): SlotConfig {
  const slots = loadAllSlots();
  const slot = slots.find((s) => s.slot === slotName);

  if (!slot) {
    const available = slots.map((s) => s.slot).join(', ');
    console.error(`${TAG} FATAL: Slot "${slotName}" not found in ${CONFIG_PATH}.`);
    console.error(`${TAG} Available slots: ${available}`);
    process.exit(1);
  }

  // Validate required fields
  if (!slot.client_id) {
    console.error(`${TAG} FATAL: Slot "${slotName}" is missing client_id.`);
    process.exit(1);
  }
  if (!slot.chrome_profile_dir) {
    console.error(`${TAG} FATAL: Slot "${slotName}" is missing chrome_profile_dir.`);
    process.exit(1);
  }

  return slot;
}

/**
 * Resolve the active slot from CLI args or env var.
 *
 * Resolution order:
 *   1. --slot <name> CLI argument
 *   2. FF_SLOT env var
 *   3. Exit with error — never defaults silently
 */
export function requireSlot(): SlotConfig {
  const slotName = getSlotName();
  const slot = loadSlot(slotName);

  console.log(`${TAG} Slot loaded: ${slot.slot} (client_id=${slot.client_id})`);
  console.log(`${TAG}   chrome_profile_dir: ${slot.chrome_profile_dir}`);
  if (slot.tiktok_username) {
    console.log(`${TAG}   tiktok_username: @${slot.tiktok_username}`);
  }

  return slot;
}

/**
 * Get the slot name from CLI args (--slot <name>) or FF_SLOT env var.
 * Exits with a clear error if neither is provided.
 */
export function getSlotName(): string {
  // Check CLI args first
  const args = process.argv.slice(2);
  const slotIdx = args.indexOf('--slot');
  if (slotIdx !== -1 && slotIdx + 1 < args.length) {
    return args[slotIdx + 1];
  }

  // Check env var
  if (process.env.FF_SLOT) {
    return process.env.FF_SLOT;
  }

  // No slot specified — fail hard
  console.error(`${TAG} FATAL: No slot specified.`);
  console.error(`${TAG} Provide --slot <name> or set FF_SLOT env var.`);
  console.error(`${TAG} Example: npm run tiktok:bootstrap:slot -- --slot wife`);

  // Show available slots if config exists
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed: SlotsFile = JSON.parse(raw);
      if (parsed.slots?.length) {
        const available = parsed.slots.map((s) => s.slot).join(', ');
        console.error(`${TAG} Available slots: ${available}`);
      }
    } catch { /* ignore parse errors here */ }
  }

  process.exit(1);
}

/**
 * Apply slot config to the current process environment.
 * Sets FF_CLIENT_ID, FF_CHROME_PROFILE_DIR, FF_SLOT, and
 * overrides TIKTOK_BROWSER_PROFILE for the uploader skill.
 */
export function applySlotEnv(slot: SlotConfig): void {
  process.env.FF_CLIENT_ID = slot.client_id;
  process.env.FF_CHROME_PROFILE_DIR = slot.chrome_profile_dir;
  process.env.FF_SLOT = slot.slot;
  process.env.TIKTOK_BROWSER_PROFILE = slot.chrome_profile_dir;

  // Set storage state path adjacent to the profile dir
  const storageStatePath = path.join(
    path.dirname(slot.chrome_profile_dir),
    `${path.basename(slot.chrome_profile_dir)}.storageState.json`,
  );
  process.env.TIKTOK_STORAGE_STATE = storageStatePath;

  // Set sessions dir to profile's parent so lockfiles are isolated
  process.env.TIKTOK_SESSIONS_DIR = path.dirname(slot.chrome_profile_dir);

  if (slot.ri_browser_profile_dir) {
    process.env.RI_BROWSER_PROFILE_DIR = slot.ri_browser_profile_dir;
  }

  console.log(`${TAG} Environment applied for slot "${slot.slot}":`);
  console.log(`${TAG}   FF_CLIENT_ID=${slot.client_id}`);
  console.log(`${TAG}   TIKTOK_BROWSER_PROFILE=${slot.chrome_profile_dir}`);
  console.log(`${TAG}   TIKTOK_STORAGE_STATE=${storageStatePath}`);
  console.log(`${TAG}   TIKTOK_SESSIONS_DIR=${path.dirname(slot.chrome_profile_dir)}`);
}
