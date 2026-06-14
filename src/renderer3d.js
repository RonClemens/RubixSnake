// renderer3d.js — Three.js 3D snake renderer
// Uses actual vertex positions from Snake.layout3D (no transform matrices).

var Renderer3D = (function () {
  var scene, camera, renderer, meshes = [], axesHelper = null, axesLabels = [], animFrame = null;
  var spherical = { theta: Math.PI, phi: Math.PI / 2, r: 4 };
  var orbitCenter = new THREE.Vector3();

  // Editor state
  var edCbs = null;          // { onSelect(segIdx) }

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
    var edRaycaster = new THREE.Raycaster();

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
          return;
        }
      }
      drag = true; lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('mouseup', function () { drag = false; });
    canvas.addEventListener('mousemove', function (e) {
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
            lt = null; lpinch = null;
            return;
          }
        }
        lt = e.touches[0]; lpinch = null;
      }
      if (e.touches.length === 2) {
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
        if (lt) { onMove(e.touches[0].clientX - lt.clientX, e.touches[0].clientY - lt.clientY); lt = e.touches[0]; }
      }
    }, { passive: false });
    canvas.addEventListener('touchend', function () {
      lt = null; lpinch = null;
    }, { passive: true });
  }

  return {
    init: init,
    update: update,
    setEditor: function (cbs) { edCbs = cbs; },
    clearEditor: function () { edCbs = null; },
    setAxisOverlay: function (cfg) { axisOverlay = cfg; },
    clearAxisOverlay: function () { axisOverlay = null; },
  };
})();
