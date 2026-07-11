import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const ZONES = [
  { id: 'Z1', label: 'Rebar Foundation Slab'   },
  { id: 'Z2', label: 'Excavation & Dirt Mounds' },
  { id: 'Z3', label: 'Vehicle Laydown / Road'   },
  { id: 'Z4', label: 'Outer Perimeter Zone'     },
];

const TRACKED = [
  { id: 'BLD-01', zone: 'Z1', cls: 'Bulldozer',      color: '#facc15' },
  { id: 'BCK-01', zone: 'Z2', cls: 'Backhoe Loader', color: '#f97316' },
  { id: 'VEH-01', zone: 'Z3', cls: 'Other Vehicle',  color: '#a855f7' },
  { id: 'WRK-01', zone: 'Z1', cls: 'Person',         color: '#ff2d78' },
  { id: 'WRK-02', zone: 'Z2', cls: 'Person',         color: '#ec4899' },
  { id: 'WRK-03', zone: 'Z3', cls: 'Person',         color: '#fb7185' },
];

const MAX_FRAMES = 1204;
const getFramePath = (idx) =>
  `/digital_twin/v3_x_1_frames/frame_${String(idx).padStart(4, '0')}.jpg`;

export default function DigitalTwinSectionLargeArea() {
  const mountRef     = useRef(null);
  const rafRef       = useRef(null);
  const controlsRef  = useRef(null);
  const orthoRef     = useRef(null);
  const droneRef     = useRef(null);
  const rotorsRef    = useRef([]);
  const workersRef   = useRef([]);
  const scanPlRef    = useRef(null);
  const consoleEnd   = useRef(null);
  const wireRef      = useRef(null);
  const texLoader    = useRef(new THREE.TextureLoader());
  const texCache     = useRef(new Map());
  const playRef      = useRef(false);
  const frameRef     = useRef(1);
  const showWireRef  = useRef(false);

  const [currentFrame, setCurrentFrame] = useState(1);
  const [playing,      setPlaying]      = useState(false);
  const [scanActive,   setScanActive]   = useState(false);
  const [scanPct,      setScanPct]      = useState(0);
  const [detCount,     setDetCount]     = useState(0);
  const [showThermal,  setShowThermal]  = useState(true);
  const [showWire,     setShowWire]     = useState(false);
  const [autoRotate,   setAutoRotate]   = useState(true);
  const [activeZone,   setActiveZone]   = useState(null);
  const [camPos,       setCamPos]       = useState({ x: '0.0', y: '0.0', z: '0.0' });
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

  useEffect(() => {
    if (consoleEnd.current) consoleEnd.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Keep refs in sync with state for use inside animation loop
  useEffect(() => { showWireRef.current = showWire; }, [showWire]);
  useEffect(() => { if (controlsRef.current) controlsRef.current.autoRotate = autoRotate; }, [autoRotate]);

  // ── Texture streaming ──────────────────────────────────────────────────────
  const applyFrame = useCallback((idx) => {
    const mesh = orthoRef.current;
    if (!mesh) return;
    const cached = texCache.current.get(idx);
    if (cached) {
      mesh.material.map = cached;
      mesh.material.needsUpdate = true;
    } else {
      texLoader.current.load(getFramePath(idx), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        texCache.current.set(idx, tex);
        // LRU eviction — keep ≤ 18 textures
        if (texCache.current.size > 18) {
          const key = texCache.current.keys().next().value;
          texCache.current.get(key)?.dispose();
          texCache.current.delete(key);
        }
        if (orthoRef.current) {
          orthoRef.current.material.map = tex;
          orthoRef.current.material.needsUpdate = true;
        }
      });
    }
    // Pre-fetch ahead
    for (let j = 1; j <= 4; j++) {
      const n = idx + j;
      if (n <= MAX_FRAMES && !texCache.current.has(n)) {
        texLoader.current.load(getFramePath(n), (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          if (!texCache.current.has(n)) texCache.current.set(n, t);
        });
      }
    }
  }, []);

  useEffect(() => { applyFrame(currentFrame); }, [currentFrame, applyFrame]);

  // ── Playback ────────────────────────────────────────────────────────────────
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

  // ── Three.js Scene ──────────────────────────────────────────────────────────
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
    const ptMain = new THREE.PointLight(0x00d4ff, 1.2, 150);
    ptMain.position.set(0, 30, 0);
    scene.add(ptMain);

    // ── Grid / Ground ───────────────────────────────────────────────────────
    const gridLineMat = new THREE.LineBasicMaterial({ color: 0x001e2e, transparent: true, opacity: 0.8 });
    const GS = 200, GD = 80;
    for (let i = 0; i <= GD; i++) {
      const p = -GS / 2 + i * (GS / GD);
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-GS/2, 0, p), new THREE.Vector3(GS/2, 0, p)]), gridLineMat));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p, 0, -GS/2), new THREE.Vector3(p, 0, GS/2)]), gridLineMat));
    }

    const gnd = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ color: 0x000d18, roughness: 1 })
    );
    gnd.rotation.x = -Math.PI / 2;
    gnd.receiveShadow = true;
    scene.add(gnd);

    // ── Orthomosaic terrain (real frame as texture) ─────────────────────────
    const TW = 160, TH = 90;
    const terrainGeo = new THREE.PlaneGeometry(TW, TH, 128, 72);

    // Realistic topographic displacement — rebar pit in center, mounds at edges
    const posArr = terrainGeo.attributes.position;
    for (let i = 0; i < posArr.count; i++) {
      const x = posArr.getX(i), y = posArr.getY(i);
      const d = Math.sqrt(x * x + y * y) / 80;
      const z = Math.sin(x * 0.10) * Math.cos(y * 0.09) * 2.5
              + Math.sin(x * 0.03 + 0.8) * 4.5
              + d * 3.0;
      posArr.setZ(i, Math.max(0, z));
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

    // Load first frame
    texLoader.current.load(getFramePath(1), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      texCache.current.set(1, tex);
      if (orthoRef.current) {
        orthoRef.current.material.map = tex;
        orthoRef.current.material.needsUpdate = true;
      }
    });

    // Wireframe overlay
    const wireGeo = new THREE.WireframeGeometry(terrainGeo);
    const wireMesh = new THREE.LineSegments(wireGeo,
      new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.25 }));
    wireMesh.visible = false;
    scene.add(wireMesh);
    wireRef.current = wireMesh;

    // Perimeter fence
    const fenceMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.5 });
    const hw = TW / 2 + 5, hh = TH / 2 + 5;
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hw, 0.3, -hh), new THREE.Vector3(hw, 0.3, -hh),
      new THREE.Vector3(hw, 0.3, hh),  new THREE.Vector3(-hw, 0.3, hh),
      new THREE.Vector3(-hw, 0.3, -hh),
    ]), fenceMat));

    // Zone labels
    const zonePosMap = [[0, 0], [-35, -22], [35, 18], [-55, 30]];
    ZONES.forEach((zone, idx) => {
      const [cx, cz] = zonePosMap[idx];
      const lc = document.createElement('canvas');
      lc.width = 380; lc.height = 52;
      const lctx = lc.getContext('2d');
      lctx.fillStyle = '#00e5ff';
      lctx.font = 'bold 18px monospace';
      lctx.fillText(zone.label.toUpperCase(), 4, 34);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(lc), transparent: true, opacity: 0.7,
      }));
      sprite.position.set(cx, 4.5, cz);
      sprite.scale.set(7, 1.0, 1);
      scene.add(sprite);
    });

    // ── 3D Construction Machinery Models ────────────────────────────────────
    // Factory function for an excavator
    const mkExcavator = (x, z, rotY, primaryColor) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.rotation.y = rotY;
      const col = new THREE.Color(primaryColor);
      const eMat = (emI = 0.4) => new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: emI, roughness: 0.35, metalness: 0.4,
      });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.5 });

      // Tracks
      const trackL = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.9, 1.6), eMat(0.3));
      trackL.position.set(0, 0.45, 0.9); trackL.castShadow = true; grp.add(trackL);
      const trackR = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.9, 1.6), eMat(0.3));
      trackR.position.set(0, 0.45, -0.9); trackR.castShadow = true; grp.add(trackR);

      // Undercarriage
      const under = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.55, 1.6), darkMat);
      under.position.set(0, 0.95, 0); under.castShadow = true; grp.add(under);

      // Cab / upper body
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.7), eMat(0.5));
      cab.position.set(-0.3, 2.1, 0); cab.castShadow = true; grp.add(cab);

      // Cab glass
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 0.3, transparent: true, opacity: 0.6 }));
      glass.position.set(0.85, 2.25, 0); grp.add(glass);

      // Boom arm
      const boomGrp = new THREE.Group();
      boomGrp.position.set(1.0, 2.7, 0);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.35), eMat(0.6));
      boom.position.set(0, 2.1, 0);
      boom.rotation.z = -Math.PI / 6;
      boom.castShadow = true;
      boomGrp.add(boom);

      // Stick
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.8, 0.25), eMat(0.6));
      stick.position.set(1.5, 3.8, 0);
      stick.rotation.z = Math.PI / 5;
      stick.castShadow = true;
      boomGrp.add(stick);

      // Bucket
      const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 1.1), eMat(0.7));
      bucket.position.set(2.8, 2.1, 0);
      bucket.castShadow = true;
      boomGrp.add(bucket);
      grp.add(boomGrp);

      // Exhaust pipe
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8), darkMat);
      exhaust.position.set(-0.8, 3.0, -0.5); grp.add(exhaust);

      // Glow point light
      const pl = new THREE.PointLight(col, 0.5, 14);
      pl.position.set(x, 3, z);
      scene.add(pl);

      scene.add(grp);
      return grp;
    };

    // Place excavators at positions matching the v3_x_1 footage
    mkExcavator(-22, -18, 0.6,  '#eab308'); // Bulldozer zone Z1
    mkExcavator(  8, -12, -0.4, '#f59e0b'); // Backhoe zone Z1
    mkExcavator( 30, -5,  1.2,  '#eab308'); // Equipment laydown Z3

    // ── Construction Crane ──────────────────────────────────────────────────
    const mkCrane = (x, z) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.8 });
      const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.3, roughness: 0.4 });

      // Mast tower
      const mast = new THREE.Mesh(new THREE.BoxGeometry(1.0, 22, 1.0), steelMat);
      mast.position.y = 11; mast.castShadow = true; grp.add(mast);

      // Jib (horizontal arm)
      const jib = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 0.5), yellowMat);
      jib.position.set(4, 22, 0); jib.castShadow = true; grp.add(jib);

      // Counter jib
      const cjib = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 0.5), yellowMat);
      cjib.position.set(-4, 22, 0); cjib.castShadow = true; grp.add(cjib);

      // Cable from tip
      const cableGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(13, 22, 0), new THREE.Vector3(13, 3, 0)
      ]);
      grp.add(new THREE.Line(cableGeo, new THREE.LineBasicMaterial({ color: 0xaaaaaa })));

      // Hook block
      const hook = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), steelMat);
      hook.position.set(13, 2.5, 0); grp.add(hook);

      const pl = new THREE.PointLight(0xf59e0b, 0.4, 30);
      pl.position.set(x, 22, z); scene.add(pl);

      scene.add(grp);
      return grp;
    };
    mkCrane(-50, -30);
    mkCrane( 45,  20);

    // ── Dump Truck ──────────────────────────────────────────────────────────
    const mkTruck = (x, z, rotY) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.rotation.y = rotY;
      const truckMat = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0xa855f7, emissiveIntensity: 0.3, roughness: 0.4 });

      // Body
      const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.5, 2.5), truckMat);
      body.position.y = 1.25; body.castShadow = true; grp.add(body);

      // Cab
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.0, 2.3),
        new THREE.MeshStandardMaterial({ color: 0x7e22ce, roughness: 0.3, metalness: 0.5 }));
      cab.position.set(-2.5, 2.0, 0); cab.castShadow = true; grp.add(cab);

      // Wheels (4)
      [[-2, -1.4], [-2, 1.4], [1.5, -1.4], [1.5, 1.4]].forEach(([wx, wz]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 12),
          new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }));
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.7, wz); grp.add(wheel);
      });

      const pl = new THREE.PointLight(0xa855f7, 0.4, 12);
      pl.position.set(x, 2, z); scene.add(pl);

      scene.add(grp);
      return grp;
    };
    mkTruck(20, 8,  0.3);
    mkTruck(-10, 22, -0.8);

    // ── Concrete Foundation Structure (rebar slab in center) ───────────────
    (() => {
      const rebarMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7 });
      for (let i = -28; i <= 28; i += 2.5) {
        const h = Math.sqrt(28 * 28 - Math.min(i * i, 28 * 28));
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-h, 0.15, i), new THREE.Vector3(h, 0.15, i)
        ]), rebarMat));
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(i, 0.15, -h), new THREE.Vector3(i, 0.15, h)
        ]), rebarMat));
      }
      // Low wall sections
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x001a28, emissive: 0x00e5ff, emissiveIntensity: 0.1, transparent: true, opacity: 0.7, roughness: 0.9,
      });
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const wx = Math.cos(a) * 30, wz = Math.sin(a) * 30;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 0.4), wallMat);
        wall.position.set(wx, 0.6, wz);
        wall.rotation.y = a;
        wall.castShadow = true;
        scene.add(wall);
      }
    })();

    // ── Workers (simple glowing capsule figures) ────────────────────────────
    const workerPositions = [
      { x: 5,   z: -8,  color: '#ff2d78', phase: 0.0 },
      { x: -15, z: -20, color: '#ff6b35', phase: 1.1 },
      { x: 30,  z: 12,  color: '#fb923c', phase: 2.4 },
    ];
    workersRef.current = [];
    workerPositions.forEach(({ x, z, color, phase }) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      const c = new THREE.Color(color);
      const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, roughness: 0.2 });

      // Body
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.0, 12), mat);
      body.position.y = 0.5; grp.add(body);
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), mat);
      head.position.y = 1.25; grp.add(head);
      scene.add(grp);

      // Heat blob
      const blobCanvas = document.createElement('canvas');
      blobCanvas.width = blobCanvas.height = 128;
      const bctx = blobCanvas.getContext('2d');
      const grad = bctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, color);
      grad.addColorStop(0.4, color);
      grad.addColorStop(1, 'transparent');
      bctx.fillStyle = grad;
      bctx.beginPath(); bctx.arc(64, 64, 64, 0, Math.PI * 2); bctx.fill();

      const blob = new THREE.Mesh(
        new THREE.CircleGeometry(1.0, 28),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(blobCanvas),
          transparent: true, opacity: 0.7,
          depthWrite: false, blending: THREE.AdditiveBlending
        })
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.set(x, 0.1, z);
      scene.add(blob);

      const pLight = new THREE.PointLight(c, 0.7, 6);
      pLight.position.set(x, 1.5, z);
      scene.add(pLight);

      workersRef.current.push({ grp, blob, pLight, baseX: x, baseZ: z, phase });
    });

    // ── Drone ───────────────────────────────────────────────────────────────
    const droneGrp = new THREE.Group();
    droneGrp.position.set(-20, 45, 0);
    scene.add(droneGrp);
    droneRef.current = droneGrp;

    const dMatDrone = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.9 });
    const gMatDrone = new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.95 });
    droneGrp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 6), dMatDrone));
    const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), gMatDrone);
    gimbal.position.y = -0.35;
    droneGrp.add(gimbal);

    const armMatDrone = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 0.2), armMatDrone);
    droneGrp.add(arm1);
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 5), armMatDrone);
    droneGrp.add(arm2);

    rotorsRef.current = [];
    [
      [1.8, 0.2, 1.8], [-1.8, 0.2, 1.8],
      [1.8, 0.2, -1.8], [-1.8, 0.2, -1.8]
    ].forEach((p, i) => {
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 8), gMatDrone.clone());
      motor.position.set(p[0], p[1], p[2]);
      droneGrp.add(motor);

      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.015, 0.09),
        new THREE.MeshBasicMaterial({ color: 0x0f172a })
      );
      blade.position.set(p[0], p[1] + 0.16, p[2]);
      droneGrp.add(blade);
      rotorsRef.current.push(blade);
    });

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(14, 45, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.04, side: THREE.DoubleSide })
    );
    cone.position.y = -22;
    droneGrp.add(cone);

    // ── LiDAR sweep plane ───────────────────────────────────────────────────
    const scanPl = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    scanPl.rotation.x = Math.PI / 2;
    scene.add(scanPl);
    scanPlRef.current = scanPl;

    // ── Floating particles ──────────────────────────────────────────────────
    const ptPositions = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
      ptPositions[i*3]   = (Math.random() - 0.5) * 180;
      ptPositions[i*3+1] = Math.random() * 20;
      ptPositions[i*3+2] = (Math.random() - 0.5) * 100;
    }
    const ptGeo = new THREE.BufferGeometry();
    ptGeo.setAttribute('position', new THREE.BufferAttribute(ptPositions, 3));
    scene.add(new THREE.Points(ptGeo, new THREE.PointsMaterial({
      color: 0x00d4ff, size: 0.07, transparent: true, opacity: 0.4,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })));

    // ── Animation loop ──────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const frameIdx = frameRef.current;

      // Workers
      workersRef.current.forEach((item) => {
        const pulse = 0.65 + Math.sin(t * 2.5 + item.phase) * 0.32;
        if (item.blob)   item.blob.material.opacity = pulse * 0.65;
        if (item.pLight) item.pLight.intensity = 0.5 + Math.sin(t * 3 + item.phase) * 0.45;
        const fo = (frameIdx / MAX_FRAMES) * 8;
        item.grp.position.x = item.baseX + Math.sin(item.phase) * fo + Math.sin(t * 0.7 + item.phase) * 0.05;
        item.grp.position.z = item.baseZ + Math.cos(item.phase) * fo + Math.cos(t * 0.7 + item.phase) * 0.03;
        item.grp.rotation.y = Math.atan2(Math.sin(item.phase), Math.cos(item.phase)) + Math.sin(t * 0.2 + item.phase) * 0.15;
      });

      // Drone
      if (droneRef.current) {
        const angle = (frameIdx / MAX_FRAMES) * Math.PI * 2 + t * 0.15;
        droneRef.current.position.set(
          Math.cos(angle) * 65,
          45 + Math.sin(t * 1.5) * 2,
          Math.sin(angle) * 40
        );
        droneRef.current.rotation.y = -angle;
        rotorsRef.current.forEach((r, i) => {
          r.rotation.y += (i % 2 === 0 ? 1 : -1) * 0.9;
        });
      }

      // LiDAR sweep
      if (scanPlRef.current) {
        scanPlRef.current.position.y = Math.sin(t * 0.9) * 6;
        scanPlRef.current.material.opacity = 0.02 + Math.abs(Math.sin(t * 0.9)) * 0.07;
      }

      // Wireframe toggle
      if (wireRef.current) {
        wireRef.current.visible = showWireRef.current;
      }

      ptMain.position.x = Math.cos(t * 0.22) * 40;
      ptMain.position.z = Math.sin(t * 0.22) * 25;

      setCamPos({
        x: camera.position.x.toFixed(1),
        y: camera.position.y.toFixed(1),
        z: camera.position.z.toFixed(1),
      });

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
      orthoRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Thermal toggle
  useEffect(() => {
    workersRef.current.forEach(item => {
      if (item.blob)   item.blob.visible   = showThermal;
      if (item.pLight) item.pLight.visible = showThermal;
    });
  }, [showThermal]);

  // ── Scan pipeline ───────────────────────────────────────────────────────────
  const startScan = useCallback(() => {
    if (scanActive) return;
    setScanActive(true); setScanPct(0); setDetCount(0);
    addLog('LIDAR SCAN INITIATED — Large Area: v3_x_1test.mp4');
    addLog('Pass 1/12: Sweeping rebar foundation slab...');
    let pct = 0, det = 0;
    const steps = [
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
      [85, 'YOLO DETECT: VEH-01 Vehicle — conf 40% — Z3'],
      [90, 'THERMAL DETECT: WRK-03 38.1°C (0.24 conf) — Z3'],
      [94, '3D MESH: Generating 160m × 90m point cloud...'],
      [97, 'TWIN SYNC: Uploading state to Z-DRONE cloud...'],
    ];
    const fired = new Set();
    const iv = setInterval(() => {
      pct += 1.4;
      setScanPct(Math.min(Math.round(pct), 100));
      steps.forEach(([p, msg]) => {
        if (p <= pct && !fired.has(p)) {
          fired.add(p);
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

      {/* CRT scanlines */}
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

      {/* ── Facility Overview (top-left) ──────────────────────────────────── */}
      <div className="absolute top-14 left-4 z-20">
        <div className="bg-[#010d1a]/85 backdrop-blur border border-[#003344] rounded px-3 py-2 text-[9px] space-y-1">
          <div className="text-[#00e5ff] font-bold tracking-wider mb-1">FACILITY OVERVIEW</div>
          <div className="text-[#00e5ff] opacity-65">{ZONES.length} Zones Mapped</div>
          <div style={{ color: '#ff2d78' }}>{detCount} / {TRACKED.length} Objects Detected</div>
          <div className="text-[#00e5ff] opacity-55">Coverage: {scanPct}%</div>
          <div className="text-[#00e5ff] opacity-40 mt-1 text-[8px]">Source: v3_x_1test.mp4</div>
          <div className="text-[#00e5ff] opacity-40 text-[8px]">Area: 160m × 90m</div>
        </div>
      </div>

      {/* ── Zone list (top-right) ─────────────────────────────────────────── */}
      <div className="absolute top-14 right-4 z-20 space-y-1">
        {ZONES.map((z) => {
          const cnt = TRACKED.filter(t => t.zone === z.id).length;
          return (
            <div key={z.id}
              className="bg-[#010d1a]/85 backdrop-blur border rounded px-2.5 py-1 text-[8px] cursor-pointer hover:border-[#00e5ff] transition-all"
              style={{ borderColor: cnt > 0 ? '#003d55' : '#002233' }}
              onClick={() => setActiveZone(prev => prev === z.id ? null : z.id)}
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

      {/* ── Live Drone Feed ───────────────────────────────────────────────── */}
      <div className="absolute top-14 left-44 z-20 w-[200px] rounded overflow-hidden border border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.2)] bg-[#010d1a]/80 backdrop-blur">
        <div className="px-2 py-1 text-[7px] text-[#00e5ff] font-bold tracking-widest border-b border-[#00e5ff]/30 flex justify-between">
          <span>DRONE FEED</span>
          <span className="opacity-60">FRM {String(currentFrame).padStart(4, '0')}</span>
        </div>
        <div className="relative aspect-video">
          <img src={getFramePath(currentFrame)} alt="Drone Feed" className="w-full h-full object-cover" />
          <div className="absolute inset-0 border-[0.5px] border-[#ff2d78] pointer-events-none opacity-40 m-[2px]" />
          <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[#ff2d78] animate-pulse" />
        </div>
        <div className="flex items-center gap-1 px-2 py-1 border-t border-[#00e5ff]/20">
          <button onClick={() => setPlaying(p => !p)}
            className="text-[7px] text-[#00e5ff] font-bold px-1.5 py-0.5 border border-[#003344] rounded hover:border-[#00e5ff] transition-colors">
            {playing ? '⏸' : '▶'}
          </button>
          <input type="range" min="1" max={MAX_FRAMES} value={currentFrame}
            onChange={(e) => { const v = parseInt(e.target.value); frameRef.current = v; setCurrentFrame(v); }}
            className="flex-1 h-0.5 appearance-none rounded cursor-pointer"
            style={{ accentColor: '#00e5ff' }} />
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
        <div className="p-2 overflow-y-auto text-[7.5px] space-y-0.5" style={{ height: 'calc(100% - 30px)' }}>
          {logs.map((l, i) => (
            <div key={i} className={`leading-relaxed break-all ${
              l.includes('THERMAL DETECT') ? 'text-[#ff2d78]' :
              l.includes('SCAN COMPLETE')  ? 'text-[#00ff88]' :
              l.includes('YOLO DETECT')    ? 'text-[#a78bfa]' :
              l.includes('LIDAR')          ? 'text-[#00e5ff]' :
              l.includes('──')             ? 'text-[#003344]'  :
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
            { label: 'THERMAL IR',  state: showThermal, toggle: () => setShowThermal(v => !v),  activeColor: '#ff2d78' },
            { label: 'WIREFRAME',   state: showWire,    toggle: () => setShowWire(v => !v),      activeColor: '#00e5ff' },
            { label: 'AUTO-ROTATE', state: autoRotate,  toggle: () => setAutoRotate(v => !v),    activeColor: '#00e5ff' },
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
            <div className="h-full rounded-full"
              style={{ width: `${scanPct}%`, background: 'linear-gradient(90deg,#003344,#00e5ff)', boxShadow: '0 0 6px #00e5ff', transition: 'width 0.08s' }} />
          </div>
          <span className="font-mono">{scanPct}%</span>
        </div>
      </div>
    </div>
  );
}
