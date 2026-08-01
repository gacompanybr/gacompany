ALTER TABLE public.whatsapp_agents
ADD COLUMN IF NOT EXISTS horarios_por_dia jsonb NOT NULL DEFAULT '{
  "seg": {"enabled": true,  "inicio": "08:00", "fim": "18:00"},
  "ter": {"enabled": true,  "inicio": "08:00", "fim": "18:00"},
  "qua": {"enabled": true,  "inicio": "08:00", "fim": "18:00"},
  "qui": {"enabled": true,  "inicio": "08:00", "fim": "18:00"},
  "sex": {"enabled": true,  "inicio": "08:00", "fim": "18:00"},
  "sab": {"enabled": false, "inicio": "08:00", "fim": "12:00"},
  "dom": {"enabled": false, "inicio": "08:00", "fim": "12:00"}
}'::jsonb;