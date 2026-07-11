import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCTION SITE ZONES — Mapped from v3_AvatarG0008_test.mp4 aerial footage
// ─────────────────────────────────────────────────────────────────────────────
const ZONES = [
  { id: 'Z1', x:  0,  z:  0,  w: 24, d: 24, label: 'Main Circular Tank', type: 'foundation' },
  { id: 'Z2', x: -22, z: -15, w: 12, d: 35, label: 'Access Road',        type: 'road'       },
  { id: 'Z3', x:  14, z: -12, w: 10, d: 26, label: 'Equipment Laydown',  type: 'excavation' },
];

// ─────────────────────────────────────────────────────────────────────────────
// TRACKED OBJECTS — From YOLO v8n + ByteTrack on v3_AvatarG0008_test.mp4
// ─────────────────────────────────────────────────────────────────────────────
const TRACKED = [
  // Workers (hi-vis)
  { id: 'WRK-01', zone: 'Z1', cls: 'Worker', color: '#ff2d78', heat: 0.87, name: 'Worker A', role: 'Tank Rebar Crew' },
  { id: 'WRK-02', zone: 'Z1', cls: 'Worker', color: '#ff6b35', heat: 0.77, name: 'Worker B', role: 'Tank Rebar Crew' },
  { id: 'WRK-03', zone: 'Z1', cls: 'Worker', color: '#ff2d78', heat: 0.55, name: 'Worker C', role: 'Tank Concrete Pour' },
  { id: 'WRK-04', zone: 'Z2', cls: 'Worker', color: '#fb923c', heat: 0.49, name: 'Worker D', role: 'Road Inspector' },
];

const zoneCentre = (z) => ({ x: z.x + z.w / 2, z: z.z + z.d / 2 });

function createHeatTex(center, outer) {
  const C = document.createElement('canvas');
  C.width = C.height = 128;
  const ctx = C.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0,   center);
  g.addColorStop(0.4, outer || center);
  g.addColorStop(1,   'transparent');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(C);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function DigitalTwinSectionV3() {
  const mountRef     = useRef(null);
  const rafRef       = useRef(null);
  const clockRef     = useRef(new THREE.Clock());
  const controlsRef  = useRef(null);
  const objectsRef   = useRef([]);
  const scanRef      = useRef(null);
  const droneRef     = useRef(null);
  const consoleEnd   = useRef(null);

  const [scanActive,    setScanActive]    = useState(false);
  const [scanPct,       setScanPct]       = useState(0);
  const [detCount,      setDetCount]      = useState(0);
  const [showThermal,   setShowThermal]   = useState(true);
  const [showWireframe, setShowWireframe] = useState(false);
  const [autoRotate,    setAutoRotate]    = useState(true);
  const [logs, setLogs] = useState([
    '> Z-DRONE Digital Twin Engine v3.0',
    '> Source: v3_AvatarG0008_test.mp4 — Circular Tank Construction',
    '> LiDAR: 12-pass aerial scan — READY',
    '> YOLO v8n + ByteTrack: STANDBY',
    '> Awaiting scan trigger...',
  ]);
  const [activeZone, setActiveZone] = useState(null);
  const [camPos, setCamPos] = useState({ x: 0, y: 0, z: 0 });
  const [currentFrame, setCurrentFrame] = useState(0);
  const MAX_FRAMES = 350;

  const addLog = useCallback((msg) => {
    setLogs(p => { const n = [...p, `> ${msg}`]; return n.length > 50 ? n.slice(-50) : n; });
  }, []);

  useEffect(() => {
    if (consoleEnd.current) consoleEnd.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ── Three.js scene ──────────────────────────────────────────────────────────
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
    scene.fog = new THREE.FogExp2(0x010b14, 0.018);

    // Camera
    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 400);
    camera.position.set(22, 28, 34);
    camera.lookAt(0, 0, 2);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 12;
    controls.maxDistance = 80;
    controlsRef.current = controls;

    // Lights
    scene.add(new THREE.AmbientLight(0x001520, 2.5));
    const dir = new THREE.DirectionalLight(0x00d4ff, 0.6);
    dir.position.set(10, 20, 8);
    dir.castShadow = true;
    scene.add(dir);
    const ptMain = new THREE.PointLight(0x00d4ff, 1.4, 60);
    ptMain.position.set(0, 18, 0);
    scene.add(ptMain);

    // ── Grid / Ground ───────────────────────────────────────────
    const gridLineMat = new THREE.LineBasicMaterial({ color: 0x001e2e, transparent: true, opacity: 0.9 });
    const GS = 60, GD = 60;
    const gridGrp = new THREE.Group();
    for (let i = 0; i <= GD; i++) {
      const p = -GS / 2 + i * (GS / GD);
      gridGrp.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-GS/2, 0, p), new THREE.Vector3(GS/2, 0, p)]),
        gridLineMat
      ));
      gridGrp.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p, 0, -GS/2), new THREE.Vector3(p, 0, GS/2)]),
        gridLineMat
      ));
    }
    gridGrp.position.y = -0.01;
    scene.add(gridGrp);

    const gnd = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0x000d18, roughness: 1 })
    );
    gnd.rotation.x = -Math.PI / 2;
    gnd.receiveShadow = true;
    scene.add(gnd);

    // ── Circular Tank Construction (Z1) ───────────────────────
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0x001a28, emissive: 0x00e5ff, emissiveIntensity: 0.15,
      transparent: true, opacity: 0.65, roughness: 0.9, side: THREE.DoubleSide
    });
    const tankEdge = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 });

    const tankGrp = new THREE.Group();
    tankGrp.position.set(ZONES[0].x + ZONES[0].w/2, 0, ZONES[0].z + ZONES[0].d/2);

    // Outer wall
    const wallGeo = new THREE.CylinderGeometry(12, 12, 2.5, 64, 1, true);
    const wall = new THREE.Mesh(wallGeo, tankMat);
    wall.position.y = 1.25;
    tankGrp.add(wall);

    // Wireframe for the wall
    const wallEdges = new THREE.EdgesGeometry(wallGeo);
    const wallLine = new THREE.LineSegments(wallEdges, tankEdge);
    wallLine.position.y = 1.25;
    tankGrp.add(wallLine);

    // Floor rebar pattern (grid on a circle)
    const floorGeo = new THREE.CircleGeometry(11.8, 64);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
      color: 0x001122, emissive: 0x00e5ff, emissiveIntensity: 0.1,
      transparent: true, opacity: 0.5
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.05;
    tankGrp.add(floor);

    // Add some rebar lines
    const rebarMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7 });
    for (let i = -11; i <= 11; i += 1.5) {
      const h = Math.sqrt(11.8 * 11.8 - i * i);
      tankGrp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-h, 0.06, i), new THREE.Vector3(h, 0.06, i)]), rebarMat));
      tankGrp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i, 0.06, -h), new THREE.Vector3(i, 0.06, h)]), rebarMat));
    }

    scene.add(tankGrp);

    // ── Road Zone (Z2) ──────────────────────────────────────────
    const roadGrp = new THREE.Group();
    roadGrp.position.set(ZONES[1].x + ZONES[1].w/2, 0, ZONES[1].z + ZONES[1].d/2);
    
    const roadGeo = new THREE.PlaneGeometry(ZONES[1].w, ZONES[1].d);
    const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({
      color: 0x000a12, emissive: 0x00e5ff, emissiveIntensity: 0.08,
      transparent: true, opacity: 0.75
    }));
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.02;
    roadGrp.add(road);

    const roadLineGeo = new THREE.PlaneGeometry(0.2, ZONES[1].d);
    const roadLineMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.85 });
    for (let i = -12; i < 15; i += 3) {
      const rl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 1.5), roadLineMat);
      rl.rotation.x = -Math.PI / 2;
      rl.position.set(0, 0.03, i);
      roadGrp.add(rl);
    }

    scene.add(roadGrp);

    // ── Terrain dirt mounds (Z3) ───────────────────────
    const dirtMat = new THREE.MeshStandardMaterial({
      color: 0x001a28, emissive: 0x004466, emissiveIntensity: 0.12,
      transparent: true, opacity: 0.55, roughness: 0.9,
    });
    const moundPositions = [
      [ 14, 0, -4, 3.5, 0.9, 2.5],
      [ 18, 0,  2, 4.0, 1.1, 2.8],
      [ 12, 0, -8, 3.0, 1.2, 2.2],
    ];
    moundPositions.forEach(([x, y, z, rx, ry, rz]) => {
      const mound = new THREE.Mesh(
        new THREE.SphereGeometry(rx, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        dirtMat.clone()
      );
      mound.scale.set(1, ry, rz / rx);
      mound.position.set(x, 0, z);
      mound.rotation.y = Math.random() * Math.PI;
      scene.add(mound);
      const edges = new THREE.EdgesGeometry(mound.geometry);
      const el2 = new THREE.LineSegments(edges,
        new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6 })
      );
      el2.position.copy(mound.position);
      el2.scale.copy(mound.scale);
      el2.rotation.copy(mound.rotation);
      scene.add(el2);
    });

    // ── Zone labels ─────────────────
    ZONES.forEach(zone => {
      const cx = zone.x + zone.w / 2, cz = zone.z + zone.d / 2;
      const lc = document.createElement('canvas');
      lc.width = 350; lc.height = 48;
      const lctx = lc.getContext('2d');
      lctx.fillStyle = '#00e5ff';
      lctx.font = 'bold 18px monospace';
      lctx.fillText(zone.label.toUpperCase(), 4, 32);
      const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(lc), transparent: true, opacity: 0.85
      }));
      labelSprite.position.set(cx, 3.5, cz);
      labelSprite.scale.set(5.5, 0.85, 1);
      scene.add(labelSprite);
    });

    // ── Worker figures (realistic human) ────────────────────────
    const mkWorker = (x, z, color, phase) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.scale.set(1.5, 1.5, 1.5); // Make workers larger (1.5x)
      const c = new THREE.Color(color);
      const wMat = (em = 0.8) => new THREE.MeshStandardMaterial({
        color: c, emissive: c, emissiveIntensity: em,
        transparent: true, opacity: 0.92, roughness: 0.18,
      });
      const P = (geo, px, py, pz, rx=0, ry=0, rz=0) => {
        const m = new THREE.Mesh(geo, wMat());
        m.position.set(px, py, pz);
        m.rotation.set(rx, ry, rz);
        m.castShadow = true;
        grp.add(m);
        return m;
      };
      
      const hg = new THREE.SphereGeometry(0.14, 18, 18); hg.scale(1, 1.12, 0.95); P(hg, 0, 1.68, 0);
      P(new THREE.CylinderGeometry(0.052, 0.068, 0.12, 12), 0, 1.55, 0);
      P(new THREE.LatheGeometry([
        new THREE.Vector2(0.15, 0), new THREE.Vector2(0.16, 0.08),
        new THREE.Vector2(0.10, 0.25), new THREE.Vector2(0.15, 0.38),
        new THREE.Vector2(0.18, 0.50), new THREE.Vector2(0.17, 0.56),
      ], 18), 0, 0.90, 0);
      P(new THREE.SphereGeometry(0.078, 12, 12), -0.22, 1.42, 0); P(new THREE.SphereGeometry(0.078, 12, 12),  0.22, 1.42, 0);
      P(new THREE.CylinderGeometry(0.058, 0.048, 0.34, 12), -0.245, 1.20, 0, 0, 0, 0.14); P(new THREE.CylinderGeometry(0.058, 0.048, 0.34, 12),  0.245, 1.20, 0, 0, 0,-0.14);
      P(new THREE.SphereGeometry(0.054, 10, 10), -0.28, 0.99, 0); P(new THREE.SphereGeometry(0.054, 10, 10),  0.28, 0.99, 0);
      P(new THREE.CylinderGeometry(0.044, 0.035, 0.30, 12), -0.295, 0.78, 0, 0, 0, 0.10); P(new THREE.CylinderGeometry(0.044, 0.035, 0.30, 12),  0.295, 0.78, 0, 0, 0,-0.10);
      const hnd = new THREE.SphereGeometry(0.046, 10, 10); hnd.scale(1.1, 0.7, 0.7); P(hnd, -0.305, 0.60, 0); P(hnd.clone(),  0.305, 0.60, 0);
      P(new THREE.SphereGeometry(0.115, 12, 12), 0, 0.91, 0);
      P(new THREE.SphereGeometry(0.074, 10, 10), -0.115, 0.86, 0); P(new THREE.SphereGeometry(0.074, 10, 10),  0.115, 0.86, 0);
      P(new THREE.CylinderGeometry(0.088, 0.068, 0.42, 14), -0.115, 0.62, 0); P(new THREE.CylinderGeometry(0.088, 0.068, 0.42, 14),  0.115, 0.62, 0);
      P(new THREE.SphereGeometry(0.068, 10, 10), -0.115, 0.38, 0); P(new THREE.SphereGeometry(0.068, 10, 10),  0.115, 0.38, 0);
      P(new THREE.CylinderGeometry(0.062, 0.046, 0.38, 14), -0.115, 0.15, 0); P(new THREE.CylinderGeometry(0.062, 0.046, 0.38, 14),  0.115, 0.15, 0);
      P(new THREE.SphereGeometry(0.044, 10, 10), -0.115, -0.04, 0.01); P(new THREE.SphereGeometry(0.044, 10, 10),  0.115, -0.04, 0.01);
      const ft = new THREE.BoxGeometry(0.09, 0.05, 0.22); ft.translate(0, 0, 0.06); P(ft, -0.115, -0.06, 0); P(ft.clone(), 0.115, -0.06, 0);

      const blob = new THREE.Mesh(
        new THREE.CircleGeometry(1.0, 28),
        new THREE.MeshBasicMaterial({ map: createHeatTex(color), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.set(x, 0.1, z);
      scene.add(blob);

      const blobCore = new THREE.Mesh(
        new THREE.CircleGeometry(0.35, 20),
        new THREE.MeshBasicMaterial({ map: createHeatTex('#ffffff', color), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      blobCore.rotation.x = -Math.PI / 2;
      blobCore.position.set(x, 0.11, z);
      scene.add(blobCore);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.34, 22),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.12, z);
      scene.add(ring);

      const pLight = new THREE.PointLight(c, 0.7, 4);
      pLight.position.set(x, 1.2, z);
      scene.add(pLight);

      scene.add(grp);
      return { grp, blob, blobCore, ring, pLight, baseX: x, baseZ: z, phase, color: c };
    };

    // Workers positions based on YOLO in v3
    const workerObjects = [
      mkWorker(ZONES[0].x + ZONES[0].w/2 + 2, ZONES[0].z + ZONES[0].d/2 + 3, '#ff2d78', 0.0), // Center of tank
      mkWorker(ZONES[0].x + ZONES[0].w/2 - 6, ZONES[0].z + ZONES[0].d/2 + 8, '#ff6b35', 1.1), // Edge of tank
      mkWorker(ZONES[0].x + ZONES[0].w/2 + 8, ZONES[0].z + ZONES[0].d/2 - 5, '#ff2d78', 2.3), // Edge of tank
      mkWorker(-16.5,  -5.0, '#fb923c', 3.4), // On road
    ];
    objectsRef.current = workerObjects;

    // ── LiDAR drone model ────────────────────────────────────────
    const droneGrp = new THREE.Group();
    droneGrp.position.set(-8, 18, 0);
    scene.add(droneGrp);
    droneRef.current = droneGrp;

    const dBodyMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.9 });
    const dBody = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 6), dBodyMat);
    droneGrp.add(dBody);

    const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.95 })
    );
    gimbal.position.y = -0.35;
    droneGrp.add(gimbal);

    const armMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    [[5, 0.12, 0], [0.12, 0, 5]].forEach(d => {
      droneGrp.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(...d), armMat)));
    });

    const rotors = [];
    [[1.8, 0.2, 1.8], [-1.8, 0.2, 1.8], [1.8, 0.2, -1.8], [-1.8, 0.2, -1.8]].forEach(p => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 8),
        new THREE.MeshStandardMaterial({ color: 0x00d4ff, metalness: 0.9 })
      );
      m.position.set(...p);
      droneGrp.add(m);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.015, 0.09),
        new THREE.MeshBasicMaterial({ color: 0x0f172a })
      );
      blade.position.set(...p);
      blade.position.y += 0.16;
      droneGrp.add(blade);
      rotors.push(blade);
    });

    // Scan beam cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(5, 18, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.05, side: THREE.DoubleSide })
    );
    cone.position.y = -9;
    droneGrp.add(cone);

    // ── LiDAR sweep plane ────────────────────────────────────────
    const scanPl = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    scanPl.rotation.x = Math.PI / 2;
    scene.add(scanPl);
    scanRef.current = scanPl;

    // ── Floating dust particles ───────────────────────────────────
    const ptGeo = new THREE.BufferGeometry();
    const ptArr = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      ptArr[i*3]   = (Math.random()-0.5)*50;
      ptArr[i*3+1] = Math.random()*12;
      ptArr[i*3+2] = (Math.random()-0.5)*50;
    }
    ptGeo.setAttribute('position', new THREE.BufferAttribute(ptArr, 3));
    scene.add(new THREE.Points(ptGeo, new THREE.PointsMaterial({
      color: 0x00d4ff, size: 0.06, transparent: true, opacity: 0.45,
      depthWrite: false, blending: THREE.AdditiveBlending
    })));

    // ── Animation loop ───────────────────────────────────────────
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const t = clockRef.current.getElapsedTime();

      // Get current frame from a ref to sync with state without dependency array issues
      const frameIndex = parseInt(document.getElementById('twin-timeline')?.value || 0);

      // Worker animations (synced to timeline + subtle idle breathing)
      objectsRef.current.forEach(item => {
        const pulse = 0.65 + Math.sin(t * 2.5 + item.phase) * 0.32;
        if (item.blob)     item.blob.material.opacity = pulse * 0.65;
        if (item.blobCore) item.blobCore.material.opacity = 0.85 + Math.sin(t * 4 + item.phase) * 0.15;
        if (item.ring)     item.ring.material.opacity = pulse * 0.7;
        if (item.pLight)   item.pLight.intensity = 0.5 + Math.sin(t * 3 + item.phase) * 0.45;
        
        // Sync position to the timeline frame! (Moves them across their paths)
        const frameOffset = (frameIndex / 350) * 12; // move up to 12 units
        item.grp.position.x = item.baseX + Math.sin(item.phase) * frameOffset + Math.sin(t * 0.7 + item.phase) * 0.05;
        item.grp.position.z = item.baseZ + Math.cos(item.phase) * frameOffset + Math.cos(t * 0.7 + item.phase) * 0.03;
        
        // Rotate them to face where they are walking
        item.grp.rotation.y = Math.atan2(Math.sin(item.phase), Math.cos(item.phase)) + Math.sin(t * 0.2 + item.phase) * 0.15;
      });

      // Drone hover + circular patrol (synced to timeline)
      if (droneRef.current) {
        const droneT = (frameIndex / 350) * Math.PI * 2 + t * 0.2;
        droneRef.current.position.x = ZONES[0].x + ZONES[0].w/2 + Math.cos(droneT) * 10;
        droneRef.current.position.y = 18 + Math.sin(t * 1.5) * 0.5;
        droneRef.current.position.z = ZONES[0].z + ZONES[0].d/2 + Math.sin(droneT) * 10;
        droneRef.current.rotation.y = -droneT;
        rotors.forEach((r, i) => { r.rotation.y += (i % 2 === 0 ? 1 : -1) * 0.9; });
      }

      // Scan plane sweep
      if (scanRef.current) {
        scanRef.current.position.y = Math.sin(t * 0.9) * 5;
        scanRef.current.material.opacity = 0.03 + Math.abs(Math.sin(t * 0.9)) * 0.08;
      }

      ptMain.position.x = Math.cos(t * 0.25) * 12;
      ptMain.position.z = Math.sin(t * 0.25) * 10;

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
    };
  }, []);

  // ── Toggle auto-rotate ──────────────────────────────────────────
  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  // ── Toggle thermal blobs ─────────────────────────────────────────
  useEffect(() => {
    objectsRef.current.forEach(item => {
      if (item.blob)     item.blob.visible = showThermal;
      if (item.blobCore) item.blobCore.visible = showThermal;
      if (item.ring)     item.ring.visible = showThermal;
      if (item.pLight)   item.pLight.visible = showThermal;
    });
  }, [showThermal]);

  // ── Scan pipeline ────────────────────────────────────────────────
  const startScan = useCallback(() => {
    if (scanActive) return;
    setScanActive(true);
    setScanPct(0);
    setDetCount(0);
    addLog('LIDAR SCAN INITIATED — Aerial survey: v3_AvatarG0008_test.mp4');
    addLog('Pass 1/12: Sweeping circular tank perimeter...');

    let pct = 0, det = 0;
    const logs2 = [
      [10, 'LiDAR: Tank Base mapped — 24,440 pts'],
      [20, 'LiDAR: Access Road triangulated — 12,820 pts'],
      [30, 'LiDAR: Equipment laydown profiled — 8,950 pts'],
      [40, 'THERMAL IR: Heat signatures scan active...'],
      [45, 'THERMAL: Ambient baseline 28.1°C (outdoor)'],
      [55, 'THERMAL DETECT: WRK-01 38.8°C (0.87 conf) — Tank Rebar'],
      [65, 'THERMAL DETECT: WRK-02 38.5°C (0.77 conf) — Tank Rebar'],
      [75, 'THERMAL DETECT: WRK-03 39.1°C (0.55 conf) — Tank Concrete Pour'],
      [85, 'THERMAL DETECT: WRK-04 38.7°C (0.49 conf) — Road Inspector'],
      [90, '3D MESH: Generating site point cloud...'],
      [95, 'TWIN SYNC: Uploading state to Z-DRONE cloud...'],
    ];

    const iv = setInterval(() => {
      pct += 1.5;
      setScanPct(Math.min(Math.round(pct), 100));
      const triggered = logs2.filter(([p]) => p <= pct);
      triggered.forEach(([p, msg]) => {
        if (!logs2.find(x => x[0] === p && x[2])) {
          logs2.find(x => x[0] === p)[2] = true;
          addLog(msg);
          if (msg.startsWith('THERMAL DETECT') || msg.startsWith('YOLO DETECT')) {
            det++;
            setDetCount(det);
          }
        }
      });
      if (pct >= 100) {
        clearInterval(iv);
        setScanActive(false);
        addLog('──────────────────────────────────');
        addLog('SCAN COMPLETE: 4 workers detected');
        addLog('Digital Twin LIVE — Tank Site Sync: ACTIVE');
      }
    }, 90);
  }, [scanActive, addLog]);

  const resetScan = useCallback(() => {
    setScanActive(false);
    setScanPct(0);
    setDetCount(0);
    setLogs([
      '> Z-DRONE Digital Twin Engine v3.0',
      '> Source: v3_AvatarG0008_test.mp4 — Circular Tank Construction',
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
              style={{ width: `${scanPct}%`, boxShadow: '0 0 12px 2px #00e5ff', transition: 'width 0.09s linear' }} />
          </div>
        )}

        {/* ── Top-left facility overview ───────────────────────── */}
        <div className="absolute top-14 left-4 z-20">
          <div className="bg-[#010d1a]/85 backdrop-blur border border-[#003344] rounded px-3 py-2 text-[9px] space-y-1">
            <div className="text-[#00e5ff] font-bold tracking-wider mb-1">FACILITY OVERVIEW</div>
            <div className="text-[#00e5ff] opacity-65">{ZONES.length} Zones Mapped</div>
            <div style={{ color: '#ff2d78' }}>{detCount} / {TRACKED.length} Objects Detected</div>
            <div className="text-[#00e5ff] opacity-55">Coverage: {scanPct}%</div>
            <div className="text-[#00e5ff] opacity-40 mt-1 text-[8px]">Source: v3_AvatarG0008_test.mp4</div>
          </div>
        </div>

        {/* ── Right — zone list ────────────────────────────────── */}
        <div className="absolute top-14 right-4 z-20 space-y-1">
          {ZONES.map((z, i) => {
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

        {/* ── Camera HUD ────────────────────────────────────────── */}
        <div className="absolute bottom-32 left-4 z-20">
          <div className="bg-[#010d1a]/80 backdrop-blur border border-[#002233] rounded px-2.5 py-1.5 text-[8px] space-y-0.5 pointer-events-none">
            <div className="text-[#00e5ff] font-bold text-[7px] tracking-widest">VIRTUAL CAM</div>
            <div className="text-[#00e5ff] opacity-55">Pos [{camPos.x}, {camPos.y}, {camPos.z}]</div>
            <div className="text-[#00e5ff] opacity-45">WebGL 2.0 · 60FPS</div>
          </div>
        </div>

        {/* ── Detection badges (bottom-left) ───────────────────── */}
        {detCount > 0 && (
          <div className="absolute bottom-20 left-4 z-20 flex gap-1.5 flex-wrap max-w-[200px]">
            {TRACKED.slice(0, detCount).map(t => (
              <div key={t.id} className="bg-[#010d1a]/90 backdrop-blur border rounded px-2 py-1 text-[7px]"
                style={{ borderColor: t.color + '55' }}>
                <div className="font-bold" style={{ color: t.color }}>{t.id}</div>
                <div className="opacity-55 text-[6px]" style={{ color: t.color }}>{t.cls}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── LIVE VIDEO FEED HUD (Synced to frames) ────────────────── */}
        <div className="absolute top-14 left-44 z-20 w-[180px] rounded overflow-hidden border border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.2)] bg-[#010d1a]/80 backdrop-blur">
            <div className="px-2 py-1 text-[7px] text-[#00e5ff] font-bold tracking-widest border-b border-[#00e5ff]/30 flex justify-between">
                <span>DRONE FEED</span>
                <span className="opacity-60">FRM {currentFrame.toString().padStart(4, '0')}</span>
            </div>
            <div className="relative aspect-video">
                <img 
                    src={`/digital_twin/frames2/frame_${currentFrame.toString().padStart(4, '0')}.jpg`} 
                    alt="Drone Feed"
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-[0.5px] border-[#ff2d78] pointer-events-none opacity-40 m-[2px]" />
                <div className="absolute top-1 right-1 h-1 w-1 rounded-full bg-[#ff2d78] animate-pulse" />
            </div>
        </div>

        {/* ── System Console ────────────────────────────────────── */}
        <div className="absolute bottom-4 right-4 z-20 w-72 bg-[#010d1a]/92 backdrop-blur border border-[#003344] rounded overflow-hidden"
          style={{ height: '165px' }}>
          <div className="px-3 py-1.5 border-b border-[#002233] flex justify-between items-center">
            <span className="text-[#00e5ff] text-[8px] font-bold tracking-widest">SYSTEM CONSOLE</span>
            <div className="flex gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-[#ff2d78] animate-pulse" />
              <div className="h-1.5 w-1.5 rounded-full bg-[#00e5ff]" />
            </div>
          </div>
          <div className="p-2 overflow-y-auto text-[7.5px] space-y-0.5 scrollbar-none"
            style={{ height: 'calc(100% - 30px)' }}>
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

      {/* ── TIMELINE SCRUBBER ────────────────────────────────────── */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[80%] max-w-[500px] z-30 pointer-events-auto">
        <div className="flex items-center gap-4 bg-[#010d1a]/85 backdrop-blur border border-[#003344] px-4 py-1.5 rounded-full shadow-lg">
            <span className="text-[#00e5ff] text-[9px] font-bold tracking-wider w-12 text-right">
               {((currentFrame / 30).toFixed(1))}s
            </span>
            <input 
                id="twin-timeline"
                type="range" 
                min="0" 
                max={MAX_FRAMES - 1} 
                value={currentFrame}
                onChange={e => setCurrentFrame(parseInt(e.target.value))}
                className="flex-1 h-1 bg-[#002233] rounded-lg appearance-none cursor-pointer outline-none"
                style={{
                   background: `linear-gradient(to right, #00e5ff ${(currentFrame / (MAX_FRAMES - 1)) * 100}%, #002233 ${(currentFrame / (MAX_FRAMES - 1)) * 100}%)`
                }}
            />
            <span className="text-[#00e5ff] text-[9px] opacity-60 tracking-wider">
               FRM {currentFrame.toString().padStart(4, '0')} / {MAX_FRAMES - 1}
            </span>
        </div>
      </div>

      {/* ── BOTTOM CONTROLS (Positioned absolutely or as part of the wrapper) ────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-5 py-3 border-t border-[#003344] bg-[#010d1a] gap-4 flex-wrap z-30 translate-y-full">
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
            { label: 'THERMAL IR', state: showThermal, toggle: () => setShowThermal(v => !v), activeColor: '#ff2d78' },
            { label: 'WIREFRAME',  state: showWireframe, toggle: () => setShowWireframe(v => !v), activeColor: '#00e5ff' },
            { label: 'AUTO-ROTATE', state: autoRotate, toggle: () => setAutoRotate(v => !v), activeColor: '#00e5ff' },
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
              style={{ width: `${scanPct}%`, background: 'linear-gradient(90deg,#003344,#00e5ff)', boxShadow: '0 0 6px #00e5ff', transition: 'width 0.09s' }} />
          </div>
          <span className="font-mono">{scanPct}%</span>
        </div>
      </div>
    </div>
  );
}
