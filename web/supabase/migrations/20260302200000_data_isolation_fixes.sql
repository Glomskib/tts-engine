-- Data isolation fixes: assign orphaned records to admin, remove legacy RLS leak
-- No real customers yet — all data belongs to admin.

DO $$
DECLARE
  admin_uid uuid;
BEGIN
  -- Find admin by email
  SELECT id INTO admin_uid
  FROM auth.users
  WHERE email = 'brandon@communitycorewholesale.com'
  LIMIT 1;

  IF admin_uid IS NULL THEN
    RAISE NOTICE 'Admin user not found — skipping orphan assignment';
    RETURN;
  END IF;

  -- 1. Assign orphaned videos to admin
  UPDATE videos
  SET client_user_id = admin_uid
  WHERE client_user_id IS NULL;

  -- 2. Assign orphaned products to admin
  UPDATE products
  SET user_id = admin_uid
  WHERE user_id IS NULL;

  -- 3. Assign orphaned scripts to admin
  UPDATE scripts
  SET user_id = admin_uid
  WHERE user_id IS NULL;

  UPDATE scripts
  SET created_by = admin_uid::text
  WHERE created_by IS NULL OR created_by = '';

  -- 4. Assign orphaned winners_bank to admin
  UPDATE winners_bank
  SET user_id = admin_uid
  WHERE user_id IS NULL;

  -- 5. Assign orphaned reference_videos to admin
  UPDATE reference_videos
  SET user_id = admin_uid
  WHERE user_id IS NULL;

  -- 6. Assign orphaned saved_skits to admin
  UPDATE saved_skits
  SET user_id = admin_uid
  WHERE user_id IS NULL;

  -- 7. Assign orphaned tiktok_accounts to admin
  UPDATE tiktok_accounts
  SET user_id = admin_uid
  WHERE user_id IS NULL;

  -- 8. Clean up smoke-test issue reports
  DELETE FROM ff_issue_actions
  WHERE issue_id IN (
    SELECT id FROM ff_issue_reports
    WHERE message_text LIKE '[smoke-test]%'
  );
  DELETE FROM ff_issue_reports
  WHERE message_text LIKE '[smoke-test]%';

  RAISE NOTICE 'Data isolation cleanup complete for admin %', admin_uid;
END $$;

-- 9. Fix reference_videos RLS: remove legacy "user_id IS NULL visible to all" leak
DO $$
BEGIN
  -- Drop the leaky policy if it exists
  DROP POLICY IF EXISTS "Users can view own winners" ON reference_videos;

  -- Recreate with strict user isolation (no NULL fallback)
  CREATE POLICY "Users can view own winners" ON reference_videos
    FOR SELECT USING (auth.uid() = user_id);

EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'reference_videos table not found — skipping RLS fix';
END $$;
