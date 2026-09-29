# Project Architecture Rules

- Mercado Livre scraping remains HTML-based, runs eight times daily, fetches sequentially, stops on CAPTCHA, and supports an optional `ML_SCRAPER_PROXY_URL`; this reduces repeated IP blocking without changing downstream affiliate or dispatch logic.
