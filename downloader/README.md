# YouTube downloader service

Replaces RenderIO's YouTube download step. The app uses it when `DOWNLOADER_URL` and
`DOWNLOADER_SECRET` are set on Vercel; otherwise it falls back to RenderIO.

Env: `DOWNLOADER_SECRET` (shared with the app), `PUBLIC_URL` (this service's https URL),
`YT_PROXY_URL` or `YTDLP_PROXY` (residential proxy, e.g. `http://user:pass@gate.example.com:7000` — used only after an unproxied yt-dlp attempt is blocked:
YouTube blocks datacenter IPs, incl. Vercel), optional `YTDLP_COOKIES_FILE`, `CONCURRENCY` (3-5),
`MAX_SOURCE_MINUTES` (120), `FILE_TTL_MIN` (120).

Deploy (any Docker host): `docker build -t vac-dl . && docker run -p 8080:8080 -e ... vac-dl`
yt-dlp self-updates every 24h; files are deleted after FILE_TTL_MIN.

## Download order in the app (YouTube links)

1. This service, when `DOWNLOADER_URL` + `DOWNLOADER_SECRET` are set (always preferred).
2. Otherwise RapidAPI (`YT_RAPIDAPI_KEY`), then the direct download API (`YT_DOWNLOAD_API_KEY`).
3. If those fail and time allows, RenderIO's yt-dlp, retried up to 2 times with ~5s/~10s backoff
   (+jitter, max 15s) on `SOURCE_RATE_LIMITED`, 429, 5xx and timeouts. Each retry is a new paid
   RenderIO command, so retries are capped.

Proxy: set `YT_PROXY_URL` (or `YTDLP_PROXY`) on this service. A download is first tried without
a proxy; the proxy is only used if yt-dlp hits a YouTube sign-in / bot / 403 / 429 block, so
normal successes do not burn residential bandwidth. Sticky ports 10001-10010 are rotated per job.
