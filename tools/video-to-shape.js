#!/usr/bin/env node
// video-to-shape.js — draft a RubixSnake shape JSON from a YouTube build-along video.
//
// Most snake-cube videos never narrate folds precisely enough to fully
// reconstruct a 23-joint sequence, so this is a *scaffold* generator, not a
// solver: it pulls the auto-captions (if any), scans them for fold language
// ("fold right", "flip it back", "straight", ...) in caption order, and fills
// each matched joint. Anything it can't confidently match is left as "?" —
// the app's existing Import flow already treats unknown joint letters as
// "needs reconciliation" and highlights them in orange, so the output pastes
// straight into the Editor's Import card ready for a human to finish.
//
// Requires: yt-dlp on PATH (https://github.com/yt-dlp/yt-dlp).
//
// Usage:
//   node tools/video-to-shape.js <youtube-url> [--name "Shape Name"] [--out file.json]

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const JOINT_TYPES = ['S', 'R', 'L', 'F'];
const NUM_JOINTS = 23;

// Ordered so longer/more specific phrases are tried before generic ones.
const KEYWORD_RULES = [
  { type: 'F', re: /\bflip(?:s|ped)?\b|\b180\b|fold.*back|back.*fold/i },
  { type: 'S', re: /\bstraight\b|no fold|continue(?:s|d)? straight|keep(?:ing)? going/i },
  { type: 'R', re: /\bright\b|\bup(?:ward)?\b|clockwise/i },
  { type: 'L', re: /\bleft\b|\bdown(?:ward)?\b|counter-?clockwise/i },
];

function usage(msg) {
  if (msg) console.error('Error: ' + msg + '\n');
  console.error('Usage: node tools/video-to-shape.js <youtube-url> [--name "Shape Name"] [--out file.json]');
  process.exit(msg ? 1 : 0);
}

function parseArgs(argv) {
  const args = { url: null, name: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name') { args.name = argv[++i]; }
    else if (a === '--out') { args.out = argv[++i]; }
    else if (a === '-h' || a === '--help') { usage(); }
    else if (!args.url) { args.url = a; }
  }
  return args;
}

function tryYtDlp(argList) {
  try {
    return execFileSync('yt-dlp', argList, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return null;
  }
}

function fetchTitle(url) {
  const out = tryYtDlp(['--skip-download', '--print', '%(title)s', url]);
  return out ? out.trim() : null;
}

// Downloads auto-generated (or manual, if available) English captions as VTT
// into a temp dir and returns the parsed plain-text cues, or [] on failure.
function fetchCaptionCues(url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2s-'));
  const base = path.join(dir, 'cap');
  const ok = tryYtDlp([
    '--skip-download', '--write-auto-sub', '--write-sub',
    '--sub-lang', 'en.*,en',
    '--sub-format', 'vtt',
    '-o', base + '.%(ext)s',
    url,
  ]);
  if (ok === null) return [];

  const vtt = fs.readdirSync(dir).find(function (f) { return f.endsWith('.vtt'); });
  if (!vtt) return [];

  const text = fs.readFileSync(path.join(dir, vtt), 'utf8');
  return parseVtt(text);
}

// Minimal WebVTT parser: returns [{ start: "00:00:01.000", text: "..." }, ...]
// with cue-internal duplicate lines (common in auto-caption "rolling" cues)
// collapsed.
function parseVtt(text) {
  const lines = text.split(/\r?\n/);
  const cues = [];
  let curStart = null;
  let curText = [];
  const timeRe = /^(\d\d:\d\d:\d\d\.\d\d\d)\s*-->/;

  function flush() {
    if (curStart && curText.length) {
      const clean = curText.join(' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (clean) cues.push({ start: curStart, text: clean });
    }
    curStart = null; curText = [];
  }

  lines.forEach(function (line) {
    const m = line.match(timeRe);
    if (m) { flush(); curStart = m[1]; return; }
    if (!line.trim() || /^WEBVTT/.test(line) || /^\d+$/.test(line.trim())) return;
    curText.push(line);
  });
  flush();

  // Drop consecutive cues with identical text (auto-caption scrolling repeats them).
  return cues.filter(function (c, i) { return i === 0 || c.text !== cues[i - 1].text; });
}

// Walk cues in order; assign the first matching keyword in each cue to the
// next *unfilled* joint slot. This assumes the video narrates folds in joint
// order, which holds for a straightforward build-along but not for videos
// that jump around — treat the result as a draft, not ground truth.
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
        return; // one match per cue, first rule wins
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) usage('missing <youtube-url>');

  if (tryYtDlp(['--version']) === null) {
    usage('yt-dlp not found on PATH. Install it first: https://github.com/yt-dlp/yt-dlp#installation');
  }

  console.error('Fetching video title…');
  const title = fetchTitle(args.url);

  console.error('Fetching captions/transcript (if available)…');
  const cues = fetchCaptionCues(args.url);
  if (!cues.length) {
    console.error('  No usable captions found — emitting a blank 23-joint scaffold for manual entry.');
  } else {
    console.error('  Got ' + cues.length + ' caption cues.');
  }

  const draft = draftJointsFromCues(cues);
  const shape = buildShapeJson(args.name || title, args.url, draft.joints, draft.descs);
  const json = JSON.stringify(shape, null, 2);

  const outFile = args.out || (slug(shape.name) + '.shape.json');
  fs.writeFileSync(outFile, json);

  const resolved = draft.joints.filter(function (t) { return JOINT_TYPES.indexOf(t) >= 0; }).length;
  console.error('\nResolved ' + resolved + '/' + NUM_JOINTS + ' joints from the transcript.');
  console.error('Wrote ' + outFile + ' — paste its contents into the Editor tab\'s Import card.');
  console.error('Unmatched joints are marked "?" and will show as orange "needs reconciliation" segments on import.');
}

function slug(s) {
  return String(s || 'video-draft').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video-draft';
}

main();
