ALTER TABLE public.robo_campanhas
ADD COLUMN IF NOT EXISTS horarios_por_dia jsonb NOT NULL DEFAULT '{
  "seg": {"enabled": true, "inicio": "09:00", "fim": "20:00", "intervalo": 30},
  "ter": {"enabled": true, "inicio": "09:00", "fim": "20:00", "intervalo": 30},
  "qua": {"enabled": true, "inicio": "09:00", "fim": "20:00", "intervalo": 30},
  "qui": {"enabled": true, "inicio": "09:00", "fim": "20:00", "intervalo": 30},
  "sex": {"enabled": true, "inicio": "09:00", "fim": "20:00", "intervalo": 30},
  "sab": {"enabled": false, "inicio": "10:00", "fim": "18:00", "intervalo": 60},
  "dom": {"enabled": false, "inicio": "10:00", "fim": "18:00", "intervalo": 60}
}'::jsonb;