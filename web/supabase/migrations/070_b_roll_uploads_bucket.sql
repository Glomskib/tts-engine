-- ============================================================================
-- B-ROLL UPLOADS STORAGE BUCKET
-- For image-to-image source images
-- ============================================================================

-- Create the storage bucket for B-Roll uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'b-roll-uploads',
  'b-roll-uploads',
  true,
  10485760, -- 10MB max file size
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view uploaded images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own images" ON storage.objects;

-- Policy: Users can upload images to their own folder
CREATE POLICY "Users can upload images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'b-roll-uploads' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Anyone can view uploaded images (they're public)
CREATE POLICY "Anyone can view uploaded images" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'b-roll-uploads');

-- Policy: Users can delete their own images
CREATE POLICY "Users can delete own images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'b-roll-uploads' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
