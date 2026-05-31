// renderer2d.js — SVG/canvas 2D top-down snake rendering

var Renderer2D = (function () {

  function draw(canvas, joints, highlightJoint) {
    var W = canvas.width  = canvas.offsetWidth  || 340;
    var H = canvas.height = 280;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    var S = 22;
    var count = joints.length + 1;
    var layout = Snake.layout2D(joints, count);
    var segs = layout.segs;

    if (!segs.length) return;

    // bounding box → auto-scale
    var mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    segs.forEach(function (s) {
      [s.ax, s.bx, s.cx].forEach(function (x) { if (x < mnX) mnX = x; if (x > mxX) mxX = x; });
      [s.ay, s.by, s.cy].forEach(function (y) { if (y < mnY) mnY = y; if (y > mxY) mxY = y; });
    });
    var pad = 28, bw = mxX - mnX || 1, bh = mxY - mnY || 1;
    var sc = Math.min((W - 2*pad) / bw, (H - 2*pad) / bh);
    if (sc > 60) sc = 60; // allow large zoom for early steps, cap only at extreme
    var ox = (W - bw*sc) / 2 - mnX*sc;
    var oy = (H - bh*sc) / 2 - mnY*sc;
    function tx(x) { return x*sc + ox; }
    function ty(y) { return y*sc + oy; }

    var jid = (highlightJoint !== null && highlightJoint !== undefined) ? highlightJoint : -1;
    var UI = { S: '#58a6ff', R: '#f0883e', L: '#3fb950' };
    var jColor = '';
    if (jid >= 1 && jid <= 23) {
      var jt = joints[jid - 1] || 'S';
      jColor = UI[jt] || '#fff';
    }

    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var isA = (i === jid - 1);
      var isB = (i === jid);
      ctx.beginPath();
      ctx.moveTo(tx(s.ax), ty(s.ay));
      ctx.lineTo(tx(s.bx), ty(s.by));
      ctx.lineTo(tx(s.cx), ty(s.cy));
      ctx.closePath();
      ctx.fillStyle = Snake.segColor(s.idx).h;
      ctx.fill();
      ctx.lineWidth = isA || isB ? 2 : 0.6;
      ctx.strokeStyle = isA ? '#fff' : isB ? jColor : 'rgba(0,0,0,0.55)';
      ctx.stroke();

      if (isA || isB) {
        var lcx = (s.ax + s.bx + s.cx) / 3;
        var lcy = (s.ay + s.by + s.cy) / 3;
        ctx.fillStyle = isA ? '#fff' : jColor;
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isA ? 'A' : 'B', tx(lcx), ty(lcy));
      }
    }

    // direction arrow at next pivot
    if (jid >= 1 && jid <= 23) {
      var ac = jColor;
      var apx = tx(layout.px), apy = ty(layout.py);
      var alen = Math.max(22, sc * 0.9);
      var aex = apx + layout.fx * alen, aey = apy + layout.fy * alen;
      ctx.strokeStyle = ac; ctx.fillStyle = ac; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(apx, apy); ctx.lineTo(aex, aey); ctx.stroke();
      var ang = Math.atan2(aey - apy, aex - apx);
      ctx.beginPath();
      ctx.moveTo(aex, aey);
      ctx.lineTo(aex - 11*Math.cos(ang - 0.42), aey - 11*Math.sin(ang - 0.42));
      ctx.lineTo(aex - 11*Math.cos(ang + 0.42), aey - 11*Math.sin(ang + 0.42));
      ctx.closePath(); ctx.fill();
    }
  }

  return { draw: draw };
})();
