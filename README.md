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
