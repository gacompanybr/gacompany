ALTER TABLE public.sdr_campaigns
  ADD COLUMN audio_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN audio_on_intro boolean NOT NULL DEFAULT true,
  ADD COLUMN audio_on_long_message boolean NOT NULL DEFAULT true,
  ADD COLUMN audio_long_message_threshold integer NOT NULL DEFAULT 420
    CHECK (audio_long_message_threshold BETWEEN 200 AND 2000);