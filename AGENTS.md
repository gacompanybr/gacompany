# Project Architecture Rules

- Mercado Livre scraping remains HTML-based on the VPS, runs eight times daily, rotates one category and one page per run, stops on CAPTCHA, and supports optional `ML_SCRAPER_PROXY_URL`; this preserves downstream affiliate and dispatch logic while minimizing blocking signals.
- WhatsApp inbound debounce uses an application-generated message ID and timestamp, so rapid-message bursts always leave the newest execution responsible for replying.
- Store contact follow-up eligibility once per portfolio and normalized phone; shared fail-closed checks run before generation and every follow-up bubble, while a database-owned cutoff invalidates cancelled cycles without deleting conversation history.
- Execute explicit contact schedules through the existing agent follow-up job with token-checked atomic claims; pending schedules suppress automatic cycles, and ambiguous deliveries require manual rescheduling to avoid duplicates.
