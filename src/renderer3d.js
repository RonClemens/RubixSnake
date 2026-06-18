// renderer3d.js — Three.js 3D snake renderer
// Uses actual vertex positions from Snake.layout3D (no transform matrices).

var Renderer3D = (function () {
  var scene, camera, renderer, meshes = [], axesHelper = null, axesLabels = [], animFrame = null;
  var highlightMesh = null, glowMesh = null;
  var invalidMeshes = [];
  var seamMeshes = [];
  var showSeams = false;
  var spherical = { theta: Math.PI * 0.65, phi: 1.15, r: 4 };
  var orbitCenter = new THREE.Vector3();

  // Editor state
  var edCbs = null;          // { onSelect(segIdx) }

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

  function updateSegs(segs, opts) {
    opts = opts || {};
    var highlightIdx = opts.highlight;
    var focusMode = opts.focus || 'all';

    meshes.forEach(function (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    meshes = [];
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh.geometry.dispose();
      highlightMesh.material.dispose();
      highlightMesh = null;
    }
    if (glowMesh) {
      scene.remove(glowMesh);
      glowMesh.geometry.dispose();
      glowMesh.material.dispose();
      glowMesh = null;
    }
    invalidMeshes.forEach(function (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    invalidMeshes = [];
    seamMeshes.forEach(function (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    seamMeshes = [];

    var ghosting = focusMode === 'segment' && typeof highlightIdx === 'number';

    segs.forEach(function (seg) {
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
      var isHighlighted = seg.idx === highlightIdx;
      var ghost = ghosting && !isHighlighted;
      // MeshPhysicalMaterial's clearcoat adds a thin glossy layer that
      // catches a bright specular line along each flat-shaded facet edge,
      // faking the soft highlight a tiny rounded fillet would produce
      // without altering the underlying sharp-edged geometry.
      var mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(Snake.segColor(seg.idx).h),
        metalness: 0.1,
        roughness: 0.5,
        flatShading: true,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
        reflectivity: 0.3,
        transparent: ghost,
        opacity: ghost ? 0.15 : 1,
        depthWrite: !ghost,
      }));
      mesh.userData.segIdx = seg.idx;
      scene.add(mesh);
      meshes.push(mesh);

      if (showSeams && !ghost) {
        var seam = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: 0xc9d1d9, transparent: true, opacity: 0.55 })
        );
        seam.renderOrder = 1;
        scene.add(seam);
        seamMeshes.push(seam);
      }

      if (isHighlighted) {
        highlightMesh = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: 0x39ff14 })
        );
        highlightMesh.renderOrder = 998;
        scene.add(highlightMesh);

        var center = new THREE.Vector3();
        for (var vi = 0; vi < v.length; vi += 3) {
          center.x += v[vi]; center.y += v[vi + 1]; center.z += v[vi + 2];
        }
        center.divideScalar(v.length / 3);

        var glowScale = 1.08;
        glowMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0x39ff14,
          transparent: true,
          opacity: 0.25,
          side: THREE.BackSide,
          depthWrite: false,
        }));
        glowMesh.position.copy(center).multiplyScalar(1 - glowScale);
        glowMesh.scale.setScalar(glowScale);
        glowMesh.renderOrder = 997;
        scene.add(glowMesh);
      }
    });

    // Orange outline + glow for invalid-action segments and for any segments
    // geometrically overlapping a non-adjacent segment (self-intersection).
    var highlightSet = {};
    (opts.invalidSegs || []).forEach(function (segIdx) { highlightSet[segIdx] = true; });
    Snake.findOverlaps(segs).forEach(function (segIdx) { highlightSet[segIdx] = true; });
    Object.keys(highlightSet).map(Number).forEach(function (segIdx) {
      var target = null;
      for (var mi = 0; mi < meshes.length; mi++) {
        if (meshes[mi].userData.segIdx === segIdx) { target = meshes[mi]; break; }
      }
      if (!target) return;
      var geo = target.geometry;

      var outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xff7700, depthTest: false })
      );
      outline.renderOrder = 999;
      scene.add(outline);
      invalidMeshes.push(outline);

      var pos = geo.attributes.position;
      var cx = 0, cy = 0, cz = 0;
      for (var vi = 0; vi < pos.count; vi++) {
        cx += pos.getX(vi); cy += pos.getY(vi); cz += pos.getZ(vi);
      }
      cx /= pos.count; cy /= pos.count; cz /= pos.count;

      var glowScale = 1.08;
      var inv = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xff7700,
        transparent: true,
        opacity: 0.22,
        side: THREE.BackSide,
        depthWrite: false,
      }));
      inv.position.set(cx * (1 - glowScale), cy * (1 - glowScale), cz * (1 - glowScale));
      inv.scale.setScalar(glowScale);
      inv.renderOrder = 998;
      scene.add(inv);
      invalidMeshes.push(inv);
    });

    if (!opts.noFit && meshes.length) {
      var box = new THREE.Box3();
      var focusMesh = focusMode === 'segment' &&
        meshes.find(function (m) { return m.userData.segIdx === highlightIdx; });

      if (focusMesh) {
        box.setFromObject(focusMesh);
        fitToBox(box, 1.4, 1.8);
      } else {
        meshes.forEach(function (m) { box.expandByObject(m); });
        fitToBox(box, 1.15, 3);
      }

      var showAxes = !focusMesh;
      if (axesHelper) {
        axesHelper.visible = showAxes;
        axesLabels.forEach(function (s) { s.visible = showAxes; });
        if (showAxes) {
          var offsets = [[4.4,0,0],[0,4.4,0],[0,0,4.4]];
          axesLabels.forEach(function (s, i) {
            s.position.set(offsets[i][0], offsets[i][1], offsets[i][2]);
          });
        }
      }
      updateCamera();
    }
  }

  function update(joints, opts) {
    updateSegs(Snake.layout3D(joints), opts);
  }

  // Fit the camera to encompass the given pre-computed segments without rebuilding meshes.
  function fitToSegs(segs) {
    if (!segs.length) return;
    var box = new THREE.Box3();
    segs.forEach(function (seg) {
      seg.f.concat(seg.b).forEach(function (v) {
        box.expandByPoint(new THREE.Vector3(v[0], v[1], v[2]));
      });
    });
    fitToBox(box, 1.15, 3);
    if (axesHelper) {
      axesHelper.visible = true;
      axesLabels.forEach(function (s) { s.visible = true; });
    }
    updateCamera();
  }

  // Position orbitCenter at box's center and pick a camera distance that
  // frames the whole box within the camera's vertical AND horizontal FOV.
  function fitToBox(box, padding, minR) {
    var sphere = box.getBoundingSphere(new THREE.Sphere());
    orbitCenter.copy(sphere.center);
    var vFov = camera.fov * Math.PI / 180;
    var hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    var fov = Math.min(vFov, hFov);
    spherical.r = Math.max(sphere.radius / Math.sin(fov / 2) * padding, minR);
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
    updateSegs: updateSegs,
    fitToSegs: fitToSegs,
    setEditor: function (cbs) { edCbs = cbs; },
    clearEditor: function () { edCbs = null; },
    setShowSeams: function (v) { showSeams = !!v; },
  };
})();
