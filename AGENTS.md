# Project Architecture Rules

- Meta instant-form imports use a dedicated signed webhook, validated account/campaign/form bindings and unique submission identity; server-side integration permissions protect selection, retries never overwrite CRM workflow state, and credentials remain separate from existing Meta OAuth.
- CRM account/campaign discovery uses the linked Meta Ads connector gateway; app-owned form discovery and signed lead delivery retain dedicated credentials because managed ads authorization lacks lead permissions, with no cross-path retry fallback.
- CRM form discovery resolves a Page-scoped token from the dedicated credential once per request and never exposes or persists it; Meta requires Page authorization for leadgen_forms.

- Human-takeover pause creation and inbound checks share a stable portfolio-scoped policy; opted-out clients never create or honor these pauses, while other clients retain existing behavior.

- Commercial order dispatch is gated by a stable portfolio allowlist in the shared scope module; only opted-in portfolios bypass unchanged dental reporting. Orders use validated dispatch before the client response, per-agent group lookup, atomic reservation and explicit accepted/uncertain states to avoid duplicate or false-success reports.

- Catalog retrieval reads the complete CSV without persistent cache and shares a per-reply indexed snapshot; quantity phrases are separated from product specifications, completed zero-result lookups never fall back to older products, and live/preview responses share bounded model requests and at most one tool round to avoid silent catalog failures.
- Catalog search runs in layers (all words → editable equivalence table like cano/tubo → rarest token → any word), always requiring numeric/measure tokens, excluding rows marked "Inativo" by default and never exposing the cost column; every search is logged to `catalog_search_logs` (RLS by portfolio) and surfaced in the agent's "Buscas" tab so zero-result queries can teach new synonyms.

- Mercado Livre scraping remains HTML-based on the VPS, runs eight times daily, rotates one category and one page per run, stops on CAPTCHA, and supports optional `ML_SCRAPER_PROXY_URL`; this preserves downstream affiliate and dispatch logic while minimizing blocking signals.
- WhatsApp inbound is persisted before response gates with application-derived, portfolio/instance-scoped delivery IDs and timestamps; retries are idempotent and rapid-message bursts leave the newest execution responsible for replying.
- Conversation list and detail fetch all stored history in ordered pages and show query errors; manual outgoing messages use the allowed assistant role with an explicit team prefix so paused/off-hours chats remain visible.
- Store contact follow-up eligibility once per portfolio and normalized phone; shared fail-closed checks run before generation and every follow-up bubble, while a database-owned cutoff invalidates cancelled cycles without deleting conversation history.
- Execute explicit contact schedules through the existing agent follow-up job with token-checked atomic claims; pending schedules suppress automatic cycles, and ambiguous deliveries require manual rescheduling to avoid duplicates.
- Commercial order dispatch allowlist lives in supabase/functions/_shared/order-report-scope.ts (leonardo - novo tio + Casa do Eletricista only); dental reporting stays untouched.
- Edge functions must define corsHeaders locally; importing from "npm:@supabase/supabase-js@2/cors" fails at boot (502) — that subpath does not exist.
- AI calls use openai/gpt-6-astra via the Lovable gateway chat completions endpoint; google/gemini-2.5-flash(-lite) is deprecated and must not be reintroduced.
- Catalog search uses the same partial/fuzzy/popular-name matcher for vocabulary detection and ranking, with bounded equivalent-term expansion over the complete snapshot; numeric tokens (voltage/measure) are never dropped. Query traces remain administrative and a search where no word exists in the sheet is a completed zero result.
- Agent safety improvements are opt-in per agent and disabled by default, with Lopes Saúde protected server-side; the legacy path preserves existing dental, SDR and follow-up behavior.
- Opt-in replies use streamed Responses with terminal gateway failures surfaced without substitute replies; token-fenced delivery tries recipient aliases only after explicit rejection to prevent duplicates.
- Reply recovery wakes on eligible queue entries and unschedules after drain; ambiguous delivery is marked uncertain for manual verification instead of automatic resending.
- Manual Meta lead import pulls each enabled bound form's leads with the Page token, skips existing meta_leadgen_id and campaign-mismatched leads, so it is safe to re-run alongside the webhook.
