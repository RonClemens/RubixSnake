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
    // Single segment at origin: right-angle at origin, leg1=+Y, leg2=+Z, depth=+X.
    var segs = [];
    segs.push({
      idx: 0,
      f: [[0,0,0], [0,1,0], [0,0,1]],
      b: [[1,0,0], [1,1,0], [1,0,1]],
    });
    return segs;
  }

  return {
    COLORS: COLORS,
    segColor: segColor,
    layout2D: layout2D,
    layout3D: layout3D,
  };
})();
