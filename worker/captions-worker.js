// captions-worker.js — Cloudflare Worker
//
// Server-side counterpart to tools/video-to-shape.js: given a YouTube URL,
// fetches the watch page, pulls out the caption track list, downloads an
// English track as structured JSON, and runs the same fold-keyword
// heuristic to draft a RubixSnake shape JSON. Exists because browsers can't
// fetch youtube.com directly (CORS) and a phone can't run yt-dlp.
//
// Deploy: `wrangler deploy` from this directory (free Cloudflare account,
// see https://developers.cloudflare.com/workers/get-started/guide/).
// Then paste the resulting *.workers.dev URL into video-import.html.

const JOINT_TYPES = ['S', 'R', 'L', 'F'];
const NUM_JOINTS = 23;

const KEYWORD_RULES = [
  { type: 'F', re: /\bflip(?:s|ped)?\b|\b180\b|fold.*back|back.*fold/i },
  { type: 'S', re: /\bstraight\b|no fold|continue(?:s|d)? straight|keep(?:ing)? going/i },
  { type: 'R', re: /\bright\b|\bup(?:ward)?\b|clockwise/i },
  { type: 'L', re: /\bleft\b|\bdown(?:ward)?\b|counter-?clockwise/i },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function videoIdFromUrl(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/);
  return m ? m[1] : null;
}

async function fetchCaptionTracks(videoId) {
  const res = await fetch('https://www.youtube.com/watch?v=' + videoId, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) throw new Error('watch page fetch failed: HTTP ' + res.status);
  const html = await res.text();
  const m = html.match(/"captionTracks":(\[.*?\])(?=,")/);
  if (!m) return [];
  try { return JSON.parse(m[1]); } catch (e) { return []; }
}

function pickTrack(tracks) {
  if (!tracks.length) return null;
  return tracks.find(function (t) { return t.languageCode === 'en' && t.kind !== 'asr'; })
    || tracks.find(function (t) { return t.languageCode === 'en'; })
    || tracks.find(function (t) { return t.languageCode && t.languageCode.indexOf('en') === 0; })
    || tracks[0];
}

// json3 format: { events: [{ tStartMs, segs: [{ utf8 }, ...] }, ...] }
async function fetchCuesJson3(baseUrl) {
  const res = await fetch(baseUrl + '&fmt=json3', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('caption track fetch failed: HTTP ' + res.status);
  const data = await res.json();
  const cues = [];
  (data.events || []).forEach(function (ev) {
    if (!ev.segs) return;
    const text = ev.segs.map(function (s) { return s.utf8 || ''; }).join('').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const ms = ev.tStartMs || 0;
    const start = new Date(ms).toISOString().substr(11, 12);
    cues.push({ start: start, text: text });
  });
  return cues.filter(function (c, i) { return i === 0 || c.text !== cues[i - 1].text; });
}

function draftJointsFromCues(cues) {
  const joints = new Array(NUM_JOINTS).fill('?');
  const descs = new Array(NUM_JOINTS).fill('');
  let next = 0;
  cues.forEach(function (cue) {
    if (next >= NUM_JOINTS) return;
    for (let r = 0; r < KEYWORD_RULES.length; r++) {
      if (KEYWORD_RULES[r].re.test(cue.text)) {
        joints[next] = KEYWORD_RULES[r].type;
        descs[next] = '[' + cue.start + '] "' + cue.text + '"';
        next++;
        return;
      }
    }
  });
  return { joints: joints, descs: descs };
}

function buildShapeJson(name, sourceUrl, joints, descs) {
  const steps = joints.map(function (t, i) {
    return {
      segment: i + 1,
      action: t,
      description: descs[i] || 'Not found in transcript — watch the video and fill this fold in manually.',
    };
  });
  const resolved = joints.filter(function (t) { return JOINT_TYPES.indexOf(t) >= 0; }).length;
  return {
    name: name || 'Video Draft',
    emoji: '🎥',
    description: 'Auto-drafted from ' + sourceUrl + ' (' + resolved + '/' + NUM_JOINTS + ' folds matched from captions). ' +
      'Import this into the Editor, then use the orange-highlighted "?" segments as your to-do list to finish by hand.',
    closing: 'Close the two ends together to lock the shape.',
    steps: steps,
  };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function handle(request) {
  const reqUrl = new URL(request.url);
  const videoUrl = reqUrl.searchParams.get('url');
  if (!videoUrl) {
    return new Response(JSON.stringify({ error: 'missing ?url=' }), { status: 400, headers: CORS_HEADERS });
  }
  const videoId = videoIdFromUrl(videoUrl);
  if (!videoId) {
    return new Response(JSON.stringify({ error: 'not a recognizable YouTube URL' }), { status: 400, headers: CORS_HEADERS });
  }

  try {
    const tracks = await fetchCaptionTracks(videoId);
    const track = pickTrack(tracks);
    const cues = track ? await fetchCuesJson3(track.baseUrl) : [];
    const draft = draftJointsFromCues(cues);
    const shape = buildShapeJson(null, videoUrl, draft.joints, draft.descs);
    return new Response(JSON.stringify(shape, null, 2), {
      headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: CORS_HEADERS });
  }
}

addEventListener('fetch', function (event) {
  if (event.request.method === 'OPTIONS') {
    event.respondWith(new Response(null, { headers: CORS_HEADERS }));
  } else {
    event.respondWith(handle(event.request));
  }
});
