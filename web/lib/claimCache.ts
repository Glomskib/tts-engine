// claimCache.ts - In-memory claim cache for when DB columns don't exist
// This provides fallback claim tracking when migration 010 hasn't been applied

const memoryClaimCache = new Map<string, { claimed_by: string; claim_expires_at: string }>();

export function getMemoryClaim(videoId: string): { claimed_by: string; claim_expires_at: string } | null {
  const claim = memoryClaimCache.get(videoId);
  if (!claim) return null;
  if (new Date(claim.claim_expires_at) < new Date()) {
    memoryClaimCache.delete(videoId);
    return null;
  }
  return claim;
}

export function setMemoryClaim(videoId: string, claimed_by: string, ttl: number): void {
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();
  memoryClaimCache.set(videoId, { claimed_by, claim_expires_at: expiresAt });
}

export function clearMemoryClaim(videoId: string): void {
  memoryClaimCache.delete(videoId);
}
