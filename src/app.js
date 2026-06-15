// app.js — main application logic

(function () {

  // ── constants ──────────────────────────────────────────────────────────────
  var UI = {
    S: { col: '#58a6ff', bg: 'rgba(88,166,255,.12)',  lbl: 'STRAIGHT',       em: '&#8594;' },
    R: { col: '#f0883e', bg: 'rgba(240,136,62,.15)',  lbl: 'FOLD RIGHT 90°', em: '&#8618;' },
    L: { col: '#3fb950', bg: 'rgba(63,185,80,.15)',   lbl: 'FOLD LEFT 90°',  em: '&#8617;' },
    F: { col: '#a371f7', bg: 'rgba(163,113,247,.15)', lbl: 'FLIP 180°',      em: '&#8635;' },
  };

  function pl(jid) { return jid % 2 === 1 ? 'vertical' : 'horizontal'; }

  function dirtxt(t, jid) {
    if (t === 'S') return 'Continue straight — no fold needed';
    if (t === 'F') return '↺ Flip segment B 180° — fold it straight back the way it came';
    var p = pl(jid);
    if (t === 'R') return p === 'vertical' ? '↑ Fold segment B UPWARD' : '▶ Fold segment B to the RIGHT';
    return p === 'vertical' ? '↓ Fold segment B DOWNWARD' : '◀ Fold segment B to the LEFT';
  }

  // ── state ──────────────────────────────────────────────────────────────────
  var activeTab   = 'guide';   // 'guide' | 'engine' | 'editor'
  var guideStep   = 0;         // 0=intro, 1–23=joints, 24=done
  var edSeg = 0;               // selected segment in editor
  var edXf  = {};              // per-segment rotation overrides { id: degrees }
  var edFocusAll = true;       // 3D camera: true = fit whole snake, false = zoom to edSeg
  var edRevealCount = 2;       // how many segments are revealed/built in the editor
  var engStep = 23;            // fold-by-fold step shown in Engine 3D/2D preview (0-23)
  var activeShape = null;      // shape object from Shapes library
  var iSrc = null, iB64 = null, iMime = 'image/jpeg';
  var busy = false, verRes = null, verOk = false;
  var akey = localStorage.getItem('sak') || '';

  // ── init ───────────────────────────────────────────────────────────────────
  function init() {
    document.getElementById('kbtn').onclick = toggleKey;
    document.getElementById('ksave').onclick = saveKey;
    document.getElementById('bbk').onclick  = function () { navStep(-1); };
    document.getElementById('bfwd').onclick = function () { if (canFwd()) navStep(1); };

    document.getElementById('tab-guide').onclick  = function () { switchTab('guide'); };
    document.getElementById('tab-engine').onclick = function () { switchTab('engine'); };
    document.getElementById('tab-editor').onclick = function () { switchTab('editor'); };

    loadCustomShapes();

    // load default shape
    activeShape = Shapes.getById('rectangle');
    render();
  }

  // ── custom shape import ──────────────────────────────────────────────────
  var JOINT_TYPES = ['S', 'R', 'L', 'F'];

  function loadCustomShapes() {
    var raw = localStorage.getItem('customShapes');
    if (!raw) return;
    try {
      JSON.parse(raw).forEach(function (s) { Shapes.add(s); });
    } catch (e) { /* ignore corrupt storage */ }
  }

  function saveCustomShapes() {
    var raw = localStorage.getItem('customShapes');
    var list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch (e) { list = []; }
    return list;
  }

  // Accepts either a bare 23-element joints array, or a full shape object
  // { name, emoji, description, closing, joints }. Returns an error string,
  // or null on success.
  function importShape(text, name) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return 'Invalid JSON: ' + e.message; }
    var joints = Array.isArray(parsed) ? parsed : parsed.joints;
    if (!Array.isArray(joints) || joints.length !== 23) return 'joints must be an array of 23 S/R/L/F values';
    for (var i = 0; i < joints.length; i++) {
      if (JOINT_TYPES.indexOf(joints[i]) < 0) return 'joint ' + (i+1) + ' is "' + joints[i] + '" — must be S, R, L, or F';
    }
    var meta = Array.isArray(parsed) ? {} : parsed;
    var shape = {
      id: 'custom-' + Date.now(),
      name: (name || meta.name || 'Custom Shape'),
      emoji: meta.emoji || '✨',
      description: meta.description || 'A custom imported shape.',
      closing: meta.closing || 'Close the two ends together to lock the shape.',
      joints: joints.slice(),
    };
    Shapes.add(shape);
    var list = saveCustomShapes();
    list.push(shape);
    localStorage.setItem('customShapes', JSON.stringify(list));
    return null;
  }

  // Shared "Import shape (JSON)" card — used by both the Guide intro and the Editor.
  function importCardHtml() {
    return '<div class="card">' +
      '<div class="lbl">Import shape (JSON)</div>' +
      '<p style="color:#6e7681;font-size:11px;margin-bottom:8px">Paste a 23-element joints array (e.g. from the Engine or Editor "Copy JSON" buttons), or a full shape object with name/emoji/description/joints.</p>' +
      '<input id="imp-name" placeholder="Name (optional)" style="width:100%;padding:9px;margin-bottom:8px;background:#0d1117;border:1px solid #30363d;border-radius:7px;color:#fff;font-size:12px">' +
      '<textarea id="imp-json" rows="3" placeholder=\'["S","S","S",...]\' style="width:100%;padding:9px;background:#0d1117;border:1px solid #30363d;border-radius:7px;color:#c9d1d9;font-size:11px;font-family:monospace;resize:vertical"></textarea>' +
      '<div id="imp-err" style="color:#f85149;font-size:11px;margin-top:6px"></div>' +
      '<button id="imp-btn" style="margin-top:8px;width:100%;padding:10px;background:#21262d;border:1px solid #30363d;border-radius:8px;color:#c9d1d9;font-size:13px;font-weight:700">Import Shape</button>' +
    '</div>';
  }

  // Wires up the card produced by importCardHtml(). onSuccess runs after a
  // successful import (the new shape is now the last entry in Shapes.getAll()).
  function wireImportCard(onSuccess) {
    var btn = document.getElementById('imp-btn');
    if (!btn) return;
    btn.onclick = function () {
      var text = document.getElementById('imp-json').value.trim();
      var name = document.getElementById('imp-name').value.trim();
      var err = document.getElementById('imp-err');
      if (!text) { err.textContent = 'Paste a joints array or shape JSON first.'; return; }
      var msg = importShape(text, name);
      if (msg) { err.textContent = msg; return; }
      err.textContent = '';
      onSuccess();
    };
  }

  function switchTab(t) {
    activeTab = t;
    document.getElementById('tab-guide').className  = 'tab' + (t === 'guide'  ? ' active' : '');
    document.getElementById('tab-engine').className = 'tab' + (t === 'engine' ? ' active' : '');
    document.getElementById('tab-editor').className = 'tab' + (t === 'editor' ? ' active' : '');
    document.getElementById('navrow').style.display = t === 'guide' && guideStep >= 1 && guideStep <= 23 ? 'flex' : 'none';
    document.getElementById('pbar').style.display   = t === 'guide' ? 'block' : 'none';
    // Apply/clear editor transforms so guide & engine always see raw geometry
    Snake.clearSegTransforms();
    Renderer3D.clearEditor();
    if (t === 'editor') {
      Object.keys(edXf).forEach(function (id) { Snake.setSegTransform(+id, edXf[id]); });
    }
    render();
  }

  // ── guide navigation ───────────────────────────────────────────────────────
  function navStep(delta) {
    guideStep = Math.max(0, Math.min(24, guideStep + delta));
    clearPhoto();
    render();
  }

  function clearPhoto() { iSrc = null; iB64 = null; iMime = 'image/jpeg'; busy = false; verRes = null; verOk = false; }

  function canFwd() { return !iSrc || verOk || (verRes && verRes.pass); }

  function jnt() {
    if (!activeShape || guideStep < 1 || guideStep > 23) return null;
    return { id: guideStep, t: activeShape.joints[guideStep - 1] };
  }

  // Translate the editor's per-segment rotation overrides (edXf, in degrees)
  // back into a joint-type array. An edXf rotation of `deg` on segment i is
  // the same hinge-axis/pivot rotation a joint applies, so it composes with
  // joint i-1's existing angle (S=0, R=90, F=180, L=270) to give a new type.
  var JOINT_ANGLE = { S: 0, R: 90, F: 180, L: 270 };
  var ANGLE_JOINT = { 0: 'S', 90: 'R', 180: 'F', 270: 'L' };
  function editedJoints() {
    var joints = (activeShape ? activeShape.joints : Array(23).fill('S')).slice();
    Object.keys(edXf).forEach(function (segId) {
      var i = +segId, ji = i - 1;
      if (ji < 0 || ji >= joints.length) return;
      var deg = edXf[segId] || 0;
      if (!deg) return;
      var newAngle = (((JOINT_ANGLE[joints[ji]] || 0) + deg) % 360 + 360) % 360;
      joints[ji] = ANGLE_JOINT[newAngle] || joints[ji];
    });
    return joints;
  }

  // ── file handling ──────────────────────────────────────────────────────────
  function onFile(f) {
    if (!f) return;
    iMime = f.type || 'image/jpeg';
    iSrc  = URL.createObjectURL(f);
    verRes = null; verOk = false;
    var r = new FileReader();
    r.onload = function (e) { iB64 = e.target.result.split(',')[1]; render(); };
    r.readAsDataURL(f);
    render();
  }

  // ── AI verify ─────────────────────────────────────────────────────────────
  function verify() {
    var j = jnt();
    if (!iB64 || !j) return;
    if (!akey) { alert('Enter your Anthropic API key — tap ⚙'); return; }
    busy = true; render();
    var a = j.id - 1, b = j.id;
    var prompt = 'Rubik\'s Snake fold check.\nColors repeat: 1=Blue 2=Orange 3=Pink 4=White 5=Red 6=Green\n\nJoint ' + j.id + '/23 | ' + UI[j.t].lbl + ' | ' + pl(j.id) + ' plane\nSeg A=#' + (a+1) + ' ' + Snake.segColor(a).n + '  Seg B=#' + (b+1) + ' ' + Snake.segColor(b).n + '\n\nReply EXACTLY:\nVERDICT: PASS or VERDICT: NEEDS ADJUSTMENT\nCOLORS: ...\nFOLD: ...\nTIP: ...';
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': akey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5', max_tokens: 250,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: iMime, data: iB64 } },
          { type: 'text',  text: prompt },
        ]}],
      }),
    }).then(function (r2) { return r2.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error.message);
      var t = (d.content && d.content[0] && d.content[0].text) || 'No response';
      var pass = t.toLowerCase().indexOf('verdict: pass') >= 0;
      verRes = { pass: pass, text: t };
      if (pass) verOk = true;
      busy = false; render();
    }).catch(function (e) {
      verRes = { pass: false, text: 'Error: ' + e.message + '\nCheck API key in ⚙' };
      busy = false; render();
    });
  }

  // ── key panel ─────────────────────────────────────────────────────────────
  function toggleKey() {
    var p = document.getElementById('kpanel');
    var open = p.style.display === 'flex';
    p.style.display = open ? 'none' : 'flex';
    if (!open) document.getElementById('kinput').value = akey;
  }
  function saveKey() {
    akey = document.getElementById('kinput').value.trim();
    localStorage.setItem('sak', akey);
    document.getElementById('kpanel').style.display = 'none';
  }

  // ── SVG fold diagram ───────────────────────────────────────────────────────
  function svgBox(x, y, col, lbl) {
    var tf = col === '#e8e8e8' ? '#333' : '#fff';
    return '<rect x="' + x + '" y="' + y + '" width="60" height="22" rx="5" fill="' + col + '"/>' +
      '<rect x="' + x + '" y="' + y + '" width="60" height="22" rx="5" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/>' +
      '<text x="' + (x+30) + '" y="' + (y+15) + '" text-anchor="middle" fill="' + tf + '" font-size="9.5" font-weight="bold">' + lbl + '</text>';
  }

  function svgDiag(t, jid, ai, bi) {
    var p = pl(jid), cc = UI[t].col, ca = Snake.segColor(ai).h, na = Snake.segColor(ai).n, cb = Snake.segColor(bi).h, nb = Snake.segColor(bi).n;
    if (t === 'S') return '<svg viewBox="0 0 240 72" style="width:100%;max-width:280px;display:block;margin:0 auto">' + svgBox(8,25,ca,na) + '<line x1="70" y1="36" x2="165" y2="36" stroke="' + cc + '" stroke-width="3"/><polygon points="170,36 158,30 158,42" fill="' + cc + '"/>' + svgBox(172,25,cb,nb) + '</svg>';
    if (t === 'R' && p === 'vertical')   return '<svg viewBox="0 0 240 115" style="width:100%;max-width:280px;display:block;margin:0 auto">' + svgBox(8,62,ca,na) + '<path d="M82,73 C82,38 115,26 138,26" fill="none" stroke="' + cc + '" stroke-width="3" stroke-linecap="round"/><polygon points="152,26 138,20 138,32" fill="' + cc + '"/>' + svgBox(154,15,cb,nb) + '<text x="82" y="108" fill="' + cc + '" font-size="10" font-weight="bold">↑ FOLD UP (vertical)</text></svg>';
    if (t === 'R' && p === 'horizontal') return '<svg viewBox="0 0 240 96" style="width:100%;max-width:280px;display:block;margin:0 auto">' + svgBox(8,35,ca,na) + '<path d="M82,46 C116,46 126,20 146,20" fill="none" stroke="' + cc + '" stroke-width="3" stroke-linecap="round"/><polygon points="160,20 146,14 146,26" fill="' + cc + '"/>' + svgBox(162,9,cb,nb) + '<text x="82" y="86" fill="' + cc + '" font-size="10" font-weight="bold">▶ FOLD RIGHT (horizontal)</text></svg>';
    if (t === 'L' && p === 'vertical')   return '<svg viewBox="0 0 240 115" style="width:100%;max-width:280px;display:block;margin:0 auto">' + svgBox(8,18,ca,na) + '<path d="M82,29 C82,64 115,76 138,76" fill="none" stroke="' + cc + '" stroke-width="3" stroke-linecap="round"/><polygon points="152,76 138,70 138,82" fill="' + cc + '"/>' + svgBox(154,65,cb,nb) + '<text x="82" y="108" fill="' + cc + '" font-size="10" font-weight="bold">↓ FOLD DOWN (vertical)</text></svg>';
    if (t === 'L' && p === 'horizontal') return '<svg viewBox="0 0 240 96" style="width:100%;max-width:280px;display:block;margin:0 auto">' + svgBox(8,9,ca,na) + '<path d="M82,20 C116,20 126,46 146,46" fill="none" stroke="' + cc + '" stroke-width="3" stroke-linecap="round"/><polygon points="160,46 146,40 146,52" fill="' + cc + '"/>' + svgBox(162,35,cb,nb) + '<text x="82" y="86" fill="' + cc + '" font-size="10" font-weight="bold">◀ FOLD LEFT (horizontal)</text></svg>';
    // F: 180° flip — segment B folds straight back, reversing direction
    return '<svg viewBox="0 0 240 100" style="width:100%;max-width:280px;display:block;margin:0 auto">' + svgBox(8,60,ca,na) + '<path d="M68,71 C160,71 175,45 175,35 C175,22 160,18 80,18" fill="none" stroke="' + cc + '" stroke-width="3" stroke-linecap="round"/><polygon points="68,18 80,12 80,24" fill="' + cc + '"/>' + svgBox(8,7,cb,nb) + '<text x="120" y="95" text-anchor="middle" fill="' + cc + '" font-size="10" font-weight="bold">↺ FLIP 180° (reverse direction)</text></svg>';
  }

  // ── segment strip ──────────────────────────────────────────────────────────
  function strip(jid, tc) {
    var h = '<div style="display:flex;gap:3px;flex-wrap:wrap;padding-top:12px">';
    for (var i = 0; i < 24; i++) {
      var isA = i === jid - 1, isB = i === jid;
      var brd = isA ? '2px solid #fff' : isB ? '2px solid ' + tc : '1px solid rgba(255,255,255,.1)';
      var sc2 = isA || isB ? '1.25' : '1';
      h += '<div style="position:relative;width:22px;height:22px;border-radius:4px;background:' + Snake.segColor(i).h + ';border:' + brd + ';transform:scale(' + sc2 + ');flex-shrink:0">';
      if (isA) h += '<span style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:900;color:#fff">A</span>';
      if (isB) h += '<span style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:900;color:' + tc + '">B</span>';
      h += '</div>';
    }
    return h + '</div>';
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  function render() {
    if (activeTab === 'guide') renderGuide();
    else if (activeTab === 'engine') renderEngine();
    else renderEditor();
  }

  // ── GUIDE TAB ─────────────────────────────────────────────────────────────
  function renderGuide() {
    var j = jnt();
    var joints = activeShape ? activeShape.joints : [];

    // header state label + progress
    document.getElementById('slbl').textContent = guideStep === 0 ? activeShape ? activeShape.name : 'Intro' : guideStep <= 23 ? 'Joint ' + guideStep + '/23' : 'Done!';
    document.getElementById('pfill').style.width = ((guideStep / 23) * 100) + '%';

    var nr = document.getElementById('navrow');
    var bf = document.getElementById('bfwd');
    if (j) {
      nr.style.display = 'flex';
      var ok2 = canFwd();
      bf.style.background = ok2 ? '#238636' : '#1c2128';
      bf.style.color = ok2 ? '#fff' : '#484f58';
      bf.style.border = ok2 ? 'none' : '1.5px solid #30363d';
      bf.disabled = !ok2;
      bf.innerHTML = guideStep === 23 ? 'Final Joint ✓' : 'Next Joint →';
      document.getElementById('bbk').style.color = guideStep <= 1 ? '#484f58' : '#c9d1d9';
    } else {
      nr.style.display = 'none';
    }

    var pg = document.getElementById('pg');

    // INTRO
    if (guideStep === 0) {
      var shapeList = Shapes.getAll().map(function (s) {
        var active = activeShape && s.id === activeShape.id;
        return '<button data-sid="' + s.id + '" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px;background:' + (active ? 'rgba(88,166,255,.1)' : 'rgba(255,255,255,.04)') + ';border:1.5px solid ' + (active ? '#58a6ff' : '#30363d') + ';border-radius:10px;color:#fff;text-align:left;margin-bottom:6px">' +
          '<span style="font-size:24px">' + s.emoji + '</span>' +
          '<div><div style="font-size:14px;font-weight:700">' + s.name + '</div><div style="font-size:11px;color:#6e7681">' + s.description + '</div></div>' +
          '</button>';
      }).join('');
      pg.innerHTML =
        '<div class="card" style="text-align:center;padding:22px 16px">' +
          '<div style="font-size:48px;margin-bottom:8px">🐍</div>' +
          '<div style="font-size:21px;font-weight:800;margin-bottom:6px">Rubix Snake Guide</div>' +
          '<p style="color:#8b949e;font-size:13px;line-height:1.55">Step-by-step folding instructions with 2D path view, fold diagrams, and AI photo verification.</p>' +
        '</div>' +
        '<div class="card"><div class="lbl">Choose a shape</div>' + shapeList + '</div>' +
        '<button id="bstart" style="padding:15px;background:#238636;border-radius:12px;font-size:16px;font-weight:700;color:#fff;width:100%">Start → Joint 1</button>' +
        importCardHtml();

      pg.querySelectorAll('[data-sid]').forEach(function (btn) {
        btn.onclick = function () { activeShape = Shapes.getById(this.getAttribute('data-sid')); render(); };
      });
      document.getElementById('bstart').onclick = function () { guideStep = 1; clearPhoto(); render(); };
      wireImportCard(function () {
        activeShape = Shapes.getAll()[Shapes.getAll().length - 1];
        render();
      });
      return;
    }

    // DONE
    if (guideStep === 24) {
      var doneEmoji = activeShape ? activeShape.emoji : '🎉';
      var doneClosing = activeShape && activeShape.closing ? activeShape.closing : 'Close the two ends together to lock the shape.';
      pg.innerHTML =
        '<div style="text-align:center;padding:22px 16px 8px;display:flex;flex-direction:column;gap:12px;align-items:center">' +
          '<div style="font-size:64px">' + doneEmoji + '</div>' +
          '<div style="font-size:22px;font-weight:800">All 23 joints done!</div>' +
          (activeShape ? '<div style="font-size:14px;color:#8b949e">Your snake should now form a <b style="color:#fff">' + activeShape.name + '</b>.</div>' : '') +
        '</div>' +
        '<div class="card" style="padding:10px">' +
          '<div class="lbl">Final shape — 3D (drag to rotate)</div>' +
          '<div id="done-3d" style="width:100%;height:280px;border-radius:8px;overflow:hidden;background:#0d1117;touch-action:none"></div>' +
        '</div>' +
        '<div class="card"><p style="font-size:14px;color:#c9d1d9;line-height:1.6">' + doneClosing + '<br><br><b style="color:#f0883e">Doesn\'t fit?</b> Mirror all R↔L from joint 1 — some snakes have opposite chirality.</p></div>' +
        '<button id="brst" style="padding:14px;background:#238636;border-radius:12px;font-size:15px;font-weight:700;color:#fff;width:100%">↺ Start Over</button>';
      document.getElementById('brst').onclick = function () { guideStep = 0; clearPhoto(); render(); };
      setTimeout(function () {
        var v3 = document.getElementById('done-3d');
        if (v3) { Renderer3D.init(v3); Renderer3D.update(joints); }
      }, 20);
      return;
    }

    // JOINT STEP
    var ai = guideStep - 1, bi = guideStep;
    var t = j.t, tc = UI[t].col, tbg = UI[t].bg;

    var photoH;
    if (!iSrc) {
      photoH = '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<label class="ubtn" style="background:' + tc + '1a;border:2px solid ' + tc + '66;color:' + tc + '">📷 Open Camera<input type="file" accept="image/*" capture="environment" id="ic"></label>' +
        '<label class="ubtn" style="background:rgba(255,255,255,.04);border:1.5px solid #30363d;color:#8b949e;font-size:13px">🖼 Gallery<input type="file" accept="image/*" id="ig"></label>' +
        '</div>';
    } else {
      photoH = '<img src="' + iSrc + '" style="width:100%;border-radius:8px;max-height:200px;object-fit:cover;display:block">' +
        '<label class="ubtn" style="margin-top:7px;background:#21262d;border:1px solid #30363d;color:#8b949e;font-size:12px;border-radius:8px;padding:9px">↺ Retake<input type="file" accept="image/*" capture="environment" id="ir"></label>';
    }

    var verH = '';
    if (iB64 && !busy && !verRes) {
      verH = '<button id="bver" style="padding:13px;background:' + tc + ';border-radius:10px;font-size:14px;font-weight:700;color:#fff;width:100%">🤖 Verify with AI</button>';
    }
    if (busy) {
      verH = '<div class="card" style="display:flex;align-items:center;gap:10px;justify-content:center;padding:16px"><div class="spin" style="border-top-color:' + tc + '"></div><span style="color:#8b949e;font-size:13px">Analysing…</span></div>';
    }
    if (verRes) {
      var rc = verRes.pass ? '#238636' : '#b08800', rct = verRes.pass ? '#3fb950' : '#e3b341';
      verH = '<div class="card" style="border:1.5px solid ' + rc + '">' +
        '<div style="font-size:14px;font-weight:700;margin-bottom:7px;color:' + rct + '">' + (verRes.pass ? '✅ PASS' : '⚠ NEEDS ADJUSTMENT') + '</div>' +
        '<pre>' + verRes.text.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</pre>' +
        (!verRes.pass ? '<button id="brev" style="margin-top:9px;width:100%;padding:8px;background:#21262d;border:1px solid #30363d;border-radius:7px;color:#c9d1d9;font-size:12px;font-weight:600">↺ Re-verify</button>' : '') +
        '</div>';
    }

    var skipH = (!iSrc || verOk || (verRes && verRes.pass)) ? '' :
      '<button id="bskip" style="background:none;border:none;color:#484f58;font-size:11px;padding:3px;width:100%;text-align:center">Skip verification →</button>';

    pg.innerHTML =
      '<div class="card" style="padding:10px">' +
        '<div class="lbl">Snake path so far — 2D</div>' +
        '<canvas id="sc" style="width:100%;background:#0d1117;border-radius:6px"></canvas>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
          '<div style="flex:1;display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,255,255,.05);border-radius:7px;font-size:12px">' +
            '<div style="width:14px;height:14px;border-radius:3px;background:' + Snake.segColor(ai).h + '"></div>' +
            '<span><b style="color:#fff">A</b> #' + (ai+1) + ' ' + Snake.segColor(ai).n + '</span></div>' +
          '<span style="color:#6e7681;line-height:2">→</span>' +
          '<div style="flex:1;display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,255,255,.05);border-radius:7px;border:1px solid ' + tc + '44;font-size:12px">' +
            '<div style="width:14px;height:14px;border-radius:3px;background:' + Snake.segColor(bi).h + '"></div>' +
            '<span><b style="color:' + tc + '">B</b> #' + (bi+1) + ' ' + Snake.segColor(bi).n + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="padding:10px">' +
        '<div class="lbl">3D view — drag to rotate</div>' +
        '<div id="guide-3d" style="width:100%;height:220px;border-radius:8px;overflow:hidden;background:#0d1117;touch-action:none"></div>' +
      '</div>' +
      '<div class="card"><div class="lbl">All 24 segments</div>' + strip(j.id, tc) + '</div>' +
      '<div class="card" style="border:1.5px solid ' + tc + '44;background:' + tbg + '">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
          '<div style="width:42px;height:42px;border-radius:10px;background:' + tc + '20;border:2px solid ' + tc + ';display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">' + UI[t].em + '</div>' +
          '<div><div style="font-size:17px;font-weight:800;color:' + tc + '">' + UI[t].lbl + '</div>' +
          '<div style="font-size:11px;color:#6e7681;margin-top:1px">' + (pl(j.id) === 'vertical' ? '↕ Vertical' : '↔ Horizontal') + ' · Cycle ' + (Math.floor((j.id-1)/6)+1) + '/4 · Pos ' + (((j.id-1)%6)+1) + '/6</div></div>' +
        '</div>' +
        '<div style="background:rgba(0,0,0,.25);border-radius:8px;padding:10px 6px;margin-bottom:10px">' + svgDiag(t, j.id, ai, bi) + '</div>' +
        '<div style="background:rgba(0,0,0,.25);border-radius:7px;padding:9px 12px;font-size:13px;font-weight:700;color:' + tc + '">' + dirtxt(t, j.id) + '</div>' +
      '</div>' +
      '<div class="card"><div class="lbl">📷 Photo check — after folding</div>' + photoH + '</div>' +
      verH + skipH;

    ['ic','ig','ir'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.onchange = function () { onFile(this.files[0]); };
    });
    var bv = document.getElementById('bver'); if (bv) bv.onclick = verify;
    var brv = document.getElementById('brev'); if (brv) brv.onclick = verify;
    var bsk = document.getElementById('bskip'); if (bsk) bsk.onclick = function () { verOk = true; navStep(1); };

    setTimeout(function () {
      var cv = document.getElementById('sc');
      if (cv) Renderer2D.draw(cv, joints.slice(0, guideStep), guideStep);
      var v3 = document.getElementById('guide-3d');
      if (v3) { Renderer3D.init(v3); Renderer3D.update(joints.slice(0, guideStep)); }
    }, 20);
  }

  // ── ENGINE TAB ────────────────────────────────────────────────────────────
  function engineStepInfo(joints) {
    if (engStep < 1) {
      return '<div style="font-size:12px;color:#6e7681;margin-top:10px;text-align:center">Start of snake — segment 0 only</div>';
    }
    var t = joints[engStep - 1], tc = UI[t].col, tbg = UI[t].bg;
    var ai = engStep - 1, bi = engStep;
    return '<div style="border:1.5px solid ' + tc + '44;background:' + tbg + ';border-radius:10px;padding:10px;margin-top:10px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
          '<div style="width:36px;height:36px;border-radius:8px;background:' + tc + '20;border:2px solid ' + tc + ';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">' + UI[t].em + '</div>' +
          '<div>' +
            '<div style="font-size:14px;font-weight:800;color:' + tc + '">Joint ' + engStep + '/23 — ' + UI[t].lbl + '</div>' +
            '<div style="font-size:11px;color:#6e7681;margin-top:1px">' + Snake.segColor(ai).n + ' → ' + Snake.segColor(bi).n + ' · ' + (pl(engStep) === 'vertical' ? '↕ Vertical' : '↔ Horizontal') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="background:rgba(0,0,0,.25);border-radius:8px;padding:8px 4px">' + svgDiag(t, engStep, ai, bi) + '</div>' +
        '<div style="background:rgba(0,0,0,.25);border-radius:7px;padding:9px 12px;margin-top:8px;font-size:13px;font-weight:700;color:' + tc + '">' + dirtxt(t, engStep) + '</div>' +
      '</div>';
  }

  function renderEngine() {
    document.getElementById('navrow').style.display = 'none';
    var pg = document.getElementById('pg');
    var startJoints = activeShape ? activeShape.joints.slice() : Array(23).fill('S');
    var joints = MovesEngine.getJoints() || startJoints;

    pg.innerHTML =
      '<div class="card">' +
        '<div class="lbl">Moves Engine — build a new shape</div>' +
        '<p style="font-size:12px;color:#6e7681;margin-bottom:10px">Tap any joint to cycle S → R → L. Watch the 2D + 3D views update live.</p>' +
        '<div id="me-container"></div>' +
      '</div>' +
      '<div class="card" style="padding:10px">' +
        '<div class="lbl">2D path preview</div>' +
        '<canvas id="ec" style="width:100%;background:#0d1117;border-radius:6px"></canvas>' +
      '</div>' +
      '<div class="card" style="padding:10px">' +
        '<div class="lbl">Fold-by-fold 3D preview — drag to rotate</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin:8px 0">' +
          '<button id="eng-prev" style="padding:8px 12px;background:#21262d;border:1px solid #30363d;border-radius:7px;color:#c9d1d9;font-size:13px;font-weight:700">&#9664;</button>' +
          '<input id="eng-slider" type="range" min="0" max="23" step="1" value="' + engStep + '" style="flex:1">' +
          '<button id="eng-next" style="padding:8px 12px;background:#21262d;border:1px solid #30363d;border-radius:7px;color:#c9d1d9;font-size:13px;font-weight:700">&#9654;</button>' +
        '</div>' +
        '<div id="eng-step-lbl" style="text-align:center;font-size:12px;color:#8b949e;font-weight:700;margin-bottom:8px">Step ' + engStep + ' / 23</div>' +
        '<div id="view3d" style="width:100%;height:240px;border-radius:8px;overflow:hidden;background:#0d1117;touch-action:none"></div>' +
        '<div id="eng-step-info">' + engineStepInfo(joints) + '</div>' +
      '</div>';

    function refreshViews(j) {
      var cv = document.getElementById('ec');
      if (cv) Renderer2D.draw(cv, j, engStep >= 1 ? engStep : null);
      var v3 = document.getElementById('view3d');
      if (v3) { Renderer3D.init(v3); Renderer3D.update(j.slice(0, engStep)); }
      var info = document.getElementById('eng-step-info');
      if (info) info.innerHTML = engineStepInfo(j);
    }

    function setStep(s) {
      engStep = Math.max(0, Math.min(23, s));
      var slider = document.getElementById('eng-slider');
      if (slider) slider.value = engStep;
      var lbl = document.getElementById('eng-step-lbl');
      if (lbl) lbl.textContent = 'Step ' + engStep + ' / 23';
      refreshViews(MovesEngine.getJoints() || startJoints);
    }

    MovesEngine.init(document.getElementById('me-container'), startJoints, function (j) {
      setTimeout(function () { refreshViews(j); }, 20);
    });

    document.getElementById('eng-prev').onclick = function () { setStep(engStep - 1); };
    document.getElementById('eng-next').onclick = function () { setStep(engStep + 1); };
    document.getElementById('eng-slider').oninput = function () { setStep(+this.value); };

    // trigger initial draw
    setTimeout(function () { refreshViews(MovesEngine.getJoints() || startJoints); }, 50);
  }

  // ── EDITOR TAB ────────────────────────────────────────────────────────────
  function renderEditor() {
    var pg = document.getElementById('pg');
    var joints = activeShape ? activeShape.joints : [];
    var numSegs = edRevealCount;
    var subJoints = joints.slice(0, edRevealCount - 1);
    var xf = edXf[edSeg] || 0;

    var segBtns = '';
    for (var i = 0; i < numSegs; i++) {
      var sc = Snake.segColor(i).h;
      var active = i === edSeg;
      segBtns += '<button data-edid="' + i + '" style="display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:8px;' +
        'background:' + (active ? sc + '28' : 'rgba(255,255,255,.05)') + ';' +
        'border:' + (active ? '1.5px solid ' + sc : '1px solid #30363d') + ';color:#fff;font-size:12px;font-weight:' + (active ? '700' : '400') + '">' +
        '<span style="width:11px;height:11px;border-radius:3px;background:' + sc + ';display:inline-block;flex-shrink:0"></span>' +
        'Seg&nbsp;' + i + '</button>';
    }

    function rotRow(rval) {
      var v = ((Math.round(rval) % 360) + 360) % 360;
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<button data-rot="-90" style="flex:1;padding:9px;background:#21262d;border:1px solid #30363d;border-radius:7px;color:#8b949e;font-size:13px;font-weight:700">-90°</button>' +
        '<span id="ed-rot-val" style="width:46px;text-align:center;color:#fff;font-size:13px;font-weight:700">' + v + '°</span>' +
        '<button data-rot="90" style="flex:1;padding:9px;background:#21262d;border:1px solid #30363d;border-radius:7px;color:#8b949e;font-size:13px;font-weight:700">+90°</button>' +
      '</div>';
    }

    // "+ Add Segment" — only when there is a next joint left to reveal.
    var addCardH = '';
    if (edRevealCount <= joints.length) {
      var swatches = Snake.COLORS.map(function (c) {
        return '<button data-addcolor="' + c.h + '" title="' + c.n + '" style="width:36px;height:36px;border-radius:8px;background:' + c.h + ';border:1.5px solid rgba(255,255,255,.2);cursor:pointer"></button>';
      }).join('');
      addCardH = '<div class="card">' +
        '<div class="lbl">+ Add Segment ' + edRevealCount + ' — pick a color</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' + swatches + '</div>' +
      '</div>';
    }

    pg.innerHTML =
      '<div class="card" style="padding:10px">' +
        '<div class="lbl">3D — tap segment to select &amp; drag to orbit</div>' +
        '<div id="editor-3d" style="width:100%;height:240px;border-radius:8px;overflow:hidden;background:#0d1117;touch-action:none"></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="lbl" style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
          '<span>Segment</span>' +
          (edSeg === null ? '' : '<button id="ed-unselect" style="padding:4px 10px;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#8b949e;font-size:11px">View Full Snake</button>') +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + segBtns + '</div>' +
      '</div>' +
      ((edSeg === 0 || edSeg === null) ? '' :
      '<div class="card">' +
        '<div class="lbl" id="ed-xf-hdr">Rotate — Seg ' + edSeg + ' (' + Snake.segColor(edSeg).n + ')</div>' +
        rotRow(xf) +
        '<button id="ed-reset" style="margin-top:6px;padding:7px 14px;background:#21262d;border:1px solid #30363d;border-radius:7px;color:#8b949e;font-size:12px">Reset Seg ' + edSeg + '</button>' +
      '</div>') +
      addCardH +
      '<div class="card">' +
        '<div class="lbl">Joint sequence (with rotations applied)</div>' +
        '<div id="ed-seq" style="font-size:11px;font-family:monospace;color:#58a6ff;background:#0d1117;border:1px solid #21262d;border-radius:7px;padding:8px;line-height:1.8;word-break:break-all;margin-bottom:8px">' +
          editedJoints().map(function (t) {
            var u = { S: '#58a6ff', R: '#f0883e', L: '#3fb950', F: '#a371f7' };
            return '<span style="color:' + u[t] + '">' + t + '</span>';
          }).join(' ') +
        '</div>' +
        '<button id="ed-copy" style="width:100%;padding:9px;background:#21262d;border:1px solid #30363d;border-radius:8px;color:#c9d1d9;font-size:12px;font-weight:700">&#128203; Copy JSON</button>' +
      '</div>' +
      '<div class="card">' +
        '<div class="lbl">Save this as a new shape</div>' +
        '<p style="color:#6e7681;font-size:11px;margin-bottom:8px">Saves the joint sequence above to your shape picker (stored in this browser).</p>' +
        '<input id="ed-save-name" placeholder="Shape name" style="width:100%;padding:9px;margin-bottom:8px;background:#0d1117;border:1px solid #30363d;border-radius:7px;color:#fff;font-size:12px">' +
        '<button id="ed-save-btn" style="width:100%;padding:10px;background:#238636;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700">&#128190; Save as New Shape</button>' +
        '<div id="ed-save-msg" style="font-size:11px;margin-top:6px"></div>' +
      '</div>' +
      importCardHtml();

    // Segment selector
    pg.querySelectorAll('[data-edid]').forEach(function (btn) {
      btn.onclick = function () {
        edSeg = +this.getAttribute('data-edid');
        edFocusAll = false;
        renderEditor();
      };
    });

    // Unselect — view full snake without ghosting
    var edUnselectBtn = document.getElementById('ed-unselect');
    if (edUnselectBtn) edUnselectBtn.onclick = function () {
      edSeg = null;
      edFocusAll = true;
      renderEditor();
    };

    // Add segment — pick a color for the next segment in the chain
    pg.querySelectorAll('[data-addcolor]').forEach(function (btn) {
      btn.onclick = function () {
        var hex = this.getAttribute('data-addcolor');
        var newIdx = edRevealCount;
        Snake.setSegColor(newIdx, hex);
        edRevealCount++;
        edSeg = newIdx;
        edFocusAll = true;
        renderEditor();
      };
    });

    // ±90° rotation buttons
    pg.querySelectorAll('[data-rot]').forEach(function (btn) {
      btn.onclick = function () {
        var delta = +this.getAttribute('data-rot');
        var cur = edXf[edSeg] || 0;
        var next = ((cur + delta) % 360 + 360) % 360;
        edXf[edSeg] = next;
        Snake.setSegTransform(edSeg, next);
        var val = document.getElementById('ed-rot-val');
        if (val) val.textContent = next + '°';
        edFocusAll = true;
        Renderer3D.update(subJoints, { highlight: edSeg, focus: 'all' });
        updateSeqReadout();
      };
    });

    var edResetBtn = document.getElementById('ed-reset');
    if (edResetBtn) edResetBtn.onclick = function () {
      delete edXf[edSeg];
      Snake.clearSegTransforms();
      Object.keys(edXf).forEach(function (id) { Snake.setSegTransform(+id, edXf[id]); });
      edFocusAll = true;
      renderEditor();
    };

    // joint-sequence readout + Copy JSON
    function updateSeqReadout() {
      var seq = document.getElementById('ed-seq');
      if (!seq) return;
      var u = { S: '#58a6ff', R: '#f0883e', L: '#3fb950', F: '#a371f7' };
      seq.innerHTML = editedJoints().map(function (t) {
        return '<span style="color:' + u[t] + '">' + t + '</span>';
      }).join(' ');
    }
    var edCopyBtn = document.getElementById('ed-copy');
    if (edCopyBtn) edCopyBtn.onclick = function () {
      var json = JSON.stringify(editedJoints());
      if (navigator.clipboard) {
        navigator.clipboard.writeText(json).then(function () {
          edCopyBtn.textContent = '✓ Copied!';
          setTimeout(function () { edCopyBtn.innerHTML = '&#128203; Copy JSON'; }, 1500);
        });
      } else {
        edCopyBtn.textContent = json;
      }
    };

    // Save current edit as a new shape in the picker
    var edSaveBtn = document.getElementById('ed-save-btn');
    if (edSaveBtn) edSaveBtn.onclick = function () {
      var name = document.getElementById('ed-save-name').value.trim();
      var msg = document.getElementById('ed-save-msg');
      if (!name) { msg.textContent = 'Enter a name for this shape.'; msg.style.color = '#f85149'; return; }
      importShape(JSON.stringify(editedJoints()), name);
      activeShape = Shapes.getAll()[Shapes.getAll().length - 1];
      msg.textContent = 'Saved "' + name + '" — find it in Guide → Choose a shape.';
      msg.style.color = '#3fb950';
    };

    // Import a shape (JSON) directly from the Editor
    wireImportCard(function () {
      activeShape = Shapes.getAll()[Shapes.getAll().length - 1];
      renderEditor();
    });

    // 3D init + wire editor callbacks
    setTimeout(function () {
      var v3 = document.getElementById('editor-3d');
      if (!v3) return;
      Renderer3D.init(v3);
      Renderer3D.update(subJoints, { highlight: edSeg, focus: edFocusAll ? 'all' : 'segment' });
      Renderer3D.setEditor({
        onSelect: function (idx) {
          if (idx === edSeg && !edFocusAll) return;
          edSeg = idx;
          edFocusAll = false;
          renderEditor();
        },
      });
    }, 20);
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', init);

})();
