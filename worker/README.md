# captions-worker

Fetches a YouTube video's captions and drafts a RubixSnake shape JSON
(same heuristic as `tools/video-to-shape.js`), so the phone PWA
(`video-import.html`) doesn't need a CLI or yt-dlp installed.

## Deploy (free Cloudflare account, ~2 minutes)

```
npm install -g wrangler
cd worker
wrangler login        # opens a browser to authorize once
wrangler deploy
```

`wrangler deploy` prints a URL like
`https://rubix-snake-captions.<your-subdomain>.workers.dev` — paste that
into the "Caption-fetch worker URL" field in `video-import.html` (saved
in the browser's localStorage, one-time setup per device).

## Known limitation

This fetches `youtube.com` directly from Cloudflare's network. YouTube
rate-limits/blocks some automated traffic by IP reputation — this worked
when tested from a normal residential network, but if it starts
returning errors, that's YouTube-side bot detection, not a bug here.
Most snake-cube build videos also don't narrate folds at all, so expect
many `"?"` placeholders even when the fetch succeeds — that's the
intended fallback (see `description` field in the returned JSON), not a
failure.
