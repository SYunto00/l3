/**
 * _worker.js — L3 Cloudflare Worker
 *
 * Routes:
 *   GET  /api/content       → fetch content.json from R2; fallback to INITIAL_CONTENT seed
 *   POST /api/upload        → auth + multipart parse → write file to R2 + update content.json
 *   GET  /media/<key>       → proxy R2 object with long-cache headers
 *   GET  /admin             → rewrite to /admin.html via ASSETS
 *   *                       → pass through to ASSETS (static site files)
 *
 * Expected Cloudflare bindings:
 *   env.MEDIA        — R2 bucket `l3-media`
 *   env.ADMIN_TOKEN  — secret string (32+ chars)
 *   env.ASSETS       — static assets from the GitHub repo (auto-bound by CF Pages/Workers)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    /* ── OPTIONS preflight ── */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    /* ── /api/content ── */
    if (path === '/api/content' && request.method === 'GET') {
      return handleGetContent(env);
    }

    /* ── /api/upload ── */
    if (path === '/api/upload' && request.method === 'POST') {
      return handleUpload(request, env);
    }

    /* ── /api/posts/:id ── */
    const postsMatch = path.match(/^\/api\/posts\/([^/]+)$/);
    if (postsMatch) {
      const id = postsMatch[1];
      if (request.method === 'DELETE') return handleDeletePost(request, env, id);
      if (request.method === 'PATCH')  return handlePatchPost(request, env, id);
    }

    /* ── /api/posts/:id/media ── */
    const mediaReplaceMatch = path.match(/^\/api\/posts\/([^/]+)\/media$/);
    if (mediaReplaceMatch && request.method === 'PUT') {
      const id = mediaReplaceMatch[1];
      return handleReplaceMedia(request, env, id);
    }

    /* ── /api/comments ── */
    if (path === '/api/comments' && request.method === 'GET') {
      return handleGetComments(request, env);
    }
    if (path === '/api/comments' && request.method === 'POST') {
      return handlePostComment(request, env);
    }

    /* ── /api/admin/comments ── */
    if (path === '/api/admin/comments' && request.method === 'GET') {
      return handleAdminGetComments(request, env);
    }

    /* ── /api/comments/:id ── */
    const commentMatch = path.match(/^\/api\/comments\/([^/]+)$/);
    if (commentMatch) {
      const id = commentMatch[1];
      if (request.method === 'DELETE') return handleDeleteComment(request, env, id);
      if (request.method === 'PATCH')  return handlePatchComment(request, env, id);
    }

    /* ── /media/<key> ── */
    if (path.startsWith('/media/')) {
      return handleMedia(path, env);
    }

    /* ── /admin → /admin.html ── */
    if (path === '/admin' || path === '/admin/') {
      const adminUrl = new URL(request.url);
      adminUrl.pathname = '/admin.html';
      const rewritten = new Request(adminUrl.toString(), request);
      return env.ASSETS.fetch(rewritten);
    }

    /* ── everything else → static assets ── */
    return env.ASSETS.fetch(request);
  },
};

/* ==========================================================================
   INITIAL CONTENT SEED
   Ported from the 22 hardcoded DATA entries in index.html.
   Each entry gets a deterministic UUID-like id (stable across cold starts).
   mediaKey: null because these are placeholder chips with no actual media.
   ========================================================================== */
const INITIAL_CONTENT = [
  {
    id: "1a000000-0000-0000-0000-000000000001",
    createdAt: "2026-04-29T00:00:00.000Z",
    date: "2026-04-29",
    title: "里山の稜線",
    themes: ["nature"],
    mediaType: "photo",
    body: "夕暮れ時、稜線が紫に変わる瞬間を3年間追い続けた記録。光は毎回違う顔を見せた。",
    mediaKey: null,
    size: "L"
  },
  {
    id: "1a000000-0000-0000-0000-000000000002",
    createdAt: "2026-03-14T00:00:00.000Z",
    date: "2026-03-14",
    title: "言葉の重力",
    themes: ["philosophy"],
    mediaType: "text",
    body: "書くことで思考が固まる。メモが草稿になり、草稿が問いになる過程を可視化する試み。",
    mediaKey: null,
    size: "M"
  },
  {
    id: "1a000000-0000-0000-0000-000000000003",
    createdAt: "2025-11-03T00:00:00.000Z",
    date: "2025-11-03",
    title: "仕組みの骨格",
    themes: ["system"],
    mediaType: "text",
    body: "毎朝繰り返す作業を0にした。人間がやらなくていいことは機械に任せる、その設計思想。",
    mediaKey: null,
    size: "M"
  },
  {
    id: "1a000000-0000-0000-0000-000000000004",
    createdAt: "2024-09-20T00:00:00.000Z",
    date: "2024-09-20",
    title: "教室の静けさ",
    themes: ["education"],
    mediaType: "video",
    body: "問いが生まれる瞬間の静寂がある。答えの直前ではなく、問いの直前の空気。",
    mediaKey: null,
    size: "M"
  },
  {
    id: "1a000000-0000-0000-0000-000000000005",
    createdAt: "2026-05-07T00:00:00.000Z",
    date: "2026-05-07",
    title: "8小節の宇宙",
    themes: ["music"],
    mediaType: "audio",
    body: "同じフレーズが繰り返されるたびに意味が変わる。ループは反復ではなく螺旋だ。",
    mediaKey: null,
    size: "M"
  },
  {
    id: "1a000000-0000-0000-0000-000000000006",
    createdAt: "2026-07-04T00:00:00.000Z",
    date: "2026-07-04",
    title: "森の設計論",
    themes: ["nature", "system"],
    mediaType: "text",
    body: "自然のパターンを仕組みに変換する実験。里山のエッジ効果をシステム設計に援用する。",
    mediaKey: null,
    size: "M"
  },
  {
    id: "1a000000-0000-0000-0000-000000000007",
    createdAt: "2024-04-12T00:00:00.000Z",
    date: "2024-04-12",
    title: "場所なき自己",
    themes: ["philosophy"],
    mediaType: "text",
    body: "国籍でも言語でもない、第三の帰属感を探している。それはまだ言葉になっていない。",
    mediaKey: null,
    size: "M"
  },
  {
    id: "1a000000-0000-0000-0000-000000000008",
    createdAt: "2025-08-25T00:00:00.000Z",
    date: "2025-08-25",
    title: "翻訳の余白",
    themes: ["philosophy"],
    mediaType: "audio",
    body: "訳せない言葉こそが文化の核心だ。その余白をどう渡すか、録音しながら考えた。",
    mediaKey: null,
    size: "M"
  },
  {
    id: "1a000000-0000-0000-0000-000000000009",
    createdAt: "2024-07-15T00:00:00.000Z",
    date: "2024-07-15",
    title: "雨の地図",
    themes: ["nature"],
    mediaType: "photo",
    body: "同じ場所で1年間、雨を記録した。季節ごとに音が変わる。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000010",
    createdAt: "2026-09-03T00:00:00.000Z",
    date: "2026-09-03",
    title: "自動化の詩",
    themes: ["system"],
    mediaType: "text",
    body: "コードが動く夜、私は何もしていない。それが設計の完成形だ。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000011",
    createdAt: "2024-10-08T00:00:00.000Z",
    date: "2024-10-08",
    title: "沈黙の長さ",
    themes: ["music"],
    mediaType: "audio",
    body: "音楽の中で最も雄弁なのは、音のない4拍目だ。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000012",
    createdAt: "2025-05-30T00:00:00.000Z",
    date: "2025-05-30",
    title: "問いの種",
    themes: ["education"],
    mediaType: "text",
    body: "良い問いは答えより長く生きる。それが教育の本質かもしれない。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000013",
    createdAt: "2025-09-11T00:00:00.000Z",
    date: "2025-09-11",
    title: "生態の文法",
    themes: ["nature", "philosophy"],
    mediaType: "text",
    body: "植物が情報を交換する方法を言語として読む視点。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000014",
    createdAt: "2026-06-17T00:00:00.000Z",
    date: "2026-06-17",
    title: "時間の形",
    themes: ["philosophy"],
    mediaType: "text",
    body: "線ではなく層として時間を感じる。過去は沈殿し、未来は浮遊する。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000015",
    createdAt: "2025-07-26T00:00:00.000Z",
    date: "2025-07-26",
    title: "祭りの拍動",
    themes: ["music"],
    mediaType: "audio",
    body: "村の祭りのリズムはグリッドの外にある。それが生きている証拠だ。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000016",
    createdAt: "2024-05-09T00:00:00.000Z",
    date: "2024-05-09",
    title: "意味の重なり",
    themes: ["philosophy"],
    mediaType: "text",
    body: "概念と言語が一致しない地点で思考が始まる。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000017",
    createdAt: "2024-08-14T00:00:00.000Z",
    date: "2024-08-14",
    title: "信号と雑音",
    themes: ["system"],
    mediaType: "audio",
    body: "ノイズの中にパターンを見つける訓練。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000018",
    createdAt: "2026-04-08T00:00:00.000Z",
    date: "2026-04-08",
    title: "野外の授業",
    themes: ["education"],
    mediaType: "video",
    body: "教室の外で初めて答える顔がある。土の上で問うこと。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000019",
    createdAt: "2026-08-19T00:00:00.000Z",
    date: "2026-08-19",
    title: "種の設計",
    themes: ["nature"],
    mediaType: "photo",
    body: "小さな殻の中に次の森がある。生命の情報圧縮。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000020",
    createdAt: "2025-10-05T00:00:00.000Z",
    date: "2025-10-05",
    title: "根のネット",
    themes: ["system"],
    mediaType: "text",
    body: "農村のコミュニティはプロトコルなき分散ネットワークだ。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000021",
    createdAt: "2024-06-22T00:00:00.000Z",
    date: "2024-06-22",
    title: "方言の地層",
    themes: ["philosophy"],
    mediaType: "audio",
    body: "地域の言葉は地形に刻まれた歴史の断面図だ。",
    mediaKey: null,
    size: "S"
  },
  {
    id: "1a000000-0000-0000-0000-000000000022",
    createdAt: "2025-04-17T00:00:00.000Z",
    date: "2025-04-17",
    title: "境界の倫理",
    themes: ["philosophy"],
    mediaType: "text",
    body: "どこで「私」が終わり「他者」が始まるかを問い続ける。",
    mediaKey: null,
    size: "S"
  },
];

/* ==========================================================================
   CORS HEADERS — open (same-origin in production, useful for local dev)
   ========================================================================== */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function corsResponse(body, init = {}) {
  const headers = { ...CORS_HEADERS, ...(init.headers || {}) };
  return new Response(body, { ...init, headers });
}

/* ==========================================================================
   GET /api/content
   Reads content.json from R2. If the object doesn't exist yet, returns the
   INITIAL_CONTENT seed so the front-end always has something to render.
   ========================================================================== */
async function handleGetContent(env) {
  try {
    const obj = await env.MEDIA.get('content.json');

    if (obj === null) {
      /* First visit — seed not yet written; return hardcoded initial data */
      return corsResponse(JSON.stringify(INITIAL_CONTENT), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const text = await obj.text();
    return corsResponse(text, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', /* always fresh — content changes on upload */
      },
    });
  } catch (err) {
    /* R2 unavailable (e.g. local preview without binding) → return seed */
    console.error('GET /api/content error:', err);
    return corsResponse(JSON.stringify(INITIAL_CONTENT), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

/* ==========================================================================
   POST /api/upload
   Auth: Authorization: Bearer <ADMIN_TOKEN>
   Body: multipart/form-data with fields:
     title       (required)
     date        (YYYY-MM-DD, required)
     themes      (comma-separated list, required — e.g. "nature,system")
     mediaType   (text | photo | audio | video, required)
     body        (optional — text body or caption)
     size        (S | M | L, optional, default M)
     file        (File, required for photo/audio/video types)
   ========================================================================== */
async function handleUpload(request, env) {
  /* ── Auth check ── */
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Parse multipart form data ── */
  let formData;
  try {
    formData = await request.formData();
  } catch (err) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Invalid form data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const title     = (formData.get('title') || '').trim();
  const date      = (formData.get('date')  || '').trim();
  const themesRaw = (formData.get('themes') || '').trim();
  const mediaType = (formData.get('mediaType') || '').trim();
  const body      = (formData.get('body')  || '').trim();
  const size      = (['S', 'M', 'L'].includes(formData.get('size'))) ? formData.get('size') : 'M';
  const file      = formData.get('file'); /* File object or null */

  /* ── Validate required fields ── */
  if (!title || !date || !themesRaw || !mediaType) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Missing required fields: title, date, themes, mediaType' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const themes = themesRaw.split(',').map(t => t.trim()).filter(Boolean);
  const validThemes = ['nature', 'system', 'education', 'music', 'philosophy'];
  const invalidTheme = themes.find(t => !validThemes.includes(t));
  if (invalidTheme) {
    return corsResponse(JSON.stringify({ ok: false, error: `Unknown theme: ${invalidTheme}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const validTypes = ['text', 'photo', 'audio', 'video'];
  if (!validTypes.includes(mediaType)) {
    return corsResponse(JSON.stringify({ ok: false, error: `Unknown mediaType: ${mediaType}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Upload file to R2 if applicable ── */
  let mediaKey = null;

  if (mediaType !== 'text') {
    if (!file || typeof file === 'string') {
      return corsResponse(JSON.stringify({ ok: false, error: 'File required for photo/audio/video types' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    /* Derive file extension from MIME type or original filename */
    const ext = deriveExtension(file.name, file.type);
    const uuid = crypto.randomUUID();
    mediaKey = `${uuid}.${ext}`;

    const r2Key = `media/${mediaKey}`;
    const fileBuffer = await file.arrayBuffer();

    try {
      await env.MEDIA.put(r2Key, fileBuffer, {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
      });
    } catch (err) {
      console.error('R2 put error:', err);
      return corsResponse(JSON.stringify({ ok: false, error: 'File upload failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /* ── Build new work entry ── */
  const newId = crypto.randomUUID();
  const newEntry = {
    id: newId,
    createdAt: new Date().toISOString(),
    date,
    title,
    themes,
    mediaType,
    body: body || null,
    mediaKey,
    size,
  };

  /* ── Read existing content.json from R2 (or use seed) ── */
  let entries;
  try {
    const existing = await env.MEDIA.get('content.json');
    entries = existing ? JSON.parse(await existing.text()) : [...INITIAL_CONTENT];
  } catch (err) {
    console.error('Reading content.json failed:', err);
    entries = [...INITIAL_CONTENT];
  }

  /* Prepend new entry (newest first) */
  entries.unshift(newEntry);

  /* ── Write updated content.json back to R2 ── */
  try {
    await env.MEDIA.put('content.json', JSON.stringify(entries), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (err) {
    console.error('Writing content.json failed:', err);
    return corsResponse(JSON.stringify({ ok: false, error: 'Failed to save metadata' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return corsResponse(JSON.stringify({ ok: true, id: newId, mediaKey }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ==========================================================================
   DELETE /api/posts/:id
   Auth: Authorization: Bearer <ADMIN_TOKEN>
   Removes the entry from content.json; also deletes the media file from R2
   if the entry has a mediaKey.
   ========================================================================== */
async function handleDeletePost(request, env, id) {
  /* ── Auth check ── */
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Load content.json ── */
  let entries;
  try {
    const obj = await env.MEDIA.get('content.json');
    entries = obj ? JSON.parse(await obj.text()) : [...INITIAL_CONTENT];
  } catch (err) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Failed to read content' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const entry = entries[idx];

  /* ── Delete media file from R2 if present ── */
  if (entry.mediaKey) {
    try {
      await env.MEDIA.delete(`media/${entry.mediaKey}`);
    } catch (err) {
      console.error('R2 media delete error (non-fatal):', err);
      /* Non-fatal: continue to remove metadata even if file delete fails */
    }
  }

  /* ── Remove entry and write back ── */
  entries.splice(idx, 1);
  try {
    await env.MEDIA.put('content.json', JSON.stringify(entries), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (err) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Failed to save content' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return corsResponse(JSON.stringify({ ok: true, id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ==========================================================================
   PATCH /api/posts/:id
   Auth: Authorization: Bearer <ADMIN_TOKEN>
   Accepts JSON body with any subset of: title, date, themes, body, size.
   Immutable fields (id, createdAt, mediaType, mediaKey) are silently ignored.
   ========================================================================== */
async function handlePatchPost(request, env, id) {
  /* ── Auth check ── */
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Parse JSON body ── */
  let patch;
  try {
    patch = await request.json();
  } catch (err) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Validate patch fields ── */
  const validThemes = ['nature', 'system', 'education', 'music', 'philosophy'];
  const validSizes  = ['S', 'M', 'L'];
  const dateRe      = /^\d{4}-\d{2}-\d{2}$/;

  if ('title' in patch && (typeof patch.title !== 'string' || !patch.title.trim())) {
    return corsResponse(JSON.stringify({ ok: false, error: 'title must be a non-empty string' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if ('date' in patch && !dateRe.test(patch.date)) {
    return corsResponse(JSON.stringify({ ok: false, error: 'date must match YYYY-MM-DD' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if ('themes' in patch) {
    if (!Array.isArray(patch.themes) || patch.themes.length === 0) {
      return corsResponse(JSON.stringify({ ok: false, error: 'themes must be a non-empty array' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const bad = patch.themes.find(t => !validThemes.includes(t));
    if (bad) {
      return corsResponse(JSON.stringify({ ok: false, error: `Unknown theme: ${bad}` }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  if ('size' in patch && !validSizes.includes(patch.size)) {
    return corsResponse(JSON.stringify({ ok: false, error: 'size must be S, M or L' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Load content.json ── */
  let entries;
  try {
    const obj = await env.MEDIA.get('content.json');
    entries = obj ? JSON.parse(await obj.text()) : [...INITIAL_CONTENT];
  } catch (err) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Failed to read content' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Merge allowed fields only ── */
  const allowed = ['title', 'date', 'themes', 'body', 'size'];
  const updated  = { ...entries[idx] };
  for (const key of allowed) {
    if (key in patch) updated[key] = key === 'title' ? patch[key].trim() : patch[key];
  }
  entries[idx] = updated;

  /* ── Write back ── */
  try {
    await env.MEDIA.put('content.json', JSON.stringify(entries), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (err) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Failed to save content' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return corsResponse(JSON.stringify({ ok: true, entry: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ==========================================================================
   GET /media/<key>
   Proxies an object from the R2 bucket's `media/` prefix.
   Sets a long cache-control header since media objects are immutable.
   ========================================================================== */
async function handleMedia(path, env) {
  /* path = "/media/abc123.jpg" → key = "media/abc123.jpg" */
  const key = path.slice(1); /* strip leading "/" */

  let obj;
  try {
    obj = await env.MEDIA.get(key);
  } catch (err) {
    return new Response('Storage error', { status: 500 });
  }

  if (obj === null) {
    return new Response('Not found', { status: 404 });
  }

  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';

  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': obj.etag || '',
    },
  });
}

/* ==========================================================================
   PUT /api/posts/:id/media
   Auth: Authorization: Bearer <ADMIN_TOKEN>
   Body: multipart/form-data with field `file` (required).
   Replaces the media file for an existing non-text entry.
   ========================================================================== */
async function handleReplaceMedia(request, env, id) {
  /* ── Auth check ── */
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Load content.json ── */
  let entries;
  try {
    const obj = await env.MEDIA.get('content.json');
    entries = obj ? JSON.parse(await obj.text()) : [...INITIAL_CONTENT];
  } catch (err) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Failed to read content' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const entry = entries[idx];
  if (entry.mediaType === 'text') {
    return corsResponse(JSON.stringify({ ok: false, error: 'テキスト投稿にはメディアがありません' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Parse multipart form data ── */
  let formData;
  try {
    formData = await request.formData();
  } catch (err) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Invalid form data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return corsResponse(JSON.stringify({ ok: false, error: 'file フィールドが必要です' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Upload new file to R2 ── */
  const ext = deriveExtension(file.name, file.type);
  const newKey = `${crypto.randomUUID()}.${ext}`;
  const r2Key  = `media/${newKey}`;
  const fileBuffer = await file.arrayBuffer();

  try {
    await env.MEDIA.put(r2Key, fileBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
  } catch (err) {
    console.error('R2 put error:', err);
    return corsResponse(JSON.stringify({ ok: false, error: 'File upload failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Delete old media file (non-fatal) ── */
  const oldKey = entry.mediaKey;
  if (oldKey) {
    try {
      await env.MEDIA.delete(`media/${oldKey}`);
    } catch (err) {
      console.error('R2 old media delete error (non-fatal):', err);
    }
  }

  /* ── Update entry and write back ── */
  const updated = { ...entry, mediaKey: newKey };
  entries[idx] = updated;

  try {
    await env.MEDIA.put('content.json', JSON.stringify(entries), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (err) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Failed to save content' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return corsResponse(JSON.stringify({ ok: true, entry: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ==========================================================================
   COMMENTS — helpers
   ========================================================================== */

const NG_WORDS = ['fuck', 'shit', 'bitch', 'asshole', 'クソ', '氏ね', '死ね', 'ばか死', 'カス', '消えろ'];

async function readComments(env) {
  try {
    const obj = await env.MEDIA.get('comments.json');
    if (!obj) return [];
    return JSON.parse(await obj.text());
  } catch (_) {
    return [];
  }
}

async function writeComments(env, comments) {
  await env.MEDIA.put('comments.json', JSON.stringify(comments), {
    httpMetadata: { contentType: 'application/json' },
  });
}

function stripIp(comment) {
  const { ip: _ip, ...rest } = comment;
  return rest;
}

/* ==========================================================================
   GET /api/comments?workId=X  (public)
   ========================================================================== */
async function handleGetComments(request, env) {
  const url = new URL(request.url);
  const workId = url.searchParams.get('workId') || '';

  const all = await readComments(env);

  const filtered = all
    .filter(c => c.workId === workId && c.status === 'approved')
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0))
    .map(stripIp);

  return corsResponse(JSON.stringify(filtered), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/* ==========================================================================
   POST /api/comments  (public, rate-limited)
   ========================================================================== */
async function handlePostComment(request, env) {
  /* ── Rate limit ── */
  const IP_LIMITS = globalThis.__ipLimits || (globalThis.__ipLimits = new Map());
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const last = IP_LIMITS.get(ip) || 0;
  if (now - last < 30000) {
    return corsResponse(JSON.stringify({ ok: false, error: '投稿間隔が短すぎます（30秒待ってください）' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Parse body ── */
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { workId, color, text: rawText } = body || {};
  const text = typeof rawText === 'string' ? rawText.trim() : '';

  /* ── Validate workId ── */
  if (!workId || typeof workId !== 'string') {
    return corsResponse(JSON.stringify({ ok: false, error: 'workId is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  /* Check workId exists in content.json */
  try {
    const contentObj = await env.MEDIA.get('content.json');
    const entries = contentObj ? JSON.parse(await contentObj.text()) : [...INITIAL_CONTENT];
    if (!entries.find(e => e.id === workId)) {
      return corsResponse(JSON.stringify({ ok: false, error: 'workId not found' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (_) {
    /* If content.json unreadable, fall back to INITIAL_CONTENT check */
    if (!INITIAL_CONTENT.find(e => e.id === workId)) {
      return corsResponse(JSON.stringify({ ok: false, error: 'workId not found' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /* ── Validate color ── */
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return corsResponse(JSON.stringify({ ok: false, error: 'color must be #RRGGBB' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Validate text length ── */
  if (text.length < 2 || text.length > 140) {
    return corsResponse(JSON.stringify({ ok: false, error: 'テキストは2〜140文字で入力してください' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── NG word filter ── */
  const lower = text.toLowerCase();
  const ngHit = NG_WORDS.find(w => lower.includes(w.toLowerCase()));
  if (ngHit) {
    return corsResponse(JSON.stringify({ ok: false, error: '使用できない言葉が含まれています' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  /* ── Record rate limit ── */
  IP_LIMITS.set(ip, now);

  /* ── Build comment ── */
  const comment = {
    id: crypto.randomUUID(),
    workId,
    color,
    text,
    createdAt: new Date().toISOString(),
    ip,
    status: 'approved',
  };

  /* ── Append to comments.json ── */
  const comments = await readComments(env);
  comments.push(comment);
  try {
    await writeComments(env, comments);
  } catch (err) {
    console.error('writeComments error:', err);
    return corsResponse(JSON.stringify({ ok: false, error: '保存に失敗しました' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return corsResponse(JSON.stringify({ ok: true, comment: stripIp(comment) }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
}

/* ==========================================================================
   GET /api/admin/comments  (auth)
   Returns full list including ip and all statuses.
   ========================================================================== */
async function handleAdminGetComments(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const comments = await readComments(env);
  /* Sort newest first */
  comments.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));

  return corsResponse(JSON.stringify(comments), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/* ==========================================================================
   DELETE /api/comments/:id  (auth)
   ========================================================================== */
async function handleDeleteComment(request, env, id) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const comments = await readComments(env);
  const idx = comments.findIndex(c => c.id === id);
  if (idx === -1) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  comments.splice(idx, 1);
  try {
    await writeComments(env, comments);
  } catch (err) {
    return corsResponse(JSON.stringify({ ok: false, error: '保存に失敗しました' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return corsResponse(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

/* ==========================================================================
   PATCH /api/comments/:id  (auth)
   Body: { status: 'approved' | 'rejected' }
   ========================================================================== */
async function handlePatchComment(request, env, id) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let patch;
  try {
    patch = await request.json();
  } catch (_) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { status } = patch || {};
  if (!['approved', 'rejected'].includes(status)) {
    return corsResponse(JSON.stringify({ ok: false, error: 'status must be "approved" or "rejected"' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const comments = await readComments(env);
  const idx = comments.findIndex(c => c.id === id);
  if (idx === -1) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  comments[idx] = { ...comments[idx], status };
  try {
    await writeComments(env, comments);
  } catch (err) {
    return corsResponse(JSON.stringify({ ok: false, error: '保存に失敗しました' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return corsResponse(JSON.stringify({ ok: true, comment: comments[idx] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

/* ==========================================================================
   HELPERS
   ========================================================================== */

/**
 * Derive a file extension from the original filename or MIME type.
 * Falls back to 'bin' if nothing matches.
 */
function deriveExtension(filename, mimeType) {
  /* Try filename extension first */
  if (filename) {
    const parts = filename.split('.');
    if (parts.length > 1) {
      const ext = parts[parts.length - 1].toLowerCase();
      if (/^[a-z0-9]{1,10}$/.test(ext)) return ext;
    }
  }

  /* Fall back to MIME type map */
  const mimeMap = {
    'image/jpeg':       'jpg',
    'image/jpg':        'jpg',
    'image/png':        'png',
    'image/gif':        'gif',
    'image/webp':       'webp',
    'image/avif':       'avif',
    'image/heic':       'heic',
    'video/mp4':        'mp4',
    'video/webm':       'webm',
    'video/quicktime':  'mov',
    'audio/mpeg':       'mp3',
    'audio/mp3':        'mp3',
    'audio/ogg':        'ogg',
    'audio/wav':        'wav',
    'audio/aac':        'aac',
    'audio/flac':       'flac',
    'audio/x-m4a':      'm4a',
    'audio/mp4':        'm4a',
  };

  return mimeMap[mimeType] || 'bin';
}
