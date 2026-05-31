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
  // Returns array of {pos:[x,y,z], rot:[rx,ry,rz], idx} for Three.js rendering
  // Uses the same alternating-axis logic as the physical puzzle.
  // Segment 0 sits at origin pointing +X.
  // The rotation axis alternates: odd joints rotate around Z, even around Y.
  // (This is a simplified but visually correct approximation.)
  function layout3D(joints) {
    var L = 1; // segment length in world units
    // We track position + orientation as 3 basis vectors (forward, up, right)
    var pos = [0, 0, 0];
    var fwd = [1, 0, 0];
    var up  = [0, 1, 0];
    var rgt = [0, 0, 1];

    var result = [];

    function addSeg(i, p, f, u, r) {
      result.push({
        pos: p.slice(),
        fwd: f.slice(),
        up:  u.slice(),
        idx: i,
      });
    }

    addSeg(0, pos, fwd, up, rgt);

    for (var i = 0; i < joints.length; i++) {
      var t = joints[i];
      // Advance position by one segment length along fwd
      pos = vadd(pos, vscale(fwd, L));

      // Apply rotation at joint based on turn type and parity
      // Even joints (0-indexed) turn in the up/fwd plane (left/right from above)
      // Odd joints turn in the rgt/fwd plane (up/down)
      var parity = i % 2;
      if (t === 'R') {
        if (parity === 0) {
          // turn right: new_fwd = rgt, new_rgt = -fwd
          var nf = rgt.slice(), nr = vneg(fwd);
          fwd = nf; rgt = nr;
        } else {
          // turn up: new_fwd = -up, new_up = fwd
          var nf2 = vneg(up), nu = fwd.slice();
          fwd = nf2; up = nu;
        }
      } else if (t === 'L') {
        if (parity === 0) {
          // turn left: new_fwd = -rgt, new_rgt = fwd
          var nf3 = vneg(rgt), nr2 = fwd.slice();
          fwd = nf3; rgt = nr2;
        } else {
          // turn down: new_fwd = up, new_up = -fwd
          var nf4 = up.slice(), nu2 = vneg(fwd);
          fwd = nf4; up = nu2;
        }
      }

      addSeg(i + 1, pos, fwd, up, rgt);
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
