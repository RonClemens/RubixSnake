// snake.js — core model for a 24-segment Rubik's Snake
// Each segment is a right-isosceles triangular prism.
// 23 joints; each joint angle: 0=straight, 1=R 90°, 2=180°, 3=L 90°
// (In the UI we use S/R/L strings; internally we use 0/1/2/3)

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

  // Convert S/R/L string array to numeric 0/1/3
  function strToNum(arr) {
    return arr.map(function (t) {
      if (t === 'R') return 1;
      if (t === 'L') return 3;
      return 0;
    });
  }

  // Convert numeric back to S/R/L
  function numToStr(arr) {
    return arr.map(function (n) {
      if (n === 1) return 'R';
      if (n === 3) return 'L';
      return 'S';
    });
  }

  // ── 2D layout ──────────────────────────────────────────────────────────────
  // Returns array of {ax,ay,bx,by,cx,cy,idx} triangles for segments 0..count-1
  // joints: array of 23 S/R/L strings
  function layout2D(joints, count) {
    var S = 1; // unit size — caller scales
    var px = 0, py = 0;
    var fx = 1, fy = 0;  // fwd
    var ux = 0, uy = 1;  // perp
    var flip = false;
    var segs = [];

    var limit = Math.min(count, 24);
    for (var i = 0; i < limit; i++) {
      var bx, by, cx, cy;
      if (!flip) {
        bx = px + S * fx; by = py + S * fy;
        cx = px + S * ux; cy = py + S * uy;
      } else {
        bx = px - S * fx; by = py - S * fy;
        cx = px - S * ux; cy = py - S * uy;
      }
      segs.push({ ax: px, ay: py, bx: bx, by: by, cx: cx, cy: cy, idx: i });

      if (!flip) {
        px = px + S * fx + S * ux; py = py + S * fy + S * uy;
      } else {
        px = px - S * ux; py = py - S * uy;
      }
      flip = !flip;

      if (i < joints.length) {
        var t = joints[i];
        if (t === 'R') {
          var nfx = ux, nfy = uy, nux = -fx, nuy = -fy;
          fx = nfx; fy = nfy; ux = nux; uy = nuy;
        } else if (t === 'L') {
          var nfx2 = -ux, nfy2 = -uy, nux2 = fx, nuy2 = fy;
          fx = nfx2; fy = nfy2; ux = nux2; uy = nuy2;
        }
      }
    }
    // also return the next pivot + direction for arrow drawing
    return { segs: segs, px: px, py: py, fx: fx, fy: fy };
  }

  // ── 3D layout ──────────────────────────────────────────────────────────────
  // Returns array of {pos, fwd, up, idx} for Three.js rendering.
  //
  // Physical model: each segment is a right-isosceles triangular prism.
  // Adjacent segments connect at the hypotenuse face and alternate orientation
  // (one has the right-angle vertex at the "near" corner, the next at the "far"
  // corner). This creates the familiar zigzag even in the straight position.
  //
  // Position advance mirrors the 2D layout:
  //   even segment → next pos = pos + fwd*L + up*L  (along the hypotenuse diagonal)
  //   odd  segment → next pos = pos + (-up)*L        (back along the leg)
  //
  // Joint rotation alternates plane:
  //   even joint index → rotate in fwd/up plane
  //   odd  joint index → rotate in fwd/rgt plane
  //
  // For odd (flipped) segments the up vector is negated in the output so the
  // mesh's right-angle vertex always matches pos.
  function layout3D(joints) {
    var L = 1;
    var pos  = [0, 0, 0];
    var fwd  = [1, 0, 0];
    var up   = [0, 1, 0];
    var rgt  = [0, 0, 1];
    var flip = false;
    var result = [];

    for (var i = 0; i <= joints.length; i++) {
      // Output: negate up for flipped segments so mesh right-angle vertex = pos
      result.push({
        pos: pos.slice(),
        fwd: fwd.slice(),
        up:  flip ? vneg(up) : up.slice(),
        idx: i,
      });

      if (i >= joints.length) break;

      // Advance position (zigzag matching the physical geometry)
      if (!flip) {
        pos = vadd(vadd(pos, vscale(fwd, L)), vscale(up, L));
      } else {
        pos = vadd(pos, vscale(vneg(up), L));
      }
      flip = !flip;

      // Apply joint rotation (alternating planes)
      var t = joints[i];
      if (t !== 'S') {
        var sign = (t === 'R') ? 1 : -1;
        if (i % 2 === 0) {
          // even joint: rotate in fwd/up plane
          var nf  = vscale(up,  sign);
          var nu  = vscale(fwd, -sign);
          fwd = nf; up = nu;
        } else {
          // odd joint: rotate in fwd/rgt plane
          var nf2 = vscale(rgt, sign);
          var nr2 = vscale(fwd, -sign);
          fwd = nf2; rgt = nr2;
        }
      }
    }

    return result;
  }

  // ── vector helpers ─────────────────────────────────────────────────────────
  function vadd(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
  function vscale(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }
  function vneg(a) { return [-a[0], -a[1], -a[2]]; }

  return {
    COLORS: COLORS,
    segColor: segColor,
    strToNum: strToNum,
    numToStr: numToStr,
    layout2D: layout2D,
    layout3D: layout3D,
  };
})();
