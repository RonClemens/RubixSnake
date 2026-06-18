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
  var guideReverse = false;    // false=fold 0→23, true=fold 23→0
  var edSeg = 0;               // selected segment in editor
  var edXf  = {};              // per-segment rotation overrides { id: degrees }
  var edFocusAll = true;       // 3D camera: true = fit whole snake, false = zoom to edSeg
  var edRevealCount = 2;       // how many segments are revealed/built in the editor
  var edBuildDir = 'fwd';      // 'fwd' = build head-first (0→23), 'rev' = build tail-first (23→0)
  var engStep = 23;            // fold-by-fold step shown in Engine 3D/2D preview (0-23)
  var engPlaying = false;
  var engAnimRaf = null;
  var engAnimTimer = null;
  var edPlaying = false;
  var edAnimTimer = null;
  var edAnimRaf = null;
  var animMode  = 'full';      // 'full' = play whole sequence, 'step' = play only the current/latest joint
  var animSpeed = 1;           // playback speed multiplier: 0.25, 0.5, 1, 2
  var activeShape = null;      // shape object from Shapes library
  var iSrc = null, iB64 = null, iMime = 'image/jpeg';
  var busy = false, verRes = null, verOk = false;
  var akey = localStorage.getItem('sak') || '';
  var showSeams = localStorage.getItem('seams') !== '0'; // on by default
  var pausedStep = 0;          // guideStep saved when leaving a puzzle mid-way via #homebtn
  var pausedShapeId = null;    // activeShape.id this pausedStep belongs to
  var collapsedCards = {};     // cardKey -> bool, which "card" frames the user has collapsed

  // ── collapsible card frames ───────────────────────────────────────────────
  // Every .card in #pg gets a click-to-collapse header automatically. Runs via
  // a MutationObserver so it covers every render*()/renderEditor() call site,
  // including the many internal re-renders that bypass the top-level render().
  function enhanceCollapsibleCards() {
    var pg = document.getElementById('pg');
    if (!pg) return;
    var seen = {};
    pg.querySelectorAll('.card').forEach(function (card) {
      if (card.children.length < 2) return; // nothing to hide
      var header = card.children[0];
      var label = (header.textContent || '').trim();
      if (!label) return; // no meaningful header to click (e.g. spinner row)

      var key = activeTab + ':' + label.slice(0, 40);
      seen[key] = (seen[key] || 0) + 1;
      if (seen[key] > 1) key += '#' + seen[key];

      var body = document.createElement('div');
      body.className = 'card-body-auto';
      Array.prototype.slice.call(card.children, 1).forEach(function (el) { body.appendChild(el); });
      card.appendChild(body);

      var curPad = parseFloat(getComputedStyle(header).paddingRight) || 0;
      header.style.position = 'relative';
      header.style.paddingRight = (curPad + 16) + 'px';
      header.style.cursor = 'pointer';
      header.style.userSelect = 'none';
      var chev = document.createElement('span');
      chev.textContent = '▾';
      chev.style.cssText = 'position:absolute;right:0;top:50%;transform:translateY(-50%);' +
        'font-size:10px;color:#6e7681;transition:transform .2s;pointer-events:none';
      header.appendChild(chev);

      var collapsed = !!collapsedCards[key];
      body.style.display = collapsed ? 'none' : '';
      chev.style.transform = 'translateY(-50%)' + (collapsed ? ' rotate(-90deg)' : '');

      header.onclick = function (e) {
        if (e.target.closest && e.target.closest('button,input,a,select,label,textarea')) return;
        var nowCollapsed = !collapsedCards[key];
        collapsedCards[key] = nowCollapsed;
        body.style.display = nowCollapsed ? 'none' : '';
        chev.style.transform = 'translateY(-50%)' + (nowCollapsed ? ' rotate(-90deg)' : '');
      };
    });
  }

  // ── init ───────────────────────────────────────────────────────────────────
  function init() {
    document.getElementById('kbtn').onclick = toggleKey;
    document.getElementById('ksave').onclick = saveKey;
    document.getElementById('bbk').onclick  = function () { navStep(-1); };
    document.getElementById('bfwd').onclick = function () { if (canFwd()) navStep(1); };
    new MutationObserver(enhanceCollapsibleCards).observe(document.getElementById('pg'), { childList: true });
    document.getElementById('homebtn').onclick = function () {
      if (guideStep >= 1 && guideStep <= 23) {
        pausedStep = guideStep;
        pausedShapeId = activeShape ? activeShape.id : null;
      }
      guideStep = 0;
      clearPhoto();
      if (activeTab !== 'guide') switchTab('guide');
      else render();
    };

    Renderer3D.setShowSeams(showSeams);
    document.getElementById('seamschk').checked = showSeams;
    document.getElementById('seamschk').onchange = function (e) {
      showSeams = e.target.checked;
      localStorage.setItem('seams', showSeams ? '1' : '0');
      Renderer3D.setShowSeams(showSeams);
      render();
    };

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

  // Detect and extract joints + optional step descriptions from an enriched
  // step array: [{segment, action, description}, ...].  Entries are sorted by
  // segment number; the first 23 are used (a 24th "closing" entry is ignored).
  function fromEnrichedArr(arr) {
    var sorted = arr.slice().sort(function (a, b) { return (a.segment || 0) - (b.segment || 0); });
    return {
      joints: sorted.map(function (e) { return String(e.action || '').toUpperCase(); }).slice(0, 23),
      descs:  sorted.map(function (e) { return String(e.description || ''); }).slice(0, 23),
    };
  }

  // Accepts:
  //   • a bare 23-element joints array  ["S","R","L",...]
  //   • an enriched step array          [{segment,action,description}, ...]
  //   • a full shape object             {name, emoji, description, closing, joints}
  //   • a shape object with steps       {name, ..., steps:[{segment,action,...}]}
  // Unknown action types are substituted with 'S' and recorded in shape.invalidJoints.
  // Warnings (if any) are pushed into the optional `warns` array.
  // Returns an error string on hard failure, or null on success.
  function importShape(text, name, warns) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return 'Invalid JSON: ' + e.message; }

    var joints, stepDescs, shapeMeta = {};

    if (Array.isArray(parsed)) {
      if (parsed.length > 0 && parsed[0] !== null && typeof parsed[0] === 'object' && 'action' in parsed[0]) {
        var ea = fromEnrichedArr(parsed);
        joints = ea.joints; stepDescs = ea.descs;
      } else {
        joints = parsed;
      }
    } else if (parsed && typeof parsed === 'object') {
      shapeMeta = parsed;
      if (Array.isArray(parsed.steps) && parsed.steps.length > 0 && 'action' in parsed.steps[0]) {
        var es = fromEnrichedArr(parsed.steps);
        joints = es.joints; stepDescs = es.descs;
      } else {
        joints = parsed.joints;
      }
    }

    if (!Array.isArray(joints) || joints.length < 23) {
      return 'Need 23 joint values (S/R/L/F) — got ' + (joints ? joints.length : 0);
    }
    joints = joints.slice(0, 23);

    // Substitute unknown actions with 'S' and record them
    var invalidJoints = [];
    joints = joints.map(function (t, i) {
      if (JOINT_TYPES.indexOf(t) < 0) {
        invalidJoints.push({ index: i, original: t });
        if (warns) warns.push('segment ' + (i + 1) + ' "' + t + '" → S');
        return 'S';
      }
      return t;
    });

    var shape = {
      id: 'custom-' + Date.now(),
      name:        name || shapeMeta.name        || 'Custom Shape',
      emoji:       shapeMeta.emoji               || '✨',
      description: shapeMeta.description         || 'A custom imported shape.',
      closing:     shapeMeta.closing             || 'Close the two ends together to lock the shape.',
      joints:      joints,
    };
    if (invalidJoints.length)  shape.invalidJoints   = invalidJoints;
    if (stepDescs && stepDescs.some(function (d) { return d; })) shape.stepDescriptions = stepDescs;

    Shapes.add(shape);
    var list = saveCustomShapes();
    list.push(shape);
    localStorage.setItem('customShapes', JSON.stringify(list));
    return null;
  }

  // Generate a human-readable description for joint jid (1-indexed).
  function stepDesc(t, jid) {
    var ai = jid - 1, bi = jid;
    var an = Snake.segColor(ai).n, bn = Snake.segColor(bi).n;
    if (t === 'S') return an + ' → ' + bn + ': continue straight — no fold needed.';
    if (t === 'F') return an + ' → ' + bn + ': flip ' + bn + ' segment 180° straight back.';
    var vert = pl(jid) === 'vertical';
    if (t === 'R') return an + ' → ' + bn + (vert ? ': fold ' + bn + ' upward.' : ': fold ' + bn + ' to the right.');
    return an + ' → ' + bn + (vert ? ': fold ' + bn + ' downward.' : ': fold ' + bn + ' to the left.');
  }

  // Build the enriched [{segment, action, description}] export from a joints array.
  // Uses stored stepDescriptions from the active shape if available, otherwise
  // auto-generates from segment colours and fold direction.
  function exportEnriched(joints) {
    var stored = activeShape && activeShape.stepDescriptions;
    return joints.map(function (t, i) {
      return {
        segment:     i + 1,
        action:      t,
        description: (stored && stored[i]) || stepDesc(t, i + 1),
      };
    });
  }

  // Returns all 0-indexed joint indices from activeShape that had unknown actions
  function invalidJointIndices() {
    return activeShape && activeShape.invalidJoints
      ? activeShape.invalidJoints.map(function (j) { return j.index; })
      : [];
  }

  // Returns segment indices (both sides of each invalid joint) visible when numJoints
  // joints have been applied (segments 0..numJoints are visible).
  function invalidSegsForStep(numJoints) {
    var result = [];
    invalidJointIndices().forEach(function (j) {
      if (j < numJoints) { result.push(j); result.push(j + 1); }
    });
    return result;
  }

  // Reverse mode: at reverse step k, the last k joints (indices 23-k..22) have been
  // applied and all 24 segments are visible. Only highlight invalid joints in that range.
  function invalidSegsForRevStep(k) {
    var result = [];
    invalidJointIndices().forEach(function (j) {
      if (j >= 23 - k) { result.push(j); result.push(j + 1); }
    });
    return result;
  }

  // Builds a 23-joint array where only the last k joints (indices 23-k..22,
  // i.e. the tail) keep their real action; everything before that is forced
  // 'S' (straight) as a placeholder for not-yet-revealed folds. Feeding this
  // to Snake.layout3D/layout3DFrac always yields the full 24-segment chain,
  // which is how reverse (23→0) mode reveals the snake tail-first.
  function reverseJoints(joints, k) {
    return Array(23 - k).fill('S').concat(joints.slice(23 - k, 23));
  }

  function removeCustomShape(id) {
    Shapes.remove(id);
    var raw = localStorage.getItem('customShapes');
    var list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch (e) { list = []; }
    list = list.filter(function (s) { return s.id !== id; });
    localStorage.setItem('customShapes', JSON.stringify(list));
    if (activeShape && activeShape.id === id) activeShape = Shapes.getAll()[0] || null;
  }

  // ── animation helpers ────────────────────────────────────────────────────────
  // Shared "play mode" + "speed" control row, used by both the Engine and
  // Editor 3D animate buttons.
  function animControlsHtml() {
    var modeBtns = [['full', 'Full Shape'], ['step', 'This Step']].map(function (m) {
      var act = animMode === m[0];
      return '<button data-animmode="' + m[0] + '" style="flex:1;padding:6px 4px;border-radius:6px;font-size:11px;font-weight:700;' +
        (act ? 'background:rgba(88,166,255,.15);border:1.5px solid #58a6ff;color:#58a6ff'
             : 'background:rgba(255,255,255,.04);border:1px solid #30363d;color:#6e7681') + '">' + m[1] + '</button>';
    }).join('');
    var speedBtns = [0.25, 0.5, 1, 2].map(function (s) {
      var act = animSpeed === s;
      return '<button data-animspeed="' + s + '" style="flex:1;padding:6px 4px;border-radius:6px;font-size:11px;font-weight:700;' +
        (act ? 'background:rgba(63,185,80,.15);border:1.5px solid #3fb950;color:#3fb950'
             : 'background:rgba(255,255,255,.04);border:1px solid #30363d;color:#6e7681') + '">' + s + 'x</button>';
    }).join('');
    return '<div style="display:flex;gap:6px;margin-top:8px">' + modeBtns + '</div>' +
           '<div style="display:flex;gap:6px;margin-top:6px">' + speedBtns + '</div>';
  }

  function wireAnimControls(pg) {
    pg.querySelectorAll('[data-animmode]').forEach(function (btn) {
      btn.onclick = function () { animMode = this.getAttribute('data-animmode'); render(); };
    });
    pg.querySelectorAll('[data-animspeed]').forEach(function (btn) {
      btn.onclick = function () { animSpeed = +this.getAttribute('data-animspeed'); render(); };
    });
  }

  function stopEngAnim() {
    engPlaying = false;
    if (engAnimRaf)   { cancelAnimationFrame(engAnimRaf); engAnimRaf = null; }
    if (engAnimTimer) { clearTimeout(engAnimTimer); engAnimTimer = null; }
    var btn = document.getElementById('eng-play');
    if (btn) { btn.textContent = '▶ Play'; btn.style.color = '#3fb950'; }
  }

  function startEngAnim() {
    stopEngAnim();
    var joints = MovesEngine.getJoints() || (activeShape ? activeShape.joints.slice() : Array(23).fill('S'));
    var v3 = document.getElementById('view3d');
    if (v3) Renderer3D.init(v3);
    engPlaying = true;
    // Aligns playback to the puzzle's chosen folding direction: forward
    // builds the chain 0→23, reverse plays the same geometry backward,
    // unfolding tail-first (23→0), so it matches the Guide tab's direction.
    var dir = guideReverse ? -1 : 1;
    if (animMode === 'full') {
      if (dir > 0 && engStep >= 23) engStep = 0;
      if (dir < 0 && engStep <= 0) engStep = 23;
    }

    var playBtn = document.getElementById('eng-play');
    if (playBtn) { playBtn.textContent = '⏸ Stop'; playBtn.style.color = '#f0883e'; }

    // Fit camera once to the full 23-step snake so it stays fixed during animation
    Renderer3D.fitToSegs(Snake.layout3DPartial(joints, 23, 1));

    var tweenMs = 1000 / animSpeed; // 1x = 1 second per segment move
    var holdMs = 150 / animSpeed;

    function doStep() {
      if (!engPlaying) return;
      var step = engStep;
      if (step > 23 || step < 0) { stopEngAnim(); return; }

      // Update slider + label
      var slider = document.getElementById('eng-slider');
      if (slider) slider.value = step;
      var lbl = document.getElementById('eng-step-lbl');
      if (lbl) lbl.textContent = 'Step ' + step + ' / 23';
      var info = document.getElementById('eng-step-info');
      if (info) info.innerHTML = engineStepInfo(joints, step);

      var startTime = null;

      function frame(now) {
        if (!engPlaying) return;
        if (!startTime) startTime = now;
        // Pace every step (including straight 'S' joints, which have no
        // visible rotation) by the same tweenMs so 1x always means 1
        // second per segment, regardless of fold type.
        var rawT = Math.min(1, (now - startTime) / tweenMs);
        // smoothstep easing
        var eased = rawT * rawT * (3 - 2 * rawT);
        // dir>0: joint `step` folds in (0→1). dir<0: joint `step` (the most
        // recently folded one) unfolds back out (1→0) before being dropped.
        var t = dir > 0 ? eased : 1 - eased;
        Renderer3D.updateSegs(Snake.layout3DPartial(joints, step, t), { noFit: true, invalidSegs: invalidSegsForStep(step) });
        if (rawT < 1) {
          engAnimRaf = requestAnimationFrame(frame);
        } else if (animMode === 'step') {
          stopEngAnim();
        } else {
          engAnimTimer = setTimeout(function () {
            if (!engPlaying) return;
            engStep = step + dir;
            if (engStep > 23) { engStep = 23; stopEngAnim(); return; }
            if (engStep < 0) { engStep = 0; stopEngAnim(); return; }
            doStep();
          }, holdMs);
        }
      }

      engAnimRaf = requestAnimationFrame(frame);
    }

    doStep();
  }

  function stopEdAnim() {
    edPlaying = false;
    if (edAnimRaf)   { cancelAnimationFrame(edAnimRaf); edAnimRaf = null; }
    if (edAnimTimer) { clearTimeout(edAnimTimer); edAnimTimer = null; }
    var btn = document.getElementById('ed-anim');
    if (btn) { btn.textContent = '▶ Animate'; btn.style.color = '#58a6ff'; }
  }

  function startEdAnim() {
    stopEdAnim();
    var joints = activeShape ? activeShape.joints : [];
    if (!joints.length) return;
    var v3 = document.getElementById('editor-3d');
    if (v3) Renderer3D.init(v3);
    edPlaying = true;

    var animBtn = document.getElementById('ed-anim');
    if (animBtn) { animBtn.textContent = '⏸ Stop'; animBtn.style.color = '#f0883e'; }

    var dirRev = edBuildDir === 'rev';

    // Fit camera once. Reverse mode always shows all 24 segments (unedited
    // ones forced straight), so it fits the full chain, not just a window.
    Renderer3D.fitToSegs(dirRev
      ? Snake.layout3D(reverseJoints(joints, edRevealCount - 1))
      : Snake.layout3DPartial(joints.slice(0, edRevealCount - 1), edRevealCount - 1, 1));

    var tweenMs = 1000 / animSpeed; // 1x = 1 second per segment move
    var holdMs = 150 / animSpeed;
    // 'step' mode replays only the most-recently-edited joint's fold;
    // 'full' mode rebuilds the whole edited progress from scratch — a single
    // segment (forward) or the fully-straight chain (reverse).
    var step = animMode === 'step' ? Math.max(0, edRevealCount - 1) : 0;

    function doStep() {
      if (!edPlaying) return;
      if (step > edRevealCount - 1) { stopEdAnim(); return; }

      var startTime = null;

      function frame(now) {
        if (!edPlaying) return;
        if (!startTime) startTime = now;
        // Pace every step (including straight 'S' joints) by tweenMs so
        // 1x always means 1 second per segment, regardless of fold type.
        var rawT = Math.min(1, (now - startTime) / tweenMs);
        var t = rawT * rawT * (3 - 2 * rawT);
        var segs = dirRev
          ? Snake.layout3DFrac(reverseJoints(joints, step), 23 - step, t)
          : Snake.layout3DPartial(joints, step, t);
        var invalid = dirRev ? invalidSegsForRevStep(step) : invalidSegsForStep(step);
        Renderer3D.updateSegs(segs, { noFit: true, invalidSegs: invalid });
        if (rawT < 1) {
          edAnimRaf = requestAnimationFrame(frame);
        } else if (animMode === 'step') {
          stopEdAnim();
        } else {
          edAnimTimer = setTimeout(function () {
            if (!edPlaying) return;
            step++;
            doStep();
          }, holdMs);
        }
      }

      edAnimRaf = requestAnimationFrame(frame);
    }

    doStep();
  }

  // Shared "Import shape (JSON)" card — used by both the Guide intro and the Editor.
  function importCardHtml() {
    return '<div class="card">' +
      '<div class="lbl">Import shape (JSON)</div>' +
      '<p style="color:#6e7681;font-size:11px;margin-bottom:8px">Paste a compact joints array <code style="color:#58a6ff">["S","R",...]</code>, an enriched step array <code style="color:#58a6ff">[{segment,action,description}...]</code>, or a full shape object with name/emoji/joints.</p>' +
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
      if (!text) { err.style.color = '#f85149'; err.textContent = 'Paste a joints array or shape JSON first.'; return; }
      var warns = [];
      var msg = importShape(text, name, warns);
      if (msg) { err.style.color = '#f85149'; err.textContent = msg; return; }
      if (warns.length) {
        err.style.color = '#ff7700';
        err.textContent = '⚠ Imported with substitutions — ' + warns.join(', ') + '. Orange segments need reconciliation.';
        setTimeout(onSuccess, 900);
      } else {
        err.textContent = '';
        onSuccess();
      }
    };
  }

  function switchTab(t) {
    stopEngAnim();
    stopEdAnim();
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
  var guideAnimating = false;

  function navStep(delta) {
    if (guideAnimating) return;
    var newStep = Math.max(0, Math.min(24, guideStep + delta));
    if (newStep !== guideStep && activeShape &&
        guideStep >= 1 && guideStep <= 23 && newStep >= 1 && newStep <= 23) {
      animateGuideStep(guideStep, newStep);
    } else {
      guideStep = newStep;
      clearPhoto();
      render();
    }
  }

  // Tweens the 3D view between two adjacent guide steps, folding/unfolding
  // only the one joint that changed. Direction-aware: forward mode grows the
  // chain from segment 0 (layout3DPartial); reverse mode reveals it
  // tail-first from segment 23, using a forced-straight prefix + layout3DFrac
  // so the in-progress fold animates the correct joint relative to the
  // already-revealed tail instead of the head.
  function animateGuideStep(oldStep, newStep) {
    var v3 = document.getElementById('guide-3d');
    if (!v3 || !activeShape) { guideStep = newStep; clearPhoto(); render(); return; }
    var joints = activeShape.joints;
    var growing = newStep > oldStep;
    var animStep = growing ? newStep : oldStep; // the one joint that's mid-fold

    var finalSegs = guideReverse
      ? Snake.layout3D(reverseJoints(joints, newStep))
      : Snake.layout3DPartial(joints, newStep, 1);
    Renderer3D.init(v3);
    Renderer3D.fitToSegs(finalSegs);

    var invalidSegs = guideReverse ? invalidSegsForRevStep(newStep) : invalidSegsForStep(newStep);
    guideAnimating = true;
    var tweenMs = 1000 / animSpeed;
    var startTime = null;

    function frame(now) {
      if (!startTime) startTime = now;
      var rawT = Math.min(1, (now - startTime) / tweenMs);
      var eased = rawT * rawT * (3 - 2 * rawT);
      var frac = growing ? eased : 1 - eased;
      var segs = guideReverse
        ? Snake.layout3DFrac(reverseJoints(joints, animStep), 23 - animStep, frac)
        : Snake.layout3DPartial(joints, animStep, frac);
      Renderer3D.updateSegs(segs, { noFit: true, invalidSegs: invalidSegs });
      if (rawT < 1) {
        requestAnimationFrame(frame);
      } else {
        guideAnimating = false;
        guideStep = newStep;
        clearPhoto();
        render();
      }
    }
    requestAnimationFrame(frame);
  }

  function clearPhoto() { iSrc = null; iB64 = null; iMime = 'image/jpeg'; busy = false; verRes = null; verOk = false; }

  function canFwd() { return !iSrc || verOk || (verRes && verRes.pass); }

  function jnt() {
    if (!activeShape || guideStep < 1 || guideStep > 23) return null;
    var joints = activeShape.joints;
    // physId: the physical joint being folded this step (1-indexed, 1..23)
    var physId = guideReverse ? (24 - guideStep) : guideStep;
    var t = joints[physId - 1]; // joint action at this physical position
    return { id: guideStep, physId: physId, t: t };
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
    var a = j.physId - 1, b = j.physId;
    var prompt = 'Rubik\'s Snake fold check.\nColors repeat: 1=Blue 2=Orange 3=Pink 4=White 5=Red 6=Green\n\nJoint ' + j.physId + '/23 | ' + UI[j.t].lbl + ' | ' + pl(j.physId) + ' plane\nSeg A=#' + (a+1) + ' ' + Snake.segColor(a).n + '  Seg B=#' + (b+1) + ' ' + Snake.segColor(b).n + '\n\nReply EXACTLY:\nVERDICT: PASS or VERDICT: NEEDS ADJUSTMENT\nCOLORS: ...\nFOLD: ...\nTIP: ...';
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
  function updateHeader() {
    document.getElementById('apptitle').textContent =
      activeShape ? (activeShape.emoji + ' ' + activeShape.name) : '🐍 Rubix Snake';
    document.getElementById('homebtn').style.display =
      (activeTab === 'guide' && guideStep >= 1 && guideStep <= 23) ? '' : 'none';
  }

  function render() {
    updateHeader();
    if (activeTab === 'guide') renderGuide();
    else if (activeTab === 'engine') renderEngine();
    else renderEditor();
  }

  // ── GUIDE TAB ─────────────────────────────────────────────────────────────
  function renderGuide() {
    var j = jnt();
    var joints = activeShape ? activeShape.joints : [];

    // header state label + progress
    document.getElementById('slbl').textContent =
      guideStep === 0 ? (activeShape ? activeShape.name : 'Intro')
      : guideStep <= 23 ? (guideReverse ? '← Joint ' + (24 - guideStep) + '/23' : 'Joint ' + guideStep + '/23')
      : 'Done!';
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
      bf.innerHTML = guideStep === 23 ? 'Final Joint ✓' : (guideReverse ? '← Next Joint' : 'Next Joint →');
      document.getElementById('bbk').style.color = guideStep <= 1 ? '#484f58' : '#c9d1d9';
    } else {
      nr.style.display = 'none';
    }

    var pg = document.getElementById('pg');

    // INTRO
    if (guideStep === 0) {
      var shapeList = Shapes.getAll().map(function (s) {
        var active = activeShape && s.id === activeShape.id;
        var isCustom = s.id.indexOf('custom-') === 0;
        return '<div style="display:flex;gap:6px;margin-bottom:6px">' +
          '<button data-sid="' + s.id + '" style="flex:1;display:flex;align-items:center;gap:10px;padding:12px;background:' + (active ? 'rgba(88,166,255,.1)' : 'rgba(255,255,255,.04)') + ';border:1.5px solid ' + (active ? '#58a6ff' : '#30363d') + ';border-radius:10px;color:#fff;text-align:left;min-width:0">' +
            '<span style="font-size:24px">' + s.emoji + '</span>' +
            '<div style="min-width:0"><div style="font-size:14px;font-weight:700">' + s.name + '</div><div style="font-size:11px;color:#6e7681">' + s.description + '</div></div>' +
          '</button>' +
          (isCustom ? '<button data-delid="' + s.id + '" title="Delete custom shape" style="width:44px;flex-shrink:0;background:rgba(248,81,73,.08);border:1.5px solid rgba(248,81,73,.35);border-radius:10px;color:#f85149;font-size:18px">&#128465;</button>' : '') +
        '</div>';
      }).join('');
      var activeInvalidWarn = '';
      if (activeShape && activeShape.invalidJoints && activeShape.invalidJoints.length) {
        var warnList = activeShape.invalidJoints.map(function (j) {
          return 'joint ' + (j.index + 1) + ' "' + j.original + '"';
        }).join(', ');
        activeInvalidWarn = '<div style="background:rgba(255,119,0,.1);border:1.5px solid #ff7700;border-radius:8px;padding:9px 12px;font-size:11px;color:#ff7700;font-weight:700;margin-top:8px">⚠ Unknown actions at ' + warnList + ' — treated as S. Open in Engine tab to correct.</div>';
      }

      var dirAct = 'background:rgba(88,166,255,.12);border:1.5px solid #58a6ff;color:#58a6ff';
      var dirInact = 'background:rgba(255,255,255,.04);border:1.5px solid #30363d;color:#6e7681';
      var flatPreviewH = guideReverse
        ? '<div class="card" style="padding:10px">' +
            '<div class="lbl">Starting position — full snake flat (from segment 23 end)</div>' +
            '<canvas id="intro-2d" style="width:100%;background:#0d1117;border-radius:6px;margin-bottom:8px"></canvas>' +
            '<div id="intro-3d" style="width:100%;height:160px;border-radius:8px;overflow:hidden;background:#0d1117;touch-action:none"></div>' +
          '</div>'
        : '';
      var startLabel = guideReverse ? 'Start ← from Joint 23' : 'Start → from Joint 1';
      var canResume = pausedStep > 0 && activeShape && pausedShapeId === activeShape.id;
      var resumeH = canResume
        ? '<button id="bresume" style="padding:15px;background:#1f6feb;border-radius:12px;font-size:16px;font-weight:700;color:#fff;width:100%">▶ Resume — Joint ' + pausedStep + '/23</button>'
        : '';

      pg.innerHTML =
        '<div class="card" style="text-align:center;padding:22px 16px">' +
          '<div style="font-size:48px;margin-bottom:8px">🐍</div>' +
          '<div style="font-size:21px;font-weight:800;margin-bottom:6px">Rubix Snake Guide</div>' +
          '<p style="color:#8b949e;font-size:13px;line-height:1.55">Step-by-step folding instructions with 2D path view, fold diagrams, and AI photo verification.</p>' +
        '</div>' +
        resumeH +
        '<div class="card"><div class="lbl">Choose a shape</div>' + shapeList + activeInvalidWarn +
          '<div class="lbl" style="margin-top:12px">Folding direction</div>' +
          '<div style="display:flex;gap:6px">' +
            '<button id="bdir-fwd" style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:700;' + (!guideReverse ? dirAct : dirInact) + '">↗ 0 → 23</button>' +
            '<button id="bdir-rev" style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:700;' + (guideReverse ? dirAct : dirInact) + '">↙ 23 → 0</button>' +
          '</div>' +
        '</div>' +
        flatPreviewH +
        '<button id="bstart" style="padding:15px;background:#238636;border-radius:12px;font-size:16px;font-weight:700;color:#fff;width:100%">' + startLabel + '</button>' +
        importCardHtml();

      pg.querySelectorAll('[data-sid]').forEach(function (btn) {
        btn.onclick = function () {
          var sid = this.getAttribute('data-sid');
          if (sid !== pausedShapeId) { pausedStep = 0; pausedShapeId = null; }
          activeShape = Shapes.getById(sid);
          guideReverse = false;
          render();
        };
      });
      pg.querySelectorAll('[data-delid]').forEach(function (btn) {
        btn.onclick = function () {
          var id = this.getAttribute('data-delid');
          if (!confirm('Delete this custom shape? This can\'t be undone.')) return;
          if (id === pausedShapeId) { pausedStep = 0; pausedShapeId = null; }
          removeCustomShape(id);
          render();
        };
      });
      document.getElementById('bdir-fwd').onclick = function () { guideReverse = false; render(); };
      document.getElementById('bdir-rev').onclick = function () { guideReverse = true; render(); };
      document.getElementById('bstart').onclick = function () {
        pausedStep = 0; pausedShapeId = null;
        guideStep = 1; clearPhoto(); render();
      };
      if (canResume) {
        document.getElementById('bresume').onclick = function () {
          guideStep = pausedStep;
          pausedStep = 0; pausedShapeId = null;
          clearPhoto(); render();
        };
      }
      wireImportCard(function () {
        pausedStep = 0; pausedShapeId = null;
        activeShape = Shapes.getAll()[Shapes.getAll().length - 1];
        guideReverse = false;
        render();
      });
      if (guideReverse) {
        setTimeout(function () {
          var cv2 = document.getElementById('intro-2d');
          if (cv2) Renderer2D.draw(cv2, joints, null);
          var v3i = document.getElementById('intro-3d');
          if (v3i) { Renderer3D.init(v3i); Renderer3D.update(Array(23).fill('S')); }
        }, 20);
      }
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
      document.getElementById('brst').onclick = function () {
        pausedStep = 0; pausedShapeId = null;
        guideStep = 0; guideReverse = false; clearPhoto(); render();
      };
      setTimeout(function () {
        var v3 = document.getElementById('done-3d');
        if (v3) { Renderer3D.init(v3); Renderer3D.update(joints, { invalidSegs: invalidSegsForStep(joints.length) }); }
      }, 20);
      return;
    }

    // JOINT STEP
    var ai = j.physId - 1, bi = j.physId;  // physical segment indices for A and B
    var t = j.t, tc = UI[t].col, tbg = UI[t].bg;
    var isInvalidStep = invalidJointIndices().indexOf(j.physId - 1) >= 0;
    var invalidOriginal = '';
    if (isInvalidStep && activeShape && activeShape.invalidJoints) {
      var ij2 = activeShape.invalidJoints.filter(function (x) { return x.index === j.physId - 1; })[0];
      if (ij2) invalidOriginal = ij2.original;
    }

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
      '<div class="card"><div class="lbl">All 24 segments</div>' + strip(j.physId, tc) + '</div>' +
      '<div class="card" style="border:1.5px solid ' + tc + '44;background:' + tbg + '">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
          '<div style="width:42px;height:42px;border-radius:10px;background:' + tc + '20;border:2px solid ' + tc + ';display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">' + UI[t].em + '</div>' +
          '<div><div style="font-size:17px;font-weight:800;color:' + tc + '">' + UI[t].lbl + '</div>' +
          '<div style="font-size:11px;color:#6e7681;margin-top:1px">' + (pl(j.physId) === 'vertical' ? '↕ Vertical' : '↔ Horizontal') + ' · Cycle ' + (Math.floor((j.physId-1)/6)+1) + '/4 · Pos ' + (((j.physId-1)%6)+1) + '/6</div></div>' +
        '</div>' +
        '<div style="background:rgba(0,0,0,.25);border-radius:8px;padding:10px 6px;margin-bottom:10px">' + svgDiag(t, j.physId, ai, bi) + '</div>' +
        '<div style="background:rgba(0,0,0,.25);border-radius:7px;padding:9px 12px;font-size:13px;font-weight:700;color:' + tc + '">' + dirtxt(t, j.physId) + '</div>' +
      '</div>' +
      (isInvalidStep ? '<div style="background:rgba(255,119,0,.1);border:1.5px solid #ff7700;border-radius:10px;padding:10px 12px;font-size:12px;color:#ff7700;font-weight:700">⚠ Unknown action "' + invalidOriginal + '" at this joint — treated as S (straight). Use the Engine tab to set the correct fold.</div>' : '') +
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
      // 2D: always pass full joints + physical joint ID so A/B labels land on correct segments
      if (cv) Renderer2D.draw(cv, joints, j.physId, invalidJointIndices());
      var v3 = document.getElementById('guide-3d');
      if (v3) {
        Renderer3D.init(v3);
        if (guideReverse) {
          Renderer3D.update(reverseJoints(joints, guideStep), { highlight: bi, invalidSegs: invalidSegsForRevStep(guideStep) });
        } else {
          Renderer3D.update(joints.slice(0, guideStep), { highlight: bi, invalidSegs: invalidSegsForStep(guideStep) });
        }
      }
    }, 20);
  }

  // ── ENGINE TAB ────────────────────────────────────────────────────────────
  function engineStepInfo(joints, step) {
    if (step === undefined) step = engStep;
    if (step < 1) {
      return '<div style="font-size:12px;color:#6e7681;margin-top:10px;text-align:center">Start of snake — segment 0 only</div>';
    }
    var t = joints[step - 1], tc = UI[t].col, tbg = UI[t].bg;
    var ai = step - 1, bi = step;
    return '<div style="border:1.5px solid ' + tc + '44;background:' + tbg + ';border-radius:10px;padding:10px;margin-top:10px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
          '<div style="width:36px;height:36px;border-radius:8px;background:' + tc + '20;border:2px solid ' + tc + ';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">' + UI[t].em + '</div>' +
          '<div>' +
            '<div style="font-size:14px;font-weight:800;color:' + tc + '">Joint ' + step + '/23 — ' + UI[t].lbl + '</div>' +
            '<div style="font-size:11px;color:#6e7681;margin-top:1px">' + Snake.segColor(ai).n + ' → ' + Snake.segColor(bi).n + ' · ' + (pl(step) === 'vertical' ? '↕ Vertical' : '↔ Horizontal') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="background:rgba(0,0,0,.25);border-radius:8px;padding:8px 4px">' + svgDiag(t, step, ai, bi) + '</div>' +
        '<div style="background:rgba(0,0,0,.25);border-radius:7px;padding:9px 12px;margin-top:8px;font-size:13px;font-weight:700;color:' + tc + '">' + dirtxt(t, step) + '</div>' +
      '</div>';
  }

  function renderEngine() {
    stopEngAnim();
    document.getElementById('navrow').style.display = 'none';
    var pg = document.getElementById('pg');
    var startJoints = activeShape ? activeShape.joints.slice() : Array(23).fill('S');
    var joints = MovesEngine.getJoints() || startJoints;

    pg.innerHTML =
      '<div class="card" style="position:sticky;top:0;z-index:5;padding:10px;box-shadow:0 8px 12px -6px rgba(0,0,0,.6)">' +
        '<div class="lbl">3D preview — drag to rotate</div>' +
        '<div id="view3d" style="width:100%;height:200px;border-radius:8px;overflow:hidden;background:#0d1117;touch-action:none"></div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin:8px 0">' +
          '<button id="eng-prev" style="padding:8px 12px;background:#21262d;border:1px solid #30363d;border-radius:7px;color:#c9d1d9;font-size:13px;font-weight:700">&#9664;</button>' +
          '<input id="eng-slider" type="range" min="0" max="23" step="1" value="' + engStep + '" style="flex:1">' +
          '<button id="eng-next" style="padding:8px 12px;background:#21262d;border:1px solid #30363d;border-radius:7px;color:#c9d1d9;font-size:13px;font-weight:700">&#9654;</button>' +
          '<button id="eng-play" style="padding:8px 12px;background:#21262d;border:1px solid #30363d;border-radius:7px;color:#3fb950;font-size:13px;font-weight:700;white-space:nowrap">&#9654; Play</button>' +
        '</div>' +
        '<div id="eng-step-lbl" style="text-align:center;font-size:12px;color:#8b949e;font-weight:700">Step ' + engStep + ' / 23</div>' +
      '</div>' +
      '<div class="card" style="padding:10px">' +
        '<div class="lbl">Playback options</div>' +
        animControlsHtml() +
        '<canvas id="ec" style="width:100%;background:#0d1117;border-radius:6px;margin-top:10px"></canvas>' +
      '</div>' +
      '<div class="card" style="padding:10px">' +
        '<div id="eng-step-info">' + engineStepInfo(joints) + '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="lbl">Moves Engine — build a new shape</div>' +
        '<p style="font-size:12px;color:#6e7681;margin-bottom:10px">Tap any joint to cycle S → R → L → F. The 3D + 2D views above jump straight to that joint so you can see the change immediately.</p>' +
        '<div id="me-container"></div>' +
      '</div>';

    function refreshViews(j, highlightSeg) {
      var cv = document.getElementById('ec');
      if (cv) Renderer2D.draw(cv, j, engStep >= 1 ? engStep : null, invalidJointIndices());
      var v3 = document.getElementById('view3d');
      if (v3) {
        Renderer3D.init(v3);
        Renderer3D.update(j.slice(0, engStep), {
          invalidSegs: invalidSegsForStep(engStep),
          highlight: highlightSeg,
        });
      }
      var info = document.getElementById('eng-step-info');
      if (info) info.innerHTML = engineStepInfo(j);
    }

    function setStep(s, highlightSeg) {
      stopEngAnim();
      engStep = Math.max(0, Math.min(23, s));
      var slider = document.getElementById('eng-slider');
      if (slider) slider.value = engStep;
      var lbl = document.getElementById('eng-step-lbl');
      if (lbl) lbl.textContent = 'Step ' + engStep + ' / 23';
      refreshViews(MovesEngine.getJoints() || startJoints, highlightSeg);
    }

    MovesEngine.init(document.getElementById('me-container'), startJoints, function (j, changedJointIdx) {
      stopEngAnim();
      if (typeof changedJointIdx === 'number') {
        // Jump the preview straight to the joint that was just edited, with
        // its segment highlighted, so the user sees the effect without
        // having to scroll or scrub the slider.
        setStep(changedJointIdx + 1, changedJointIdx + 1);
      } else {
        setTimeout(function () { refreshViews(j); }, 20);
      }
    });

    document.getElementById('eng-prev').onclick = function () { setStep(engStep - 1); };
    document.getElementById('eng-next').onclick = function () { setStep(engStep + 1); };
    document.getElementById('eng-slider').oninput = function () { setStep(+this.value); };
    document.getElementById('eng-play').onclick = function () {
      if (engPlaying) { stopEngAnim(); } else { startEngAnim(); }
    };
    wireAnimControls(pg);

    // trigger initial draw
    setTimeout(function () {
      var v3 = document.getElementById('view3d');
      if (v3) Renderer3D.init(v3);
      refreshViews(MovesEngine.getJoints() || startJoints);
    }, 50);
  }

  // ── EDITOR TAB ────────────────────────────────────────────────────────────
  function renderEditor() {
    stopEdAnim();
    var pg = document.getElementById('pg');
    var joints = activeShape ? activeShape.joints : [];
    var total = joints.length + 1;
    var dirRev = edBuildDir === 'rev';
    var numSegs = edRevealCount;
    var subJoints = joints.slice(0, edRevealCount - 1);
    var xf = edXf[edSeg] || 0;

    // Reverse mode shows the full 24-segment chain from the start — segments
    // not yet edited are forced straight ('S') via reverseJoints, and fold
    // into place one at a time as editing proceeds tail-first (23 -> 0).
    var dispJoints = dirRev ? reverseJoints(joints, edRevealCount - 1) : subJoints;
    var dispInvalid = dirRev ? invalidSegsForRevStep(edRevealCount - 1) : invalidSegsForStep(subJoints.length);

    var visibleIdxs = [];
    if (dirRev) {
      for (var vi = total - 1; vi >= 0; vi--) visibleIdxs.push(vi);
    } else {
      for (var vi = 0; vi < numSegs; vi++) visibleIdxs.push(vi);
    }

    var segBtns = '';
    visibleIdxs.forEach(function (i) {
      var sc = Snake.segColor(i).h;
      var active = i === edSeg;
      segBtns += '<button data-edid="' + i + '" style="display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:8px;' +
        'background:' + (active ? sc + '28' : 'rgba(255,255,255,.05)') + ';' +
        'border:' + (active ? '1.5px solid ' + sc : '1px solid #30363d') + ';color:#fff;font-size:12px;font-weight:' + (active ? '700' : '400') + '">' +
        '<span style="width:11px;height:11px;border-radius:3px;background:' + sc + ';display:inline-block;flex-shrink:0"></span>' +
        'Seg&nbsp;' + i + '</button>';
    });

    function rotRow(rval) {
      var v = ((Math.round(rval) % 360) + 360) % 360;
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<button data-rot="-90" style="flex:1;padding:9px;background:#21262d;border:1px solid #30363d;border-radius:7px;color:#8b949e;font-size:13px;font-weight:700">-90°</button>' +
        '<span id="ed-rot-val" style="width:46px;text-align:center;color:#fff;font-size:13px;font-weight:700">' + v + '°</span>' +
        '<button data-rot="90" style="flex:1;padding:9px;background:#21262d;border:1px solid #30363d;border-radius:7px;color:#8b949e;font-size:13px;font-weight:700">+90°</button>' +
      '</div>';
    }

    // "+ Add Segment" — only when there is a next joint left to reveal.
    var nextIdx = dirRev ? total - edRevealCount - 1 : edRevealCount;
    var addCardH = '';
    if (edRevealCount <= joints.length) {
      var swatches = Snake.COLORS.map(function (c) {
        return '<button data-addcolor="' + c.h + '" title="' + c.n + '" style="width:36px;height:36px;border-radius:8px;background:' + c.h + ';border:1.5px solid rgba(255,255,255,.2);cursor:pointer"></button>';
      }).join('');
      addCardH = '<div class="card">' +
        '<div class="lbl">+ Add Segment ' + nextIdx + ' — pick a color</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' + swatches + '</div>' +
      '</div>';
    }

    var dirAct = 'background:rgba(88,166,255,.12);border:1.5px solid #58a6ff;color:#58a6ff';
    var dirInact = 'background:rgba(255,255,255,.04);border:1.5px solid #30363d;color:#6e7681';
    var buildDirH = '<div class="card">' +
      '<div class="lbl">Build direction</div>' +
      '<div style="display:flex;gap:6px">' +
        '<button id="ed-dir-fwd" style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:700;' + (!dirRev ? dirAct : dirInact) + '">↗ Head-first 0 → 23</button>' +
        '<button id="ed-dir-rev" style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:700;' + (dirRev ? dirAct : dirInact) + '">↙ Tail-first 23 → 0</button>' +
      '</div>' +
    '</div>';

    pg.innerHTML =
      '<div class="card" style="padding:10px">' +
        '<div class="lbl" style="display:flex;justify-content:space-between;align-items:center">' +
          '<span>3D — tap segment to select &amp; drag to orbit</span>' +
          '<button id="ed-anim" style="padding:5px 10px;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#58a6ff;font-size:12px;font-weight:700">&#9654; Animate</button>' +
        '</div>' +
        '<div id="editor-3d" style="width:100%;height:240px;border-radius:8px;overflow:hidden;background:#0d1117;touch-action:none"></div>' +
        animControlsHtml() +
      '</div>' +
      buildDirH +
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
        '<div style="display:flex;gap:8px">' +
          '<button id="ed-copy" style="flex:1;padding:9px;background:#21262d;border:1px solid #30363d;border-radius:8px;color:#c9d1d9;font-size:12px;font-weight:700">&#128203; Copy JSON</button>' +
          '<button id="ed-copy-enriched" style="flex:1;padding:9px;background:#21262d;border:1px solid #30363d;border-radius:8px;color:#a371f7;font-size:12px;font-weight:700">&#128196; Copy Enriched</button>' +
        '</div>' +
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

    // Build direction — switching resets progress, since reveal order flips.
    function switchEdDir(dir) {
      if (edBuildDir === dir) return;
      var freshCount = edBuildDir === 'rev' ? 1 : 2;
      var hasProgress = edRevealCount > freshCount || Object.keys(edXf).length > 0;
      if (hasProgress && !confirm('Switch build direction? This resets the segments and rotations you\'ve built so far.')) return;
      edBuildDir = dir;
      edRevealCount = dir === 'rev' ? 1 : 2;
      edXf = {};
      Snake.clearSegTransforms();
      edSeg = dir === 'rev' ? total - 1 : 0;
      edFocusAll = true;
      renderEditor();
    }
    document.getElementById('ed-dir-fwd').onclick = function () { switchEdDir('fwd'); };
    document.getElementById('ed-dir-rev').onclick = function () { switchEdDir('rev'); };

    // Add segment — pick a color for the next segment in the chain
    pg.querySelectorAll('[data-addcolor]').forEach(function (btn) {
      btn.onclick = function () {
        var hex = this.getAttribute('data-addcolor');
        var newIdx = nextIdx;
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
        Renderer3D.update(dispJoints, { highlight: edSeg, focus: 'all', invalidSegs: dispInvalid });
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

    var edCopyEnriched = document.getElementById('ed-copy-enriched');
    if (edCopyEnriched) edCopyEnriched.onclick = function () {
      var json = JSON.stringify(exportEnriched(editedJoints()), null, 2);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(json).then(function () {
          edCopyEnriched.textContent = '✓ Copied!';
          setTimeout(function () { edCopyEnriched.innerHTML = '&#128196; Copy Enriched'; }, 1500);
        });
      } else {
        edCopyEnriched.textContent = json;
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

    // Animate button
    var edAnimBtn = document.getElementById('ed-anim');
    if (edAnimBtn) edAnimBtn.onclick = function () {
      if (edPlaying) { stopEdAnim(); } else { startEdAnim(); }
    };
    wireAnimControls(pg);

    // 3D init + wire editor callbacks
    setTimeout(function () {
      var v3 = document.getElementById('editor-3d');
      if (!v3) return;
      Renderer3D.init(v3);
      Renderer3D.update(dispJoints, { highlight: edSeg, focus: edFocusAll ? 'all' : 'segment', invalidSegs: dispInvalid });
      Renderer3D.setEditor({
        onSelect: function (idx) {
          if (idx === edSeg && !edFocusAll) return;
          stopEdAnim();
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
