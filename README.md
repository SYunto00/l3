# L3 — 思想の散歩道

Syuntoの個人アーカイブ。5つの色で配置される作品集。

## Structure

- `index.html` — main archive (chips flow horizontally)
- `about-colors.html` — explains the 5-color system and interactive mixer
- `favicon.svg` — site icon
- `og-image.svg` — social share image
- `/dev/` — development files (demos, comparisons), not deployed

## Local dev

Any static file server works:
```
npx serve -p 5174
```

## Deploy

Cloudflare Pages, connected to this repo, auto-deploys on push to `main`.

## Theme colors

- NATURE 山・自然 `#87A96B`
- SYSTEM 仕組み・AI `#D97A4A`
- EDUCATION 教育・子ども `#E4C26F`
- MUSIC 音楽・即興 `#8C7DB0`
- PHILOSOPHY 哲学・生き方 `#4A6374`

5-color softMix (×0.7 + avg×0.3) result: `#E3DBD1` — the "light ground" in about-colors.

## Mix algorithm

`softMix = 0.7 * screen-blend + 0.3 * arithmetic-average`
- Multi-theme chips display their mixed color
- Source themes shown as small dots at top-left of each chip

## Admin

Access the upload form at:

```
https://l3.kawasaki-gakusha.workers.dev/admin?token=YOUR_TOKEN
```

Or visit `/admin` directly and enter your token when prompted.
The token is saved to `localStorage` after the first successful post.

## Architecture

```
Browser
  ├── GET /          → index.html (static, via ASSETS)
  ├── GET /api/content  → _worker.js → R2 content.json (fallback: seed)
  ├── POST /api/upload  → _worker.js (auth) → R2 media/<uuid>.<ext>
  │                                         → R2 content.json (append)
  ├── GET /media/<key>  → _worker.js → R2 media/<key> (immutable cache)
  └── GET /admin        → _worker.js → /admin.html (via ASSETS)
```

| Layer | Details |
|---|---|
| Static files | GitHub repo → Cloudflare Workers Git integration, auto-deploy on push to `main` |
| Worker | `_worker.js` at repo root — picked up automatically by CF Pages/Workers |
| Media storage | Cloudflare R2 bucket `l3-media` (binding name: `MEDIA`) |
| Content metadata | R2 object `content.json`; fallback seed in `_worker.js` |
| Auth | `ADMIN_TOKEN` Cloudflare secret (set in dashboard → Workers → Settings → Variables) |

## Cloudflare setup (one-time)

1. Create R2 bucket named `l3-media`
2. In Workers dashboard → your worker → Settings → Variables:
   - Add R2 binding: name `MEDIA`, bucket `l3-media`
   - Add secret: name `ADMIN_TOKEN`, value = 32+ random chars
3. Push code to `main` — CF auto-deploys
