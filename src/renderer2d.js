// renderer2d.js — 2D snake strip diagram
// Each segment shown as an isosceles triangle in a horizontal strip.
// Even segments (0,2,...) point DOWN ▽; odd segments (1,3,...) point UP ∆.
// Adjacent segments share slanted edges, matching the physical snake's
// alternating cross-section view.

var Renderer2D = (function () {

  function draw(canvas, joints, highlightJoint) {
    var W = canvas.width = canvas.offsetWidth || 340;
    var pad = 20;
    var N = 24;
    var TW = 2, TH = 2; // unit triangle base-width and height

    // Total strip width in units: each segment steps TW/2 forward
    var stripW = (N - 1) * (TW / 2) + TW; // = (N+1)/2 * TW = 25 units

    var sc = (W - 2 * pad) / stripW;

    var H = canvas.height = Math.max(120, Math.round(TH * sc + 2 * pad));
    var ox = pad;
    var oy = (H - TH * sc) / 2; // vertically center the strip

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    function tx(x) { return x * sc + ox; }
    function ty(y) { return y * sc + oy; }

    var jid = (highlightJoint !== null && highlightJoint !== undefined) ? highlightJoint : -1;
    var UI = { S: '#58a6ff', R: '#f0883e', L: '#3fb950' };
    var jColor = (jid >= 1 && jid <= 23) ? (UI[joints[jid - 1]] || '#fff') : '';

    for (var i = 0; i < N; i++) {
      var isA = (i === jid - 1);
      var isB = (i === jid);

      var xOff = i * (TW / 2);
      var ax, ay, bx, by, cx, cy;

      if (i % 2 === 0) {
        // ▽ DOWN: base at top (y=0), apex at bottom (y=TH)
        ax = xOff;          ay = 0;
        bx = xOff + TW;     by = 0;
        cx = xOff + TW / 2; cy = TH;
      } else {
        // ∆ UP: base at bottom (y=TH), apex at top (y=0)
        ax = xOff;          ay = TH;
        bx = xOff + TW;     by = TH;
        cx = xOff + TW / 2; cy = 0;
      }

      ctx.beginPath();
      ctx.moveTo(tx(ax), ty(ay));
      ctx.lineTo(tx(bx), ty(by));
      ctx.lineTo(tx(cx), ty(cy));
      ctx.closePath();

      ctx.fillStyle = Snake.segColor(i).h;
      ctx.fill();
      ctx.lineWidth = (isA || isB) ? 2.5 : 0.8;
      ctx.strokeStyle = isA ? '#ffffff' : isB ? jColor : 'rgba(0,0,0,0.45)';
      ctx.stroke();

      if (isA || isB) {
        var lcx = tx((ax + bx + cx) / 3);
        var lcy = ty((ay + by + cy) / 3);
        ctx.fillStyle = isA ? '#ffffff' : jColor;
        ctx.font = 'bold ' + Math.max(8, Math.round(sc * 0.55)) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isA ? 'A' : 'B', lcx, lcy);
      }
    }

    // Joint marker: colored dot at midpoint of the shared edge between seg jid-1 and jid
    if (jid >= 1 && jid <= 23) {
      var pi = jid - 1;
      // Shared edge midpoint formula: (pi * TW/2 + 3*TW/4,  TH/2)
      var mx = pi * (TW / 2) + 3 * (TW / 4);
      var my = TH / 2;
      var r = Math.max(4, sc * 0.28);

      ctx.beginPath();
      ctx.arc(tx(mx), ty(my), r, 0, Math.PI * 2);
      ctx.fillStyle = jColor;
      ctx.fill();
      ctx.strokeStyle = '#0d1117';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      var foldLabel = joints[jid - 1] || 'S';
      ctx.fillStyle = '#0d1117';
      ctx.font = 'bold ' + Math.max(7, Math.round(r * 1.1)) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(foldLabel, tx(mx), ty(my));
    }
  }

  return { draw: draw };
})();
