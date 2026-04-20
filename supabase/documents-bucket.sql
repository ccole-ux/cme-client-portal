-- One-time Supabase Storage setup for the documents library. Run this in the
-- Supabase Dashboard SQL editor after migrations.
--
-- Creates a `documents` bucket with a 25MB file size limit, plus RLS
-- policies matching the spec:
-- - Read: project members (enforced in the API route using signed URLs;
--   bucket is private so no public reads)
-- - Write: CME staff only

-- Create the bucket if missing. Safe to re-run.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  26214400, -- 25 MB
  NULL -- allow any mime
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- Storage RLS policies. The API route issues signed URLs via the admin
-- (service-role) client for downloads and uses the same client for uploads,
-- so the policies below simply block anonymous public access while allowing
-- our authenticated server-side code path to work unchanged.
DROP POLICY IF EXISTS "documents: no public read" ON storage.objects;
CREATE POLICY "documents: no public read" ON storage.objects
  FOR SELECT TO anon
  USING (false);

DROP POLICY IF EXISTS "documents: auth read" ON storage.objects;
CREATE POLICY "documents: auth read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents: staff write" ON storage.objects;
CREATE POLICY "documents: staff write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('cme_admin', 'cme_viewer')
    )
  );
