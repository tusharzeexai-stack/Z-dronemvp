import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ── BUILDING FLOOR PLAN LAYOUT ─────────────────────────────────
// Each room: [x, z, width, depth, label, type]
const ROOMS = [
  { id: 'R1', x: -6,  z: -4,  w: 5,  d: 4,  label: 'Control Room',   type: 'control'   },
  { id: 'R2', x:  0,  z: -4,  w: 6,  d: 4,  label: 'Operations Bay', type: 'ops'       },
  { id: 'R3', x:  6,  z: -4,  w: 4,  d: 4,  label: 'Server Rack',    type: 'server'    },
  { id: 'R4', x: -6,  z:  2,  w: 5,  d: 5,  label: 'Drone Bay A',    type: 'bay'       },
  { id: 'R5', x:  0,  z:  2,  w: 6,  d: 5,  label: 'Central Hub',    type: 'hub'       },
  { id: 'R6', x:  6,  z:  2,  w: 4,  d: 5,  label: 'Drone Bay B',    type: 'bay'       },
  { id: 'R7', x: -3,  z:  8,  w: 10, d: 4,  label: 'Hangar',         type: 'hangar'    },
];

// ── TRACKED PERSONNEL (simulated heat signatures) ──────────────
const PERSONNEL = [
  { id: 'P-01', room: 'R1', color: '#ff2d78', name: 'Operator',  role: 'Flight Controller',  heat: 0.92 },
  { id: 'P-02', room: 'R2', color: '#ff6b35', name: 'Tech',      role: 'Systems Analyst',    heat: 0.85 },
  { id: 'P-03', room: 'R2', color: '#ff2d78', name: 'Engineer',  role: 'Payload Specialist', heat: 0.88 },
  { id: 'P-04', room: 'R5', color: '#ff3399', name: 'Commander', role: 'Mission Lead',       heat: 0.95 },
  { id: 'P-05', room: 'R7', color: '#ff6b35', name: 'Crew-A',   role: 'Ground Handler',     heat: 0.80 },
  { id: 'P-06', room: 'R7', color: '#ff6b35', name: 'Crew-B',   role: 'Ground Handler',     heat: 0.78 },
];

const WALL_HEIGHT = 2.4;
const WALL_THICKNESS = 0.18;
const CYAN = new THREE.Color(0x00d4ff);
const CYAN_DIM = new THREE.Color(0x0088aa);

// Room center helper
const roomCenter = (r) => ({ x: r.x + r.w / 2, z: r.z + r.d / 2 });

// ══════════════════════════════════════════════════════════════
function DigitalTwinSection() {
  const mountRef       = useRef(null);
  const rendererRef    = useRef(null);
  const sceneRef       = useRef(null);
  const cameraRef      = useRef(null);
  const controlsRef    = useRef(null);
  const rafRef         = useRef(null);
  const clockRef       = useRef(new THREE.Clock());
  const heatBlobsRef   = useRef([]);    // { mesh, baseY, person }
  const personMeshRef  = useRef({});   // { id: mesh }
  const scanLineRef    = useRef(null);
  const consoleEndRef  = useRef(null);

  const [scanActive, setScanActive]       = useState(false);
  const [scanProgress, setScanProgress]   = useState(0);
  const [detectedCount, setDetectedCount] = useState(0);
  const [activeRoom, setActiveRoom]       = useState(null);
  const [showThermal, setShowThermal]     = useState(true);
  const [showWireframe, setShowWireframe] = useState(false);
  const [consoleLogs, setConsoleLogs]     = useState([
    '> Z-DRONE Digital Twin Engine v3.0',
    '> Holographic scan module: READY',
    '> LiDAR point cloud: awaiting trigger...',
    '> Thermal IR camera: STANDBY',
  ]);

  const addLog = useCallback((msg) => {
    setConsoleLogs(p => {
      const next = [...p, `> ${msg}`];
      return next.length > 40 ? next.slice(-40) : next;
    });
  }, []);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  // ── THREE.JS SCENE BUILD ─────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth;
    const H = el.clientHeight || 560;

    // ── Renderer ─────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x010b14, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.innerHTML = '';
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Scene ─────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010b14, 0.025);
    sceneRef.current = scene;

    // ── Camera ────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 300);
    camera.position.set(18, 20, 22);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // ── Controls ──────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.minDistance = 10;
    controls.maxDistance = 60;
    controlsRef.current = controls;

    // ── Lighting ──────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x001520, 2.0));

    const pointLightCyan = new THREE.PointLight(0x00d4ff, 1.8, 40);
    pointLightCyan.position.set(0, 12, 0);
    scene.add(pointLightCyan);

    const pointLightBlue = new THREE.PointLight(0x0044ff, 0.8, 30);
    pointLightBlue.position.set(-8, 6, -6);
    scene.add(pointLightBlue);

    // ── Grid Floor ────────────────────────────────────────────
    const gridMat = new THREE.LineBasicMaterial({ color: 0x002233, transparent: true, opacity: 0.8 });
    const gridSize = 40;
    const gridDiv  = 40;
    const step = gridSize / gridDiv;
    const gridGrp = new THREE.Group();

    for (let i = 0; i <= gridDiv; i++) {
      const p = -gridSize / 2 + i * step;
      const hGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-gridSize / 2, 0, p),
        new THREE.Vector3(gridSize / 2, 0, p),
      ]);
      const vGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p, 0, -gridSize / 2),
        new THREE.Vector3(p, 0, gridSize / 2),
      ]);
      gridGrp.add(new THREE.Line(hGeo, gridMat));
      gridGrp.add(new THREE.Line(vGeo, gridMat));
    }
    gridGrp.position.y = -0.01;
    scene.add(gridGrp);

    // Ground plane (dark, receives light)
    const gndGeo = new THREE.PlaneGeometry(80, 80);
    const gndMat = new THREE.MeshStandardMaterial({ color: 0x000d18, roughness: 1, metalness: 0 });
    const gnd = new THREE.Mesh(gndGeo, gndMat);
    gnd.rotation.x = -Math.PI / 2;
    gnd.receiveShadow = true;
    scene.add(gnd);

    // ── Materials ─────────────────────────────────────────────
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x003344,
      emissive: 0x00aabb,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.55,
      roughness: 0.4,
      metalness: 0.6,
      side: THREE.DoubleSide,
    });

    const wallEdgeMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.9,
    });

    const floorMat = (type) => new THREE.MeshStandardMaterial({
      color: type === 'hub'    ? 0x001a2f :
             type === 'server' ? 0x001422 : 0x000f1a,
      emissive: type === 'hub'    ? 0x004466 :
                type === 'server' ? 0x002244 : 0x001133,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.7,
      roughness: 0.8,
    });

    // ── Build Rooms ───────────────────────────────────────────
    ROOMS.forEach(room => {
      const cx = room.x + room.w / 2;
      const cz = room.z + room.d / 2;

      // Floor tile
      const floorGeo = new THREE.PlaneGeometry(room.w - 0.1, room.d - 0.1);
      const floor = new THREE.Mesh(floorGeo, floorMat(room.type));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0.01, cz);
      floor.receiveShadow = true;
      floor.userData = { roomId: room.id, roomLabel: room.label };
      scene.add(floor);

      // ── 4 Walls as edge-glowing thin boxes ───────────────
      const walls = [
        // North
        { pos: [cx, WALL_HEIGHT / 2, room.z],              size: [room.w, WALL_HEIGHT, WALL_THICKNESS] },
        // South
        { pos: [cx, WALL_HEIGHT / 2, room.z + room.d],     size: [room.w, WALL_HEIGHT, WALL_THICKNESS] },
        // West
        { pos: [room.x, WALL_HEIGHT / 2, cz],              size: [WALL_THICKNESS, WALL_HEIGHT, room.d] },
        // East
        { pos: [room.x + room.w, WALL_HEIGHT / 2, cz],     size: [WALL_THICKNESS, WALL_HEIGHT, room.d] },
      ];

      walls.forEach(w => {
        const geo = new THREE.BoxGeometry(...w.size);
        const mesh = new THREE.Mesh(geo, wallMat.clone());
        mesh.position.set(...w.pos);
        mesh.castShadow = true;
        scene.add(mesh);

        // Glowing edge wireframe
        const edges = new THREE.EdgesGeometry(geo);
        const edgeLines = new THREE.LineSegments(edges, wallEdgeMat.clone());
        edgeLines.position.set(...w.pos);
        scene.add(edgeLines);
      });

      // Room label sprite (canvas texture)
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 256; labelCanvas.height = 48;
      const lctx = labelCanvas.getContext('2d');
      lctx.clearRect(0, 0, 256, 48);
      lctx.fillStyle = 'rgba(0,212,255,0.85)';
      lctx.font = 'bold 20px monospace';
      lctx.fillText(room.label.toUpperCase(), 8, 32);
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, opacity: 0.9 }));
      labelSprite.position.set(cx, WALL_HEIGHT + 0.6, cz);
      labelSprite.scale.set(3.5, 0.65, 1);
      scene.add(labelSprite);
    });

    // ── Thermal Heat Blobs (per person) ──────────────────────
    heatBlobsRef.current = [];
    PERSONNEL.forEach((person, idx) => {
      const room = ROOMS.find(r => r.id === person.room);
      if (!room) return;
      const rc = roomCenter(room);

      // Offset slightly within room
      const offsetX = (Math.cos(idx * 2.1) * room.w * 0.25);
      const offsetZ = (Math.sin(idx * 1.7) * room.d * 0.25);

      // Thermal blob — large soft glow plane on floor
      const blobGeo = new THREE.CircleGeometry(1.2, 32);
      const blobTex = createHeatBlobTexture(person.color);
      const blobMat = new THREE.MeshBasicMaterial({
        map: blobTex,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.set(rc.x + offsetX, 0.04, rc.z + offsetZ);
      scene.add(blob);

      // Inner hot core (brighter)
      const coreGeo = new THREE.CircleGeometry(0.4, 24);
      const coreTex = createHeatBlobTexture('#ffffff', person.color);
      const coreMat = new THREE.MeshBasicMaterial({
        map: coreTex,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.rotation.x = -Math.PI / 2;
      core.position.set(rc.x + offsetX, 0.05, rc.z + offsetZ);
      scene.add(core);

      // ── Realistic Human Figure ───────────────────────────────
      const fig = new THREE.Group();
      fig.position.set(rc.x + offsetX, 0, rc.z + offsetZ);
      scene.add(fig);

      const bodyColor = new THREE.Color(person.color);
      const mkMat = (emissInt = 0.75) => new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyColor,
        emissiveIntensity: emissInt,
        transparent: true,
        opacity: 0.92,
        roughness: 0.18,
        metalness: 0.05,
      });

      const P = (geo, x, y, z, rx=0, ry=0, rz=0) => {
        const m = new THREE.Mesh(geo, mkMat());
        m.position.set(x, y, z);
        m.rotation.set(rx, ry, rz);
        m.castShadow = true;
        fig.add(m);
      };

      // ── HEAD (smooth oval, slightly taller than wide) ────────
      const headGeo = new THREE.SphereGeometry(0.145, 20, 20);
      headGeo.scale(1, 1.15, 0.95);
      P(headGeo, 0, 1.70, 0);

      // ── NECK ─────────────────────────────────────────────────
      P(new THREE.CylinderGeometry(0.055, 0.072, 0.13, 14), 0, 1.555, 0);

      // ── TORSO — LatheGeometry for organic taper ───────────────
      // Points trace half-profile: hip → waist → chest → shoulder
      const torsoProfile = [
        new THREE.Vector2(0.155, 0),     // hip width
        new THREE.Vector2(0.165, 0.08),  // lower hip flare
        new THREE.Vector2(0.105, 0.26),  // waist (narrow)
        new THREE.Vector2(0.155, 0.40),  // ribcage
        new THREE.Vector2(0.185, 0.52),  // chest
        new THREE.Vector2(0.175, 0.58),  // shoulder slope
      ];
      P(new THREE.LatheGeometry(torsoProfile, 20), 0, 0.91, 0);

      // ── SHOULDER SPHERES ──────────────────────────────────────
      P(new THREE.SphereGeometry(0.082, 14, 14), -0.225, 1.44, 0);
      P(new THREE.SphereGeometry(0.082, 14, 14),  0.225, 1.44, 0);

      // ── UPPER ARMS (slight outward angle) ────────────────────
      P(new THREE.CylinderGeometry(0.062, 0.052, 0.36, 14), -0.255, 1.21, 0,  0, 0,  0.14);
      P(new THREE.CylinderGeometry(0.062, 0.052, 0.36, 14),  0.255, 1.21, 0,  0, 0, -0.14);

      // ── ELBOW SPHERES ─────────────────────────────────────────
      P(new THREE.SphereGeometry(0.058, 12, 12), -0.29, 1.00, 0);
      P(new THREE.SphereGeometry(0.058, 12, 12),  0.29, 1.00, 0);

      // ── FOREARMS ─────────────────────────────────────────────
      P(new THREE.CylinderGeometry(0.048, 0.038, 0.33, 14), -0.305, 0.79, 0,  0, 0,  0.10);
      P(new THREE.CylinderGeometry(0.048, 0.038, 0.33, 14),  0.305, 0.79, 0,  0, 0, -0.10);

      // ── WRIST + HAND (oval blob) ──────────────────────────────
      const handGeo = new THREE.SphereGeometry(0.050, 12, 12);
      handGeo.scale(1.1, 0.75, 0.7);
      P(handGeo, -0.315, 0.60, 0.01);
      P(handGeo.clone(), 0.315, 0.60, 0.01);

      // ── PELVIS SPHERE (rounds the hip join) ───────────────────
      P(new THREE.SphereGeometry(0.12, 14, 14), 0, 0.93, 0);

      // ── HIP JOINT SPHERES ─────────────────────────────────────
      P(new THREE.SphereGeometry(0.078, 12, 12), -0.12, 0.88, 0);
      P(new THREE.SphereGeometry(0.078, 12, 12),  0.12, 0.88, 0);

      // ── THIGHS (tapered, high-poly) ───────────────────────────
      P(new THREE.CylinderGeometry(0.092, 0.072, 0.44, 16), -0.12, 0.63, 0);
      P(new THREE.CylinderGeometry(0.092, 0.072, 0.44, 16),  0.12, 0.63, 0);

      // ── KNEE SPHERES ──────────────────────────────────────────
      P(new THREE.SphereGeometry(0.072, 12, 12), -0.12, 0.39, 0);
      P(new THREE.SphereGeometry(0.072, 12, 12),  0.12, 0.39, 0);

      // ── CALVES (slight taper) ─────────────────────────────────
      P(new THREE.CylinderGeometry(0.065, 0.048, 0.40, 16), -0.12, 0.16, 0);
      P(new THREE.CylinderGeometry(0.065, 0.048, 0.40, 16),  0.12, 0.16, 0);

      // ── ANKLE SPHERES ─────────────────────────────────────────
      P(new THREE.SphereGeometry(0.048, 12, 12), -0.12, -0.04, 0.01);
      P(new THREE.SphereGeometry(0.048, 12, 12),  0.12, -0.04, 0.01);

      // ── FEET (elongated box, angled forward) ──────────────────
      const footShape = new THREE.BoxGeometry(0.095, 0.055, 0.24);
      footShape.translate(0, 0, 0.06); // shift forward
      P(footShape,        -0.12, -0.06, 0.0);
      P(footShape.clone(), 0.12, -0.06, 0.0);

      // Glowing ring at feet
      const ringGeo = new THREE.RingGeometry(0.25, 0.38, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(person.color),
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(rc.x + offsetX, 0.06, rc.z + offsetZ);
      scene.add(ring);

      // Point light per person
      const pLight = new THREE.PointLight(new THREE.Color(person.color), 0.8, 4);
      pLight.position.set(rc.x + offsetX, 1.2, rc.z + offsetZ);
      scene.add(pLight);

      heatBlobsRef.current.push({
        blob, core, fig, ring, pLight,
        baseX: rc.x + offsetX, baseZ: rc.z + offsetZ,
        phase: idx * 1.2,
        person,
      });
      personMeshRef.current[person.id] = { blob, core, fig, ring };
    });

    // ── LiDAR Scan Plane ──────────────────────────────────────
    const scanGeo = new THREE.PlaneGeometry(36, 36);
    const scanMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const scanPlane = new THREE.Mesh(scanGeo, scanMat);
    scanPlane.rotation.x = Math.PI / 2;
    scanPlane.position.y = -2;
    scene.add(scanPlane);
    scanLineRef.current = scanPlane;

    // ── Floating Particle Dust ────────────────────────────────
    const ptCount = 400;
    const ptGeo = new THREE.BufferGeometry();
    const ptPos = new Float32Array(ptCount * 3);
    for (let i = 0; i < ptCount; i++) {
      ptPos[i * 3]     = (Math.random() - 0.5) * 28;
      ptPos[i * 3 + 1] = Math.random() * 5;
      ptPos[i * 3 + 2] = (Math.random() - 0.5) * 24;
    }
    ptGeo.setAttribute('position', new THREE.BufferAttribute(ptPos, 3));
    const ptMat = new THREE.PointsMaterial({
      color: 0x00d4ff, size: 0.06, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Points(ptGeo, ptMat));

    // ── Vertical corner pillars glow ──────────────────────────
    const pillarPositions = [[-8.5, -5.5], [8.5, -5.5], [-8.5, 11], [8.5, 11]];
    pillarPositions.forEach(([px, pz]) => {
      const geo = new THREE.CylinderGeometry(0.08, 0.08, WALL_HEIGHT, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6 });
      const pillar = new THREE.Mesh(geo, mat);
      pillar.position.set(px, WALL_HEIGHT / 2, pz);
      scene.add(pillar);
    });

    // ── Animate ───────────────────────────────────────────────
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const t = clockRef.current.getElapsedTime();

      // Pulse heat blobs
      heatBlobsRef.current.forEach((item) => {
        const pulse = 0.7 + Math.sin(t * 2.5 + item.phase) * 0.3;
        item.blob.material.opacity  = pulse * 0.65;
        item.core.material.opacity  = (0.8 + Math.sin(t * 4 + item.phase) * 0.2) * 0.9;
        item.ring.material.opacity  = pulse * 0.7;
        item.pLight.intensity = 0.6 + Math.sin(t * 3 + item.phase) * 0.4;

        // Subtle sway
        item.fig.position.x = item.baseX + Math.sin(t * 0.8 + item.phase) * 0.06;
        item.fig.position.z = item.baseZ + Math.cos(t * 0.8 + item.phase) * 0.04;
        item.fig.rotation.y = t * 0.2 + item.phase;
      });

      // Rotate centre point light
      pointLightCyan.position.x = Math.cos(t * 0.3) * 6;
      pointLightCyan.position.z = Math.sin(t * 0.3) * 5;

      // Scan plane sweep (if scanning)
      if (scanLineRef.current) {
        const scanY = Math.sin(t * 1.2) * 3.5;
        scanLineRef.current.position.y = scanY;
        scanLineRef.current.material.opacity = 0.04 + Math.abs(Math.sin(t * 1.2)) * 0.08;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── Resize ────────────────────────────────────────────────
    const onResize = () => {
      if (!el || !renderer || !camera) return;
      const w = el.clientWidth;
      const h = el.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      el.innerHTML = '';
    };
  }, []);

  // ── Toggle thermal visibility ────────────────────────────────
  useEffect(() => {
    heatBlobsRef.current.forEach(item => {
      item.blob.visible = showThermal;
      item.core.visible = showThermal;
      item.ring.visible = showThermal;
      item.pLight.visible = showThermal;
    });
  }, [showThermal]);

  // ── Toggle wireframe overlay ─────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.traverse(obj => {
      if (obj.isMesh && obj.material && !obj.material.map) {
        if (obj.material.transparent && obj.material.opacity < 0.9) {
          obj.material.wireframe = showWireframe;
          obj.material.needsUpdate = true;
        }
      }
    });
  }, [showWireframe]);

  // ── Simulate Scan Pipeline ───────────────────────────────────
  const startScan = useCallback(() => {
    setScanActive(true);
    setScanProgress(0);
    setDetectedCount(0);
    addLog('LIDAR SCAN INITIATED — Sweeping structure...');

    let progress = 0;
    let detected = 0;
    const interval = setInterval(() => {
      progress += 2;
      setScanProgress(progress);

      if (progress === 20) addLog('LiDAR: Ceiling mapped — 14,820 pts captured');
      if (progress === 35) addLog('LiDAR: Walls triangulated — 28,450 pts');
      if (progress === 50) {
        addLog('THERMAL IR: Scanning for heat signatures...');
        addLog('THERMAL: Ambient baseline 18.4°C detected');
      }
      if (progress >= 55 && detected < PERSONNEL.length) {
        const p = PERSONNEL[detected];
        detected++;
        setDetectedCount(detected);
        addLog(`THERMAL DETECT: ${p.id} (${p.name}) — ${p.role} — Heat: ${(p.heat * 38 + 0.5).toFixed(1)}°C`);
      }
      if (progress === 80) addLog('3D MESH: Generating holographic floor plan...');
      if (progress === 90) addLog('TWIN SYNC: Uploading state to Z-DRONE cloud...');
      if (progress >= 100) {
        clearInterval(interval);
        setScanActive(false);
        setScanProgress(100);
        addLog('──────────────────────────────────');
        addLog(`SCAN COMPLETE: ${PERSONNEL.length} personnel / ${ROOMS.length} zones`);
        addLog('Digital Twin LIVE — Real-time sync: ACTIVE');
      }
    }, 120);
  }, [addLog]);

  const resetScan = useCallback(() => {
    setScanProgress(0);
    setScanActive(false);
    setDetectedCount(0);
    setConsoleLogs([
      '> Z-DRONE Digital Twin Engine v3.0',
      '> System reset. LiDAR: READY.',
      '> Thermal IR camera: STANDBY',
    ]);
  }, []);

  return (
    <div className="flex flex-col gap-0 bg-[#010b14] rounded-2xl overflow-hidden border border-[#003344] shadow-2xl" style={{ fontFamily: 'monospace' }}>

      {/* ── TOP HUD HEADER ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#003344] bg-[#010d1a]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#00e5ff] animate-pulse shadow-[0_0_6px_#00e5ff]"></div>
            <div className="h-2 w-2 rounded-full bg-[#00e5ff] opacity-60"></div>
            <div className="h-2 w-2 rounded-full bg-[#00e5ff] opacity-30"></div>
          </div>
          <span className="text-[#00e5ff] font-bold text-xs tracking-[0.2em] uppercase">Z-DRONE :: DIGITAL TWIN HOLOGRAPHIC SCAN</span>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="text-[#00e5ff] opacity-60">LiDAR: {scanProgress > 0 ? `${scanProgress}%` : 'IDLE'}</span>
          <span className="text-[#ff2d78]">THERMAL: {detectedCount > 0 ? `${detectedCount} DETECTED` : 'STANDBY'}</span>
          <span className="text-[#00e5ff] opacity-50">{new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* ── MAIN VIEWPORT ─────────────────────────────────────── */}
      <div className="relative" style={{ height: '560px' }}>
        {/* Scan line overlay */}
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-none">
          <div
            className="absolute inset-0"
            style={{
              background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,212,255,0.015) 3px, rgba(0,212,255,0.015) 4px)',
            }}
          ></div>
          {/* Subtle vignette */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,5,15,0.6) 100%)' }}></div>
        </div>

        {/* Three.js Canvas Container */}
        <div ref={mountRef} className="absolute inset-0" />

        {/* ── Scan Progress Bar (horizontal sweep effect) ─────── */}
        {scanActive && (
          <div className="absolute top-0 left-0 right-0 h-0.5 z-20">
            <div
              className="h-full bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent transition-all duration-100"
              style={{ width: `${scanProgress}%`, boxShadow: '0 0 12px 2px #00e5ff' }}
            />
          </div>
        )}

        {/* ── Top-left HUD badges ─────────────────────────────── */}
        <div className="absolute top-4 left-4 z-20 space-y-2">
          <div className="bg-[#010d1a]/80 backdrop-blur border border-[#003344] rounded px-3 py-1.5 text-[9px] space-y-0.5">
            <div className="text-[#00e5ff] font-bold tracking-wider">FACILITY OVERVIEW</div>
            <div className="text-[#00e5ff] opacity-60">{ROOMS.length} Zones Mapped</div>
            <div className="text-[#ff2d78]">{detectedCount} / {PERSONNEL.length} Personnel</div>
            <div className="text-[#00e5ff] opacity-60">Coverage: {scanProgress}%</div>
          </div>
        </div>

        {/* ── Right side — Zone status list ───────────────────── */}
        <div className="absolute top-4 right-4 z-20 space-y-1.5">
          {ROOMS.map(room => {
            const roomPersonnel = PERSONNEL.filter(p => p.room === room.id);
            const isDetected = detectedCount >= PERSONNEL.findIndex(p => p.room === room.id) + 1;
            return (
              <div
                key={room.id}
                className="bg-[#010d1a]/80 backdrop-blur border rounded px-2.5 py-1 text-[9px] cursor-pointer transition-all hover:border-[#00e5ff]"
                style={{ borderColor: roomPersonnel.length > 0 ? '#003344' : '#002233' }}
                onClick={() => setActiveRoom(activeRoom === room.id ? null : room.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#00e5ff] opacity-80 font-bold">{room.id}</span>
                  <span className="text-[#00e5ff] opacity-50 text-[8px] flex-1">{room.label}</span>
                  {roomPersonnel.length > 0 ? (
                    <span className="text-[#ff2d78] font-bold animate-pulse">●{roomPersonnel.length}</span>
                  ) : (
                    <span className="text-[#00e5ff] opacity-30">○</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Bottom Console ───────────────────────────────────── */}
        <div className="absolute bottom-4 right-4 z-20 w-72 bg-[#010d1a]/90 backdrop-blur border border-[#003344] rounded overflow-hidden" style={{ height: '160px' }}>
          <div className="px-3 py-1.5 border-b border-[#002233] flex justify-between items-center">
            <span className="text-[#00e5ff] text-[8px] font-bold tracking-widest">SYSTEM CONSOLE</span>
            <div className="flex gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-[#ff2d78] animate-pulse"></div>
              <div className="h-1.5 w-1.5 rounded-full bg-[#00e5ff]"></div>
            </div>
          </div>
          <div className="p-2 h-[calc(100%-32px)] overflow-y-auto text-[8px] space-y-0.5 scrollbar-none">
            {consoleLogs.map((log, i) => (
              <div key={i} className={`leading-relaxed ${
                log.includes('THERMAL DETECT') ? 'text-[#ff2d78]' :
                log.includes('COMPLETE')       ? 'text-[#00ff88]' :
                log.includes('LIDAR')          ? 'text-[#00e5ff]' :
                log.includes('──')             ? 'text-[#003344]' :
                'text-[#00e5ff] opacity-60'
              }`}>{log}</div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>

        {/* ── Bottom Personnel Cards ───────────────────────────── */}
        {detectedCount > 0 && (
          <div className="absolute bottom-4 left-4 z-20 flex gap-2 flex-wrap max-w-xs">
            {PERSONNEL.slice(0, detectedCount).map(p => (
              <div
                key={p.id}
                className="bg-[#010d1a]/90 backdrop-blur border rounded px-2 py-1.5 text-[8px]"
                style={{ borderColor: p.color + '55' }}
              >
                <div className="font-bold" style={{ color: p.color }}>{p.id}</div>
                <div className="text-[#00e5ff] opacity-60 text-[7px]">{(p.heat * 38 + 0.5).toFixed(1)}°C</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── BOTTOM CONTROLS ───────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-[#003344] bg-[#010d1a] gap-4 flex-wrap">
        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={startScan}
            disabled={scanActive}
            className="px-4 py-2 text-[10px] font-bold rounded border transition-all disabled:opacity-40 tracking-widest"
            style={{
              background: scanActive ? 'transparent' : 'rgba(0,229,255,0.1)',
              borderColor: '#00e5ff',
              color: '#00e5ff',
              boxShadow: scanActive ? 'none' : '0 0 12px rgba(0,229,255,0.3)',
            }}
          >
            {scanActive ? '⟳ SCANNING...' : '▶ INITIATE LIDAR SCAN'}
          </button>

          <button
            onClick={resetScan}
            className="px-3 py-2 text-[10px] font-bold rounded border border-[#003344] text-[#00e5ff] opacity-60 hover:opacity-100 transition-all tracking-widest"
          >
            RESET
          </button>
        </div>

        {/* Toggle Controls */}
        <div className="flex gap-3 items-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setShowThermal(v => !v)}
              className="w-8 h-4 rounded-full transition-all relative cursor-pointer"
              style={{ background: showThermal ? '#ff2d78' : '#003344', boxShadow: showThermal ? '0 0 8px #ff2d78' : 'none' }}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${showThermal ? 'left-4' : 'left-0.5'}`}></div>
            </div>
            <span className="text-[9px] tracking-widest" style={{ color: showThermal ? '#ff2d78' : '#00e5ff66' }}>THERMAL IR</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setShowWireframe(v => !v)}
              className="w-8 h-4 rounded-full transition-all relative cursor-pointer"
              style={{ background: showWireframe ? '#00e5ff' : '#003344', boxShadow: showWireframe ? '0 0 8px #00e5ff' : 'none' }}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${showWireframe ? 'left-4' : 'left-0.5'}`}></div>
            </div>
            <span className="text-[9px] tracking-widest" style={{ color: showWireframe ? '#00e5ff' : '#00e5ff66' }}>WIREFRAME</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => { if (controlsRef.current) controlsRef.current.autoRotate = !controlsRef.current.autoRotate; }}
              className="w-8 h-4 rounded-full transition-all relative cursor-pointer bg-[#003344]"
            >
              <div className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white"></div>
            </div>
            <span className="text-[9px] tracking-widest text-[#00e5ff66]">AUTO-ROTATE</span>
          </label>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 text-[9px] text-[#00e5ff] opacity-60">
          <span className="tracking-widest">SCAN</span>
          <div className="w-32 h-1 rounded-full bg-[#002233] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                width: `${scanProgress}%`,
                background: 'linear-gradient(90deg, #003344, #00e5ff)',
                boxShadow: '0 0 6px #00e5ff',
              }}
            />
          </div>
          <span className="font-mono">{scanProgress}%</span>
        </div>
      </div>
    </div>
  );
}

// ── Canvas Texture: Radial heat blob ────────────────────────────
function createHeatBlobTexture(centerColor, outerColor) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2, r = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0,   centerColor);
  grad.addColorStop(0.3, outerColor || centerColor);
  grad.addColorStop(1,   'transparent');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

export default DigitalTwinSection;
