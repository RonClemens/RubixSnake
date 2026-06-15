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
// R = +90° around hinge,  L = −90° around hinge,  F = 180° (flip) around hinge.

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
  function vnorm(a) {
    var len = Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]);
    return [a[0]/len, a[1]/len, a[2]/len];
  }
  function vmid(a, b) { return [(a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2]; }

  // ── segment rotation overrides (used by the editor tab) ────────────────────
  // Each segment i >= 1 can be rotated about the hinge axis of the joint
  // connecting it to segment i-1 (the normal to segment i-1's "open side"
  // face — see jointHingeAxis). Seg 0 has no previous segment and is never
  // rotated.
  var _xforms = {};

  function setSegTransform(id, deg) { _xforms[id] = deg || 0; }
  function clearSegTransforms() { _xforms = {}; }

  // ── per-segment color overrides (set when adding a segment in the editor) ──
  var _colors = {};
  function setSegColor(id, hex) { _colors[id] = { n: 'Custom', h: hex }; }
  function clearSegColors() { _colors = {}; }

  // Hinge axis for the joint connecting `prevSeg` to the next segment: the
  // normal to prevSeg's "open side" leg face (the face the next segment
  // mates from) — cross(depth direction, open-face in-plane direction).
  function jointHingeAxis(prevSeg) {
    var depthDir = vnorm(vsub(prevSeg.f[0], prevSeg.b[0]));
    var other = prevSeg.idx % 2 === 0 ? 2 : 1;
    var inPlaneDir = vnorm(vsub(prevSeg.f[other], prevSeg.f[0]));
    return vnorm(vcross(depthDir, inPlaneDir));
  }

  // Centroid of the vertices `seg` shares with `prevSeg` — i.e. the joint
  // face mating the two segments. Returns null if no matching vertices were
  // found.
  function _jointCentroid(seg, prevSeg) {
    var segV = seg.f.concat(seg.b), prevV = prevSeg.f.concat(prevSeg.b);
    var sum = [0, 0, 0], n = 0;
    segV.forEach(function (v) {
      prevV.forEach(function (p) {
        if (Math.abs(v[0]-p[0]) < 1e-9 && Math.abs(v[1]-p[1]) < 1e-9 && Math.abs(v[2]-p[2]) < 1e-9) {
          sum[0]+=v[0]; sum[1]+=v[1]; sum[2]+=v[2]; n++;
        }
      });
    });
    return n ? [sum[0]/n, sum[1]/n, sum[2]/n] : null;
  }

  // Apply seg's _xforms override (if any): rotate seg's f/b by the stored
  // angle about prevSeg's joint-hinge axis, pivoting through the centroid of
  // the face seg shares with prevSeg — so the joint stays mated. Called
  // immediately after a segment's base geometry is computed, so that any
  // subsequent segment derived from it mates to the edited geometry — edits
  // propagate downstream.
  function applyXform(seg, prevSeg) {
    var deg = _xforms[seg.idx];
    if (!deg) return;
    var center = _jointCentroid(seg, prevSeg);
    if (!center) return;
    var axis = jointHingeAxis(prevSeg);
    var angle = deg * Math.PI / 180;
    seg.f = seg.f.map(function (v) { return _rotateAround(v, center, axis, angle); });
    seg.b = seg.b.map(function (v) { return _rotateAround(v, center, axis, angle); });
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
        } else if (t === 'F') {
          fx = -fx; fy = -fy; ux = -ux; uy = -uy;
        }
      }
    }
    return { segs: segs, px: px, py: py, fx: fx, fy: fy };
  }

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

  // ── 3D layout ──────────────────────────────────────────────────────────────
  // Builds joints.length + 1 segments by chaining off segment 0. Each new
  // segment is the previous segment's entire geometry, 180°-rotated about the
  // axis through the midpoint of its "open side" leg face (face 0-1 for odd
  // segments, 0-2 for even segments), parallel to its depth direction — this
  // alternates the hypotenuse between an upper and lower "rail" as the chain
  // extends. For R/L joints, the result is additionally rotated ±90° around
  // that same open-side face's normal (the joint's hinge axis), pivoting
  // through the face's center — all derived from the previous segment's own
  // (possibly edited) orientation, never a fixed global axis.
  function layout3D(joints) {
    var L = Math.SQRT1_2; // 1/√2 ≈ 0.707; legs = 1, hyp at Y=0.5
    var segs = [];
    // Seg 0 (even): triangular end caps normal to the global Z-axis. Side 1
    // (leg face 0-1) and Side 2 (leg face 0-2) meet at the right-angle edge
    // (X=0, Y=-L/2); the Z-axis runs through the point midway between the
    // midpoints of Side 1 and Side 2 — i.e. X=0, Y=0 — a line parallel to
    // Side 3, the hypotenuse panel (X=±L, Y=L/2).
    segs.push({
      idx: 0,
      f: [[ 0, -L/2,  0.5], [-L,  L/2,  0.5], [ L,  L/2,  0.5]],
      b: [[ 0, -L/2, -0.5], [-L,  L/2, -0.5], [ L,  L/2, -0.5]],
    });

    for (var i = 1; i <= joints.length; i++) {
      var prev = segs[i-1];
      var depthDir = vnorm(vsub(prev.f[0], prev.b[0]));
      var other = prev.idx % 2 === 0 ? 2 : 1;
      var axisPt = vmid(prev.f[0], prev.f[other]);
      var f = prev.f.map(function (v) { return _rotateAround(v, axisPt, depthDir, Math.PI); });
      var b = prev.b.map(function (v) { return _rotateAround(v, axisPt, depthDir, Math.PI); });

      var jt = joints[i-1];
      if (jt === 'R' || jt === 'L' || jt === 'F') {
        var inPlaneDir = vnorm(vsub(prev.f[other], prev.f[0]));
        var hingeAxis = vnorm(vcross(depthDir, inPlaneDir));
        var pivot = vmid(vmid(prev.f[0], prev.b[0]), vmid(prev.f[other], prev.b[other]));
        var angle = jt === 'F' ? Math.PI : (jt === 'R' ? 1 : -1) * Math.PI / 2;
        f = f.map(function (v) { return _rotateAround(v, pivot, hingeAxis, angle); });
        b = b.map(function (v) { return _rotateAround(v, pivot, hingeAxis, angle); });
      }

      segs.push({ idx: i, f: f, b: b });
      applyXform(segs[i], prev);
    }

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
  };
})();
