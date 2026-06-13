// renderer3d.js — Three.js 3D snake renderer
// Uses actual vertex positions from Snake.layout3D (no transform matrices).

var Renderer3D = (function () {
  var scene, camera, renderer, meshes = [], axesHelper = null, axesLabels = [], animFrame = null;
  var spherical = { theta: Math.PI, phi: Math.PI / 2, r: 4 };
  var orbitCenter = new THREE.Vector3();

  // Editor state
  var edCbs = null;          // { getXf(segIdx), onSelect(segIdx), onTransform(segIdx, xf) }
  var edMode = 'translate';  // 'translate' | 'rotate'

  // Joint-axis overlay: { segIdx: { a1: 'x'|'y'|'z', a2: 'x'|'y'|'z' } }
  var axisOverlay = null;
  var axisMeshes = [];
  var AXIS_DIR = { x: [1,0,0], y: [0,1,0], z: [0,0,1] };
  var AXIS_COL = { a1: 0xffff00, a2: 0xff00ff };

  var PRISM_IDX = [
    0,2,1,   3,4,5,     // front + back triangular caps
    0,1,4,  0,4,3,     // leg1 square face
    0,3,5,  0,5,2,     // leg2 square face
    1,2,5,  1,5,4,     // hyp face
  ];

  function init(container) {
    if (renderer) {
      if (renderer.domElement.parentNode !== container) {
        container.appendChild(renderer.domElement);
        resize(container);
      }
      return;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);

    var w = container.offsetWidth  || 340;
    var h = container.offsetHeight || 260;
    camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 200);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    var d1 = new THREE.DirectionalLight(0xffffff, 0.9);
    d1.position.set(5, 8, 6); scene.add(d1);
    var d2 = new THREE.DirectionalLight(0x8888ff, 0.3);
    d2.position.set(-4, -3, -5); scene.add(d2);

    axesHelper = new THREE.AxesHelper(4);
    axesHelper.material.depthTest = false;
    axesHelper.renderOrder = 999;
    scene.add(axesHelper);

    var labelDefs = [
      { text: 'X', pos: [4.4, 0, 0],   color: '#ff4444' },
      { text: 'Y', pos: [0,   4.4, 0], color: '#44ff44' },
      { text: 'Z', pos: [0,   0, 4.4], color: '#4488ff' },
    ];
    axesLabels = labelDefs.map(function (d) {
      var canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = d.color;
      ctx.font = 'bold 200px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.text, 128, 128);
      var tex = new THREE.CanvasTexture(canvas);
      var mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
      var sprite = new THREE.Sprite(mat);
      sprite.position.set(d.pos[0], d.pos[1], d.pos[2]);
      sprite.scale.set(0.7, 0.7, 0.7);
      sprite.renderOrder = 1000;
      scene.add(sprite);
      return sprite;
    });

    container.style.touchAction = 'none';
    addOrbit(container, renderer.domElement);

    new ResizeObserver(function () { resize(container); }).observe(container);

    (function loop() {
      animFrame = requestAnimationFrame(loop);
      renderer.render(scene, camera);
    })();
  }

  function resize(container) {
    var w = container.offsetWidth || 340;
    var h = container.offsetHeight || 260;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function update(joints) {
    meshes.forEach(function (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    meshes = [];
    axisMeshes.forEach(function (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    axisMeshes = [];

    Snake.layout3D(joints).forEach(function (seg) {
      var f = seg.f, b = seg.b;
      var v = new Float32Array([
        f[0][0],f[0][1],f[0][2],
        f[1][0],f[1][1],f[1][2],
        f[2][0],f[2][1],f[2][2],
        b[0][0],b[0][1],b[0][2],
        b[1][0],b[1][1],b[1][2],
        b[2][0],b[2][1],b[2][2],
      ]);
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
      geo.setIndex(PRISM_IDX);
      var mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
        color: new THREE.Color(Snake.segColor(seg.idx).h),
        shininess: 60,
        flatShading: true,
      }));
      mesh.userData.segIdx = seg.idx;
      scene.add(mesh);
      meshes.push(mesh);

      if (axisOverlay && axisOverlay[seg.idx]) {
        var cfg = axisOverlay[seg.idx];
        var cents = Snake.legFaceCentroids(seg);
        ['a1', 'a2'].forEach(function (key, i) {
          var dir = AXIS_DIR[cfg[key]] || AXIS_DIR.x;
          var c = cents[i];
          var len = 0.8;
          var pts = [
            new THREE.Vector3(c[0] - dir[0]*len/2, c[1] - dir[1]*len/2, c[2] - dir[2]*len/2),
            new THREE.Vector3(c[0] + dir[0]*len/2, c[1] + dir[1]*len/2, c[2] + dir[2]*len/2),
          ];
          var lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
          var line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: AXIS_COL[key] }));
          line.renderOrder = 998;
          scene.add(line);
          axisMeshes.push(line);

          var sphGeo = new THREE.SphereGeometry(0.05, 12, 12);
          var sphere = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: AXIS_COL[key] }));
          sphere.position.set(c[0], c[1], c[2]);
          sphere.renderOrder = 998;
          scene.add(sphere);
          axisMeshes.push(sphere);
        });
      }
    });

    if (meshes.length) {
      var box = new THREE.Box3();
      meshes.forEach(function (m) { box.expandByObject(m); });
      box.getCenter(orbitCenter);
      var size = box.getSize(new THREE.Vector3());
      var diag = size.length();
      var shortSide = Math.min(size.x, size.y, size.z);
      spherical.r = Math.max(diag * 0.7, shortSide * 6, 3);
      if (axesHelper) {
        var offsets = [[4.4,0,0],[0,4.4,0],[0,0,4.4]];
        axesLabels.forEach(function (s, i) {
          s.position.set(offsets[i][0], offsets[i][1], offsets[i][2]);
        });
      }
      updateCamera();
    }
  }

  function updateCamera() {
    camera.position.set(
      orbitCenter.x + spherical.r * Math.sin(spherical.phi) * Math.cos(spherical.theta),
      orbitCenter.y + spherical.r * Math.cos(spherical.phi),
      orbitCenter.z + spherical.r * Math.sin(spherical.phi) * Math.sin(spherical.theta)
    );
    camera.lookAt(orbitCenter);
  }

  function addOrbit(container, canvas) {
    var drag = false, lx = 0, ly = 0;

    // Editor drag state (local to addOrbit so it doesn't bleed)
    var edDrag = false;
    var edDragMesh = null;
    var edDragStartClient = { x: 0, y: 0 };
    var edDragBaseXf = null;
    var edDragPlane = new THREE.Plane();
    var edDragStartWorld = new THREE.Vector3();
    var edRaycaster = new THREE.Raycaster();

    function snapTo(v, step) { return Math.round(v / step) * step; }

    function ndcFromClient(cx, cy) {
      var rect = canvas.getBoundingClientRect();
      return new THREE.Vector2(
        (cx - rect.left) / rect.width * 2 - 1,
        -((cy - rect.top) / rect.height) * 2 + 1
      );
    }

    function hitMesh(cx, cy) {
      if (!meshes.length) return null;
      edRaycaster.setFromCamera(ndcFromClient(cx, cy), camera);
      var hits = edRaycaster.intersectObjects(meshes);
      return hits.length > 0 ? hits[0].object : null;
    }

    function meshCentroid(mesh) {
      var pos = mesh.geometry.attributes.position;
      var cx=0, cy=0, cz=0, n=pos.count;
      for (var i=0; i<n; i++) { cx+=pos.getX(i); cy+=pos.getY(i); cz+=pos.getZ(i); }
      return new THREE.Vector3(cx/n, cy/n, cz/n);
    }

    function startEdDrag(cx, cy, mesh) {
      var xf = edCbs.getXf(mesh.userData.segIdx);
      edDragBaseXf = { tx:xf.tx||0, ty:xf.ty||0, tz:xf.tz||0,
                       rx:xf.rx||0, ry:xf.ry||0, rz:xf.rz||0 };
      edDragStartClient = { x: cx, y: cy };
      if (edMode === 'translate') {
        var centroid = meshCentroid(mesh);
        var normal = new THREE.Vector3();
        camera.getWorldDirection(normal);
        edDragPlane.setFromNormalAndCoplanarPoint(normal, centroid);
        edRaycaster.setFromCamera(ndcFromClient(cx, cy), camera);
        edRaycaster.ray.intersectPlane(edDragPlane, edDragStartWorld);
      }
      edDragMesh = mesh;
      edDrag = true;
    }

    function moveEdDrag(cx, cy) {
      if (!edDrag || !edDragMesh || !edCbs) return;
      var xf = { tx:edDragBaseXf.tx, ty:edDragBaseXf.ty, tz:edDragBaseXf.tz,
                 rx:edDragBaseXf.rx, ry:edDragBaseXf.ry, rz:edDragBaseXf.rz };
      if (edMode === 'translate') {
        var worldNow = new THREE.Vector3();
        edRaycaster.setFromCamera(ndcFromClient(cx, cy), camera);
        if (edRaycaster.ray.intersectPlane(edDragPlane, worldNow)) {
          xf.tx = snapTo(edDragBaseXf.tx + worldNow.x - edDragStartWorld.x, 0.5);
          xf.ty = snapTo(edDragBaseXf.ty + worldNow.y - edDragStartWorld.y, 0.5);
          xf.tz = snapTo(edDragBaseXf.tz + worldNow.z - edDragStartWorld.z, 0.5);
        }
      } else {
        xf.ry = snapTo(edDragBaseXf.ry + (cx - edDragStartClient.x) * 0.5, 45);
        xf.rx = snapTo(edDragBaseXf.rx + (cy - edDragStartClient.y) * 0.5, 45);
      }
      edCbs.onTransform(edDragMesh.userData.segIdx, xf);
    }

    function endEdDrag() { edDrag = false; edDragMesh = null; }

    function onMove(dx, dy) {
      spherical.theta -= dx * 0.008;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi + dy * 0.008));
      updateCamera();
    }

    // ── mouse ──
    canvas.addEventListener('mousedown', function (e) {
      if (edCbs) {
        var hit = hitMesh(e.clientX, e.clientY);
        if (hit) {
          edCbs.onSelect(hit.userData.segIdx);
          startEdDrag(e.clientX, e.clientY, hit);
          return;
        }
      }
      drag = true; lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('mouseup', function () { drag = false; endEdDrag(); });
    canvas.addEventListener('mousemove', function (e) {
      if (edDrag) { moveEdDrag(e.clientX, e.clientY); return; }
      if (!drag) return;
      onMove(e.clientX - lx, e.clientY - ly);
      lx = e.clientX; ly = e.clientY;
    });

    // ── touch ──
    var lt = null, lpinch = null;
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (e.touches.length === 1) {
        if (edCbs) {
          var hit = hitMesh(e.touches[0].clientX, e.touches[0].clientY);
          if (hit) {
            edCbs.onSelect(hit.userData.segIdx);
            startEdDrag(e.touches[0].clientX, e.touches[0].clientY, hit);
            lt = null; lpinch = null;
            return;
          }
        }
        lt = e.touches[0]; lpinch = null;
      }
      if (e.touches.length === 2) {
        endEdDrag();
        lpinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        lt = null;
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (e.touches.length === 2) {
        var dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (lpinch) { spherical.r = Math.max(1, spherical.r * (lpinch / dist)); updateCamera(); }
        lpinch = dist;
      } else if (e.touches.length === 1) {
        if (edDrag) { moveEdDrag(e.touches[0].clientX, e.touches[0].clientY); }
        else if (lt) { onMove(e.touches[0].clientX - lt.clientX, e.touches[0].clientY - lt.clientY); lt = e.touches[0]; }
      }
    }, { passive: false });
    canvas.addEventListener('touchend', function () {
      lt = null; lpinch = null; endEdDrag();
    }, { passive: true });
  }

  return {
    init: init,
    update: update,
    setEditor: function (mode, cbs) { edMode = mode; edCbs = cbs; },
    setEdMode: function (mode) { edMode = mode; },
    clearEditor: function () { edCbs = null; },
    setAxisOverlay: function (cfg) { axisOverlay = cfg; },
    clearAxisOverlay: function () { axisOverlay = null; },
  };
})();
