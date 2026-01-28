/**
 * Team member display name mapping
 * Maps user IDs to human-readable display names
 */

// Static fallback mapping for known team members
// This is used when the database lookup fails or for quick client-side display
const TEAM_DISPLAY_NAMES: Record<string, string> = {
  editor1: 'Denver',
  creator1: 'Brandon',
  creator2: 'Katlyn',
  editor2: 'Editor 2',
  uploader1: 'Uploader',
};

/**
 * Get display name for a user ID
 * Falls back to the ID if no mapping exists
 */
export function getTeamDisplayName(userId: string | null | undefined): string {
  if (!userId) return 'Unassigned';

  // Check static mapping first
  const staticName = TEAM_DISPLAY_NAMES[userId.toLowerCase()];
  if (staticName) return staticName;

  // Try to extract a readable name from email
  if (userId.includes('@')) {
    const localPart = userId.split('@')[0];
    // Capitalize first letter
    return localPart.charAt(0).toUpperCase() + localPart.slice(1);
  }

  // If it's a UUID, show a short version
  if (userId.length === 36 && userId.includes('-')) {
    return userId.slice(0, 8) + '...';
  }

  return userId;
}

/**
 * Format video code for display (converts stored MM-DD-YY to MM/DD/YY)
 * Example: BKADV0-OXYENG-MT001-01-27-26-001 → BKADV0-OXYENG-MT001-01/27/26-001
 */
export function formatVideoCodeForDisplay(videoCode: string | null | undefined): string {
  if (!videoCode) return '';

  // Match the date pattern MM-DD-YY in the code and convert to MM/DD/YY
  // Pattern: after 3rd hyphen, look for XX-XX-XX pattern
  const parts = videoCode.split('-');
  if (parts.length >= 7) {
    // Format: ACCOUNT-BRAND-SKU-MM-DD-YY-SEQ
    // Convert MM-DD-YY to MM/DD/YY
    const [account, brand, sku, month, day, year, seq] = parts;
    return `${account}-${brand}-${sku}-${month}/${day}/${year}-${seq}`;
  }

  return videoCode;
}
