# Project Architecture Rules

- Commercial order dispatch is gated by a stable portfolio allowlist in the shared scope module; only opted-in portfolios bypass unchanged dental reporting. Orders use validated dispatch before the client response, per-agent group lookup, atomic reservation and explicit accepted/uncertain states to avoid duplicate or false-success reports.

- Catalog retrieval reads the complete CSV without persistent cache and shares a per-reply snapshot; a shared search module ranks all rows before paginating or price sorting, so both live and preview answers use current commercial data without changing agents that have no catalog.

- Mercado Livre scraping remains HTML-based on the VPS, runs eight times daily, rotates one category and one page per run, stops on CAPTCHA, and supports optional `ML_SCRAPER_PROXY_URL`; this preserves downstream affiliate and dispatch logic while minimizing blocking signals.
- WhatsApp inbound debounce uses an application-generated message ID and timestamp, so rapid-message bursts always leave the newest execution responsible for replying.
- Store contact follow-up eligibility once per portfolio and normalized phone; shared fail-closed checks run before generation and every follow-up bubble, while a database-owned cutoff invalidates cancelled cycles without deleting conversation history.
- Execute explicit contact schedules through the existing agent follow-up job with token-checked atomic claims; pending schedules suppress automatic cycles, and ambiguous deliveries require manual rescheduling to avoid duplicates.
