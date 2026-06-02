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
  // Returns array of { idx, f:[f0,f1,f2], b:[b0,b1,b2] }
  // f0 = right-angle vertex (front), f1/f2 = leg tips, b* = same shifted by fwd.
  function layout3D(joints) {
    var pos  = [0, 0, 0];
    var fwd  = [1, 0, 0];
    // Rotate the cross-section 45° around fwd so the hypotenuse face is
    // horizontal (perpendicular to Y).  With leg1=(0,1,0) and leg2=(0,0,1)
    // the hyp was at 45° in Y-Z.  Rotating 45° CW gives:
    //   leg1 = (0, 1/√2,  1/√2)  →  upper-right diagonal
    //   leg2 = (0, 1/√2, -1/√2)  →  upper-left  diagonal
    // Combined cross-section is then a diamond (square rotated 45°).
    var s = Math.SQRT2 / 2;          // 1/√2 ≈ 0.7071
    var leg1 = [0,  s,  s];
    var leg2 = [0,  s, -s];
    var segs = [];

    for (var i = 0; i < 24; i++) {
      var odd = i & 1;
      var f0, f1, f2;

      if (!odd) {
        // Even: right-angle at pos → hyp face normal (0,−1,0) = −Y (bottom face) ✓
        f0 = pos.slice();
        f1 = vadd(pos, leg1);
        f2 = vadd(pos, leg2);
      } else {
        // Odd: right-angle at opposite corner → hyp face normal (0,+1,0) = +Y (top face) ✓
        f0 = vadd(vadd(pos, leg1), leg2);
        f1 = vadd(pos, leg2);
        f2 = vadd(pos, leg1);
      }

      segs.push({
        idx: i,
        f: [f0, f1, f2],
        b: [vadd(f0, fwd), vadd(f1, fwd), vadd(f2, fwd)],
      });

      pos = vadd(pos, fwd);

      if (i < joints.length && joints[i] !== 'S') {
        var hinge = odd ? leg1 : leg2;
        if (joints[i] === 'R') {
          var nf = vcross(hinge, fwd);
          if (!odd) leg1 = vcross(hinge, leg1);
          else      leg2 = vcross(hinge, leg2);
          fwd = nf;
        } else {
          var nf2 = vcross(fwd, hinge);
          if (!odd) leg1 = vcross(leg1, hinge);
          else      leg2 = vcross(leg2, hinge);
          fwd = nf2;
        }
      }
    }
    return segs;
  }

  return {
    COLORS: COLORS,
    segColor: segColor,
    layout2D: layout2D,
    layout3D: layout3D,
  };
})();
