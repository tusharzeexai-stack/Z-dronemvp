import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default function DigitalTwinSectionLargeArea() {
  const mountRef     = useRef(null);
  const rafRef       = useRef(null);
  const controlsRef  = useRef(null);
  const terrainRef   = useRef(null);

  const [currentFrame, setCurrentFrame] = useState(1);
  const MAX_FRAMES = 1204;
  const textureLoader = useRef(new THREE.TextureLoader());
  const textureCache = useRef(new Map());

  // Helper to get frame path
  const getFramePath = (idx) => `/digital_twin/v3_x_1_frames/frame_${String(idx).padStart(4, '0')}.jpg`;

  // Preload next few frames
  const preloadFrames = useCallback((startIdx) => {
    for (let i = startIdx; i < startIdx + 5 && i <= MAX_FRAMES; i++) {
      if (!textureCache.current.has(i)) {
        textureLoader.current.load(getFramePath(i), (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          textureCache.current.set(i, tex);
          // Cleanup old cache to save memory
          if (textureCache.current.size > 20) {
            const firstKey = textureCache.current.keys().next().value;
            const oldTex = textureCache.current.get(firstKey);
            oldTex.dispose();
            textureCache.current.delete(firstKey);
          }
        });
      }
    }
  }, []);

  // Update terrain texture when frame changes
  useEffect(() => {
    if (terrainRef.current) {
      if (textureCache.current.has(currentFrame)) {
        terrainRef.current.material.map = textureCache.current.get(currentFrame);
        terrainRef.current.material.needsUpdate = true;
      } else {
        textureLoader.current.load(getFramePath(currentFrame), (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          textureCache.current.set(currentFrame, tex);
          terrainRef.current.material.map = tex;
          terrainRef.current.material.needsUpdate = true;
        });
      }
      preloadFrames(currentFrame + 1);
    }
  }, [currentFrame, preloadFrames]);


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
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010b14, 0.005);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
    camera.position.set(0, 80, 120);
    camera.lookAt(0, 0, 0);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 10;
    controls.maxDistance = 300;
    controlsRef.current = controls;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(100, 200, 50);
    scene.add(dirLight);

    // ── Massive Terrain Map (Digital Twin Area) ──────────────────────────
    // Since the video has 1204 frames of a large area, we'll map it to a huge plane
    const terrainGeo = new THREE.PlaneGeometry(320, 180, 64, 64);
    
    // Add subtle displacement to terrain based on sine waves for a rugged look
    const posAttr = terrainGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = Math.sin(x * 0.05) * Math.cos(y * 0.05) * 5 + Math.sin(x * 0.01) * 10;
      posAttr.setZ(i, z);
    }
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.rotation.x = -Math.PI / 2;
    scene.add(terrainMesh);
    terrainRef.current = terrainMesh;

    // Grid helper
    const gridHelper = new THREE.GridHelper(400, 100, 0x00d4ff, 0x001e2e);
    gridHelper.position.y = -5;
    scene.add(gridHelper);

    // ── Animation loop ───────────────────────────────────────────
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
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
      terrainGeo.dispose();
      terrainMat.dispose();
      el.innerHTML = '';
      
      // Clear textures
      textureCache.current.forEach(tex => tex.dispose());
      textureCache.current.clear();
    };
  }, []);

  return (
    <div className="flex flex-col bg-[#010b14] rounded-b-2xl overflow-hidden border-x border-b border-[#003344] shadow-2xl relative" style={{ height: '620px', fontFamily: 'monospace' }}>
        
        {/* Three.js canvas */}
        <div ref={mountRef} className="absolute inset-0" />

        {/* ── Top-left facility overview ───────────────────────── */}
        <div className="absolute top-6 left-6 z-20 pointer-events-none">
          <div className="bg-[#010d1a]/85 backdrop-blur border border-[#003344] rounded px-4 py-3 text-[10px] space-y-1">
            <div className="text-[#00e5ff] font-bold tracking-wider mb-2 text-xs">LARGE AREA DIGITAL TWIN</div>
            <div className="text-[#00e5ff] opacity-80">Source: v3_x_1test.mp4</div>
            <div className="text-[#00e5ff] opacity-80">Extracted Frames: 1,204 (Streaming)</div>
            <div className="text-[#00e5ff] opacity-80">Mapping: Dynamic Displacement Mesh</div>
            <div className="text-emerald-400 font-bold mt-2 animate-pulse">● LIVE STREAM ACTIVE</div>
          </div>
        </div>

        {/* Timeline Slider */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-3/4 z-20">
            <div className="bg-[#010d1a]/85 backdrop-blur border border-[#003344] rounded-lg p-3">
                <div className="flex justify-between text-[#00e5ff] text-[10px] font-bold mb-2 tracking-widest">
                    <span>FRAME: {currentFrame}</span>
                    <span>/ {MAX_FRAMES}</span>
                </div>
                <input 
                    type="range"
                    min="1"
                    max={MAX_FRAMES}
                    value={currentFrame}
                    onChange={(e) => setCurrentFrame(parseInt(e.target.value))}
                    className="w-full h-1 bg-[#001e2e] rounded-lg appearance-none cursor-pointer accent-[#00e5ff]"
                />
            </div>
        </div>
    </div>
  );
}
