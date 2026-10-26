-- Run once in the Supabase SQL editor before using image attachments.
-- Existing transactions need no backfill; images remain private.
BEGIN;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receipt_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('transaction-receipts', 'transaction-receipts', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS transaction_receipts_owner ON storage.objects;
CREATE POLICY transaction_receipts_owner ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'transaction-receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text))
WITH CHECK (bucket_id = 'transaction-receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));
COMMIT;

-- Verify the bucket is private and the object policy is owner-scoped.
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'transaction-receipts';
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'transaction_receipts_owner';
