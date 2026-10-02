# Project Architecture Rules

- Mercado Livre scraping remains HTML-based on the VPS, runs eight times daily, rotates one category and one page per run, stops on CAPTCHA, and supports optional `ML_SCRAPER_PROXY_URL`; this preserves downstream affiliate and dispatch logic while minimizing blocking signals.
- WhatsApp inbound debounce uses an application-generated message ID and timestamp, so rapid-message bursts always leave the newest execution responsible for replying.
