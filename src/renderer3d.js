// renderer3d.js — Three.js 3D snake renderer
// Uses actual vertex positions from Snake.layout3D (no transform matrices).

var Renderer3D = (function () {
  var scene, camera, renderer, meshes = [], axesHelper = null, axesLabels = [], animFrame = null;
  // theta=π/2 → camera in Y-Z plane so the X-extending snake reads horizontally.
  // phi=π/3  → 60° from vertical (30° above horizontal) for a natural elevation.
  var spherical = { theta: Math.PI / 2, phi: Math.PI / 3, r: 15 };
  var orbitCenter = new THREE.Vector3();

  var PRISM_IDX = [
    0,2,1,   3,4,5,     // front + back triangular caps
    0,1,4,  0,4,3,     // leg1 square face
    0,3,5,  0,5,2,     // leg2 square face
    1,2,5,  1,5,4,     // hyp face (even=−Y / odd=+Y, no z-fight with FrontSide)
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
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    var d1 = new THREE.DirectionalLight(0xffffff, 0.9);
    d1.position.set(5, 8, 6); scene.add(d1);
    var d2 = new THREE.DirectionalLight(0x8888ff, 0.3);
    d2.position.set(-4, -3, -5); scene.add(d2);

    // X=red, Y=green, Z=blue — always drawn on top, repositioned in update()
    axesHelper = new THREE.AxesHelper(4);
    axesHelper.material.depthTest = false;
    axesHelper.renderOrder = 999;
    scene.add(axesHelper);

    // Axis labels
    var labelDefs = [
      { text: 'X', pos: [4.4, 0, 0],   color: '#ff4444' },
      { text: 'Y', pos: [0,   4.4, 0], color: '#44ff44' },
      { text: 'Z', pos: [0,   0, 4.4], color: '#4488ff' },
    ];
    axesLabels = labelDefs.map(function (d) {
      var canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = d.color;
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.text, 32, 32);
      var tex = new THREE.CanvasTexture(canvas);
      var mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
      var sprite = new THREE.Sprite(mat);
      sprite.position.set(d.pos[0], d.pos[1], d.pos[2]);
      sprite.scale.set(0.7, 0.7, 0.7);
      sprite.renderOrder = 1000;
      scene.add(sprite);
      return sprite;
    });

    addOrbit(container);

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

  // Build/rebuild scene from joint array
  function update(joints) {
    meshes.forEach(function (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    meshes = [];

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
      // flatShading computes per-triangle normals so each prism face is
      // rendered as a crisp flat plane — no rounded-edge artifacts.
      var mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
        color: new THREE.Color(Snake.segColor(seg.idx).h),
        shininess: 60,
        flatShading: true,
      }));
      scene.add(mesh);
      meshes.push(mesh);
    });

    // Fit camera around bounding box
    if (meshes.length) {
      var box = new THREE.Box3();
      meshes.forEach(function (m) { box.expandByObject(m); });
      box.getCenter(orbitCenter);
      // For elongated snakes use half-diagonal so the cross-section stays visible;
      // for compact shapes the full diagonal still gives a good framing.
      var size = box.getSize(new THREE.Vector3());
      var diag = size.length();
      var shortSide = Math.min(size.x, size.y, size.z);
      spherical.r = Math.max(diag * 0.7, shortSide * 6, 3);
      if (axesHelper) {
        axesHelper.position.copy(orbitCenter);
        var offsets = [[4.4,0,0],[0,4.4,0],[0,0,4.4]];
        axesLabels.forEach(function (s, i) {
          s.position.set(orbitCenter.x + offsets[i][0], orbitCenter.y + offsets[i][1], orbitCenter.z + offsets[i][2]);
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

  function addOrbit(el) {
    var drag = false, lx = 0, ly = 0;

    function onMove(dx, dy) {
      spherical.theta -= dx * 0.008;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi + dy * 0.008));
      updateCamera();
    }

    el.addEventListener('mousedown', function (e) { drag = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup',  function ()  { drag = false; });
    el.addEventListener('mousemove', function (e) {
      if (!drag) return;
      onMove(e.clientX - lx, e.clientY - ly);
      lx = e.clientX; ly = e.clientY;
    });

    var lt = null;
    el.addEventListener('touchstart', function (e) { if (e.touches.length === 1) lt = e.touches[0]; }, { passive: true });
    el.addEventListener('touchmove',  function (e) {
      if (e.touches.length !== 1 || !lt) return;
      e.preventDefault();
      onMove(e.touches[0].clientX - lt.clientX, e.touches[0].clientY - lt.clientY);
      lt = e.touches[0];
    }, { passive: false });
  }

  return { init: init, update: update };
})();
