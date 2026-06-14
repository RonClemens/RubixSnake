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
  function vnorm(a) {
    var len = Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]);
    return [a[0]/len, a[1]/len, a[2]/len];
  }
  function vmid(a, b) { return [(a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2]; }

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

  // Rotate v around `center` by xf.rx/ry/rz (degrees), each about its own
  // fixed axis taken from `frame` (frame.x/y/z — unit vectors derived from
  // the previous segment's local orientation; see segLocalFrame).
  function _xfApply(v, xf, center, frame) {
    var d = Math.PI / 180;
    var p = v;
    if (xf.rx) p = _rotateAround(p, center, frame.x, xf.rx * d);
    if (xf.ry) p = _rotateAround(p, center, frame.y, xf.ry * d);
    if (xf.rz) p = _rotateAround(p, center, frame.z, xf.rz * d);
    return p;
  }

  // Local rotation frame for a segment's editor controls, derived from the
  // PREVIOUS segment's current (post-edit) orientation: z = its depth
  // direction (f0->b0), y = the in-plane direction of its "open side" leg
  // face (the face this segment was mated from), x = the normal to that
  // face (cross(z, y) — the joint's hinge/"red" axis). Seg 0 has no
  // previous segment, so it uses the fixed global axes.
  function segLocalFrame(prevSeg) {
    if (!prevSeg) return { x: [1,0,0], y: [0,1,0], z: [0,0,1] };
    var depthDir = vnorm(vsub(prevSeg.f[0], prevSeg.b[0]));
    var other = prevSeg.idx % 2 === 0 ? 2 : 1;
    var inPlaneDir = vnorm(vsub(prevSeg.f[other], prevSeg.f[0]));
    var normalDir = vnorm(vcross(depthDir, inPlaneDir));
    return { x: normalDir, y: inPlaneDir, z: depthDir };
  }

  // Centroid of the vertices `seg` shares with `prevSeg` — i.e. the joint
  // face mating the two segments. Returns null if there's no previous
  // segment or no matching vertices were found.
  function _jointCentroid(seg, prevSeg) {
    if (!prevSeg) return null;
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

  // Apply seg's _xforms override (if any) to its f/b vertices in place,
  // rotating about `frame`'s axes through the centroid of the face seg
  // shares with `prevSeg` (the joint connecting them) — so the joint stays
  // mated. Seg 0 (no prevSeg) rotates about its own centroid. Called
  // immediately after a segment's base geometry is computed, so that any
  // subsequent segment derived from it (via reflection off its faces) mates
  // to the edited geometry — edits propagate downstream.
  function applyXform(seg, frame, prevSeg) {
    var xf = _xforms[seg.idx];
    if (!xf) return;
    var center = _jointCentroid(seg, prevSeg);
    if (!center) {
      var all = seg.f.concat(seg.b), px=0, py=0, pz=0;
      all.forEach(function (v) { px+=v[0]; py+=v[1]; pz+=v[2]; });
      center = [px/all.length, py/all.length, pz/all.length];
    }
    seg.f = seg.f.map(function (v) { return _xfApply(v, xf, center, frame); });
    seg.b = seg.b.map(function (v) { return _xfApply(v, xf, center, frame); });
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
    applyXform(segs[0], segLocalFrame(null), null);

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

      // Seg 1: an "S" joint shares Seg 0's Side 2 (leg face 0-2), not the
      // hypotenuse. 180°-rotate Seg 0's entire geometry about the axis
      // through the midpoint of that shared edge, parallel to Seg 0's own
      // depth direction (frame-independent — follows any edits made to
      // Seg 0's orientation), so the hypotenuses alternate between an upper
      // and lower "rail" as more straight segments follow.
      if (i === 1) {
        var depthDir1 = vnorm(vsub(prev.f[0], prev.b[0]));
        var axisPt1 = vmid(prev.f[0], prev.f[2]);
        f = prev.f.map(function (v) { return _rotateAround(v, axisPt1, depthDir1, Math.PI); });
        b = prev.b.map(function (v) { return _rotateAround(v, axisPt1, depthDir1, Math.PI); });
      }

      // Seg 2: repeats Seg 0's pattern, mating to Seg 1's Side 1 (leg face
      // 0-1) — the other leg face from the one Seg 1 shares with Seg 0.
      // 180°-rotate Seg 1's entire geometry about the axis through the
      // midpoint of that edge, parallel to Seg 1's depth direction, which
      // puts Seg 2's hypotenuse back on the upper rail, alternating with
      // Seg 1's lower rail.
      if (i === 2) {
        var depthDir2 = vnorm(vsub(prev.f[0], prev.b[0]));
        var axisPt2 = vmid(prev.f[0], prev.f[1]);
        f = prev.f.map(function (v) { return _rotateAround(v, axisPt2, depthDir2, Math.PI); });
        b = prev.b.map(function (v) { return _rotateAround(v, axisPt2, depthDir2, Math.PI); });
      }

      // Seg 3: mates to Seg 2's Side 2 (alternating back from the Side 1
      // mate used for Seg 2), via the same 180° rotation as Seg 1. If
      // joint 2 is an R/L turn, the result is additionally rotated ±90°
      // around the axis normal to Seg 2's open Side 2 face, pivoting
      // through that face's center — the joint's hinge axis, derived from
      // Seg 2's own orientation rather than a fixed global axis.
      if (i === 3) {
        var depthDir3 = vnorm(vsub(prev.f[0], prev.b[0]));
        var axisPt3 = vmid(prev.f[0], prev.f[2]);
        f = prev.f.map(function (v) { return _rotateAround(v, axisPt3, depthDir3, Math.PI); });
        b = prev.b.map(function (v) { return _rotateAround(v, axisPt3, depthDir3, Math.PI); });

        if (jt === 'R' || jt === 'L') {
          var pivot3 = [
            (prev.f[0][0] + prev.b[0][0] + prev.f[2][0] + prev.b[2][0]) / 4,
            (prev.f[0][1] + prev.b[0][1] + prev.f[2][1] + prev.b[2][1]) / 4,
            (prev.f[0][2] + prev.b[0][2] + prev.f[2][2] + prev.b[2][2]) / 4,
          ];
          var inPlaneDir3 = vnorm(vsub(prev.f[2], prev.f[0]));
          var rotAxis3 = vnorm(vcross(depthDir3, inPlaneDir3));
          var angle3 = (jt === 'R' ? 1 : -1) * Math.PI / 2;
          f = f.map(function (v) { return _rotateAround(v, pivot3, rotAxis3, angle3); });
          b = b.map(function (v) { return _rotateAround(v, pivot3, rotAxis3, angle3); });
        }
      }

      segs.push({ idx: i, f: f, b: b });
      applyXform(segs[i], segLocalFrame(prev), prev);
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
    setSegAxes: setSegAxes,
    getSegAxes: getSegAxes,
    setHinge: setHinge,
    getHinge: getHinge,
    legFaceCentroids: legFaceCentroids,
  };
})();
