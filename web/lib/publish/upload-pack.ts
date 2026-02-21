/**
 * UploadPack — everything needed for a manual TikTok upload.
 * Ephemeral: generated on-demand, never persisted to DB.
 */
export interface UploadPack {
  video_id: string;
  product_id: string;
  generated_at: string;       // ISO timestamp
  lane: string;               // persona lane (e.g. "skeptic") or "general"
  product_name: string;
  caption: string;            // TikTok caption (without hashtags)
  hashtags: string[];         // e.g. ["#ad", "#tiktokshop"]
  cover_text: string;         // Thumbnail overlay text
  hook: string;               // First-line hook
  cta: string;                // Call to action
  compliance_notes: string;   // e.g. "#ad required"
  references: string[];       // Source URLs
  video_url: string;          // Public or signed URL for download
  video_path: string;         // Supabase Storage path or external URL
}
