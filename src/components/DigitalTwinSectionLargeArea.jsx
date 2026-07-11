import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─────────────────────────────────────────────────────────────────────────────
// ZONES — Mapped from v3_x_1test.mp4 large-area aerial footage
// ─────────────────────────────────────────────────────────────────────────────
const ZONES = [
  { id: 'Z1', label: 'Rebar Foundation Slab',   type: 'foundation' },
  { id: 'Z2', label: 'Excavation & Dirt Mounds', type: 'excavation' },
  { id: 'Z3', label: 'Vehicle Laydown / Road',   type: 'road'       },
  { id: 'Z4', label: 'Outer Perimeter Zone',     type: 'perimeter'  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TRACKED OBJECTS — from YOLO labels in the video frames
// ─────────────────────────────────────────────────────────────────────────────
const TRACKED = [
  { id: 'BLD-01', zone: 'Z1', cls: 'Bulldozer',      color: '#facc15', heat: 0.97 },
  { id: 'BCK-01', zone: 'Z2', cls: 'Backhoe Loader', color: '#f97316', heat: 0.37 },
  { id: 'VEH-01', zone: 'Z3', cls: 'Other Vehicle',  color: '#a855f7', heat: 0.40 },
  { id: 'WRK-01', zone: 'Z1', cls: 'Person',         color: '#ff2d78', heat: 0.79 },
  { id: 'WRK-02', zone: 'Z2', cls: 'Person',         color: '#ec4899', heat: 0.63 },
  { id: 'WRK-03', zone: 'Z3', cls: 'Person',         color: '#fb7185', heat: 0.24 },
];

const MAX_FRAMES = 1204;
const getFramePath = (idx) =>
  `/digital_twin/v3_x_1_frames/frame_${String(idx).padStart(4, '0')}.jpg`;

function createHeatTex(center, outer) {
  const C = document.createElement('canvas');
  C.width = C.height = 128;
  const ctx = C.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0,   center);
  g.addColorStop(0.4, outer || center);
  g.addColorStop(1,   'transparent');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(64, 64, 64, 0, Math.PI * 2); ctx.fill();
  return new THREE.CanvasTexture(C);
}

export default function DigitalTwinSectionLargeArea() {
  const mountRef    = useRef(null);
  const rafRef      = useRef(null);
  const clockRef    = useRef(new THREE.Clock());
  const controlsRef = useRef(null);
  const orthoRef    = useRef(null);
  const droneRef    = useRef(null);
  const rotorsRef   = useRef([]);
  const objectsRef  = useRef([]);
  const scanPlRef   = useRef(null);
  const consoleEnd  = useRef(null);

  const texLoader   = useRef(new THREE.TextureLoader());
  const texCache    = useRef(new Map());

  const [currentFrame,   setCurrentFrame]   = useState(1);
  const [scanActive,     setScanActive]     = useState(false);
  const [scanPct,        setScanPct]        = useState(0);
  const [detCount,       setDetCount]       = useState(0);
  const [showThermal,    setShowThermal]    = useState(true);
  const [showWireframe,  setShowWireframe]  = useState(false);
  const [autoRotate,     setAutoRotate]     = useState(true);
  const [activeZone,     setActiveZone]     = useState(null);
  const [camPos,         setCamPos]         = useState({ x: 0, y: 0, z: 0 });
  const [playing,        setPlaying]        = useState(false);
  const [logs, setLogs] = useState([
    '> Z-DRONE Digital Twin Engine v3.0',
    '> Source: v3_x_1test.mp4 — Large Area Construction',
    '> LiDAR: 12-pass aerial scan — READY',
    '> YOLO v8n + ByteTrack: STANDBY',
    '> Awaiting scan trigger...',
  ]);

  const addLog = useCallback((msg) => {
    setLogs(p => { const n = [...p, `> ${msg}`]; return n.length > 50 ? n.slice(-50) : n; });
  }, []);

  const playRef  = useRef(false);
  const frameRef = useRef(1);

  useEffect(() => {
    if (consoleEnd.current) consoleEnd.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ── Texture streaming ─────────────────────────────────────────────────────
  const applyFrame = useCallback((idx) => {
    if (!orthoRef.current) return;
    if (texCache.current.has(idx)) {
      orthoRef.current.material.map = texCache.current.get(idx);
      orthoRef.current.material.needsUpdate = true;
    } else {
      texLoader.current.load(getFramePath(idx), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        texCache.current.set(idx, tex);
        if (texCache.current.size > 20) {
          const first = texCache.current.keys().next().value;
          texCache.current.get(first)?.dispose();
          texCache.current.delete(first);
        }
        if (orthoRef.current) {
          orthoRef.current.material.map = tex;
          orthoRef.current.material.needsUpdate = true;
        }
      });
    }
    // Prefetch next 3
    for (let j = 1; j <= 3; j++) {
      const n = idx + j;
      if (n <= MAX_FRAMES && !texCache.current.has(n))
        texLoader.current.load(getFramePath(n), (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          texCache.current.set(n, t);
        });
    }
  }, []);

  useEffect(() => { applyFrame(currentFrame); }, [currentFrame, applyFrame]);

  // ── Playback ─────────────────────────────────────────────────────────────
  useEffect(() => {
    playRef.current = playing;
    if (!playing) return;
    const iv = setInterval(() => {
      if (!playRef.current) { clearInterval(iv); return; }
      frameRef.current = frameRef.current >= MAX_FRAMES ? 1 : frameRef.current + 1;
      setCurrentFrame(frameRef.current);
    }, 100);
    return () => clearInterval(iv);
  }, [playing]);

  // ── Three.js Scene ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth, H = el.clientHeight || 560;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x010b14, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010b14, 0.003);

    // Camera
    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 800);
    camera.position.set(30, 55, 70);
    camera.lookAt(0, 0, 0);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.22;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 15;
    controls.maxDistance = 250;
    controlsRef.current = controls;

    // Lights
    scene.add(new THREE.AmbientLight(0x001520, 3.0));
    const dir = new THREE.DirectionalLight(0x00d4ff, 0.5);
    dir.position.set(40, 80, 20);
    dir.castShadow = true;
    scene.add(dir);
    const ptMain = new THREE.PointLight(0x00d4ff, 1.2, 120);
    ptMain.position.set(0, 30, 0);
    scene.add(ptMain);

    // ── Grid / Ground ──────────────────────────────────────────────────────
    const gridLineMat = new THREE.LineBasicMaterial({ color: 0x001e2e, transparent: true, opacity: 0.9 });
    const GS = 200, GD = 80;
    const gridGrp = new THREE.Group();
    for (let i = 0; i <= GD; i++) {
      const p = -GS / 2 + i * (GS / GD);
      gridGrp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-GS/2, 0, p), new THREE.Vector3(GS/2, 0, p)]), gridLineMat));
      gridGrp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p, 0, -GS/2), new THREE.Vector3(p, 0, GS/2)]), gridLineMat));
    }
    gridGrp.position.y = -0.01;
    scene.add(gridGrp);

    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ color: 0x000d18, roughness: 1 }));
    gnd.rotation.x = -Math.PI / 2;
    gnd.receiveShadow = true;
    scene.add(gnd);

    // ── MAIN ORTHOMOSAIC TERRAIN (real frame textured) ────────────────────
    const TERRAIN_W = 160, TERRAIN_H = 90;
    const terrainGeo = new THREE.PlaneGeometry(TERRAIN_W, TERRAIN_H, 80, 45);

    // Subtle topographic displacement
    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const z = Math.sin(x * 0.12) * Math.cos(y * 0.11) * 2.0
              + Math.sin(x * 0.04) * 3.5;
      pos.setZ(i, Math.max(0, z));
    }
    terrainGeo.computeVertexNormals();
    terrainGeo.rotateX(-Math.PI / 2);

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x001a28,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.06,
      roughness: 0.85,
      metalness: 0.05,
    });

    const orthoMesh = new THREE.Mesh(terrainGeo, terrainMat);
    orthoMesh.receiveShadow = true;
    scene.add(orthoMesh);
    orthoRef.current = orthoMesh;

    // Wireframe edges overlay
    const wireGeo  = new THREE.EdgesGeometry(terrainGeo);
    const wireMesh = new THREE.LineSegments(wireGeo,
      new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 }));
    wireMesh.visible = false;
    scene.add(wireMesh);

    // Perimeter fence glow
    const fenceMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.5 });
    const hw = TERRAIN_W / 2 + 5, hh = TERRAIN_H / 2 + 5;
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hw, 0.3, -hh), new THREE.Vector3(hw, 0.3, -hh),
      new THREE.Vector3(hw, 0.3,  hh), new THREE.Vector3(-hw, 0.3,  hh),
      new THREE.Vector3(-hw, 0.3, -hh),
    ]), fenceMat));

    // ── Zone labels ────────────────────────────────────────────────────────
    const zonePositions = [
      [0, 0], [-35, -22], [35, 18], [-55, 30]
    ];
    ZONES.forEach((zone, idx) => {
      const [cx, cz] = zonePositions[idx];
      const lc = document.createElement('canvas');
      lc.width = 380; lc.height = 52;
      const lctx = lc.getContext('2d');
      lctx.fillStyle = '#00e5ff';
      lctx.font = 'bold 18px monospace';
      lctx.fillText(zone.label.toUpperCase(), 4, 34);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(lc), transparent: true, opacity: 0.7
      }));
      sprite.position.set(cx, 4.5, cz);
      sprite.scale.set(7, 1.0, 1);
      scene.add(sprite);
    });

    // ── Worker Figures ─────────────────────────────────────────────────────
    const mkWorker = (x, z, color, phase) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.scale.set(1.4, 1.4, 1.4);
      const c = new THREE.Color(color);
      const wMat = () => new THREE.MeshStandardMaterial({
        color: c, emissive: c, emissiveIntensity: 0.8,
        transparent: true, opacity: 0.92, roughness: 0.18,
      });
      const P = (geo, px, py, pz) => {
        const m = new THREE.Mesh(geo, wMat());
        m.position.set(px, py, pz); m.castShadow = true; grp.add(m); return m;
      };
      const hg = new THREE.SphereGeometry(0.14, 18, 18); hg.scale(1, 1.12, 0.95); P(hg, 0, 1.68, 0);
      P(new THREE.CylinderGeometry(0.052, 0.068, 0.12, 12), 0, 1.55, 0);
      P(new THREE.LatheGeometry([
        new THREE.Vector2(0.15,0), new THREE.Vector2(0.16,0.08),
        new THREE.Vector2(0.10,0.25), new THREE.Vector2(0.15,0.38),
        new THREE.Vector2(0.18,0.50), new THREE.Vector2(0.17,0.56)], 18), 0, 0.90, 0);
      P(new THREE.SphereGeometry(0.078,12,12),-0.22,1.42,0); P(new THREE.SphereGeometry(0.078,12,12),0.22,1.42,0);
      P(new THREE.CylinderGeometry(0.058,0.048,0.34,12),-0.245,1.20,0); P(new THREE.CylinderGeometry(0.058,0.048,0.34,12),0.245,1.20,0);
      P(new THREE.CylinderGeometry(0.088,0.068,0.42,14),-0.115,0.62,0); P(new THREE.CylinderGeometry(0.088,0.068,0.42,14),0.115,0.62,0);
      P(new THREE.CylinderGeometry(0.062,0.046,0.38,14),-0.115,0.15,0); P(new THREE.CylinderGeometry(0.062,0.046,0.38,14),0.115,0.15,0);

      const blob = new THREE.Mesh(new THREE.CircleGeometry(1.0,28),
        new THREE.MeshBasicMaterial({ map: createHeatTex(color), transparent:true, opacity:0.7, depthWrite:false, blending:THREE.AdditiveBlending }));
      blob.rotation.x = -Math.PI/2; blob.position.set(x,0.1,z); scene.add(blob);

      const ring = new THREE.Mesh(new THREE.RingGeometry(0.22,0.34,22),
        new THREE.MeshBasicMaterial({ color: c, transparent:true, opacity:0.7, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI/2; ring.position.set(x,0.12,z); scene.add(ring);

      const pLight = new THREE.PointLight(c, 0.7, 6);
      pLight.position.set(x, 1.5, z); scene.add(pLight);

      scene.add(grp);
      return { grp, blob, ring, pLight, baseX: x, baseZ: z, phase, color: c };
    };

    const workerObjects = [
      mkWorker( 5,  -8, '#ff2d78', 0.0),
      mkWorker(-15, -20, '#ff6b35', 1.1),
      mkWorker( 30,  12, '#fb923c', 2.4),
    ];
    objectsRef.current = workerObjects;

    // ── LiDAR Drone ───────────────────────────────────────────────────────
    const droneGrp = new THREE.Group();
    droneGrp.position.set(-20, 45, 0);
    scene.add(droneGrp);
    droneRef.current = droneGrp;

    const dMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.9 });
    const gMat = new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.95 });
    droneGrp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 6), dMat));
    const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), gMat);
    gimbal.position.y = -0.35; droneGrp.add(gimbal);
    [[5, 0.12, 0], [0.12, 0, 5]].forEach(d => droneGrp.add(new THREE.Mesh(new THREE.BoxGeometry(...d),
      new THREE.MeshStandardMaterial({ color: 0x334155 }))));

    rotorsRef.current = [];
    [[1.8, 0.2, 1.8], [-1.8, 0.2, 1.8], [1.8, 0.2, -1.8], [-1.8, 0.2, -1.8]].forEach(p => {
      droneGrp.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 8), gMat.clone()), { position: new THREE.Vector3(...p) }));
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.015, 0.09),
        new THREE.MeshBasicMaterial({ color: 0x0f172a }));
      blade.position.set(p[0], p[1] + 0.16, p[2]);
      droneGrp.add(blade);
      rotorsRef.current.push(blade);
    });

    const cone = new THREE.Mesh(new THREE.ConeGeometry(14, 45, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.04, side: THREE.DoubleSide }));
    cone.position.y = -22; droneGrp.add(cone);

    // ── LiDAR sweep plane ─────────────────────────────────────────────────
    const scanPl = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    scanPl.rotation.x = Math.PI / 2;
    scene.add(scanPl);
    scanPlRef.current = scanPl;

    // ── Floating particles ────────────────────────────────────────────────
    const ptGeo = new THREE.BufferGeometry();
    const ptArr = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
      ptArr[i*3]=(Math.random()-0.5)*180; ptArr[i*3+1]=Math.random()*20; ptArr[i*3+2]=(Math.random()-0.5)*100;
    }
    ptGeo.setAttribute('position', new THREE.BufferAttribute(ptArr, 3));
    scene.add(new THREE.Points(ptGeo, new THREE.PointsMaterial({
      color: 0x00d4ff, size: 0.07, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending
    })));

    // ── Animation loop ─────────────────────────────────────────────────────
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const t = clockRef.current.getElapsedTime();
      const frameIdx = frameRef.current;

      // Worker animations
      objectsRef.current.forEach(item => {
        const pulse = 0.65 + Math.sin(t * 2.5 + item.phase) * 0.32;
        if (item.blob)   item.blob.material.opacity = pulse * 0.65;
        if (item.ring)   item.ring.material.opacity = pulse * 0.7;
        if (item.pLight) item.pLight.intensity = 0.5 + Math.sin(t * 3 + item.phase) * 0.45;
        const fo = (frameIdx / MAX_FRAMES) * 10;
        item.grp.position.x = item.baseX + Math.sin(item.phase) * fo + Math.sin(t * 0.7 + item.phase) * 0.05;
        item.grp.position.z = item.baseZ + Math.cos(item.phase) * fo + Math.cos(t * 0.7 + item.phase) * 0.03;
        item.grp.rotation.y = Math.atan2(Math.sin(item.phase), Math.cos(item.phase)) + Math.sin(t * 0.2 + item.phase) * 0.15;
      });

      // Drone patrol (larger orbit for large area)
      if (droneRef.current) {
        const droneT = (frameIdx / MAX_FRAMES) * Math.PI * 2 + t * 0.15;
        droneRef.current.position.set(
          Math.cos(droneT) * 65, 45 + Math.sin(t * 1.5) * 2, Math.sin(droneT) * 40
        );
        droneRef.current.rotation.y = -droneT;
        rotorsRef.current.forEach((r, i) => { r.rotation.y += (i % 2 === 0 ? 1 : -1) * 0.9; });
      }

      // Scan sweep
      if (scanPlRef.current) {
        scanPlRef.current.position.y = Math.sin(t * 0.9) * 6;
        scanPlRef.current.material.opacity = 0.02 + Math.abs(Math.sin(t * 0.9)) * 0.07;
      }

      // Wireframe toggle
      wireMesh.visible = showWireframeRef.current;

      ptMain.position.x = Math.cos(t * 0.22) * 40;
      ptMain.position.z = Math.sin(t * 0.22) * 25;

      if (camera) setCamPos({ x: camera.position.x.toFixed(1), y: camera.position.y.toFixed(1), z: camera.position.z.toFixed(1) });

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      el.innerHTML = '';
      texCache.current.forEach(t => t.dispose());
      texCache.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs for live toggle in animation loop (avoid scene rebuild)
  const showWireframeRef = useRef(false);
  useEffect(() => { showWireframeRef.current = showWireframe; }, [showWireframe]);
  useEffect(() => { if (controlsRef.current) controlsRef.current.autoRotate = autoRotate; }, [autoRotate]);

  // Thermal toggle
  useEffect(() => {
    objectsRef.current.forEach(item => {
      if (item.blob)   item.blob.visible   = showThermal;
      if (item.ring)   item.ring.visible   = showThermal;
      if (item.pLight) item.pLight.visible = showThermal;
    });
  }, [showThermal]);

  // ── Scan pipeline ────────────────────────────────────────────────────────
  const startScan = useCallback(() => {
    if (scanActive) return;
    setScanActive(true); setScanPct(0); setDetCount(0);
    addLog('LIDAR SCAN INITIATED — Large Area: v3_x_1test.mp4');
    addLog('Pass 1/12: Sweeping rebar foundation slab...');
    let pct = 0, det = 0;
    const logSteps = [
      [8,  'LiDAR: Foundation Slab mapped — 31,220 pts'],
      [18, 'LiDAR: Excavation zone triangulated — 22,840 pts'],
      [28, 'LiDAR: Vehicle laydown profiled — 14,950 pts'],
      [38, 'LiDAR: Outer perimeter scanned — 9,100 pts'],
      [45, 'THERMAL IR: Heat signatures scan active...'],
      [50, 'THERMAL: Ambient baseline 31.4°C (outdoor)'],
      [58, 'YOLO DETECT: BLD-01 Bulldozer — conf 97% — Z1'],
      [65, 'YOLO DETECT: BCK-01 Backhoe — conf 37% — Z2'],
      [72, 'THERMAL DETECT: WRK-01 39.2°C (0.79 conf) — Z1'],
      [79, 'THERMAL DETECT: WRK-02 38.9°C (0.63 conf) — Z2'],
      [85, 'YOLO DETECT: VEH-01 Other Vehicle — conf 40% — Z3'],
      [90, 'THERMAL DETECT: WRK-03 38.1°C (0.24 conf) — Z3'],
      [94, '3D MESH: Generating 160m × 90m point cloud...'],
      [97, 'TWIN SYNC: Uploading state to Z-DRONE cloud...'],
    ];
    const iv = setInterval(() => {
      pct += 1.4;
      setScanPct(Math.min(Math.round(pct), 100));
      logSteps.forEach(([p, msg]) => {
        if (p <= pct && !logSteps.find(x => x[0] === p && x[2])) {
          logSteps.find(x => x[0] === p)[2] = true;
          addLog(msg);
          if (msg.startsWith('THERMAL DETECT') || msg.startsWith('YOLO DETECT')) {
            det++; setDetCount(det);
          }
        }
      });
      if (pct >= 100) {
        clearInterval(iv);
        setScanActive(false);
        addLog('──────────────────────────────────');
        addLog(`SCAN COMPLETE: ${TRACKED.length} objects detected`);
        addLog('Digital Twin LIVE — Large Area Sync: ACTIVE');
      }
    }, 80);
  }, [scanActive, addLog]);

  const resetScan = useCallback(() => {
    setScanActive(false); setScanPct(0); setDetCount(0);
    setLogs([
      '> Z-DRONE Digital Twin Engine v3.0',
      '> Source: v3_x_1test.mp4 — Large Area Construction',
      '> System reset. LiDAR: READY.',
    ]);
  }, []);

  return (
    <div className="flex flex-col bg-[#010b14] rounded-b-2xl overflow-hidden border-x border-b border-[#003344] shadow-2xl relative" style={{ height: '560px', fontFamily: 'monospace' }}>

      {/* Scan lines */}
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{ background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,212,255,0.013) 3px,rgba(0,212,255,0.013) 4px)' }} />
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{ background: 'radial-gradient(ellipse at center,transparent 55%,rgba(0,5,15,0.65) 100%)' }} />

      {/* Three.js canvas */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Sweep bar */}
      {scanActive && (
        <div className="absolute top-0 left-0 right-0 h-0.5 z-20">
          <div className="h-full bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent"
            style={{ width: `${scanPct}%`, boxShadow: '0 0 12px 2px #00e5ff', transition: 'width 0.08s linear' }} />
        </div>
      )}

      {/* ── Top-left: Facility overview ─────────────────────────────────── */}
      <div className="absolute top-14 left-4 z-20">
        <div className="bg-[#010d1a]/85 backdrop-blur border border-[#003344] rounded px-3 py-2 text-[9px] space-y-1">
          <div className="text-[#00e5ff] font-bold tracking-wider mb-1">FACILITY OVERVIEW</div>
          <div className="text-[#00e5ff] opacity-65">{ZONES.length} Zones Mapped</div>
          <div style={{ color: '#ff2d78' }}>{detCount} / {TRACKED.length} Objects Detected</div>
          <div className="text-[#00e5ff] opacity-55">Coverage: {scanPct}%</div>
          <div className="text-[#00e5ff] opacity-40 mt-1 text-[8px]">Source: v3_x_1test.mp4</div>
          <div className="text-[#00e5ff] opacity-40 text-[8px]">Area: 160m × 90m (14,400m²)</div>
        </div>
      </div>

      {/* ── Right: Zone list ─────────────────────────────────────────────── */}
      <div className="absolute top-14 right-4 z-20 space-y-1">
        {ZONES.map((z) => {
          const cnt = TRACKED.filter(t => t.zone === z.id).length;
          return (
            <div key={z.id}
              className="bg-[#010d1a]/85 backdrop-blur border rounded px-2.5 py-1 text-[8px] cursor-pointer hover:border-[#00e5ff] transition-all"
              style={{ borderColor: cnt > 0 ? '#003d55' : '#002233' }}
              onClick={() => setActiveZone(activeZone === z.id ? null : z.id)}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[#00e5ff] opacity-70 font-bold">{z.id}</span>
                <span className="text-[#00e5ff] opacity-45 flex-1 text-[7px]">{z.label}</span>
                {cnt > 0
                  ? <span style={{ color: '#ff2d78' }} className="font-bold animate-pulse">●{cnt}</span>
                  : <span className="text-[#00e5ff] opacity-25">○</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── LIVE DRONE FEED (real frame images) ──────────────────────────── */}
      <div className="absolute top-14 left-44 z-20 w-[200px] rounded overflow-hidden border border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.2)] bg-[#010d1a]/80 backdrop-blur">
        <div className="px-2 py-1 text-[7px] text-[#00e5ff] font-bold tracking-widest border-b border-[#00e5ff]/30 flex justify-between">
          <span>DRONE FEED</span>
          <span className="opacity-60">FRM {String(currentFrame).padStart(4,'0')}</span>
        </div>
        <div className="relative aspect-video">
          <img
            src={getFramePath(currentFrame)}
            alt="Live Drone Feed"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 border-[0.5px] border-[#ff2d78] pointer-events-none opacity-40 m-[2px]" />
          <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[#ff2d78] animate-pulse" />
        </div>
        {/* Mini playback controls under feed */}
        <div className="flex items-center gap-1 px-2 py-1 border-t border-[#00e5ff]/20">
          <button onClick={() => setPlaying(p => !p)}
            className="text-[7px] text-[#00e5ff] font-bold px-1.5 py-0.5 border border-[#003344] rounded hover:border-[#00e5ff] transition-colors">
            {playing ? '⏸' : '▶'}
          </button>
          <input type="range" min="1" max={MAX_FRAMES} value={currentFrame}
            onChange={(e) => { const v = parseInt(e.target.value); frameRef.current = v; setCurrentFrame(v); }}
            className="flex-1 h-0.5 appearance-none rounded cursor-pointer"
            style={{ accentColor: '#00e5ff' }}
          />
        </div>
      </div>

      {/* ── Virtual CAM telemetry ─────────────────────────────────────────── */}
      <div className="absolute bottom-28 left-4 z-20">
        <div className="bg-[#010d1a]/80 backdrop-blur border border-[#002233] rounded px-2.5 py-1.5 text-[8px] space-y-0.5 pointer-events-none">
          <div className="text-[#00e5ff] font-bold text-[7px] tracking-widest">VIRTUAL CAM</div>
          <div className="text-[#00e5ff] opacity-55">Pos [{camPos.x}, {camPos.y}, {camPos.z}]</div>
          <div className="text-[#00e5ff] opacity-45">WebGL 2.0 · 60FPS</div>
          <div className="text-[#00e5ff] opacity-35">FRM {String(currentFrame).padStart(4,'0')} / {MAX_FRAMES}</div>
        </div>
      </div>

      {/* ── System Console ────────────────────────────────────────────────── */}
      <div className="absolute bottom-4 right-4 z-20 w-72 bg-[#010d1a]/92 backdrop-blur border border-[#003344] rounded overflow-hidden" style={{ height: '165px' }}>
        <div className="px-3 py-1.5 border-b border-[#002233] flex justify-between items-center">
          <span className="text-[#00e5ff] text-[8px] font-bold tracking-widest">SYSTEM CONSOLE</span>
          <div className="flex gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-[#ff2d78] animate-pulse" />
            <div className="h-1.5 w-1.5 rounded-full bg-[#00e5ff]" />
          </div>
        </div>
        <div className="p-2 overflow-y-auto text-[7.5px] space-y-0.5 scrollbar-none" style={{ height: 'calc(100% - 30px)' }}>
          {logs.map((l, i) => (
            <div key={i} className={`leading-relaxed break-all ${
              l.includes('THERMAL DETECT') ? 'text-[#ff2d78]' :
              l.includes('SCAN COMPLETE')  ? 'text-[#00ff88]' :
              l.includes('YOLO DETECT')    ? 'text-[#a78bfa]' :
              l.includes('LIDAR')          ? 'text-[#00e5ff]' :
              l.includes('──')             ? 'text-[#003344]' :
              'text-[#00e5ff] opacity-55'
            }`}>{l}</div>
          ))}
          <div ref={consoleEnd} />
        </div>
      </div>

      {/* ── Timeline Scrubber ─────────────────────────────────────────────── */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[75%] max-w-[540px] z-30 pointer-events-auto">
        <div className="flex items-center gap-4 bg-[#010d1a]/85 backdrop-blur border border-[#003344] px-4 py-1.5 rounded-full shadow-lg">
          <span className="text-[#00e5ff] text-[9px] font-bold tracking-wider w-12 text-right">
            {((currentFrame / 3).toFixed(1))}s
          </span>
          <input
            id="large-twin-timeline"
            type="range" min="1" max={MAX_FRAMES} value={currentFrame}
            onChange={e => { const v = parseInt(e.target.value); frameRef.current = v; setCurrentFrame(v); }}
            className="flex-1 h-1 bg-[#002233] rounded-lg appearance-none cursor-pointer outline-none"
            style={{ background: `linear-gradient(to right, #00e5ff ${(currentFrame/MAX_FRAMES)*100}%, #002233 ${(currentFrame/MAX_FRAMES)*100}%)` }}
          />
          <span className="text-[#00e5ff] text-[9px] opacity-60 tracking-wider">
            FRM {String(currentFrame).padStart(4,'0')} / {MAX_FRAMES}
          </span>
        </div>
      </div>

      {/* ── Bottom Controls ───────────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-5 py-3 border-t border-[#003344] bg-[#010d1a] gap-4 flex-wrap z-30">
        <div className="flex gap-3">
          <button onClick={startScan} disabled={scanActive}
            className="px-4 py-2 text-[10px] font-bold rounded border tracking-widest transition-all disabled:opacity-40"
            style={{ background: scanActive ? 'transparent' : 'rgba(0,229,255,0.1)', borderColor: '#00e5ff', color: '#00e5ff', boxShadow: scanActive ? 'none' : '0 0 12px rgba(0,229,255,0.25)' }}>
            {scanActive ? '⟳ SCANNING...' : '▶ INITIATE LIDAR SCAN'}
          </button>
          <button onClick={resetScan}
            className="px-3 py-2 text-[10px] font-bold rounded border border-[#003344] text-[#00e5ff] opacity-55 hover:opacity-100 tracking-widest transition-all">
            RESET
          </button>
        </div>

        <div className="flex gap-4 items-center flex-wrap">
          {[
            { label: 'THERMAL IR',  state: showThermal,   toggle: () => setShowThermal(v => !v),   activeColor: '#ff2d78' },
            { label: 'WIREFRAME',   state: showWireframe, toggle: () => setShowWireframe(v => !v), activeColor: '#00e5ff' },
            { label: 'AUTO-ROTATE', state: autoRotate,    toggle: () => setAutoRotate(v => !v),    activeColor: '#00e5ff' },
          ].map(({ label, state, toggle, activeColor }) => (
            <label key={label} className="flex items-center gap-2 cursor-pointer" onClick={toggle}>
              <div className="w-8 h-4 rounded-full relative transition-all"
                style={{ background: state ? activeColor : '#003344', boxShadow: state ? `0 0 8px ${activeColor}` : 'none' }}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${state ? 'left-4' : 'left-0.5'}`} />
              </div>
              <span className="text-[9px] tracking-widest" style={{ color: state ? activeColor : '#00e5ff55' }}>{label}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3 text-[9px] text-[#00e5ff] opacity-55">
          <span className="tracking-widest">SCAN</span>
          <div className="w-32 h-1 rounded-full bg-[#002233] overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${scanPct}%`, background: 'linear-gradient(90deg,#003344,#00e5ff)', boxShadow: '0 0 6px #00e5ff', transition: 'width 0.08s' }} />
          </div>
          <span className="font-mono">{scanPct}%</span>
        </div>
      </div>
    </div>
  );
}
