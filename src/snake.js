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

  function segColor(i) { return _colors[i] || COLORS[i % 6]; }

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

  // ── per-segment color overrides (set when adding a segment in the editor) ──
  var _colors = {};
  function setSegColor(id, hex) { _colors[id] = { n: 'Custom', h: hex }; }
  function clearSegColors() { _colors = {}; }

  // ── per-segment joint axis directions (a1/a2 -> 'x'|'y'|'z') ───────────────
  var _axes = {};
  function setSegAxes(id, cfg) { _axes[id] = { a1: (cfg && cfg.a1) || 'x', a2: (cfg && cfg.a2) || 'x' }; }
  function getSegAxes(id) { return _axes[id] || { a1: 'x', a2: 'x' }; }

  // ── per-joint hinge axis override ('a1'|'a2') for R/L rotations ───────────
  var _hinges = {};
  function setHinge(jointIdx, key) { _hinges[jointIdx] = key; }
  function getHinge(jointIdx) { return _hinges[jointIdx] || null; }

  // Rotate v around centroid (px,py,pz) using XYZ Euler (right-hand rule), then translate.
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

  // ── joint axis helpers ─────────────────────────────────────────────────────
  // Each segment's vertex 0 is the right-angle corner of its triangular cross-
  // section. The two "right-angle side" (leg) faces are 0-1 and 0-2, extruded
  // front (f) to back (b). Returns the centroid of each leg face, in order
  // [face 0-1 centroid, face 0-2 centroid].
  function legFaceCentroids(seg) {
    var f = seg.f, b = seg.b;
    function avg4(p1, p2, p3, p4) {
      return [
        (p1[0]+p2[0]+p3[0]+p4[0]) / 4,
        (p1[1]+p2[1]+p3[1]+p4[1]) / 4,
        (p1[2]+p2[2]+p3[2]+p4[2]) / 4,
      ];
    }
    return [
      avg4(f[0], b[0], f[1], b[1]),
      avg4(f[0], b[0], f[2], b[2]),
    ];
  }

  // Point-reflect v through point p (180° inversion).
  function _reflect(v, p) { return [2*p[0]-v[0], 2*p[1]-v[1], 2*p[2]-v[2]]; }

  // Rotate point v by `angle` radians around the line through point p with
  // unit-vector direction `axis` (Rodrigues' rotation formula).
  function _rotateAround(v, p, axis, angle) {
    var d = vsub(v, p);
    var cos = Math.cos(angle), sin = Math.sin(angle);
    var kxd = vcross(axis, d);
    var kdotd = axis[0]*d[0] + axis[1]*d[1] + axis[2]*d[2];
    var r = [
      d[0]*cos + kxd[0]*sin + axis[0]*kdotd*(1-cos),
      d[1]*cos + kxd[1]*sin + axis[1]*kdotd*(1-cos),
      d[2]*cos + kxd[2]*sin + axis[2]*kdotd*(1-cos),
    ];
    return vadd(r, p);
  }

  var AXIS_VEC = { x: [1,0,0], y: [0,1,0], z: [0,0,1] };

  // ── 3D layout ──────────────────────────────────────────────────────────────
  // Builds joints.length + 1 segments by chaining off segment 0. For each
  // joint i (connecting seg i -> seg i+1): the new segment is the previous
  // segment's geometry, point-reflected through the midpoint of its "outgoing"
  // hypotenuse edge (the b1-b2 edge). For R/L joints, the reflected segment is
  // additionally rotated ±90° around the hinge axis (a1 or a2 leg-face axis of
  // segment i, direction set via setSegAxes / overridden via setHinge).
  function layout3D(joints) {
    var L = Math.SQRT1_2; // 1/√2 ≈ 0.707; legs = 1, hyp at Y=0.5
    var segs = [];
    // Seg 0 (even): triangular end caps normal to the global X-axis. Side 1
    // (leg face 0-1) and Side 2 (leg face 0-2) meet at the right-angle edge
    // (Y=-L/2, Z=0); the X-axis runs through the point midway between the
    // midpoints of Side 1 and Side 2 — i.e. Y=0, Z=0 — a line parallel to
    // Side 3, the hypotenuse panel (Y=L/2, Z=±L).
    segs.push({
      idx: 0,
      f: [[-0.5, -L/2,  0], [-0.5,  L/2, -L], [-0.5,  L/2,  L]],
      b: [[ 0.5, -L/2,  0], [ 0.5,  L/2, -L], [ 0.5,  L/2,  L]],
    });

    for (var i = 1; i <= joints.length; i++) {
      var prev = segs[i-1];
      var p = [
        (prev.b[1][0] + prev.b[2][0]) / 2,
        (prev.b[1][1] + prev.b[2][1]) / 2,
        (prev.b[1][2] + prev.b[2][2]) / 2,
      ];
      var f = prev.b.map(function (v) { return _reflect(v, p); });
      var b = prev.f.map(function (v) { return _reflect(v, p); });

      var jt = joints[i-1];
      if (jt === 'R' || jt === 'L') {
        var axCfg = _axes[i-1] || { a1: 'x', a2: 'x' };
        var hingeKey = _hinges[i-1] || ((i-1) % 2 === 0 ? 'a2' : 'a1');
        var dir = AXIS_VEC[axCfg[hingeKey]] || AXIS_VEC.x;
        var angle = (jt === 'R' ? 1 : -1) * Math.PI / 2;
        f = f.map(function (v) { return _rotateAround(v, p, dir, angle); });
        b = b.map(function (v) { return _rotateAround(v, p, dir, angle); });
      }

      segs.push({ idx: i, f: f, b: b });
    }

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
    setSegColor: setSegColor,
    clearSegColors: clearSegColors,
    setSegAxes: setSegAxes,
    getSegAxes: getSegAxes,
    setHinge: setHinge,
    getHinge: getHinge,
    legFaceCentroids: legFaceCentroids,
  };
})();
