# YouTube downloader service

Replaces RenderIO's YouTube download step. The app uses it when `DOWNLOADER_URL` and
`DOWNLOADER_SECRET` are set on Vercel; otherwise it falls back to RenderIO.

Env: `DOWNLOADER_SECRET` (shared with the app), `PUBLIC_URL` (this service's https URL),
`YTDLP_PROXY` (residential proxy, e.g. `http://user:pass@gate.example.com:7000` — required:
YouTube blocks datacenter IPs, incl. Vercel), optional `YTDLP_COOKIES_FILE`, `CONCURRENCY` (3-5),
`MAX_SOURCE_MINUTES` (120), `FILE_TTL_MIN` (120).

Deploy (any Docker host): `docker build -t vac-dl . && docker run -p 8080:8080 -e ... vac-dl`
yt-dlp self-updates every 24h; files are deleted after FILE_TTL_MIN.
