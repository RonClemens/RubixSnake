// renderer3d.js — Three.js 3D snake renderer

var Renderer3D = (function () {
  var scene, camera, renderer, meshes = [], animFrame = null;

  function init(container) {
    if (renderer) {
      // reparent canvas to new container if needed
      if (renderer.domElement.parentNode !== container) {
        container.appendChild(renderer.domElement);
        var w = container.offsetWidth || 340;
        var h = container.offsetHeight || 260;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      return;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);

    var w = container.offsetWidth || 340;
    var h = container.offsetHeight || 300;
    camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    camera.position.set(8, 6, 12);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    // lights
    var amb = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(amb);
    var dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    var dir2 = new THREE.DirectionalLight(0x8888ff, 0.3);
    dir2.position.set(-5, -4, -5);
    scene.add(dir2);

    // simple orbit via pointer drag
    addOrbitControl(container);

    // resize observer
    var ro = new ResizeObserver(function () {
      var nw = container.offsetWidth;
      var nh = container.offsetHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    ro.observe(container);

    loop();
  }

  function loop() {
    animFrame = requestAnimationFrame(loop);
    renderer.render(scene, camera);
  }

  // ── build/update scene from joint array ────────────────────────────────────
  function update(joints) {
    // clear old meshes
    meshes.forEach(function (m) { scene.remove(m); });
    meshes = [];

    var layout = Snake.layout3D(joints);
    var L = 1.0; // segment length

    // Segment geometry: a right-isosceles triangular prism
    // Legs = L, length along fwd = L
    var geo = buildSegGeo(L);

    layout.forEach(function (seg) {
      var color = Snake.segColor(seg.idx).h;
      var mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        shininess: 60,
        specular: new THREE.Color(0x444444),
      });
      var mesh = new THREE.Mesh(geo, mat);

      // Orient mesh: local +X = fwd, local +Y = up, local +Z = rgt
      var fwd = new THREE.Vector3().fromArray(seg.fwd);
      var up  = new THREE.Vector3().fromArray(seg.up);
      var rgt = new THREE.Vector3().crossVectors(fwd, up).normalize();
      // Build rotation matrix from basis vectors
      var m4 = new THREE.Matrix4();
      m4.makeBasis(fwd, up, rgt);
      mesh.setRotationFromMatrix(m4);
      mesh.position.fromArray(seg.pos);

      scene.add(mesh);
      meshes.push(mesh);
    });

    // re-center camera on bounding box
    if (layout.length) {
      var pts = layout.map(function (s) { return new THREE.Vector3().fromArray(s.pos); });
      var box = new THREE.Box3().setFromPoints(pts);
      var ctr = new THREE.Vector3();
      box.getCenter(ctr);
      var sz = box.getSize(new THREE.Vector3()).length();
      camera.position.copy(ctr).add(new THREE.Vector3(sz, sz * 0.7, sz * 1.2));
      camera.lookAt(ctr);
    }
  }

  // right-isosceles triangular prism: legs along +Y and +Z, extruded along +X
  function buildSegGeo(L) {
    var geo = new THREE.BufferGeometry();
    var h = L * 0.5;
    // 6 vertices: front face (x=0) and back face (x=L)
    var verts = new Float32Array([
      // front tri (x=0)
       0, 0, 0,
       0, h, 0,
       0, 0, h,
      // back tri (x=L)
       L, 0, 0,
       L, h, 0,
       L, 0, h,
    ]);
    // indices: 2 end caps + 3 rectangular side faces
    var idx = [
      // front cap
      0, 2, 1,
      // back cap
      3, 4, 5,
      // side 1: bottom (y=0)
      0, 3, 5,  0, 5, 2,
      // side 2: left (z=0)
      0, 1, 4,  0, 4, 3,
      // hypotenuse face
      1, 2, 5,  1, 5, 4,
    ];
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // ── minimal orbit (rotate camera around centre) ────────────────────────────
  function addOrbitControl(el) {
    var drag = false, lx = 0, ly = 0;
    var spherical = { theta: Math.PI * 0.25, phi: Math.PI * 0.35, r: 0 };

    function updateCamera() {
      var ctr = new THREE.Vector3();
      if (meshes.length) {
        var box = new THREE.Box3();
        meshes.forEach(function (m) { box.expandByObject(m); });
        box.getCenter(ctr);
        spherical.r = box.getSize(new THREE.Vector3()).length() * 1.2;
      } else {
        spherical.r = 15;
      }
      camera.position.set(
        ctr.x + spherical.r * Math.sin(spherical.phi) * Math.cos(spherical.theta),
        ctr.y + spherical.r * Math.cos(spherical.phi),
        ctr.z + spherical.r * Math.sin(spherical.phi) * Math.sin(spherical.theta)
      );
      camera.lookAt(ctr);
    }

    el.addEventListener('mousedown', function (e) { drag = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', function () { drag = false; });
    el.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      spherical.theta -= dx * 0.008;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi + dy * 0.008));
      updateCamera();
    });
    // touch
    var lastTouch = null;
    el.addEventListener('touchstart', function (e) { if (e.touches.length === 1) lastTouch = e.touches[0]; });
    el.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 1 || !lastTouch) return;
      e.preventDefault();
      var dx = e.touches[0].clientX - lastTouch.clientX;
      var dy = e.touches[0].clientY - lastTouch.clientY;
      lastTouch = e.touches[0];
      spherical.theta -= dx * 0.008;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi + dy * 0.008));
      updateCamera();
    }, { passive: false });
  }

  function destroy() {
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = null;
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null; camera = null; meshes = [];
  }

  return { init: init, update: update, destroy: destroy };
})();
