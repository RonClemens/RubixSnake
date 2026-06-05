// snake.js — core model for a 24-segment Rubik's Snake
//
// Geometry: each segment is a right-isosceles triangular prism, legs = depth = 1.
// Even segments: right-angle corner at the "near" corner of the bounding unit square.
// Odd  segments: right-angle corner at the diagonally opposite corner.
// Together they tile a square cross-section — this is the straight wand.
//
// Joint rotation axis alternates:
//   After even segment i: hinge = leg2 (Z-axis when straight)
//   After odd  segment i: hinge = leg1 (Y-axis when straight)
// R = +90° around hinge,  L = −90° around hinge.

var Snake = (function () {

  var COLORS = [
    { n: 'Blue',   h: '#2980b9' },
    { n: 'Orange', h: '#e67e22' },
    { n: 'Pink',   h: '#e91e63' },
    { n: 'White',  h: '#e8e8e8' },
    { n: 'Red',    h: '#c0392b' },
    { n: 'Green',  h: '#27ae60' },
  ];

  function segColor(i) { return COLORS[i % 6]; }

  // ── vector helpers ─────────────────────────────────────────────────────────
  function vadd(a, b)   { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
  function vsub(a, b)   { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
  function vcross(a, b) {
    return [
      a[1]*b[2] - a[2]*b[1],
      a[2]*b[0] - a[0]*b[2],
      a[0]*b[1] - a[1]*b[0],
    ];
  }

  // ── segment transform overrides (used by the editor tab) ──────────────────
  var _xforms = {};

  function setSegTransform(id, xf) {
    _xforms[id] = { tx: xf.tx||0, ty: xf.ty||0, tz: xf.tz||0,
                    rx: xf.rx||0, ry: xf.ry||0, rz: xf.rz||0 };
  }
  function clearSegTransforms() { _xforms = {}; }

  // Rotate v around pivot using XYZ Euler (right-hand rule), then translate.
  function _xfApply(v, xf, px, py, pz) {
    var d = Math.PI / 180;
    var x = v[0]-px, y = v[1]-py, z = v[2]-pz, c, s, t;
    c = Math.cos(xf.rx*d); s = Math.sin(xf.rx*d);
    t = y*c - z*s; z = y*s + z*c; y = t;
    c = Math.cos(xf.ry*d); s = Math.sin(xf.ry*d);
    t = x*c + z*s; z = -x*s + z*c; x = t;
    c = Math.cos(xf.rz*d); s = Math.sin(xf.rz*d);
    t = x*c - y*s; y = x*s + y*c; x = t;
    return [x+px+xf.tx, y+py+xf.ty, z+pz+xf.tz];
  }

  // ── 2D layout ──────────────────────────────────────────────────────────────
  // Side-view zigzag diagram. Returns {segs, px, py, fx, fy} for canvas drawing.
  function layout2D(joints, count) {
    var px = 0, py = 0;
    var fx = 1, fy = 0;
    var ux = 0, uy = 1;
    var flip = false;
    var segs = [];
    var limit = Math.min(count, 24);

    for (var i = 0; i < limit; i++) {
      var bx, by, cx, cy;
      if (!flip) {
        bx = px + fx; by = py + fy;
        cx = px + ux; cy = py + uy;
      } else {
        bx = px - fx; by = py - fy;
        cx = px - ux; cy = py - uy;
      }
      segs.push({ ax: px, ay: py, bx: bx, by: by, cx: cx, cy: cy, idx: i });

      if (!flip) { px = px + fx + ux; py = py + fy + uy; }
      else        { px = px - ux;      py = py - uy; }
      flip = !flip;

      if (i < joints.length) {
        var t = joints[i];
        if (t === 'R') {
          var nfx = ux, nfy = uy; ux = -fx; uy = -fy; fx = nfx; fy = nfy;
        } else if (t === 'L') {
          var nfx2 = -ux, nfy2 = -uy; ux = fx; uy = fy; fx = nfx2; fy = nfy2;
        }
      }
    }
    return { segs: segs, px: px, py: py, fx: fx, fy: fy };
  }

  // ── 3D layout ──────────────────────────────────────────────────────────────
  function layout3D(joints) {
    var L = Math.SQRT1_2; // 1/√2 ≈ 0.707; legs = 1, hyp at Y=0.5
    var segs = [];
    // Seg 0 (even): hyp face at Y=0.5, right-angle at Y=0.5-L (bottom)
    segs.push({
      idx: 0,
      f: [[-0.5, 0.5-L,  0], [-0.5,  0.5, -L], [-0.5,  0.5,  L]],
      b: [[ 0.5, 0.5-L,  0], [ 0.5,  0.5, -L], [ 0.5,  0.5,  L]],
    });
    // Seg 1 (odd): hyp face at Y=0.5, right-angle at Y=0.5+L (top)
    segs.push({
      idx: 1,
      f: [[ 0.5, 0.5+L,  0], [ 0.5,  0.5,  L], [ 0.5,  0.5, -L]],
      b: [[ 1.5, 0.5+L,  0], [ 1.5,  0.5,  L], [ 1.5,  0.5, -L]],
    });
    segs.forEach(function (seg) {
      var xf = _xforms[seg.idx];
      if (!xf) return;
      var all = seg.f.concat(seg.b), px=0, py=0, pz=0;
      all.forEach(function (v) { px+=v[0]; py+=v[1]; pz+=v[2]; });
      px/=all.length; py/=all.length; pz/=all.length;
      seg.f = seg.f.map(function (v) { return _xfApply(v, xf, px, py, pz); });
      seg.b = seg.b.map(function (v) { return _xfApply(v, xf, px, py, pz); });
    });
    return segs;
  }

  return {
    COLORS: COLORS,
    segColor: segColor,
    layout2D: layout2D,
    layout3D: layout3D,
    setSegTransform: setSegTransform,
    clearSegTransforms: clearSegTransforms,
  };
})();
