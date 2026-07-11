import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ── Detections parsed from YOLO labels visible in the frames ──────────────────
const DETECTIONS = [
  { id: 'BLD-01', label: 'Bulldozer',       conf: 0.97, color: '#facc15', x: -18, z: -22, w: 9,  d: 6  },
  { id: 'BCK-01', label: 'Backhoe Loader',  conf: 0.37, color: '#f97316', x: -6,  z: -16, w: 8,  d: 7  },
  { id: 'VEH-01', label: 'Other Vehicle',   conf: 0.40, color: '#a855f7', x:  20, z:  10, w: 7,  d: 5  },
  { id: 'WRK-01', label: 'Person',          conf: 0.79, color: '#ec4899', x:  22, z:  -5, w: 2,  d: 2  },
  { id: 'WRK-02', label: 'Person',          conf: 0.63, color: '#ec4899', x:  14, z:   8, w: 2,  d: 2  },
  { id: 'WRK-03', label: 'Person',          conf: 0.24, color: '#ec4899', x:  18, z:  14, w: 2,  d: 2  },
];

const TOTAL_FRAMES = 1204;
const getFramePath = (idx) =>
  `/digital_twin/v3_x_1_frames/frame_${String(idx).padStart(4, '0')}.jpg`;

// Severity colour for each detection class
const classColor = (label) => {
  if (label.includes('Person'))  return '#ec4899';
  if (label.includes('Bulldozer') || label.includes('Backhoe')) return '#facc15';
  return '#a855f7';
};

export default function DigitalTwinSectionLargeArea() {
  const mountRef     = useRef(null);
  const rafRef       = useRef(null);
  const controlsRef  = useRef(null);
  const orthoMeshRef = useRef(null);
  const detBoxesRef  = useRef([]);
  const droneRef     = useRef(null);
  const rotorsRef    = useRef([]);

  const [currentFrame, setCurrentFrame]   = useState(1);
  const [playing, setPlaying]             = useState(false);
  const [activeDetect, setActiveDetect]   = useState(null);
  const [autoRotate, setAutoRotate]       = useState(false);
  const [showWire, setShowWire]           = useState(false);

  const playRef    = useRef(false);
  const frameRef   = useRef(1);

  const texLoader  = useRef(new THREE.TextureLoader());
  const texCache   = useRef(new Map());

  // ── Texture streaming with sliding window cache ───────────────────────────
  const loadTexture = useCallback((idx) => {
    return new Promise((resolve) => {
      if (texCache.current.has(idx)) return resolve(texCache.current.get(idx));
      texLoader.current.load(getFramePath(idx), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        texCache.current.set(idx, tex);
        // Keep cache ≤ 15 textures
        if (texCache.current.size > 15) {
          const first = texCache.current.keys().next().value;
          texCache.current.get(first)?.dispose();
          texCache.current.delete(first);
        }
        resolve(tex);
      });
    });
  }, []);

  // Apply frame to the orthomosaic terrain mesh
  const applyFrame = useCallback(async (idx) => {
    if (!orthoMeshRef.current) return;
    const tex = await loadTexture(idx);
    orthoMeshRef.current.material.map = tex;
    orthoMeshRef.current.material.needsUpdate = true;
    // Pre-fetch next 3
    for (let j = 1; j <= 3; j++) {
      const next = idx + j;
      if (next <= TOTAL_FRAMES && !texCache.current.has(next)) loadTexture(next);
    }
  }, [loadTexture]);

  useEffect(() => { applyFrame(currentFrame); }, [currentFrame, applyFrame]);

  // ── Playback timer ────────────────────────────────────────────────────────
  useEffect(() => {
    playRef.current = playing;
    if (!playing) return;
    const iv = setInterval(() => {
      if (!playRef.current) { clearInterval(iv); return; }
      frameRef.current = frameRef.current >= TOTAL_FRAMES ? 1 : frameRef.current + 1;
      setCurrentFrame(frameRef.current);
    }, 100); // ~10 fps playback
    return () => clearInterval(iv);
  }, [playing]);

  // ── Three.js scene setup ──────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth, H = el.clientHeight || 620;

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x010a12, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010a12, 0.004);

    // ── Camera ────────────────────────────────────────────────────────────
    // Isometric-ish aerial view — looking down at construction site
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 800);
    camera.position.set(0, 75, 90);
    camera.lookAt(0, 0, 0);

    // ── Controls ──────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 20;
    controls.maxDistance = 250;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // ── Lighting ──────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.0);
    sun.position.set(60, 120, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far  = 400;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -120;
    sun.shadow.camera.right= sun.shadow.camera.top    =  120;
    scene.add(sun);

    // Subtle cyan fill light from below to give the digital-twin HUD glow
    const fillLight = new THREE.PointLight(0x00d4ff, 0.4, 200);
    fillLight.position.set(0, 30, 0);
    scene.add(fillLight);

    // ── Ground Grid ───────────────────────────────────────────────────────
    const gridHelper = new THREE.GridHelper(360, 120, 0x001e2e, 0x000d18);
    gridHelper.position.y = -0.25;
    scene.add(gridHelper);

    // ── MAIN ORTHOMOSAIC TERRAIN ──────────────────────────────────────────
    // A high-res 16:9 plane — the actual drone frame is textured onto this.
    // We add VERY MILD vertex displacement so it looks 3-D, not a flat card.
    const TERRAIN_W = 160, TERRAIN_H = 90;
    const terrainGeo = new THREE.PlaneGeometry(TERRAIN_W, TERRAIN_H, 128, 72);

    // Use subtle noise displacement so the terrain is NOT flat
    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      // Edge-of-site slight mounding: less prominent in center (where rebar pit is)
      const distCenter = Math.sqrt(x * x + y * y) / 80;
      const noise = Math.sin(x * 0.18) * Math.cos(y * 0.14) * 1.8
                  + Math.sin(x * 0.05 + 1) * Math.cos(y * 0.07) * 3
                  + distCenter * 2.5;
      pos.setZ(i, Math.max(0, noise));
    }
    terrainGeo.computeVertexNormals();
    terrainGeo.rotateX(-Math.PI / 2);

    const terrainMat = new THREE.MeshStandardMaterial({
      roughness: 0.88,
      metalness: 0.02,
      // map will be swapped per-frame
    });

    const orthoMesh = new THREE.Mesh(terrainGeo, terrainMat);
    orthoMesh.receiveShadow = true;
    scene.add(orthoMesh);
    orthoMeshRef.current = orthoMesh;

    // Apply the first frame texture immediately
    texLoader.current.load(getFramePath(1), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      texCache.current.set(1, tex);
      orthoMesh.material.map = tex;
      orthoMesh.material.needsUpdate = true;
    });

    // ── WIREFRAME OVERLAY ─────────────────────────────────────────────────
    // Hidden by default, toggled by the wire button
    const wireGeo   = new THREE.WireframeGeometry(terrainGeo);
    const wireMat   = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.2 });
    const wireMesh  = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.visible = false;
    scene.add(wireMesh);

    // ── YOLO Detection Bounding Boxes ─────────────────────────────────────
    detBoxesRef.current = [];
    DETECTIONS.forEach(det => {
      const color = new THREE.Color(det.color);
      const grp = new THREE.Group();

      // Flat footprint box on terrain
      const footGeo = new THREE.PlaneGeometry(det.w, det.d);
      const footMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.rotation.x = -Math.PI / 2;
      foot.position.set(det.x, 0.1, det.z);
      scene.add(foot);

      // Wireframe 3D bounding box (standing cube)
      const height = det.label.includes('Person') ? 3.5 : 5.5;
      const boxGeo  = new THREE.BoxGeometry(det.w, height, det.d);
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      const boxLine = new THREE.LineSegments(edgesGeo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })
      );
      boxLine.position.set(det.x, height / 2, det.z);
      scene.add(boxLine);

      // Pulsing point light at base
      const pLight = new THREE.PointLight(color, 0.6, 20);
      pLight.position.set(det.x, 1, det.z);
      scene.add(pLight);

      // Billboard label sprite
      const lc = document.createElement('canvas');
      lc.width = 260; lc.height = 52;
      const lctx = lc.getContext('2d');
      lctx.fillStyle = det.color;
      lctx.font = 'bold 16px monospace';
      lctx.fillText(`${det.id} · ${det.label.toUpperCase()} ${(det.conf * 100).toFixed(0)}%`, 4, 36);
      const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(lc), transparent: true, opacity: 0.9
      }));
      labelSprite.position.set(det.x, height + 2, det.z);
      labelSprite.scale.set(8, 1.7, 1);
      scene.add(labelSprite);

      detBoxesRef.current.push({ grp, pLight, foot, boxLine, labelSprite, det });
    });

    // ── LiDAR Drone ───────────────────────────────────────────────────────
    const droneGrp = new THREE.Group();
    scene.add(droneGrp);
    droneRef.current = droneGrp;

    const dMat  = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.9 });
    const gMat  = new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.95 });

    const dBody  = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.4, 8), dMat);
    droneGrp.add(dBody);
    const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), gMat);
    gimbal.position.y = -0.42;
    droneGrp.add(gimbal);

    const armMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    droneGrp.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 0.2), armMat)));
    droneGrp.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 6), armMat)));

    rotorsRef.current = [];
    [[2.0, 0.25, 2.0], [-2.0, 0.25, 2.0], [2.0, 0.25, -2.0], [-2.0, 0.25, -2.0]].forEach(p => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.28, 8), gMat.clone());
      m.position.set(...p); droneGrp.add(m);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.015, 0.1),
        new THREE.MeshBasicMaterial({ color: 0x0f172a }));
      blade.position.set(p[0], p[1] + 0.18, p[2]);
      droneGrp.add(blade);
      rotorsRef.current.push(blade);
    });

    // Scan-beam cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(12, 38, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.04, side: THREE.DoubleSide })
    );
    cone.position.y = -19;
    droneGrp.add(cone);

    // ── Point cloud particles ─────────────────────────────────────────────
    const ptGeo = new THREE.BufferGeometry();
    const ptArr = new Float32Array(3000 * 3);
    const ptCol = new Float32Array(3000 * 3);
    for (let i = 0; i < 3000; i++) {
      const px = (Math.random() - 0.5) * TERRAIN_W;
      const pz = (Math.random() - 0.5) * TERRAIN_H;
      const py = Math.sin(px * 0.18) * Math.cos(pz * 0.14) * 1.8 + 0.2 + Math.random() * 0.5;
      ptArr[i*3]=px; ptArr[i*3+1]=py; ptArr[i*3+2]=pz;
      const c = new THREE.Color(); c.setHSL(0.55 + Math.random() * 0.1, 0.9, 0.55 + Math.random() * 0.2);
      ptCol[i*3]=c.r; ptCol[i*3+1]=c.g; ptCol[i*3+2]=c.b;
    }
    ptGeo.setAttribute('position', new THREE.BufferAttribute(ptArr, 3));
    ptGeo.setAttribute('color',    new THREE.BufferAttribute(ptCol, 3));
    const pts = new THREE.Points(ptGeo, new THREE.PointsMaterial({
      size: 0.18, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    scene.add(pts);

    // ── Site perimeter fence (glowing lines) ─────────────────────────────
    const fenceMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.45 });
    const corners = [
      new THREE.Vector3(-TERRAIN_W/2-5, 0.4, -TERRAIN_H/2-5),
      new THREE.Vector3( TERRAIN_W/2+5, 0.4, -TERRAIN_H/2-5),
      new THREE.Vector3( TERRAIN_W/2+5, 0.4,  TERRAIN_H/2+5),
      new THREE.Vector3(-TERRAIN_W/2-5, 0.4,  TERRAIN_H/2+5),
      new THREE.Vector3(-TERRAIN_W/2-5, 0.4, -TERRAIN_H/2-5),
    ];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(corners), fenceMat));

    // ── Animation Loop ────────────────────────────────────────────────────
    let elapsed = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      elapsed += dt;

      // Spin drone rotors
      rotorsRef.current.forEach((r, i) => { r.rotation.y += (i % 2 === 0 ? 1 : -1) * 0.8; });

      // Drone patrol over the site
      if (droneRef.current) {
        const angle = elapsed * 0.18;
        droneRef.current.position.set(
          Math.cos(angle) * 50,
          50 + Math.sin(elapsed * 1.2) * 2,
          Math.sin(angle) * 30
        );
        droneRef.current.rotation.y = -angle;
      }

      // Pulse detection lights
      detBoxesRef.current.forEach((item, i) => {
        const pulse = 0.5 + Math.sin(elapsed * 3 + i * 1.1) * 0.5;
        item.pLight.intensity = pulse * 0.8;
      });

      // Wireframe toggle live update
      if (wireMesh.visible !== showWire) wireMesh.visible = showWire;

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight || 620;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      terrainGeo.dispose();
      terrainMat.dispose();
      ptGeo.dispose();
      renderer.dispose();
      el.innerHTML = '';
      texCache.current.forEach(t => t.dispose());
      texCache.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire-toggle sync via ref (avoids scene rebuild)
  const showWireRef = useRef(false);
  useEffect(() => { showWireRef.current = showWire; }, [showWire]);

  // Auto-rotate sync
  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  const detectedPeople  = DETECTIONS.filter(d => d.label.includes('Person'));
  const detectedMachines = DETECTIONS.filter(d => !d.label.includes('Person'));

  return (
    <div className="flex flex-col bg-[#010a12] rounded-b-2xl overflow-hidden border-x border-b border-[#003344] shadow-2xl relative" style={{ height: '640px', fontFamily: 'monospace' }}>

      {/* CRT scanline overlay */}
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{ background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,212,255,0.012) 3px,rgba(0,212,255,0.012) 4px)' }} />
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,5,15,0.55) 100%)' }} />

      {/* Three.js mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* ── Top-left HUD: Facility Overview ───────────────────────────── */}
      <div className="absolute top-3 left-4 z-20 pointer-events-none">
        <div className="bg-[#010d1a]/90 backdrop-blur border border-[#003344] rounded px-3 py-2.5 text-[9px] space-y-1 min-w-[180px]">
          <div className="text-[#00e5ff] font-bold tracking-widest text-[10px] mb-1">FACILITY OVERVIEW</div>
          <div className="text-[#00e5ff] opacity-70">Site: v3_x_1test.mp4 — Large Area Survey</div>
          <div className="text-[#00e5ff] opacity-70">Frames: {TOTAL_FRAMES} | FPS Source: 3</div>
          <div className="text-[#00e5ff] opacity-70">Terrain: 160m × 90m (14,400 m²)</div>
          <div style={{ color: '#facc15' }}>Machines: {detectedMachines.length} tracked</div>
          <div style={{ color: '#ec4899' }} className="animate-pulse">Workers: {detectedPeople.length} detected</div>
          <div className="text-emerald-400 mt-1">● LiDAR Drone: ACTIVE</div>
        </div>
      </div>

      {/* ── Right HUD: Detection List ─────────────────────────────────── */}
      <div className="absolute top-3 right-4 z-20 space-y-1">
        {DETECTIONS.map((det) => (
          <div key={det.id}
            onClick={() => setActiveDetect(activeDetect?.id === det.id ? null : det)}
            className="bg-[#010d1a]/90 backdrop-blur border rounded px-2.5 py-1 text-[8px] cursor-pointer transition-all hover:border-[#00e5ff]"
            style={{ borderColor: activeDetect?.id === det.id ? det.color : '#002233' }}
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-[8px] animate-pulse" style={{ color: det.color }}>●</span>
              <span className="font-bold" style={{ color: det.color }}>{det.id}</span>
              <span className="text-[#00e5ff] opacity-60">{det.label.toUpperCase()}</span>
              <span className="ml-auto text-[#00e5ff] opacity-40">{(det.conf * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Active detection detail popup ────────────────────────────── */}
      {activeDetect && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30">
          <div className="bg-[#010d1a]/95 backdrop-blur border rounded-lg px-4 py-3 text-[9px] space-y-1 min-w-[220px]"
            style={{ borderColor: activeDetect.color }}>
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-[11px]" style={{ color: activeDetect.color }}>{activeDetect.id}</span>
              <button onClick={() => setActiveDetect(null)} className="text-[#00e5ff] opacity-50 hover:opacity-100">✕</button>
            </div>
            <div className="text-[#00e5ff] opacity-80">Class: <span className="font-bold text-white">{activeDetect.label}</span></div>
            <div className="text-[#00e5ff] opacity-80">Confidence: <span className="font-bold text-white">{(activeDetect.conf * 100).toFixed(0)}%</span></div>
            <div className="text-[#00e5ff] opacity-80">Position: <span className="font-bold text-white">[{activeDetect.x}m, {activeDetect.z}m]</span></div>
            <div className="text-[#00e5ff] opacity-80">Footprint: <span className="font-bold text-white">{activeDetect.w}m × {activeDetect.d}m</span></div>
          </div>
        </div>
      )}

      {/* ── Bottom toolbar ────────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-[#010d1a]/95 backdrop-blur border-t border-[#003344] px-4 py-2.5">
        {/* Timeline */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[#00e5ff] text-[9px] font-bold w-20 shrink-0">
            FRAME {currentFrame} / {TOTAL_FRAMES}
          </span>
          <div className="flex-1 relative">
            <input
              type="range" min="1" max={TOTAL_FRAMES} value={currentFrame}
              onChange={(e) => { const v = parseInt(e.target.value); frameRef.current = v; setCurrentFrame(v); }}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: '#00e5ff', background: `linear-gradient(to right, #00e5ff ${(currentFrame/TOTAL_FRAMES)*100}%, #001e2e ${(currentFrame/TOTAL_FRAMES)*100}%)` }}
            />
          </div>
          <span className="text-[#00e5ff] opacity-40 text-[9px] w-12 text-right">
            {((currentFrame / 3) | 0)}s
          </span>
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { frameRef.current = 1; setCurrentFrame(1); setPlaying(false); }}
            className="px-2 py-1 text-[8px] font-bold text-[#00e5ff] border border-[#003344] rounded hover:border-[#00e5ff] transition-colors"
          >⏮ RESET</button>

          <button
            onClick={() => setPlaying(p => !p)}
            className={`px-3 py-1 text-[9px] font-bold rounded border transition-colors ${playing ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-[#00e5ff]/10 border-[#00e5ff] text-[#00e5ff]'}`}
          >{playing ? '⏸ PAUSE' : '▶ PLAY'}</button>

          <button
            onClick={() => setAutoRotate(a => !a)}
            className={`px-2 py-1 text-[8px] font-bold rounded border transition-colors ${autoRotate ? 'bg-sky-500/20 border-sky-400 text-sky-400' : 'text-[#00e5ff] border-[#003344] hover:border-[#00e5ff]'}`}
          >⟳ ORBIT</button>

          <button
            onClick={() => setShowWire(w => !w)}
            className={`px-2 py-1 text-[8px] font-bold rounded border transition-colors ${showWire ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400' : 'text-[#00e5ff] border-[#003344] hover:border-[#00e5ff]'}`}
          >⬡ WIRE</button>

          <div className="ml-auto text-[9px] font-bold space-x-3">
            <span className="text-emerald-400">● DRONE PATROL</span>
            <span className="text-[#00e5ff] opacity-60">{detectedMachines.length} MACHINES</span>
            <span style={{ color: '#ec4899' }}>{detectedPeople.length} WORKERS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
