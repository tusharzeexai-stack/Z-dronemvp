import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCTION SITE ZONES — Mapped from test1.mp4 aerial footage
// ─────────────────────────────────────────────────────────────────────────────
const ZONES = [
  { id: 'Z1', x: -14, z: -10, w: 10, d: 8,  label: 'Excavation North',  type: 'excavation' },
  { id: 'Z2', x: -2,  z: -10, w: 9,  d: 8,  label: 'Foundation Zone A', type: 'foundation' },
  { id: 'Z3', x:  8,  z: -10, w: 8,  d: 8,  label: 'Pipe Laydown',       type: 'pipe'       },
  { id: 'Z4', x: -14, z:  0,  w: 10, d: 9,  label: 'Excavation South',   type: 'excavation' },
  { id: 'Z5', x: -2,  z:  0,  w: 9,  d: 9,  label: 'Central Works',      type: 'central'    },
  { id: 'Z6', x:  8,  z:  0,  w: 8,  d: 9,  label: 'Material Store',     type: 'storage'    },
  { id: 'Z7', x: -6,  z:  10, w: 14, d: 7,  label: 'Site Access Road',   type: 'road'       },
];

// ─────────────────────────────────────────────────────────────────────────────
// TRACKED OBJECTS — From YOLO v8n + ByteTrack on test1.mp4
// ─────────────────────────────────────────────────────────────────────────────
const TRACKED = [
  // Excavators (yellow)
  { id: 'EXC-01', zone: 'Z1', cls: 'Excavator',  color: '#f59e0b', heat: 0.95, name: 'CAT 336 Excavator',   role: 'Dig North Face'   },
  { id: 'EXC-02', zone: 'Z5', cls: 'Excavator',  color: '#eab308', heat: 0.90, name: 'CAT 320 Excavator',   role: 'Foundation Trench' },
  { id: 'EXC-03', zone: 'Z3', cls: 'Excavator',  color: '#f59e0b', heat: 0.88, name: 'CAT 323 Excavator',   role: 'Pipe Lay Assist'  },
  // White vehicle
  { id: 'VEH-01', zone: 'Z7', cls: 'Vehicle',    color: '#e2e8f0', heat: 0.65, name: 'Site Pickup (White)', role: 'Supervisor Patrol' },
  // Workers (hi-vis)
  { id: 'WRK-01', zone: 'Z2', cls: 'Worker',     color: '#ff2d78', heat: 0.92, name: 'Worker A',            role: 'Foundation Crew'  },
  { id: 'WRK-02', zone: 'Z2', cls: 'Worker',     color: '#ff6b35', heat: 0.89, name: 'Worker B',            role: 'Foundation Crew'  },
  { id: 'WRK-03', zone: 'Z5', cls: 'Worker',     color: '#ff2d78', heat: 0.91, name: 'Worker C',            role: 'Central Works'    },
  { id: 'WRK-04', zone: 'Z4', cls: 'Worker',     color: '#fb923c', heat: 0.87, name: 'Worker D',            role: 'Excavation South' },
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
export default function DigitalTwinSection() {
  const mountRef     = useRef(null);
  const rafRef       = useRef(null);
  const clockRef     = useRef(new THREE.Clock());
  const controlsRef  = useRef(null);
  const objectsRef   = useRef([]);     // { group, baseX, baseZ, phase, obj, pLight }
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
    '> Source: test1.mp4 — Construction Site Survey',
    '> LiDAR: 14-pass aerial scan — READY',
    '> YOLO v8n + ByteTrack: STANDBY',
    '> Awaiting scan trigger...',
  ]);
  const [activeZone, setActiveZone] = useState(null);
  const [camPos, setCamPos] = useState({ x: 0, y: 0, z: 0 });

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
    camera.position.set(20, 22, 28);
    camera.lookAt(0, 0, 2);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.32;
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
    const GS = 50, GD = 50;
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
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: 0x000d18, roughness: 1 })
    );
    gnd.rotation.x = -Math.PI / 2;
    gnd.receiveShadow = true;
    scene.add(gnd);

    // ── Terrain dirt mounds (from video) ───────────────────────
    const dirtMat = new THREE.MeshStandardMaterial({
      color: 0x001a28, emissive: 0x004466, emissiveIntensity: 0.12,
      transparent: true, opacity: 0.55, roughness: 0.9,
    });
    const moundPositions = [
      [-8, 0, -4, 3.5, 0.9, 2.5],
      [ 4, 0, -6, 2.8, 0.7, 2.0],
      [-4, 0,  4, 4.0, 1.1, 2.8],
      [ 9, 0,  3, 2.5, 0.6, 2.0],
      [-12,0, -3, 3.0, 1.2, 2.2],
      [ 2, 0,  1, 2.0, 0.5, 2.5],
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
        new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.2 })
      );
      el2.position.copy(mound.position);
      el2.scale.copy(mound.scale);
      el2.rotation.copy(mound.rotation);
      scene.add(el2);
    });

    // ── Zone outlines (site perimeter & zones) ─────────────────
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x002233, emissive: 0x00aabb, emissiveIntensity: 0.18,
      transparent: true, opacity: 0.45, roughness: 0.4, side: THREE.DoubleSide,
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85 });

    const FENCE_H = 1.6;
    ZONES.forEach(zone => {
      const cx = zone.x + zone.w / 2, cz = zone.z + zone.d / 2;

      // Zone floor
      const floorGeo = new THREE.PlaneGeometry(zone.w - 0.1, zone.d - 0.1);
      const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
        color: zone.type === 'road' ? 0x001428 : zone.type === 'central' ? 0x001a2f : 0x000f1c,
        emissive: zone.type === 'road' ? 0x002244 : zone.type === 'central' ? 0x004466 : 0x001133,
        emissiveIntensity: 0.38,
        transparent: true, opacity: 0.6, roughness: 0.9,
      }));
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(cx, 0.01, cz);
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);

      // 4 low fence walls
      [
        { pos: [cx, FENCE_H/2, zone.z],          size: [zone.w, FENCE_H, 0.12] },
        { pos: [cx, FENCE_H/2, zone.z + zone.d], size: [zone.w, FENCE_H, 0.12] },
        { pos: [zone.x, FENCE_H/2, cz],          size: [0.12, FENCE_H, zone.d] },
        { pos: [zone.x + zone.w, FENCE_H/2, cz], size: [0.12, FENCE_H, zone.d] },
      ].forEach(w => {
        const wallGeo = new THREE.BoxGeometry(...w.size);
        const wall = new THREE.Mesh(wallGeo, wallMat.clone());
        wall.position.set(...w.pos);
        wall.castShadow = true;
        scene.add(wall);
        const el3 = new THREE.LineSegments(
          new THREE.EdgesGeometry(wallGeo),
          edgeMat.clone()
        );
        el3.position.set(...w.pos);
        scene.add(el3);
      });

      // Zone label sprite
      const lc = document.createElement('canvas');
      lc.width = 300; lc.height = 48;
      const lctx = lc.getContext('2d');
      lctx.fillStyle = '#00e5ff';
      lctx.font = 'bold 18px monospace';
      lctx.fillText(zone.label.toUpperCase(), 4, 32);
      const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(lc), transparent: true, opacity: 0.85
      }));
      labelSprite.position.set(cx, FENCE_H + 0.7, cz);
      labelSprite.scale.set(4.5, 0.7, 1);
      scene.add(labelSprite);
    });

    // ── Excavator models (from video — big yellow CATs) ─────────
    const mkExcavator = (x, z, rot, color) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.rotation.y = rot;
      const bodyC = new THREE.Color(color);
      const eMat  = (em = 0.5) => new THREE.MeshStandardMaterial({
        color: bodyC, emissive: bodyC, emissiveIntensity: em,
        transparent: true, opacity: 0.9, roughness: 0.3, metalness: 0.3,
      });

      // Lower body / tracks
      const tracks = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.2), eMat(0.3));
      tracks.position.y = 0.28;
      grp.add(tracks);
      // Upper body cab
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.0), eMat(0.5));
      cab.position.set(-0.1, 1.0, 0);
      grp.add(cab);
      // Boom arm (long)
      const boom = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), eMat(0.6));
      boom.position.set(0.7, 1.8, 0);
      boom.rotation.z = -Math.PI / 5;
      grp.add(boom);
      // Stick arm
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), eMat(0.6));
      stick.position.set(1.6, 1.2, 0);
      stick.rotation.z = Math.PI / 4;
      grp.add(stick);
      // Bucket
      const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.6), eMat(0.7));
      bucket.position.set(2.2, 0.5, 0);
      grp.add(bucket);

      // Glowing ring
      const rg = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 28),
        new THREE.MeshBasicMaterial({ color: bodyC, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      rg.rotation.x = -Math.PI / 2;
      rg.position.y = 0.02;
      grp.add(rg);

      scene.add(grp);
      return grp;
    };

    mkExcavator(-9.5, -6,  0.8, '#f59e0b');
    mkExcavator( 2,   -4,  -0.3, '#eab308');
    mkExcavator( 10,  -5,  Math.PI / 3, '#f59e0b');

    // ── White vehicle model ─────────────────────────────────────
    const mkVehicle = (x, z) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      const vMat = new THREE.MeshStandardMaterial({
        color: 0xd0e8f0, emissive: 0x4488aa, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.88, roughness: 0.2, metalness: 0.4,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 0.9), vMat);
      body.position.y = 0.6;
      grp.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.85), vMat);
      roof.position.set(-0.2, 1.08, 0);
      grp.add(roof);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.4, 24),
        new THREE.MeshBasicMaterial({ color: 0xd0e8f0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      grp.add(ring);
      scene.add(grp);
      return grp;
    };
    const vehicleGrp = mkVehicle(0, 12);

    // ── Worker figures (realistic human) ────────────────────────
    const mkWorker = (x, z, color, phase) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
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
      // Head
      const hg = new THREE.SphereGeometry(0.14, 18, 18);
      hg.scale(1, 1.12, 0.95);
      P(hg, 0, 1.68, 0);
      // Neck
      P(new THREE.CylinderGeometry(0.052, 0.068, 0.12, 12), 0, 1.55, 0);
      // Torso (LatheGeometry organic)
      P(new THREE.LatheGeometry([
        new THREE.Vector2(0.15, 0), new THREE.Vector2(0.16, 0.08),
        new THREE.Vector2(0.10, 0.25), new THREE.Vector2(0.15, 0.38),
        new THREE.Vector2(0.18, 0.50), new THREE.Vector2(0.17, 0.56),
      ], 18), 0, 0.90, 0);
      // Shoulder spheres
      P(new THREE.SphereGeometry(0.078, 12, 12), -0.22, 1.42, 0);
      P(new THREE.SphereGeometry(0.078, 12, 12),  0.22, 1.42, 0);
      // Upper arms
      P(new THREE.CylinderGeometry(0.058, 0.048, 0.34, 12), -0.245, 1.20, 0, 0, 0, 0.14);
      P(new THREE.CylinderGeometry(0.058, 0.048, 0.34, 12),  0.245, 1.20, 0, 0, 0,-0.14);
      // Elbow spheres
      P(new THREE.SphereGeometry(0.054, 10, 10), -0.28, 0.99, 0);
      P(new THREE.SphereGeometry(0.054, 10, 10),  0.28, 0.99, 0);
      // Forearms
      P(new THREE.CylinderGeometry(0.044, 0.035, 0.30, 12), -0.295, 0.78, 0, 0, 0, 0.10);
      P(new THREE.CylinderGeometry(0.044, 0.035, 0.30, 12),  0.295, 0.78, 0, 0, 0,-0.10);
      // Hands
      const hnd = new THREE.SphereGeometry(0.046, 10, 10); hnd.scale(1.1, 0.7, 0.7);
      P(hnd, -0.305, 0.60, 0); P(hnd.clone(),  0.305, 0.60, 0);
      // Pelvis
      P(new THREE.SphereGeometry(0.115, 12, 12), 0, 0.91, 0);
      // Hip joints
      P(new THREE.SphereGeometry(0.074, 10, 10), -0.115, 0.86, 0);
      P(new THREE.SphereGeometry(0.074, 10, 10),  0.115, 0.86, 0);
      // Thighs
      P(new THREE.CylinderGeometry(0.088, 0.068, 0.42, 14), -0.115, 0.62, 0);
      P(new THREE.CylinderGeometry(0.088, 0.068, 0.42, 14),  0.115, 0.62, 0);
      // Knee spheres
      P(new THREE.SphereGeometry(0.068, 10, 10), -0.115, 0.38, 0);
      P(new THREE.SphereGeometry(0.068, 10, 10),  0.115, 0.38, 0);
      // Calves
      P(new THREE.CylinderGeometry(0.062, 0.046, 0.38, 14), -0.115, 0.15, 0);
      P(new THREE.CylinderGeometry(0.062, 0.046, 0.38, 14),  0.115, 0.15, 0);
      // Ankles
      P(new THREE.SphereGeometry(0.044, 10, 10), -0.115, -0.04, 0.01);
      P(new THREE.SphereGeometry(0.044, 10, 10),  0.115, -0.04, 0.01);
      // Feet
      const ft = new THREE.BoxGeometry(0.09, 0.05, 0.22); ft.translate(0, 0, 0.06);
      P(ft, -0.115, -0.06, 0); P(ft.clone(), 0.115, -0.06, 0);

      // Thermal blob under feet
      const blob = new THREE.Mesh(
        new THREE.CircleGeometry(1.0, 28),
        new THREE.MeshBasicMaterial({ map: createHeatTex(color), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.set(x, 0.04, z);
      scene.add(blob);

      const blobCore = new THREE.Mesh(
        new THREE.CircleGeometry(0.35, 20),
        new THREE.MeshBasicMaterial({ map: createHeatTex('#ffffff', color), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      blobCore.rotation.x = -Math.PI / 2;
      blobCore.position.set(x, 0.05, z);
      scene.add(blobCore);

      // Glowing ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.34, 22),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.06, z);
      scene.add(ring);

      const pLight = new THREE.PointLight(c, 0.7, 4);
      pLight.position.set(x, 1.2, z);
      scene.add(pLight);

      scene.add(grp);
      return { grp, blob, blobCore, ring, pLight, baseX: x, baseZ: z, phase, color: c };
    };

    // Place workers based on YOLO positions from video frames
    const workerObjects = [
      mkWorker(-4.5, -5.5, '#ff2d78', 0.0),
      mkWorker(-2.8, -6.5, '#ff6b35', 1.1),
      mkWorker( 1.5, -2.0, '#ff2d78', 2.3),
      mkWorker(-8.5,  2.0, '#fb923c', 3.4),
    ];
    objectsRef.current = workerObjects;

    // ── LiDAR drone model ────────────────────────────────────────
    const droneGrp = new THREE.Group();
    droneGrp.position.set(-6, 14, -4);
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
      new THREE.ConeGeometry(4, 14, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.05, side: THREE.DoubleSide })
    );
    cone.position.y = -7;
    droneGrp.add(cone);

    // ── LiDAR sweep plane ────────────────────────────────────────
    const scanPl = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 44),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    scanPl.rotation.x = Math.PI / 2;
    scene.add(scanPl);
    scanRef.current = scanPl;

    // ── Floating dust particles ───────────────────────────────────
    const ptGeo = new THREE.BufferGeometry();
    const ptArr = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i++) {
      ptArr[i*3]   = (Math.random()-0.5)*44;
      ptArr[i*3+1] = Math.random()*8;
      ptArr[i*3+2] = (Math.random()-0.5)*38;
    }
    ptGeo.setAttribute('position', new THREE.BufferAttribute(ptArr, 3));
    scene.add(new THREE.Points(ptGeo, new THREE.PointsMaterial({
      color: 0x00d4ff, size: 0.06, transparent: true, opacity: 0.45,
      depthWrite: false, blending: THREE.AdditiveBlending
    })));

    // ── Surrounding trees (background from video) ────────────────
    [[18, -14], [-20, -14], [18, 14], [-20, 14]].forEach(([x, z]) => {
      const tMat = new THREE.MeshStandardMaterial({
        color: 0x002233, emissive: 0x004422, emissiveIntensity: 0.2,
        transparent: true, opacity: 0.5, wireframe: false,
      });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.5, 6), tMat);
      trunk.position.set(x, 1.25, z);
      scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), tMat.clone());
      crown.position.set(x, 3.5, z);
      crown.scale.set(1, 0.85, 1);
      scene.add(crown);
    });

    // ── Perimeter site fence (outer boundary) ────────────────────
    const fenceMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.3 });
    const fencePoints = [
      [-18, 0, -14], [18, 0, -14], [18, 0, 18], [-18, 0, 18], [-18, 0, -14]
    ].map(p => new THREE.Vector3(...p));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(fencePoints), fenceMat));
    const fenceTop = fencePoints.map(p => p.clone().setY(2.0));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(fenceTop), fenceMat));
    // Vertical posts
    [[-18,-14],[18,-14],[18,18],[-18,18],[-18,0],[18,0],[0,-14],[0,18]].forEach(([x,z]) => {
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,0,z), new THREE.Vector3(x,2.0,z)]),
        fenceMat
      ));
    });

    // ── Animation loop ───────────────────────────────────────────
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const t = clockRef.current.getElapsedTime();

      // Worker animations
      objectsRef.current.forEach(item => {
        const pulse = 0.65 + Math.sin(t * 2.5 + item.phase) * 0.32;
        if (item.blob)     item.blob.material.opacity = pulse * 0.65;
        if (item.blobCore) item.blobCore.material.opacity = 0.85 + Math.sin(t * 4 + item.phase) * 0.15;
        if (item.ring)     item.ring.material.opacity = pulse * 0.7;
        if (item.pLight)   item.pLight.intensity = 0.5 + Math.sin(t * 3 + item.phase) * 0.45;
        // Subtle breathing/sway
        item.grp.position.x = item.baseX + Math.sin(t * 0.7 + item.phase) * 0.05;
        item.grp.position.z = item.baseZ + Math.cos(t * 0.7 + item.phase) * 0.03;
        item.grp.rotation.y = Math.sin(t * 0.2 + item.phase) * 0.15;
      });

      // Vehicle patrol
      vehicleGrp.position.x = Math.sin(t * 0.22) * 7;
      vehicleGrp.position.z = 12 + Math.cos(t * 0.22) * 3;
      vehicleGrp.rotation.y = -t * 0.22 + Math.PI;

      // Drone hover + patrol
      if (droneRef.current) {
        droneRef.current.position.x = -6 + Math.cos(t * 0.3) * 5;
        droneRef.current.position.y = 14 + Math.sin(t * 1.5) * 0.5;
        droneRef.current.position.z = -4 + Math.sin(t * 0.3) * 4;
        droneRef.current.rotation.y = t * 0.12;
        rotors.forEach((r, i) => { r.rotation.y += (i % 2 === 0 ? 1 : -1) * 0.9; });
      }

      // Scan plane sweep
      if (scanRef.current) {
        scanRef.current.position.y = Math.sin(t * 0.9) * 5;
        scanRef.current.material.opacity = 0.03 + Math.abs(Math.sin(t * 0.9)) * 0.08;
      }

      // ptMain slow orbit
      ptMain.position.x = Math.cos(t * 0.25) * 8;
      ptMain.position.z = Math.sin(t * 0.25) * 6;

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
    addLog('LIDAR SCAN INITIATED — Aerial survey: test1.mp4');
    addLog('Pass 1/14: Sweeping construction site perimeter...');

    let pct = 0, det = 0;
    const logs2 = [
      [10, 'LiDAR: North excavation zone mapped — 12,440 pts'],
      [20, 'LiDAR: Foundation Zone A triangulated — 18,820 pts'],
      [30, 'LiDAR: Dirt mounds profiled — 8,950 pts'],
      [40, 'THERMAL IR: Heat signatures scan active...'],
      [45, 'THERMAL: Ambient baseline 24.1°C (outdoor)'],
      [50, 'YOLO DETECT: EXC-01 CAT 336 — conf:0.94 @ Z1'],
      [55, 'YOLO DETECT: EXC-02 CAT 320 — conf:0.91 @ Z5'],
      [60, 'YOLO DETECT: EXC-03 CAT 323 — conf:0.89 @ Z3'],
      [65, 'YOLO DETECT: VEH-01 White Pickup — conf:0.96 @ Z7'],
      [70, 'THERMAL DETECT: WRK-01 38.8°C — Foundation Crew'],
      [75, 'THERMAL DETECT: WRK-02 38.5°C — Foundation Crew'],
      [80, 'THERMAL DETECT: WRK-03 39.1°C — Central Works'],
      [85, 'THERMAL DETECT: WRK-04 38.7°C — South Excavation'],
      [90, '3D MESH: Generating construction site point cloud...'],
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
        addLog('SCAN COMPLETE: 4 workers / 3 excavators / 1 vehicle');
        addLog('Digital Twin LIVE — Construction Site Sync: ACTIVE');
      }
    }, 90);
  }, [scanActive, addLog]);

  const resetScan = useCallback(() => {
    setScanActive(false);
    setScanPct(0);
    setDetCount(0);
    setLogs([
      '> Z-DRONE Digital Twin Engine v3.0',
      '> Source: test1.mp4 — Construction Site Survey',
      '> System reset. LiDAR: READY.',
    ]);
  }, []);

  return (
    <div style={{ fontFamily: 'monospace' }} className="flex flex-col bg-[#010b14] rounded-2xl overflow-hidden border border-[#003344] shadow-2xl">

      {/* ── TOP HUD ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#003344] bg-[#010d1a]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {[1, 0.6, 0.3].map((o, i) => (
              <div key={i} className="h-2 w-2 rounded-full bg-[#00e5ff]" style={{ opacity: o, boxShadow: i === 0 ? '0 0 6px #00e5ff' : 'none' }} />
            ))}
          </div>
          <span className="text-[#00e5ff] font-bold text-xs tracking-[0.18em] uppercase">Z-DRONE :: Digital Twin — Construction Site (test1.mp4)</span>
        </div>
        <div className="flex items-center gap-5 text-[9px]">
          <span className="text-[#00e5ff] opacity-60">LIDAR: {scanPct > 0 ? `${scanPct}%` : 'IDLE'}</span>
          <span style={{ color: '#ff2d78' }}>THERMAL: {detCount > 0 ? `${detCount} DETECTED` : 'STANDBY'}</span>
          <span className="text-[#00e5ff] opacity-40">{new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* ── VIEWPORT ─────────────────────────────────────────────── */}
      <div className="relative" style={{ height: '560px' }}>
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
        <div className="absolute top-4 left-4 z-20">
          <div className="bg-[#010d1a]/85 backdrop-blur border border-[#003344] rounded px-3 py-2 text-[9px] space-y-1">
            <div className="text-[#00e5ff] font-bold tracking-wider mb-1">FACILITY OVERVIEW</div>
            <div className="text-[#00e5ff] opacity-65">{ZONES.length} Zones Mapped</div>
            <div style={{ color: '#ff2d78' }}>{detCount} / {TRACKED.length} Objects Detected</div>
            <div className="text-[#00e5ff] opacity-55">Coverage: {scanPct}%</div>
            <div className="text-[#00e5ff] opacity-40 mt-1 text-[8px]">Source: test1.mp4</div>
          </div>
        </div>

        {/* ── Right — zone list ────────────────────────────────── */}
        <div className="absolute top-4 right-4 z-20 space-y-1">
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
          <div className="absolute bottom-4 left-4 z-20 flex gap-1.5 flex-wrap max-w-[200px]">
            {TRACKED.slice(0, detCount).map(t => (
              <div key={t.id} className="bg-[#010d1a]/90 backdrop-blur border rounded px-2 py-1 text-[7px]"
                style={{ borderColor: t.color + '55' }}>
                <div className="font-bold" style={{ color: t.color }}>{t.id}</div>
                <div className="opacity-55 text-[6px]" style={{ color: t.color }}>{t.cls}</div>
              </div>
            ))}
          </div>
        )}

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
      </div>

      {/* ── BOTTOM CONTROLS ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-[#003344] bg-[#010d1a] gap-4 flex-wrap">
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
