
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-media', 'social-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read social-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'social-media');

CREATE POLICY "Authenticated upload social-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'social-media');

CREATE POLICY "Authenticated update social-media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'social-media');

CREATE POLICY "Authenticated delete social-media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'social-media');
