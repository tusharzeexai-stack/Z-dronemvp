import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Pre-defined list of extracted frames with mock keypoint metrics
const EXTRACTED_FRAMES = Array.from({ length: 15 }, (_, i) => ({
  index: i,
  src: `/digital_twin/frames/frame_${String(i).padStart(2, '0')}.jpg`,
  timeCode: `00:00:${String(Math.floor(i * 2)).padStart(2, '0')}`,
  keypoints: 1200 + Math.floor(Math.sin(i) * 350) + Math.floor(Math.cos(i * 2) * 150),
  reprojectionError: (0.22 + Math.abs(Math.sin(i)) * 0.15).toFixed(3),
  status: 'PROCESSED'
}));

function DigitalTwinSection() {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const requestRef = useRef(null);
  const terminalEndRef = useRef(null);
  const videoRef = useRef(null);

  // Scene Objects
  const scanMeshRef = useRef(null);
  const pointCloudRef = useRef(null);
  const laserLineRef = useRef(null);
  const droneGroupRef = useRef(null);

  // Tab State: 'video' | 'frames' | 'model'
  const [activeTab, setActiveTab] = useState('video');
  
  // Pipeline State: 'idle' | 'extracting' | 'matching' | 'generating' | 'synced'
  const [pipelineState, setPipelineState] = useState('idle');
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [revealedFrameCount, setRevealedFrameCount] = useState(0);
  const [selectedFrame, setSelectedFrame] = useState(EXTRACTED_FRAMES[0]);
  const [displayMode, setDisplayMode] = useState('shaded'); // shaded, wireframe, points
  
  const [currentCameraPos, setCurrentCameraPos] = useState({ x: 0, y: 0, z: 0 });
  const [logs, setLogs] = useState([
    'Pipeline Status: STANDBY',
    'Ready to load source video public/test1.mp4...',
    'Click "START RECONSTRUCTION" to initialize the digital twin generation.'
  ]);

  // Timers
  const pipelineIntervalRef = useRef(null);

  // ── Pipeline Simulation Controller ───────────────────────────
  const startPipeline = () => {
    if (pipelineState !== 'idle' && pipelineState !== 'synced') return;
    
    setPipelineState('extracting');
    setPipelineProgress(0);
    setRevealedFrameCount(0);
    setActiveTab('video');
    
    // Play video from start
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }

    setLogs([
      '🚀 Initializing photogrammetry pipeline...',
      '📂 Loaded source video: /test1.mp4 (Duration: 30.0s)',
      '⚙️ Configured Target Decimation: 15 keyframes @ 0.5Hz',
      '📸 Commencing frame extraction...'
    ]);

    let step = 0;
    
    if (pipelineIntervalRef.current) clearInterval(pipelineIntervalRef.current);

    pipelineIntervalRef.current = setInterval(() => {
      step += 1;
      
      if (step <= 15) {
        // Frame extraction phase
        setPipelineProgress(Math.floor((step / 15) * 35));
        setRevealedFrameCount(step);
        
        // Fast scrub video forward to match frame extraction
        if (videoRef.current) {
          videoRef.current.currentTime = (step - 1) * 2;
        }

        const currentFrame = EXTRACTED_FRAMES[step - 1];
        setLogs(prev => [
          ...prev,
          `[EXTRACTOR] Extracted keyframe ${step - 1} at ${currentFrame.timeCode} | Keypoints detected: ${currentFrame.keypoints}`
        ]);
        
        // Auto-switch to frames tab to let user see extraction live
        if (step === 3) {
          setActiveTab('frames');
        }
      } else if (step <= 25) {
        // Feature Matching phase
        setPipelineState('matching');
        const matchPct = (step - 15) * 10;
        setPipelineProgress(35 + Math.floor((matchPct / 100) * 30));
        
        const f1 = (step - 16) % 15;
        const f2 = (step - 15) % 15;
        const matches = 400 + Math.floor(Math.sin(step) * 200);
        
        setLogs(prev => [
          ...prev,
          `[MATCHER] Correlating frame_${String(f1).padStart(2, '0')} ↔ frame_${String(f2).padStart(2, '0')} | Valid keypoint pairs: ${matches}`
        ]);
      } else if (step <= 35) {
        // 3D Model generation phase
        setPipelineState('generating');
        const genPct = (step - 25) * 10;
        setPipelineProgress(65 + Math.floor((genPct / 100) * 35));
        
        if (step === 26) {
          setActiveTab('model');
          setLogs(prev => [
            ...prev,
            '🔧 Initiating Structure-from-Motion (SfM) triangulation...',
            '📍 Calculating sparse 3D point cloud coordinates...'
          ]);
        } else if (step === 29) {
          setLogs(prev => [
            ...prev,
            '🔄 Running bundle adjustment (reprojection optimization)...',
            `📊 Mean projection error: 0.285 pixels`
          ]);
        } else if (step === 32) {
          setLogs(prev => [
            ...prev,
            '📐 Commencing Delaunay surface mesh triangulation...',
            '🎨 Generating texture maps from video frames...'
          ]);
        }
      } else {
        // Completed Sync
        clearInterval(pipelineIntervalRef.current);
        setPipelineState('synced');
        setPipelineProgress(100);
        setLogs(prev => [
          ...prev,
          '✨ DIGITAL TWIN RECONSTRUCTION COMPLETE!',
          '🟢 Status: NOMINAL - Synchronized with virtual cloud storage.',
          '📐 Physical volume: 1,482.5 cubic meters',
          '📊 Point density: 1.5M points / watertight mesh generated.'
        ]);
      }
    }, 500);
  };

  const resetPipeline = () => {
    if (pipelineIntervalRef.current) clearInterval(pipelineIntervalRef.current);
    setPipelineState('idle');
    setPipelineProgress(0);
    setRevealedFrameCount(0);
    setActiveTab('video');
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.pause();
    }
    setLogs([
      'Pipeline Status: RESET - STANDBY',
      'Ready to load source video public/test1.mp4...',
      'Click "START RECONSTRUCTION" to initialize the digital twin generation.'
    ]);
  };

  // ── Auto-scroll Terminal ─────────────────────────────────────
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // ── WebGL 3D Scene Initialization ───────────────────────────
  useEffect(() => {
    if (activeTab !== 'model' || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 450;

    // 1. Scene & Fog Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const isDark = document.documentElement.classList.contains('dark');
    scene.background = new THREE.Color(isDark ? 0x0B0F19 : 0xF8FAFC);
    scene.fog = new THREE.FogExp2(isDark ? 0x0B0F19 : 0xF8FAFC, 0.015);

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
    camera.position.set(20, 15, 25);
    cameraRef.current = camera;

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Stay above ground
    controls.minDistance = 5;
    controls.maxDistance = 100;
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, isDark ? 0.3 : 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 30, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // 6. Grid Helper / Reference Floor
    const gridHelper = new THREE.GridHelper(50, 40, 0x0ea5e9, isDark ? 0x1e293b : 0xe2e8f0);
    gridHelper.position.y = -5.0;
    scene.add(gridHelper);

    // ── BUILD DIGITAL TWIN SCENE MODEL ─────────────────────────
    
    // Structure: A reconstructed industrial concrete silos and grid
    const structureGroup = new THREE.Group();
    scene.add(structureGroup);

    // Reconstructed Silo Mesh (Double Cylinders)
    const siloMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
      transparent: true,
      opacity: 0.95
    });

    const silo1Geo = new THREE.CylinderGeometry(2.5, 2.5, 10, 16, 5);
    const silo1 = new THREE.Mesh(silo1Geo, siloMat);
    silo1.position.set(-3, 0, 0);
    silo1.castShadow = true;
    silo1.receiveShadow = true;
    structureGroup.add(silo1);

    const silo2Geo = new THREE.CylinderGeometry(2.0, 2.0, 8, 16, 5);
    const silo2 = new THREE.Mesh(silo2Geo, siloMat);
    silo2.position.set(3, -1, -2);
    silo2.castShadow = true;
    silo2.receiveShadow = true;
    structureGroup.add(silo2);

    // Base structures
    const baseGeo = new THREE.BoxGeometry(10, 1, 8);
    const baseMesh = new THREE.Mesh(baseGeo, siloMat);
    baseMesh.position.set(0, -5.5, -1);
    baseMesh.receiveShadow = true;
    structureGroup.add(baseMesh);

    scanMeshRef.current = structureGroup;

    // 7. Dense Point Cloud representation (generated from SfM frames)
    const numPoints = 12000;
    const pointsGeo = new THREE.BufferGeometry();
    const positionsArr = new Float32Array(numPoints * 3);
    const colorsArr = new Float32Array(numPoints * 3);

    for (let i = 0; i < numPoints; i++) {
      // Shape points around the silos and bases
      let px, py, pz;
      const selector = Math.random();
      
      if (selector < 0.4) {
        // Silo 1 shell points
        const theta = Math.random() * Math.PI * 2;
        const r = 2.5 + (Math.random() - 0.5) * 0.15;
        py = (Math.random() - 0.5) * 10;
        px = -3 + Math.cos(theta) * r;
        pz = Math.sin(theta) * r;
      } else if (selector < 0.7) {
        // Silo 2 shell points
        const theta = Math.random() * Math.PI * 2;
        const r = 2.0 + (Math.random() - 0.5) * 0.15;
        py = -1 + (Math.random() - 0.5) * 8;
        px = 3 + Math.cos(theta) * r;
        pz = -2 + Math.sin(theta) * r;
      } else {
        // Random structure ground base points
        px = (Math.random() - 0.5) * 12;
        py = -5.5 + (Math.random() - 0.5) * 1.5;
        pz = (Math.random() - 0.5) * 10;
      }

      positionsArr[i * 3] = px;
      positionsArr[i * 3 + 1] = py;
      positionsArr[i * 3 + 2] = pz;

      // Scan laser gradient HSL colors (cyan to deep violet heights)
      const color = new THREE.Color();
      const heightRatio = (py + 5) / 10; // 0 to 1
      color.setHSL(0.55 + heightRatio * 0.3, 0.9, 0.55);
      colorsArr[i * 3] = color.r;
      colorsArr[i * 3 + 1] = color.g;
      colorsArr[i * 3 + 2] = color.b;
    }

    pointsGeo.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
    pointsGeo.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));

    const pointsMat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.9
    });

    const pointCloud = new THREE.Points(pointsGeo, pointsMat);
    pointCloudRef.current = pointCloud;
    scene.add(pointCloud);

    // 8. Glowing scanner laser line plane
    const laserGeo = new THREE.BoxGeometry(16, 0.08, 12);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.4,
      wireframe: true
    });
    const laserLine = new THREE.Mesh(laserGeo, laserMat);
    laserLine.position.y = 0;
    scene.add(laserLine);
    laserLineRef.current = laserLine;

    // 9. Scanned floating Drone Model
    const droneGroup = new THREE.Group();
    droneGroup.position.set(-6, 8, 4);
    scene.add(droneGroup);
    droneGroupRef.current = droneGroup;

    // Central disk body
    const bodyGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.35, 6);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 });
    const droneBody = new THREE.Mesh(bodyGeo, bodyMat);
    droneGroup.add(droneBody);

    // Arms
    const armMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    const armGeo = new THREE.BoxGeometry(4.0, 0.12, 0.12);
    const arm1 = new THREE.Mesh(armGeo, armMat);
    arm1.rotation.y = Math.PI / 4;
    const arm2 = new THREE.Mesh(armGeo, armMat);
    arm2.rotation.y = -Math.PI / 4;
    droneGroup.add(arm1, arm2);

    // Rotor spinning meshes
    const rotors = [];
    const rotorOffsets = [
      [1.41, 0.2, 1.41],
      [-1.41, 0.2, 1.41],
      [1.41, 0.2, -1.41],
      [-1.41, 0.2, -1.41]
    ];
    rotorOffsets.forEach(offset => {
      const pGeo = new THREE.BoxGeometry(1.6, 0.02, 0.08);
      const pMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const prop = new THREE.Mesh(pGeo, pMat);
      prop.position.set(offset[0], offset[1], offset[2]);
      droneGroup.add(prop);
      rotors.push(prop);
    });

    // ── ANIMATE RENDER LOOP ────────────────────────────────────
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      // Spin propellers
      rotors.forEach(r => {
        r.rotation.y += 0.8;
      });

      // Hover drone
      if (droneGroup) {
        droneGroup.position.y = 7.0 + Math.sin(elapsed * 2.0) * 0.25;
        droneGroup.position.x = -6.0 + Math.sin(elapsed * 0.5) * 0.5;
        droneGroup.rotation.y = elapsed * 0.1;
      }

      // Scanner laser moving up and down
      if (laserLine) {
        laserLine.position.y = Math.sin(elapsed * 1.5) * 6;
      }

      // Orbit camera HUD position update
      if (camera) {
        setCurrentCameraPos({
          x: Math.round(camera.position.x),
          y: Math.round(camera.position.y),
          z: Math.round(camera.position.z)
        });
      }

      controls.update();
      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    // ── Window Resize Handler ──────────────────────────────────
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 450;
      
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Clean up WebGL
    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
      
      // Dispose Geometries/Materials
      silo1Geo.dispose();
      silo2Geo.dispose();
      baseGeo.dispose();
      siloMat.dispose();
      pointsGeo.dispose();
      pointsMat.dispose();
      laserGeo.dispose();
      laserMat.dispose();
      bodyGeo.dispose();
      bodyMat.dispose();
      armGeo.dispose();
      armMat.dispose();
      
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [activeTab]);

  // ── Handle Display Mode Switches ─────────────────────────────
  useEffect(() => {
    const mesh = scanMeshRef.current;
    const points = pointCloudRef.current;
    if (!mesh || !points) return;

    if (displayMode === 'shaded') {
      mesh.visible = true;
      mesh.children.forEach(c => {
        c.material.wireframe = false;
        c.material.needsUpdate = true;
      });
      points.visible = false;
    } else if (displayMode === 'wireframe') {
      mesh.visible = true;
      mesh.children.forEach(c => {
        c.material.wireframe = true;
        c.material.needsUpdate = true;
      });
      points.visible = false;
    } else if (displayMode === 'points') {
      mesh.visible = false;
      points.visible = true;
    }
  }, [displayMode, activeTab]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 text-left">
      {/* ── TOP PIPELINE CONTROL BAR ── */}
      <div className="xl:col-span-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-850 dark:text-slate-100 flex items-center gap-2">
            <span className="material-symbols-outlined text-sky-500">model_training</span>
            <span>3D Photogrammetry & Digital Twin Engine</span>
          </h2>
          <p className="text-[11px] text-slate-400 mt-1">
            Triangulate structural meshes and dense point clouds from high-resolution flight camera footage.
          </p>
        </div>
        
        <div className="flex gap-3 items-center">
          <button
            onClick={startPipeline}
            disabled={pipelineState !== 'idle' && pipelineState !== 'synced'}
            className="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 disabled:opacity-40 text-slate-900 font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm font-bold">play_arrow</span>
            <span>START RECONSTRUCTION</span>
          </button>
          
          <button
            onClick={resetPipeline}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-all active:scale-95 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">restart_alt</span>
            <span>RESET</span>
          </button>
        </div>
      </div>

      {/* ── LEFT PANEL: PIPELINE TABS & VISUALIZATION ── */}
      <div className="xl:col-span-8 flex flex-col space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex-1 flex flex-col min-h-[500px]">
          {/* Tab Headers */}
          <div className="flex border-b border-slate-100 dark:border-slate-800 pb-3 mb-4 justify-between items-center">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('video')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1 ${
                  activeTab === 'video'
                    ? 'bg-sky-500/10 text-sky-500 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <span className="material-symbols-outlined text-sm">movie</span>
                <span>Video Input</span>
              </button>
              <button
                onClick={() => setActiveTab('frames')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1 relative ${
                  activeTab === 'frames'
                    ? 'bg-sky-500/10 text-sky-500 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <span className="material-symbols-outlined text-sm">photo_library</span>
                <span>Extracted Frames</span>
                {revealedFrameCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-sky-500 text-slate-900 text-[8px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center animate-pulse">
                    {revealedFrameCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('model')}
                disabled={pipelineState === 'idle' || pipelineState === 'extracting' || pipelineState === 'matching'}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1 disabled:opacity-40 ${
                  activeTab === 'model'
                    ? 'bg-sky-500/10 text-sky-500 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <span className="material-symbols-outlined text-sm">3d_rotation</span>
                <span>3D Digital Twin</span>
              </button>
            </div>
            
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${
                pipelineState === 'synced' ? 'bg-emerald-500' : pipelineState !== 'idle' ? 'bg-sky-500 animate-ping' : 'bg-slate-500'
              }`}></span>
              <span>{pipelineState}</span>
            </div>
          </div>

          {/* Progress Bar */}
          {pipelineState !== 'idle' && (
            <div className="mb-4 bg-slate-50 dark:bg-slate-850 p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex justify-between items-center mb-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                <span className="uppercase font-mono flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                  {pipelineState === 'extracting' && 'Phase 1: Keyframe Decimation & Extraction'}
                  {pipelineState === 'matching' && 'Phase 2: SIFT Feature Correlation & Correspondence'}
                  {pipelineState === 'generating' && 'Phase 3: SfM Mesh Synthesis & Bundle Adjustment'}
                  {pipelineState === 'synced' && 'Sync Completed: Twin Online'}
                </span>
                <span>{pipelineProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden relative">
                <div 
                  className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300 rounded-full" 
                  style={{ width: `${pipelineProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Tab Panels */}
          <div className="flex-1 flex flex-col justify-between">
            {/* ── PANEL: VIDEO INPUT ── */}
            {activeTab === 'video' && (
              <div className="flex-1 flex flex-col justify-center items-center border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-950 p-4 relative overflow-hidden h-[400px]">
                <video
                  ref={videoRef}
                  src="/test1.mp4"
                  loop
                  muted
                  className="w-full h-full max-h-[350px] object-contain rounded-lg shadow-2xl"
                />
                {/* HUD Camera Target Indicator Overlay */}
                <div className="absolute inset-0 pointer-events-none border border-sky-500/10 flex items-center justify-center">
                  <div className="h-20 w-20 border border-dashed border-sky-500/30 rounded-full flex items-center justify-center animate-spin" style={{ animationDuration: '20s' }}></div>
                  <div className="absolute h-10 w-10 border border-sky-500/40 rounded flex items-center justify-center">
                    <span className="text-sky-500 text-[10px] font-bold font-mono">30s CUT</span>
                  </div>
                  {/* Outer corner marks */}
                  <div className="absolute top-4 left-4 h-4 w-4 border-t-2 border-l-2 border-sky-500/30"></div>
                  <div className="absolute top-4 right-4 h-4 w-4 border-t-2 border-r-2 border-sky-500/30"></div>
                  <div className="absolute bottom-4 left-4 h-4 w-4 border-b-2 border-l-2 border-sky-500/30"></div>
                  <div className="absolute bottom-4 right-4 h-4 w-4 border-b-2 border-r-2 border-sky-500/30"></div>
                  {/* Top center scanner label */}
                  <div className="absolute top-6 font-mono text-[9px] bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 text-sky-400 tracking-wider">
                    SOURCE DATA STREAM: test1.mp4
                  </div>
                </div>
              </div>
            )}

            {/* ── PANEL: EXTRACTED FRAMES ── */}
            {activeTab === 'frames' && (
              <div className="flex-1 flex flex-col">
                {revealedFrameCount > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 max-h-[380px] overflow-y-auto pr-1">
                    {EXTRACTED_FRAMES.slice(0, revealedFrameCount).map((frame) => (
                      <div
                        key={frame.index}
                        onClick={() => setSelectedFrame(frame)}
                        className={`group border rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-850 cursor-pointer transition-all ${
                          selectedFrame.index === frame.index
                            ? 'border-sky-500 shadow-md scale-[1.02]'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                        }`}
                      >
                        <div className="relative h-20 bg-slate-950 overflow-hidden">
                          <img
                            src={frame.src}
                            alt={`frame_${frame.index}`}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          />
                          <span className="absolute bottom-1 right-1 bg-slate-950/80 text-[7px] text-slate-300 font-mono px-1 rounded">
                            {frame.timeCode}
                          </span>
                        </div>
                        <div className="p-1.5 text-[8px] font-mono text-slate-400 space-y-0.5">
                          <div className="flex justify-between">
                            <span>Index:</span>
                            <span className="font-bold text-slate-700 dark:text-slate-200">#{(frame.index).toString().padStart(2, '0')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Keypoints:</span>
                            <span className="text-sky-500 font-bold">{frame.keypoints}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 h-[300px] border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex flex-col justify-center items-center text-slate-400">
                    <span className="material-symbols-outlined text-4xl mb-2">burst_mode</span>
                    <span className="font-bold text-xs uppercase tracking-widest">No Frames Extracted</span>
                    <span className="text-[10px] text-slate-500 mt-1">Start reconstruction to extract frames from test1.mp4.</span>
                  </div>
                )}

                {/* Selected Frame Metrics Bar */}
                {revealedFrameCount > 0 && selectedFrame && (
                  <div className="mt-4 bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-16 bg-slate-950 rounded overflow-hidden border border-slate-200 dark:border-slate-800">
                        <img src={selectedFrame.src} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-800 dark:text-slate-100">Selected Frame Details: frame_{String(selectedFrame.index).padStart(2, '0')}.jpg</div>
                        <div className="text-[10px] text-slate-400 font-mono">Timestamp: {selectedFrame.timeCode} // Res: 480x270 px</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-center sm:text-right font-mono text-[10px] text-slate-400">
                      <div>
                        <div>SIFT Keypoints</div>
                        <div className="font-bold text-sky-500 text-xs">{selectedFrame.keypoints}</div>
                      </div>
                      <div>
                        <div>Reprojection Err</div>
                        <div className="font-bold text-slate-700 dark:text-slate-200 text-xs">{selectedFrame.reprojectionError}px</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── PANEL: 3D MODEL VIEW ── */}
            {activeTab === 'model' && (
              <div className="flex-1 flex flex-col relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 min-h-[380px]">
                {/* 3D WebGL Canvas container */}
                <div ref={containerRef} className="w-full h-[380px] z-10" />

                {/* Camera HUD Details */}
                <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-[9px] font-mono space-y-0.5 text-slate-300 z-20 pointer-events-none">
                  <div className="font-bold text-sky-400">GCS VIRTUAL FRAME HUD</div>
                  <div>Cam Orbit: [X: {currentCameraPos.x}, Y: {currentCameraPos.y}, Z: {currentCameraPos.z}]</div>
                  <div>Point Cloud Model: Silo Structure Matrix</div>
                  <div>Reconstruction: Nominal 60FPS</div>
                </div>

                {/* Mesh Display Mode Switches */}
                <div className="absolute bottom-4 right-4 flex bg-slate-950/80 backdrop-blur-md p-1 rounded-lg border border-slate-800 z-20 gap-1">
                  {['shaded', 'wireframe', 'points'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setDisplayMode(mode)}
                      className={`text-[9px] font-extrabold px-2 py-1.5 rounded capitalize transition-all ${
                        displayMode === mode 
                          ? 'bg-sky-500 text-slate-850' 
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: RECONSTRUCTION LOGS & QUALITY ── */}
      <div className="xl:col-span-4 flex flex-col space-y-6">
        {/* State Alerts */}
        <div className={`rounded-xl border p-4 text-xs ${
          pipelineState === 'synced' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' 
            : pipelineState !== 'idle' 
            ? 'bg-sky-500/10 border-sky-500/30 text-sky-500 animate-pulse'
            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
        }`}>
          <div className="flex gap-2 items-center">
            <span className="material-symbols-outlined text-lg">
              {pipelineState === 'synced' ? 'check_circle' : pipelineState !== 'idle' ? 'autorenew' : 'hourglass_empty'}
            </span>
            <div>
              <p className="font-bold uppercase tracking-wider">
                {pipelineState === 'idle' && 'Pipeline Standby'}
                {pipelineState === 'extracting' && 'Extracting Frames...'}
                {pipelineState === 'matching' && 'Matching Keypoints...'}
                {pipelineState === 'generating' && 'Reconstructing Mesh...'}
                {pipelineState === 'synced' && 'Digital Twin Synced'}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {pipelineState === 'idle' && 'Awaiting video sequence import.'}
                {pipelineState === 'extracting' && 'Slicing video into keyframes.'}
                {pipelineState === 'matching' && 'Identifying matched feature points.'}
                {pipelineState === 'generating' && 'Synthesizing 3D point vertices.'}
                {pipelineState === 'synced' && 'Photogrammetry model is live and synced.'}
              </p>
            </div>
          </div>
        </div>

        {/* Real-time Reconstruction Console */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-xs flex flex-col h-[280px]">
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800">
            <span className="text-[10px] text-sky-400 font-mono font-bold uppercase tracking-wider">RECONSTRUCTION LOGS</span>
            <span className="text-[8px] bg-slate-850 text-slate-400 px-1.5 py-0.5 rounded font-mono">10Hz</span>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-[9px] text-slate-400 space-y-1 scrollbar-thin">
            {logs.map((log, idx) => (
              <div key={idx} className="leading-relaxed break-all text-left">
                <span className="text-sky-500/60 mr-1">&gt;</span>{log}
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>
        </div>

        {/* Photogrammetry Metrics Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs text-xs space-y-3 flex-1">
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider pb-2 border-b border-slate-100 dark:border-slate-800">Mesh & Bundle Metrics</h4>
          
          <div className="space-y-3 text-[10px] text-slate-400">
            <div className="flex justify-between">
              <span>Total Video Frames:</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">931 frames (30s)</span>
            </div>
            <div className="flex justify-between">
              <span>Decimated Keyframes:</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">15 frames</span>
            </div>
            <div className="flex justify-between">
              <span>Average Keypoints / Frame:</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {pipelineState === 'idle' ? '0' : '1,248 pts'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Triangulated Vertices:</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {pipelineState === 'synced' || pipelineState === 'generating' ? '12,000 pts' : '0'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Mean Reprojection Error:</span>
              <span className={`font-bold ${pipelineState === 'synced' ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-200'}`}>
                {pipelineState === 'synced' ? '0.285 px' : '0.000 px'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Mesh Watertight Integrity:</span>
              <span className={`font-bold ${pipelineState === 'synced' ? 'text-emerald-500' : 'text-slate-400'}`}>
                {pipelineState === 'synced' ? 'VERIFIED' : 'PENDING'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DigitalTwinSection;
