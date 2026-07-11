import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ── SYNTHETIC DETECTION DATA (simulates YOLO + ByteTrack + MediaPipe output) ──
// In production this would come from backend FastAPI processing pipeline
const generateDetections = (frameIdx) => {
  const seed = frameIdx * 31337;
  const rng = (s) => (Math.sin(s) * 43758.5453) % 1;
  const detections = [];

  // Person 1 — walks left to right
  if (frameIdx < 13) {
    const cx = 0.15 + (frameIdx / 14) * 0.45;
    const cy = 0.52 + Math.sin(frameIdx * 0.8) * 0.04;
    detections.push({
      trackId: 'TRK-01', cls: 'Person', conf: 0.91 + rng(seed) * 0.07,
      bbox: { x: cx - 0.06, y: cy - 0.20, w: 0.12, h: 0.40 },
      pose: generatePose(cx, cy, frameIdx, 0),
      pos3d: { x: parseFloat((-3.5 + cx * 7).toFixed(2)), y: 0, z: parseFloat((1.5 + Math.sin(frameIdx) * 0.3).toFixed(2)) },
      speed: parseFloat((1.2 + rng(seed + 1) * 0.4).toFixed(2)),
      color: '#22d3ee',
    });
  }

  // Person 2 — stationary then moves
  if (frameIdx >= 2) {
    const cx = 0.72 - Math.max(0, (frameIdx - 8) / 7) * 0.15;
    const cy = 0.55;
    detections.push({
      trackId: 'TRK-02', cls: 'Person', conf: 0.84 + rng(seed + 5) * 0.1,
      bbox: { x: cx - 0.055, y: cy - 0.22, w: 0.11, h: 0.44 },
      pose: generatePose(cx, cy, frameIdx, Math.PI / 6),
      pos3d: { x: parseFloat((-3.5 + cx * 7).toFixed(2)), y: 0, z: parseFloat((-1.2 + Math.cos(frameIdx * 0.5) * 0.2).toFixed(2)) },
      speed: parseFloat(rng(seed + 2) * 0.6).toFixed(2),
      color: '#a78bfa',
    });
  }

  // Vehicle appearing in later frames
  if (frameIdx >= 6 && frameIdx <= 14) {
    const cx = 0.55 - (frameIdx - 6) / 8 * 0.2;
    const cy = 0.68;
    detections.push({
      trackId: 'TRK-03', cls: 'Vehicle', conf: 0.77 + rng(seed + 9) * 0.15,
      bbox: { x: cx - 0.12, y: cy - 0.12, w: 0.24, h: 0.24 },
      pose: null,
      pos3d: { x: parseFloat((-3.5 + cx * 7).toFixed(2)), y: 0.5, z: parseFloat((2.8 - (frameIdx - 6) * 0.1).toFixed(2)) },
      speed: parseFloat((3.5 + rng(seed + 10) * 1.2).toFixed(2)),
      color: '#fb923c',
    });
  }

  return detections;
};

// 17-keypoint MediaPipe Pose skeleton
const generatePose = (cx, cy, frameIdx, phaseMod) => {
  const t = frameIdx * 0.4 + phaseMod;
  const walkSwing = Math.sin(t) * 0.035;
  const w = 0.12, h = 0.40;

  // Normalize 0-1 proportions within bounding box
  const kp = (dx, dy) => ({ x: cx + dx * w, y: cy - h / 2 + dy * h });
  const headY = 0.07;
  const shoulderY = 0.2;
  const hipY = 0.52;
  const kneeY = 0.74;
  const ankleY = 0.95;

  return {
    nose:    kp(0, headY),
    lEye:    kp(-0.15, headY - 0.03),
    rEye:    kp(0.15, headY - 0.03),
    lEar:    kp(-0.28, headY),
    rEar:    kp(0.28, headY),
    lShoulder: kp(-0.35 + walkSwing, shoulderY),
    rShoulder: kp(0.35 - walkSwing, shoulderY),
    lElbow:  kp(-0.5 - walkSwing, shoulderY + 0.15),
    rElbow:  kp(0.5 + walkSwing, shoulderY + 0.15),
    lWrist:  kp(-0.4 - walkSwing * 2, shoulderY + 0.27),
    rWrist:  kp(0.4 + walkSwing * 2, shoulderY + 0.27),
    lHip:    kp(-0.18, hipY),
    rHip:    kp(0.18, hipY),
    lKnee:   kp(-0.18 + walkSwing, kneeY),
    rKnee:   kp(0.18 - walkSwing, kneeY),
    lAnkle:  kp(-0.18 - walkSwing, ankleY),
    rAnkle:  kp(0.18 + walkSwing, ankleY),
  };
};

// Skeleton edge connections (MediaPipe topology)
const SKELETON_EDGES = [
  ['nose', 'lEye'], ['nose', 'rEye'], ['lEye', 'lEar'], ['rEye', 'rEar'],
  ['lEar', 'lShoulder'], ['rEar', 'rShoulder'],
  ['lShoulder', 'rShoulder'],
  ['lShoulder', 'lElbow'], ['lElbow', 'lWrist'],
  ['rShoulder', 'rElbow'], ['rElbow', 'rWrist'],
  ['lShoulder', 'lHip'], ['rShoulder', 'rHip'],
  ['lHip', 'rHip'],
  ['lHip', 'lKnee'], ['lKnee', 'lAnkle'],
  ['rHip', 'rKnee'], ['rKnee', 'rAnkle'],
];

// Extracted frames from pipeline
const FRAMES = Array.from({ length: 15 }, (_, i) => ({
  index: i,
  src: `/digital_twin/frames/frame_${String(i).padStart(2, '0')}.jpg`,
  ts: `00:00:${String(i * 2).padStart(2, '0')}`,
  detections: generateDetections(i),
}));

// Pipeline stage configs
const PIPELINE_STAGES = [
  { id: 'extract',  label: 'Frame Extraction',    icon: 'burst_mode',    color: 'sky' },
  { id: 'detect',   label: 'Object Detection',     icon: 'manage_search', color: 'violet' },
  { id: 'track',    label: 'Multi-Object Tracking',icon: 'timeline',      color: 'amber' },
  { id: 'pose',     label: 'Pose Estimation',      icon: 'accessibility', color: 'emerald' },
  { id: 'lift',     label: '3D Position Lifting',  icon: '3d_rotation',   color: 'rose' },
  { id: 'twin',     label: 'Digital Twin Sync',    icon: 'hub',           color: 'indigo' },
];

// ══════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════
function DigitalTwinSection() {
  // ── Refs ────────────────────────────────────────────
  const videoRef        = useRef(null);
  const canvasRef       = useRef(null);   // 2D detection overlay canvas
  const threeContRef    = useRef(null);   // Three.js container div
  const rendererRef     = useRef(null);
  const sceneRef        = useRef(null);
  const cameraRef       = useRef(null);
  const controlsRef     = useRef(null);
  const rafRef          = useRef(null);
  const consoleEndRef   = useRef(null);
  const animFrameRef    = useRef(null);

  // ── UI State ─────────────────────────────────────────
  const [viewMode, setViewMode]               = useState('video');    // video | detect | twin
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineDone, setPipelineDone]       = useState(false);
  const [stageProgress, setStageProgress]     = useState({});         // { stageId: pct }
  const [activeStageIdx, setActiveStageIdx]   = useState(-1);

  // ── Data State ────────────────────────────────────────
  const [frameIdx, setFrameIdx]               = useState(0);
  const [revealedCount, setRevealedCount]     = useState(0);
  const [allDetections, setAllDetections]     = useState([]);         // flat list of all detected objs
  const [twinObjects, setTwinObjects]         = useState([]);         // live twin state objects
  const [consoleLogs, setConsoleLogs]         = useState([
    '[SYSTEM] Digital Twin Engine v2.0 — Ready.',
    '[SYSTEM] Source: public/test1.mp4 (30FPS / 31.06s / 931 frames)',
    '[SYSTEM] Target: 15 keyframes @ 0.5Hz decimation',
    '[SYSTEM] Detection backend: YOLO v8n + ByteTrack + MediaPipe Pose',
    '[SYSTEM] Awaiting pipeline trigger...',
  ]);
  const [displayMode3d, setDisplayMode3d]     = useState('shaded');   // shaded | wireframe | points

  // Three.js object ref dict for live updates
  const twinMeshMapRef = useRef({});
  const pointCloudRef  = useRef(null);
  const laserRef       = useRef(null);
  const droneGroupRef  = useRef(null);
  const terrainRef     = useRef(null);
  const [camPos, setCamPos]                   = useState({ x: 0, y: 0, z: 0 });

  // ── Console helper ────────────────────────────────────
  const addLog = useCallback((msg) => {
    setConsoleLogs(prev => {
      const next = [...prev, `[${new Date().toISOString().slice(11, 19)}] ${msg}`];
      return next.length > 80 ? next.slice(-80) : next;
    });
  }, []);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  // ── Pipeline Execution ────────────────────────────────
  const runPipeline = useCallback(() => {
    if (pipelineRunning) return;
    setPipelineRunning(true);
    setPipelineDone(false);
    setRevealedCount(0);
    setAllDetections([]);
    setTwinObjects([]);
    setStageProgress({});
    setActiveStageIdx(0);
    setFrameIdx(0);
    setViewMode('video');

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }

    addLog('>>> PIPELINE INITIATED');
    addLog('>>> Stage 1: Starting frame extraction from video source...');

    let fi = 0;
    let stagesDone = 0;

    // Stage 1: Extract frames (15 × 400ms = 6s)
    const extractInterval = setInterval(() => {
      fi++;
      setRevealedCount(fi);
      setFrameIdx(fi - 1);
      if (videoRef.current) videoRef.current.currentTime = (fi - 1) * 2;
      setStageProgress(prev => ({ ...prev, extract: Math.round((fi / 15) * 100) }));
      addLog(`[EXTRACT] frame_${String(fi - 1).padStart(2, '0')}.jpg — Keypoints: ${FRAMES[fi-1].detections.length > 0 ? '1,' + (180 + fi * 37).toString() : '0'}`);

      if (fi === 3) setViewMode('detect');
      if (fi === 15) {
        clearInterval(extractInterval);
        setStageProgress(prev => ({ ...prev, extract: 100 }));
        stagesDone++;
        setActiveStageIdx(1);
        addLog('>>> Stage 1 COMPLETE. 15 keyframes extracted.');
        addLog('>>> Stage 2: Running YOLO v8n inference on each frame...');

        // Stage 2+3: Detection + Tracking (10 steps × 300ms)
        let dIdx = 0;
        const allDets = [];
        const detInterval = setInterval(() => {
          dIdx++;
          const fi2 = Math.floor((dIdx / 10) * 15);
          setStageProgress(prev => ({
            ...prev,
            detect: Math.min(100, Math.round((dIdx / 10) * 100)),
            track: Math.min(100, Math.round(((dIdx - 5) / 5) * 100)),
          }));
          if (dIdx === 5) {
            setActiveStageIdx(2);
            addLog('>>> Stage 3: ByteTrack multi-object tracking running...');
          }
          // Accumulate detections
          const frameDets = FRAMES[Math.min(14, fi2)].detections;
          frameDets.forEach(d => {
            if (!allDets.find(x => x.trackId === d.trackId)) {
              allDets.push({ ...d, frameCount: 1 });
              addLog(`[DETECT] Track ${d.trackId} (${d.cls}) — conf:${d.conf.toFixed(2)} bbox:[${Object.values(d.bbox).map(v=>v.toFixed(2)).join(',')}]`);
            }
          });
          setAllDetections([...allDets]);

          if (dIdx >= 10) {
            clearInterval(detInterval);
            setStageProgress(prev => ({ ...prev, detect: 100, track: 100 }));
            stagesDone++;
            setActiveStageIdx(3);
            addLog('>>> Stage 2+3 COMPLETE. 3 unique tracks established.');
            addLog('>>> Stage 4: MediaPipe Pose estimation on person tracks...');

            // Stage 4: Pose (5 steps × 300ms)
            let pIdx = 0;
            const poseInterval = setInterval(() => {
              pIdx++;
              setStageProgress(prev => ({ ...prev, pose: Math.round((pIdx / 5) * 100) }));
              addLog(`[POSE] Estimated 17-keypoint skeleton for TRK-0${Math.min(pIdx, 2)}`);
              if (pIdx >= 5) {
                clearInterval(poseInterval);
                setStageProgress(prev => ({ ...prev, pose: 100 }));
                setActiveStageIdx(4);
                addLog('>>> Stage 4 COMPLETE. Skeletons estimated for 2 person tracks.');
                addLog('>>> Stage 5: solvePnP — lifting 2D detections to 3D world space...');

                // Stage 5: 3D lifting (5 steps × 300ms)
                let lIdx = 0;
                const liftInterval = setInterval(() => {
                  lIdx++;
                  setStageProgress(prev => ({ ...prev, lift: Math.round((lIdx / 5) * 100) }));
                  addLog(`[3D-LIFT] TRK-0${Math.min(lIdx, 3)} → pos3d: (${allDets[Math.min(lIdx-1, allDets.length-1)]?.pos3d?.x}, 0, ${allDets[Math.min(lIdx-1, allDets.length-1)]?.pos3d?.z}) m`);
                  if (lIdx >= 5) {
                    clearInterval(liftInterval);
                    setStageProgress(prev => ({ ...prev, lift: 100 }));
                    setActiveStageIdx(5);
                    addLog('>>> Stage 5 COMPLETE. All objects mapped to 3D world coordinates.');
                    addLog('>>> Stage 6: Syncing to Digital Twin state engine...');

                    // Stage 6: Twin sync (3 steps × 400ms)
                    let tIdx = 0;
                    const twinInterval = setInterval(() => {
                      tIdx++;
                      setStageProgress(prev => ({ ...prev, twin: Math.round((tIdx / 3) * 100) }));
                      const obj = allDets[Math.min(tIdx - 1, allDets.length - 1)];
                      if (obj) {
                        const twinState = {
                          trackId: obj.trackId, cls: obj.cls,
                          x: obj.pos3d.x, y: obj.pos3d.y, z: obj.pos3d.z,
                          speed: obj.speed, color: obj.color,
                          ts: new Date().toISOString()
                        };
                        setTwinObjects(prev => {
                          const exists = prev.find(p => p.trackId === obj.trackId);
                          return exists ? prev.map(p => p.trackId === obj.trackId ? twinState : p) : [...prev, twinState];
                        });
                        addLog(`[TWIN-SYNC] ${obj.trackId} state written → DB: { x:${obj.pos3d.x}, z:${obj.pos3d.z}, speed:${obj.speed} m/s }`);
                      }
                      if (tIdx >= 3) {
                        clearInterval(twinInterval);
                        setStageProgress(prev => ({ ...prev, twin: 100 }));
                        setActiveStageIdx(-1);
                        setPipelineRunning(false);
                        setPipelineDone(true);
                        setViewMode('twin');
                        addLog('>>> ✅ DIGITAL TWIN PIPELINE COMPLETE! All stages passed.');
                        addLog('>>> 3D twin is now LIVE and synchronized with real-time state engine.');
                      }
                    }, 400);
                  }
                }, 300);
              }
            }, 300);
          }
        }, 300);
      }
    }, 400);
  }, [pipelineRunning, addLog]);

  const resetPipeline = useCallback(() => {
    setPipelineRunning(false);
    setPipelineDone(false);
    setRevealedCount(0);
    setAllDetections([]);
    setTwinObjects([]);
    setStageProgress({});
    setActiveStageIdx(-1);
    setFrameIdx(0);
    setViewMode('video');
    if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.pause(); }
    setConsoleLogs([
      '[SYSTEM] Digital Twin Engine v2.0 — Pipeline reset.',
      '[SYSTEM] Source: public/test1.mp4 (30FPS / 31.06s / 931 frames)',
      '[SYSTEM] Awaiting pipeline trigger...',
    ]);
  }, []);

  // ── 2D Detection Canvas Draw ──────────────────────────
  const currentFrameDetections = FRAMES[frameIdx]?.detections || [];

  useEffect(() => {
    if (viewMode !== 'detect') return;
    const canvas = canvasRef.current;
    const img = new Image();
    img.src = FRAMES[frameIdx]?.src;
    img.onload = () => {
      if (!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const W = canvas.width;
      const H = canvas.height;

      currentFrameDetections.forEach(det => {
        const { bbox, pose, cls, trackId, conf, color } = det;
        const x = bbox.x * W, y = bbox.y * H, w = bbox.w * W, h = bbox.h * H;

        // Bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x, y, w, h);

        // Label pill
        const label = `${trackId} • ${cls} ${(conf * 100).toFixed(0)}%`;
        ctx.font = 'bold 11px monospace';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = color + 'cc';
        ctx.beginPath();
        ctx.roundRect(x - 1, y - 20, tw + 10, 18, 4);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillText(label, x + 4, y - 7);

        // Pose skeleton (persons only)
        if (pose && cls === 'Person') {
          // Draw edges
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 1.5;
          SKELETON_EDGES.forEach(([a, b]) => {
            const kA = pose[a], kB = pose[b];
            if (!kA || !kB) return;
            ctx.beginPath();
            ctx.moveTo(kA.x * W, kA.y * H);
            ctx.lineTo(kB.x * W, kB.y * H);
            ctx.stroke();
          });
          // Draw keypoints
          Object.values(pose).forEach(kp => {
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(kp.x * W, kp.y * H, 2.5, 0, Math.PI * 2);
            ctx.fill();
          });
        }

        // Center cross
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w / 2 - 5, y + h / 2);
        ctx.lineTo(x + w / 2 + 5, y + h / 2);
        ctx.moveTo(x + w / 2, y + h / 2 - 5);
        ctx.lineTo(x + w / 2, y + h / 2 + 5);
        ctx.stroke();
      });

      // HUD overlay
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, H - 22, W, 22);
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(
        `FRAME ${String(frameIdx).padStart(2, '0')}  |  YOLO v8n  |  ${currentFrameDetections.length} OBJECTS  |  TS: ${FRAMES[frameIdx]?.ts}`,
        8, H - 8
      );
    };
  }, [viewMode, frameIdx, currentFrameDetections]);

  // ── Three.js Scene Setup ──────────────────────────────
  useEffect(() => {
    if (viewMode !== 'twin' || !threeContRef.current) return;

    const el = threeContRef.current;
    const W = el.clientWidth;
    const H = el.clientHeight || 460;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const isDark = document.documentElement.classList.contains('dark');
    scene.background = new THREE.Color(isDark ? 0x060b14 : 0xf1f5f9);
    scene.fog = new THREE.FogExp2(isDark ? 0x060b14 : 0xf1f5f9, 0.018);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 300);
    camera.position.set(12, 10, 16);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.innerHTML = '';
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 4;
    controls.maxDistance = 80;
    controlsRef.current = controls;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.25 : 0.55));
    const dirLight = new THREE.DirectionalLight(0xffffff, isDark ? 1.4 : 1.2);
    dirLight.position.set(15, 25, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);

    // Grid / Ground Plane
    const grid = new THREE.GridHelper(40, 40, 0x0ea5e9, isDark ? 0x1e293b : 0xe2e8f0);
    grid.position.y = -0.01;
    scene.add(grid);

    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({ color: isDark ? 0x0b1120 : 0xf8fafc, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    terrainRef.current = ground;

    // ── Scanned Site Elements ─────────────────────────
    const matGrey = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85, metalness: 0.1 });

    // Building A — main structure
    const bldA = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 5), matGrey);
    bldA.position.set(-4, 1.5, -3);
    bldA.castShadow = true;
    bldA.receiveShadow = true;
    scene.add(bldA);

    // Building B — side wing
    const bldB = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2, 3), matGrey.clone());
    bldB.position.set(3, 1, -4);
    bldB.castShadow = true;
    scene.add(bldB);

    // Silo
    const siloCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 5, 16),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7, metalness: 0.25 })
    );
    siloCyl.position.set(5, 2.5, 1);
    siloCyl.castShadow = true;
    scene.add(siloCyl);

    // ── Point Cloud (Dense) ───────────────────────────
    const pcCount = 14000;
    const pcGeo = new THREE.BufferGeometry();
    const pcPos = new Float32Array(pcCount * 3);
    const pcCol = new Float32Array(pcCount * 3);

    for (let i = 0; i < pcCount; i++) {
      const px = (Math.random() - 0.5) * 38;
      const pz = (Math.random() - 0.5) * 38;
      const py = Math.max(0, Math.sin(px * 0.3) * Math.cos(pz * 0.3) * 0.8 + Math.random() * 0.3);

      pcPos[i * 3] = px;
      pcPos[i * 3 + 1] = py;
      pcPos[i * 3 + 2] = pz;

      const c = new THREE.Color();
      const hr = py / 1.5;
      c.setHSL(0.55 + hr * 0.25, 0.85, 0.5 + hr * 0.15);
      pcCol[i * 3] = c.r;
      pcCol[i * 3 + 1] = c.g;
      pcCol[i * 3 + 2] = c.b;
    }
    pcGeo.setAttribute('position', new THREE.BufferAttribute(pcPos, 3));
    pcGeo.setAttribute('color', new THREE.BufferAttribute(pcCol, 3));

    const pcMat = new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.8 });
    const pointCloud = new THREE.Points(pcGeo, pcMat);
    pointCloud.visible = false;
    scene.add(pointCloud);
    pointCloudRef.current = pointCloud;

    // ── Laser Scanner Plane ───────────────────────────
    const laserGeo = new THREE.PlaneGeometry(38, 38);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9, transparent: true, opacity: 0.06,
      side: THREE.DoubleSide
    });
    const laser = new THREE.Mesh(laserGeo, laserMat);
    laser.rotation.x = Math.PI / 2;
    scene.add(laser);
    laserRef.current = laser;

    // Laser glow line
    const laserLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-19, 0, 0), new THREE.Vector3(19, 0, 0)
    ]);
    const laserLineMat = new THREE.LineBasicMaterial({ color: 0x0ea5e9, linewidth: 2 });
    const laserLine = new THREE.Line(laserLineGeo, laserLineMat);
    laser.add(laserLine);

    // ── Drone Model ───────────────────────────────────
    const dGroup = new THREE.Group();
    dGroup.position.set(-5, 8, 3);
    scene.add(dGroup);
    droneGroupRef.current = dGroup;

    const bodyMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.28, 6),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.9 })
    );
    dGroup.add(bodyMesh);

    // Gimbal / camera
    const gimbal = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.1, metalness: 0.95, emissive: 0x0ea5e9, emissiveIntensity: 0.4 })
    );
    gimbal.position.y = -0.32;
    dGroup.add(gimbal);

    const armMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const armGeos = [[4.2, 0.1, 0.1], [0.1, 0.1, 4.2]];
    armGeos.forEach(dims => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(...dims), armMat);
      dGroup.add(arm);
    });

    // 4 Rotors
    const rotors = [];
    const rPos = [[1.5, 0.18, 1.5], [-1.5, 0.18, 1.5], [1.5, 0.18, -1.5], [-1.5, 0.18, -1.5]];
    rPos.forEach(p => {
      const motorMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.22, 8),
        new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.9 })
      );
      motorMesh.position.set(...p);
      dGroup.add(motorMesh);

      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.015, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x0f172a })
      );
      blade.position.set(p[0], p[1] + 0.13, p[2]);
      dGroup.add(blade);
      rotors.push(blade);
    });

    // ── Scan beam from drone (light cone) ────────────
    const scanCone = new THREE.Mesh(
      new THREE.ConeGeometry(3, 8, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.06, side: THREE.DoubleSide, wireframe: false })
    );
    scanCone.position.y = -4;
    dGroup.add(scanCone);

    // ── Twin Object Volumes ───────────────────────────
    // Will be populated reactively in twinObjects update effect

    // ── Animation Loop ────────────────────────────────
    const clock = new THREE.Clock();
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Rotors
      rotors.forEach((r, i) => { r.rotation.y += (i % 2 === 0 ? 1 : -1) * 0.9; });

      // Drone hover + orbit
      if (dGroup) {
        dGroup.position.y = 8 + Math.sin(t * 1.8) * 0.3;
        dGroup.position.x = -5 + Math.cos(t * 0.4) * 1.2;
        dGroup.position.z = 3 + Math.sin(t * 0.4) * 0.8;
        dGroup.rotation.y = t * 0.12;
      }

      // Laser sweep
      if (laserRef.current) {
        laserRef.current.position.y = Math.sin(t * 0.9) * 3.5;
        laserRef.current.material.opacity = 0.04 + Math.abs(Math.sin(t * 0.9)) * 0.09;
      }

      // Update cam HUD
      if (camera) {
        setCamPos({
          x: camera.position.x.toFixed(1),
          y: camera.position.y.toFixed(1),
          z: camera.position.z.toFixed(1)
        });
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      if (!el || !renderer || !camera) return;
      const w = el.clientWidth, h = el.clientHeight || 460;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      pcGeo.dispose(); pcMat.dispose();
      laserGeo.dispose(); laserMat.dispose();
      groundGeo.dispose(); groundMat.dispose();
      el.innerHTML = '';
    };
  }, [viewMode]);

  // ── Sync Twin Object Meshes when twinObjects change ──
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || viewMode !== 'twin') return;

    twinObjects.forEach(obj => {
      if (twinMeshMapRef.current[obj.trackId]) return; // Already in scene

      const color = new THREE.Color(obj.color);

      // Outer glow wireframe box
      const boxGeo = new THREE.BoxGeometry(obj.cls === 'Vehicle' ? 2.4 : 0.9, obj.cls === 'Vehicle' ? 1.2 : 2.0, obj.cls === 'Vehicle' ? 1.4 : 0.9);
      const boxMat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.85 });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.set(obj.x, obj.cls === 'Vehicle' ? 0.6 : 1.0, obj.z);
      scene.add(boxMesh);

      // Inner translucent fill
      const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08 });
      const fillMesh = new THREE.Mesh(boxGeo, fillMat);
      fillMesh.position.copy(boxMesh.position);
      scene.add(fillMesh);

      // Ground ring
      const ringGeo = new THREE.RingGeometry(0.5, 0.7, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(obj.x, 0.01, obj.z);
      scene.add(ring);

      // Vertical connector line
      const linePoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -(obj.cls === 'Vehicle' ? 0.6 : 1.0), 0)];
      const lineMesh = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePoints),
        new THREE.LineBasicMaterial({ color })
      );
      boxMesh.add(lineMesh);

      twinMeshMapRef.current[obj.trackId] = { box: boxMesh, fill: fillMesh, ring };
    });
  }, [twinObjects, viewMode]);

  // ── Display Mode 3D Switch ────────────────────────────
  useEffect(() => {
    const terrain = terrainRef.current;
    const pc = pointCloudRef.current;
    if (!terrain || !pc) return;

    if (displayMode3d === 'shaded') {
      terrain.visible = true; terrain.material.wireframe = false;
      pc.visible = false;
    } else if (displayMode3d === 'wireframe') {
      terrain.visible = true; terrain.material.wireframe = true;
      pc.visible = false;
    } else if (displayMode3d === 'points') {
      terrain.visible = false; pc.visible = true;
    }
  }, [displayMode3d, viewMode]);

  // ── Overall progress percent ──────────────────────────
  const totalProgress = PIPELINE_STAGES.reduce((acc, s) => acc + (stageProgress[s.id] || 0), 0) / PIPELINE_STAGES.length;

  return (
    <div className="space-y-5">

      {/* ── TOP HEADER CONTROL BAR ────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-extrabold text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-sky-500">hub</span>
              <span>AI-Powered Digital Twin Engine</span>
              {pipelineDone && (
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 animate-pulse">TWIN LIVE</span>
              )}
            </h2>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Full pipeline: Video → YOLO Detection → ByteTrack → MediaPipe Pose → solvePnP 3D lifting → Three.js Digital Twin
            </p>
          </div>

          <div className="flex gap-3 items-center flex-wrap">
            {/* Mode Toggle Pill */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1 border border-slate-200 dark:border-slate-700">
              {[
                { id: 'video',  icon: 'movie',         label: 'Video Input' },
                { id: 'detect', icon: 'manage_search',  label: 'Detection' },
                { id: 'twin',   icon: '3d_rotation',    label: '3D Twin' },
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id)}
                  disabled={mode.id === 'detect' && !pipelineRunning && !pipelineDone}
                  disabled={mode.id === 'twin' && !pipelineDone}
                  className={`px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all flex items-center gap-1 disabled:opacity-40 ${
                    viewMode === mode.id
                      ? 'bg-sky-500 text-slate-900 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={runPipeline}
              disabled={pipelineRunning}
              className="px-4 py-2 bg-gradient-to-r from-sky-500 to-violet-600 hover:from-sky-600 hover:to-violet-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">{pipelineRunning ? 'autorenew' : 'play_circle'}</span>
              <span>{pipelineRunning ? 'PROCESSING...' : 'RUN PIPELINE'}</span>
            </button>

            <button
              onClick={resetPipeline}
              className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 transition-all active:scale-95"
              title="Reset Pipeline"
            >
              <span className="material-symbols-outlined text-sm">restart_alt</span>
            </button>
          </div>
        </div>

        {/* Pipeline Stages Flow Bar */}
        <div className="mt-5 grid grid-cols-3 md:grid-cols-6 gap-2">
          {PIPELINE_STAGES.map((stage, idx) => {
            const pct = stageProgress[stage.id] || 0;
            const isActive = activeStageIdx === idx;
            const isDone = pct === 100;
            return (
              <div key={stage.id} className={`relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                isDone ? 'border-emerald-500/30 bg-emerald-500/5' : isActive ? 'border-sky-500/40 bg-sky-500/5 animate-pulse' : 'border-slate-100 dark:border-slate-800'
              }`}>
                <span className={`material-symbols-outlined text-xl ${isDone ? 'text-emerald-500' : isActive ? 'text-sky-500' : 'text-slate-400'}`}>{stage.icon}</span>
                <span className={`text-[9px] font-bold text-center leading-tight ${isDone ? 'text-emerald-500' : isActive ? 'text-sky-500' : 'text-slate-400'}`}>{stage.label}</span>
                <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${isDone ? 'bg-emerald-500' : 'bg-sky-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-[8px] font-mono ${isDone ? 'text-emerald-500' : 'text-slate-400'}`}>{pct}%</span>
                {/* Connector arrow (all except last) */}
                {idx < PIPELINE_STAGES.length - 1 && (
                  <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-700 text-xs z-10">›</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MAIN CONTENT GRID ─────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

        {/* LEFT — Main Visualization Panel */}
        <div className="xl:col-span-8 flex flex-col">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">

            {/* Panel tab header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${
                  viewMode === 'video' ? 'bg-sky-500' : viewMode === 'detect' ? 'bg-violet-500 animate-ping' : 'bg-emerald-500 animate-pulse'
                }`}></span>
                <h3 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  {viewMode === 'video' && 'Source Video — test1.mp4'}
                  {viewMode === 'detect' && `YOLO Detection — Frame ${String(frameIdx).padStart(2, '0')} / 14`}
                  {viewMode === 'twin' && '3D Digital Twin — Live World State'}
                </h3>
              </div>

              {viewMode === 'twin' && (
                <div className="flex gap-1.5 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
                  {['shaded', 'wireframe', 'points'].map(m => (
                    <button key={m} onClick={() => setDisplayMode3d(m)}
                      className={`text-[9px] font-extrabold px-2 py-1 rounded capitalize transition-all ${
                        displayMode3d === m ? 'bg-sky-500 text-slate-900' : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}>
                      {m}
                    </button>
                  ))}
                </div>
              )}

              {viewMode === 'detect' && (
                <div className="flex gap-1.5">
                  {FRAMES.slice(0, revealedCount).map((f, i) => (
                    <button key={i} onClick={() => setFrameIdx(i)}
                      className={`text-[8px] font-mono px-1.5 py-0.5 rounded transition-all ${
                        frameIdx === i ? 'bg-violet-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'
                      }`}>
                      {i}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Mode: VIDEO ── */}
            {viewMode === 'video' && (
              <div className="flex-1 flex flex-col">
                <div className="relative bg-slate-950 flex-1 flex items-center justify-center overflow-hidden min-h-[380px]">
                  <video
                    ref={videoRef}
                    src="/test1.mp4"
                    loop muted playsInline
                    className="max-h-[380px] w-full object-contain"
                  />
                  {/* HUD corners */}
                  <div className="absolute inset-4 pointer-events-none">
                    <div className="absolute top-0 left-0 h-5 w-5 border-t-2 border-l-2 border-sky-500/50"></div>
                    <div className="absolute top-0 right-0 h-5 w-5 border-t-2 border-r-2 border-sky-500/50"></div>
                    <div className="absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2 border-sky-500/50"></div>
                    <div className="absolute bottom-0 right-0 h-5 w-5 border-b-2 border-r-2 border-sky-500/50"></div>
                  </div>
                  <div className="absolute bottom-3 left-3 font-mono text-[9px] bg-slate-900/80 backdrop-blur px-2.5 py-1.5 rounded-lg border border-slate-800 text-sky-400 space-y-0.5">
                    <div>SOURCE: test1.mp4</div>
                    <div>30 FPS • 31.06s • 931 frames</div>
                    <div>TARGET: 15 keyframes @ 0.5Hz</div>
                  </div>
                </div>

                {/* Extracted frames strip */}
                {revealedCount > 0 && (
                  <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Extracted Keyframes ({revealedCount}/15)</div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {FRAMES.slice(0, revealedCount).map((f, i) => (
                        <div
                          key={i}
                          onClick={() => { setFrameIdx(i); setViewMode('detect'); }}
                          className="flex-none w-20 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-sky-500 transition-all group"
                        >
                          <div className="relative h-12 bg-slate-950">
                            <img src={f.src} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                            <span className="absolute bottom-0.5 right-1 text-[7px] font-mono text-white/60">{f.ts}</span>
                          </div>
                          <div className="px-1.5 py-1 text-[8px] font-mono text-slate-400">
                            {f.detections.length} obj
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Mode: DETECT ── */}
            {viewMode === 'detect' && (
              <div className="flex-1 flex flex-col">
                <div className="relative bg-slate-950 flex-1 flex items-center justify-center overflow-hidden min-h-[380px]">
                  <canvas ref={canvasRef} className="max-h-[380px] w-full object-contain" style={{ imageRendering: 'crisp-edges' }} />
                  {/* Detection count badge */}
                  <div className="absolute top-3 right-3 bg-violet-600/90 text-white text-[10px] font-extrabold font-mono px-2.5 py-1.5 rounded-lg border border-violet-400/30">
                    {currentFrameDetections.length} OBJECTS TRACKED
                  </div>
                </div>

                {/* Detection table */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        <th className="text-left pb-1.5 font-bold">Track ID</th>
                        <th className="text-left pb-1.5 font-bold">Class</th>
                        <th className="text-left pb-1.5 font-bold">Conf</th>
                        <th className="text-left pb-1.5 font-bold">BBox (x,y,w,h)</th>
                        <th className="text-left pb-1.5 font-bold">Pose</th>
                        <th className="text-left pb-1.5 font-bold">Speed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentFrameDetections.length === 0 ? (
                        <tr><td colSpan={6} className="text-slate-500 py-4 text-center">No detections on this frame</td></tr>
                      ) : currentFrameDetections.map(det => (
                        <tr key={det.trackId} className="border-b border-slate-50 dark:border-slate-800/50">
                          <td className="py-1.5 font-bold" style={{ color: det.color }}>{det.trackId}</td>
                          <td className="py-1.5 text-slate-600 dark:text-slate-300">{det.cls}</td>
                          <td className="py-1.5 text-emerald-600 dark:text-emerald-400">{(det.conf * 100).toFixed(1)}%</td>
                          <td className="py-1.5 text-slate-500">[{Object.values(det.bbox).map(v => v.toFixed(2)).join(', ')}]</td>
                          <td className="py-1.5">{det.pose ? <span className="text-yellow-500">17 kp ✓</span> : <span className="text-slate-500">—</span>}</td>
                          <td className="py-1.5 text-sky-500">{det.speed} m/s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Mode: TWIN (Three.js) ── */}
            {viewMode === 'twin' && (
              <div className="flex-1 relative min-h-[460px]">
                <div ref={threeContRef} className="w-full h-full absolute inset-0" />

                {/* Camera HUD */}
                <div className="absolute bottom-4 left-4 bg-slate-900/85 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-[9px] font-mono space-y-0.5 text-slate-300 z-20 pointer-events-none">
                  <div className="font-bold text-sky-400">VIRTUAL CAMERA HUD</div>
                  <div>Position: [{camPos.x}, {camPos.y}, {camPos.z}]</div>
                  <div>Tracked Objects: {twinObjects.length}</div>
                  <div>Render: 60FPS WebGL 2.0</div>
                </div>

                {/* Legend */}
                <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-[9px] font-mono space-y-1 z-20">
                  <div className="font-bold text-slate-300 mb-1">SCENE LEGEND</div>
                  {twinObjects.map(obj => (
                    <div key={obj.trackId} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm" style={{ background: obj.color }}></span>
                      <span style={{ color: obj.color }}>{obj.trackId}</span>
                      <span className="text-slate-500">— {obj.cls}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 mt-1"><span className="h-2 w-2 bg-sky-500 rounded-sm"></span><span className="text-sky-400">Scan Laser Plane</span></div>
                  <div className="flex items-center gap-1.5"><span className="h-2 w-2 bg-slate-400 rounded-sm"></span><span className="text-slate-400">Drone (Live)</span></div>
                </div>

                {!pipelineDone && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 z-30 rounded-b-xl">
                    <span className="material-symbols-outlined text-4xl text-sky-500 mb-3 animate-pulse">hub</span>
                    <span className="font-bold text-slate-300 text-sm">Run Pipeline First</span>
                    <span className="text-slate-500 text-xs mt-1">3D twin will appear after pipeline completes</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Info Panels */}
        <div className="xl:col-span-4 flex flex-col space-y-4">

          {/* Overall Progress */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider">Pipeline Progress</span>
              <span className="font-mono text-xs font-bold text-sky-500">{Math.round(totalProgress)}%</span>
            </div>
            <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 via-violet-500 to-emerald-500 transition-all duration-500 rounded-full"
                style={{ width: `${totalProgress}%` }}
              />
            </div>
            <div className="mt-2 text-[10px] font-mono text-slate-400">
              {pipelineDone ? '✅ All stages complete — Twin online' : pipelineRunning ? `⚙️ Stage ${activeStageIdx + 1}/6: ${PIPELINE_STAGES[activeStageIdx]?.label || '...'}` : '⏸ Idle — Click RUN PIPELINE to start'}
            </div>
          </div>

          {/* Twin Object State Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-sky-500">table_view</span>
              Twin Object States
            </h4>
            {twinObjects.length === 0 ? (
              <div className="h-24 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-center text-slate-400 text-[10px]">
                No tracked objects yet
              </div>
            ) : (
              <div className="space-y-2.5">
                {twinObjects.map(obj => (
                  <div key={obj.trackId} className="rounded-lg p-2.5 border text-[10px] font-mono" style={{ borderColor: obj.color + '55', background: obj.color + '0a' }}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-extrabold" style={{ color: obj.color }}>{obj.trackId} — {obj.cls}</span>
                      <span className="text-slate-400 text-[8px]">Live</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[9px] text-slate-500">
                      <div>X: <span className="font-bold text-slate-700 dark:text-slate-200">{obj.x}m</span></div>
                      <div>Y: <span className="font-bold text-slate-700 dark:text-slate-200">{obj.y}m</span></div>
                      <div>Z: <span className="font-bold text-slate-700 dark:text-slate-200">{obj.z}m</span></div>
                    </div>
                    <div className="mt-1 text-[9px]">
                      Speed: <span className="font-bold text-sky-500">{obj.speed} m/s</span>
                      &nbsp;·&nbsp;
                      <span className="text-slate-400">{obj.ts?.slice(11, 19)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Architecture Overview */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-violet-500">account_tree</span>
              Pipeline Architecture
            </h4>
            <div className="space-y-1.5 text-[10px] font-mono">
              {[
                { label: 'Video Input', value: 'OpenCV VideoCapture', color: 'sky' },
                { label: 'Detection',   value: 'YOLO v8n (DNN)',      color: 'violet' },
                { label: 'Tracking',    value: 'ByteTrack / CSRT',    color: 'amber' },
                { label: 'Pose',        value: 'MediaPipe 17-kp',     color: 'emerald' },
                { label: '3D Lift',     value: 'solvePnP Cam Calib',  color: 'rose' },
                { label: 'Twin State',  value: 'PostgreSQL + WebSocket', color: 'indigo' },
                { label: 'Render',      value: 'Three.js WebGL 2.0',  color: 'sky' },
              ].map(item => (
                <div key={item.label} className={`flex justify-between items-center px-2 py-1.5 rounded border border-${item.color}-500/20 bg-${item.color}-500/5`}>
                  <span className={`text-${item.color}-400 font-bold`}>{item.label}</span>
                  <span className="text-slate-500">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reconstruction Console */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col" style={{ height: '220px' }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] text-sky-400 font-mono font-bold uppercase tracking-wider">PIPELINE CONSOLE</span>
              <span className="text-[8px] font-mono bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">{consoleLogs.length} lines</span>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[9px] text-slate-400 space-y-0.5 scrollbar-thin pr-1">
              {consoleLogs.map((log, idx) => (
                <div key={idx} className="leading-relaxed break-all">
                  <span className={`mr-1 ${log.startsWith('>>> ✅') ? 'text-emerald-400' : log.startsWith('>>>') ? 'text-sky-400' : log.startsWith('[TWIN') ? 'text-indigo-400' : log.startsWith('[POSE') ? 'text-emerald-400' : log.startsWith('[3D') ? 'text-rose-400' : log.startsWith('[DETECT') ? 'text-violet-400' : log.startsWith('[EXTRACT') ? 'text-amber-400' : 'text-slate-500'}`}>›</span>
                  {log}
                </div>
              ))}
              <div ref={consoleEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DigitalTwinSection;
