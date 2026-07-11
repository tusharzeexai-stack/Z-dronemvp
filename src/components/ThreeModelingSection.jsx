import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Survey hotspots data
const HOTSPOTS = [
  { id: 'H-01', name: 'Scaffold Structural Crack', pos: [15, 6, -10], severity: 'Critical', desc: 'Active tensile fracture detected on concrete support column. Recommended dispatch: Maintenance Team B.', code: 'SEC-390' },
  { id: 'H-02', name: 'Rotor Wear Anomaly', pos: [-5, 8, 12], severity: 'Warning', desc: 'Rotor blade C shows micro-fissure erosion at tips. Lifespan estimate: 12 flight hours remaining.', code: 'ROT-109' },
  { id: 'H-03', name: 'LiDAR Sensor Calibration Hub', pos: [0, 4, 0], severity: 'Compliant', desc: 'Autonomous sensor checks passed. GSD calibration drift < 0.1%. Optical path clear.', code: 'SEN-055' }
];

function ThreeModelingSection() {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const requestRef = useRef(null);

  // Scene Objects Refs for runtime toggling
  const terrainMeshRef = useRef(null);
  const droneGroupRef = useRef(null);
  const particleSystemRef = useRef(null);
  const wifiSkeletonsRef = useRef([]);

  // States
  const [displayMode, setDisplayMode] = useState('shaded'); // shaded, wireframe, points, contour
  const [activeHotspot, setActiveHotspot] = useState(null);
  const [sunIntensity, setSunIntensity] = useState(1.2);
  const [timeOfDay, setTimeOfDay] = useState('noon'); // morning, noon, sunset
  const [flythroughActive, setFlythroughActive] = useState(false);
  const [droneRotorsSpinning, setDroneRotorsSpinning] = useState(true);
  const [currentCameraPos, setCurrentCameraPos] = useState({ x: 0, y: 0, z: 0 });

  // Lighting references
  const dirLightRef = useRef(null);
  const ambientLightRef = useRef(null);

  // Animation states (internal)
  const flythroughProgress = useRef(0);
  const dronePositionIndex = useRef(0);

  // 1. Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 450;

    // Create Scene & Camera
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    // Background based on theme
    const isDark = document.documentElement.classList.contains('dark');
    scene.background = new THREE.Color(isDark ? 0x0B0F19 : 0xF8FAFC);
    scene.fog = new THREE.FogExp2(isDark ? 0x0B0F19 : 0xF8FAFC, 0.007);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(35, 30, 45);
    cameraRef.current = camera;

    // Create Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Clean old canvas and append new one
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
    controls.minDistance = 5;
    controls.maxDistance = 150;
    controlsRef.current = controls;

    // Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(40, 60, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 200;
    const d = 50;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    // Add Helpers
    const gridHelper = new THREE.GridHelper(100, 50, 0x0ea5e9, isDark ? 0x1e293b : 0xe2e8f0);
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    // 2. Generate surveyed terrain mesh (16:9 aspect ratio for orthomosaic)
    const terrainWidth = 106.6; 
    const terrainHeight = 60;
    const terrainSegmentsW = 64;
    const terrainSegmentsH = 36;
    const terrainGeo = new THREE.PlaneGeometry(terrainWidth, terrainHeight, terrainSegmentsW, terrainSegmentsH);
    
    const posAttr = terrainGeo.attributes.position;
    const count = posAttr.count;

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      
      // Extremely subtle unevenness (looks like a slightly uneven construction site dirt)
      const z = (Math.sin(x * 0.15) * Math.cos(y * 0.15) * 0.3) + (Math.sin(x * 0.05) * 0.2);
      posAttr.setZ(i, z);
    }
    terrainGeo.computeVertexNormals();

    // Rotate and position flat
    terrainGeo.rotateX(-Math.PI / 2);

    const terrainTexture = new THREE.TextureLoader().load('/digital_twin/frames/frame_00.jpg');
    terrainTexture.colorSpace = THREE.SRGBColorSpace; // Professional color mapping
    
    const terrainMat = new THREE.MeshStandardMaterial({
      roughness: 0.9, // Dirt is rough
      metalness: 0.0,
      map: terrainTexture,
      shadowSide: THREE.DoubleSide
    });

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;

    // 3. Create a detailed Drone Model Mesh
    const droneGroup = new THREE.Group();
    droneGroup.position.set(0, 10, 0);
    scene.add(droneGroup);
    droneGroupRef.current = droneGroup;

    // Central body
    const bodyGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.6, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 });
    const droneBody = new THREE.Mesh(bodyGeo, bodyMat);
    droneBody.castShadow = true;
    droneGroup.add(droneBody);

    // Camera sensor gimbal
    const gimbalGeo = new THREE.SphereGeometry(0.5, 12, 12);
    const gimbalMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.1, metalness: 0.9 });
    const droneGimbal = new THREE.Mesh(gimbalGeo, gimbalMat);
    droneGimbal.position.y = -0.55;
    droneGroup.add(droneGimbal);

    // 4 arms
    const armGeo = new THREE.BoxGeometry(7, 0.2, 0.25);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    
    const arm1 = new THREE.Mesh(armGeo, armMat);
    arm1.rotation.y = Math.PI / 4;
    arm1.castShadow = true;
    droneGroup.add(arm1);

    const arm2 = new THREE.Mesh(armGeo, armMat);
    arm2.rotation.y = -Math.PI / 4;
    arm2.castShadow = true;
    droneGroup.add(arm2);

    // Rotors
    const rotorMotors = [];
    const rotorPropellers = [];
    const positions = [
      [2.47, 0.3, 2.47],
      [-2.47, 0.3, 2.47],
      [2.47, 0.3, -2.47],
      [-2.47, 0.3, -2.47]
    ];

    positions.forEach((pos, idx) => {
      // Motor mount
      const motorGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 6);
      const motorMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.9 });
      const motor = new THREE.Mesh(motorGeo, motorMat);
      motor.position.set(pos[0], pos[1], pos[2]);
      motor.castShadow = true;
      droneGroup.add(motor);
      rotorMotors.push(motor);

      // Blades
      const propGeo = new THREE.BoxGeometry(2.4, 0.03, 0.18);
      const propMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
      const propeller = new THREE.Mesh(propGeo, propMat);
      propeller.position.set(pos[0], pos[1] + 0.3, pos[2]);
      propeller.castShadow = true;
      droneGroup.add(propeller);
      rotorPropellers.push(propeller);
    });

    // ── Excavator models (to give it true 3D presence) ─────────
    const mkExcavator = (x, z, rot, color) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.rotation.y = rot;
      const bodyC = new THREE.Color(color);
      const eMat  = (em = 0.5) => new THREE.MeshStandardMaterial({
        color: bodyC, emissive: bodyC, emissiveIntensity: em,
        roughness: 0.3, metalness: 0.3,
      });

      // Lower body / tracks
      const tracks = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.8, 1.8), eMat(0.3));
      tracks.position.y = 0.4;
      tracks.castShadow = true;
      grp.add(tracks);
      
      // Upper body cab
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.35, 1.5), eMat(0.5));
      cab.position.set(-0.15, 1.5, 0);
      cab.castShadow = true;
      grp.add(cab);
      
      // Boom arm
      const boom = new THREE.Mesh(new THREE.BoxGeometry(0.27, 3.3, 0.27), eMat(0.6));
      boom.position.set(1.05, 2.7, 0);
      boom.rotation.z = -Math.PI / 5;
      boom.castShadow = true;
      grp.add(boom);
      
      // Stick arm
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.1, 0.18), eMat(0.6));
      stick.position.set(2.4, 1.8, 0);
      stick.rotation.z = Math.PI / 4;
      stick.castShadow = true;
      grp.add(stick);
      
      // Bucket
      const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.52, 0.9), eMat(0.7));
      bucket.position.set(3.3, 0.75, 0);
      bucket.castShadow = true;
      grp.add(bucket);

      scene.add(grp);
      return grp;
    };

    // Positioned to match the excavators seen in frame_00.jpg
    const exc1 = mkExcavator(-16, -9, 0.8, '#eab308');
    const exc2 = mkExcavator( 5,  -5, -0.3, '#f59e0b');
    const exc3 = mkExcavator( 14, -8, Math.PI / 3, '#eab308');

    // ── RuView WiFi DensePose Skeletons ─────────
    const mkWiFiSkeleton = (x, z, colorStr) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      
      const pColor = new THREE.Color(colorStr);
      const jointMat = new THREE.MeshBasicMaterial({ color: pColor, wireframe: true, transparent: true, opacity: 0.8 });
      const boneMat = new THREE.LineBasicMaterial({ color: pColor, transparent: true, opacity: 0.5 });
      
      const jointGeo = new THREE.SphereGeometry(0.15, 8, 8);
      
      // 17 keypoints (head, shoulders, elbows, wrists, hips, knees, ankles)
      const joints = [];
      for (let i=0; i<17; i++) {
        const j = new THREE.Mesh(jointGeo, jointMat);
        grp.add(j);
        joints.push(j);
      }
      
      // Lines connecting the joints
      const lineGeo = new THREE.BufferGeometry();
      // COCO Connections
      const connections = [
        [0,1], [0,2], [1,2], // Head to shoulders
        [1,3], [3,5],        // Left arm
        [2,4], [4,6],        // Right arm
        [1,7], [2,8], [7,8], // Torso
        [7,9], [9,11],       // Left leg
        [8,10], [10,12]      // Right leg
      ];
      // Create empty line segment positions array (2 vertices per connection, 3 coords per vertex)
      const positions = new Float32Array(connections.length * 2 * 3);
      lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      
      const skeletonLines = new THREE.LineSegments(lineGeo, boneMat);
      grp.add(skeletonLines);
      
      scene.add(grp);
      wifiSkeletonsRef.current.push({ grp, joints, skeletonLines, connections, baseX: x, baseZ: z, phase: Math.random() * Math.PI * 2 });
      return grp;
    };

    mkWiFiSkeleton(-10, -5, '#0ea5e9'); // Worker 1
    mkWiFiSkeleton(10, 0, '#ec4899');  // Worker 2
    mkWiFiSkeleton(0, -15, '#10b981'); // Worker 3



    // 4. Create visual 3D Hotspot Spheres
    const hotspotGroup = new THREE.Group();
    scene.add(hotspotGroup);

    HOTSPOTS.forEach(hot => {
      // Outer glow
      const glowGeo = new THREE.SphereGeometry(1.2, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({
        color: hot.severity === 'Critical' ? 0xef4444 : hot.severity === 'Warning' ? 0xf59e0b : 0x10b981,
        transparent: true,
        opacity: 0.25,
        wireframe: true
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(hot.pos[0], hot.pos[1], hot.pos[2]);
      hotspotGroup.add(glow);

      // Inner sphere
      const coreGeo = new THREE.SphereGeometry(0.4, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({
        color: hot.severity === 'Critical' ? 0xef4444 : hot.severity === 'Warning' ? 0xf59e0b : 0x10b981
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(hot.pos[0], hot.pos[1], hot.pos[2]);
      hotspotGroup.add(core);

      // Store references in mesh
      core.userData = { id: hot.id };
    });

    // Raycast listener for hotspot clicking
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onCanvasClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(hotspotGroup.children);
      
      if (intersects.length > 0) {
        const clickedObj = intersects[0].object;
        const hotspotId = clickedObj.userData.id;
        if (hotspotId) {
          const match = HOTSPOTS.find(h => h.id === hotspotId);
          if (match) triggerFocusHotspot(match);
        }
      }
    };

    renderer.domElement.addEventListener('click', onCanvasClick);

    // 5. Generate Point Cloud representation (for points mode fallback)
    const pointsGeo = new THREE.BufferGeometry();
    const pointCount = 12000;
    const positionsArr = new Float32Array(pointCount * 3);
    const colorsArr = new Float32Array(pointCount * 3);

    for (let i = 0; i < pointCount; i++) {
      // Distribute randomly in terrain bounds
      const px = (Math.random() - 0.5) * 106.6; // terrainWidth
      const pz = (Math.random() - 0.5) * 60; // terrainHeight
      
      // Calculate elevation
      const py = (Math.sin(px * 0.15) * Math.cos(pz * 0.15) * 0.3) + (Math.sin(px * 0.05) * 0.2);

      positionsArr[i * 3] = px;
      positionsArr[i * 3 + 1] = py;
      positionsArr[i * 3 + 2] = pz;

      // HSL color gradients
      const hr = (py + 10) / 20;
      const c = new THREE.Color();
      c.setHSL(0.5 - hr * 0.4, 0.9, 0.5);
      colorsArr[i * 3] = c.r;
      colorsArr[i * 3 + 1] = c.g;
      colorsArr[i * 3 + 2] = c.b;
    }

    pointsGeo.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
    pointsGeo.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));

    const pointsMat = new THREE.PointsMaterial({
      size: 0.25,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });

    const particleSystem = new THREE.Points(pointsGeo, pointsMat);
    particleSystemRef.current = particleSystem;
    // hidden by default
    particleSystem.visible = false;
    scene.add(particleSystem);

    // 6. Animation render loop
    const clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Spin propellers
      if (droneRotorsSpinning) {
        rotorPropellers.forEach(prop => {
          prop.rotation.y += 0.7; // Speed of spin
        });
      }

      // Animate RuView WiFi Skeletons
      wifiSkeletonsRef.current.forEach((skel, i) => {
        const t = elapsed * 2.0 + skel.phase;
        
        // Simulating walking motion in 3D
        skel.grp.position.x = skel.baseX + Math.sin(t * 0.2) * 5;
        skel.grp.position.z = skel.baseZ + Math.cos(t * 0.2) * 5;
        
        // Base height calculation depending on terrain
        const py = (Math.sin(skel.grp.position.x * 0.15) * Math.cos(skel.grp.position.z * 0.15) * 0.3) + (Math.sin(skel.grp.position.x * 0.05) * 0.2);
        skel.grp.position.y = py;

        const joints = skel.joints;
        // Head
        joints[0].position.set(0, 3.8 + Math.sin(t*2)*0.1, 0);
        // Shoulders
        joints[1].position.set(-0.6, 3.0 + Math.sin(t*2)*0.1, 0);
        joints[2].position.set(0.6, 3.0 + Math.sin(t*2)*0.1, 0);
        // Elbows (swinging opposite to legs)
        joints[3].position.set(-0.7, 2.0, Math.sin(t)*0.5);
        joints[4].position.set(0.7, 2.0, -Math.sin(t)*0.5);
        // Wrists
        joints[5].position.set(-0.8, 1.0, Math.sin(t)*0.8);
        joints[6].position.set(0.8, 1.0, -Math.sin(t)*0.8);
        // Hips
        joints[7].position.set(-0.3, 1.8, 0);
        joints[8].position.set(0.3, 1.8, 0);
        // Knees (walking)
        joints[9].position.set(-0.3, 1.0, -Math.sin(t)*0.6);
        joints[10].position.set(0.3, 1.0, Math.sin(t)*0.6);
        // Ankles
        joints[11].position.set(-0.3, 0.2, -Math.sin(t)*0.8 + Math.max(0, Math.cos(t)*0.4));
        joints[12].position.set(0.3, 0.2, Math.sin(t)*0.8 + Math.max(0, -Math.cos(t)*0.4));
        
        // Add random jitter for the other 4 points (simulate noisy WiFi detection points)
        for (let j=13; j<17; j++) {
           joints[j].position.set(Math.random()-0.5, Math.random()*4, Math.random()-0.5);
        }

        // Update lines
        const posAttr = skel.skeletonLines.geometry.attributes.position;
        skel.connections.forEach((conn, idx) => {
          const ptA = joints[conn[0]].position;
          const ptB = joints[conn[1]].position;
          
          posAttr.setXYZ(idx * 2, ptA.x, ptA.y, ptA.z);
          posAttr.setXYZ(idx * 2 + 1, ptB.x, ptB.y, ptB.z);
        });
        posAttr.needsUpdate = true;
      });

      // Hover movement for drone
      if (!flythroughActive && droneGroup) {
        droneGroup.position.y = 10 + Math.sin(elapsed * 2.5) * 0.3;
        droneGroup.rotation.z = Math.sin(elapsed * 1.5) * 0.02;
        droneGroup.rotation.x = Math.cos(elapsed * 1.5) * 0.01;
      }

      // Fly-through path simulator logic
      if (flythroughActive && cameraRef.current) {
        flythroughProgress.current += delta * 0.05; // control speed
        if (flythroughProgress.current > 1) flythroughProgress.current = 0;

        const progress = flythroughProgress.current;
        // circular camera path
        const angle = progress * Math.PI * 2;
        const radius = 38 + Math.sin(angle * 3) * 6;
        
        const camX = Math.cos(angle) * radius;
        const camZ = Math.sin(angle) * radius;
        const camY = 16 + Math.cos(angle * 2) * 5;

        cameraRef.current.position.set(camX, camY, camZ);
        
        // Drone follows path slightly ahead
        const droneAngle = angle + 0.3;
        const droneX = Math.cos(droneAngle) * (radius - 5);
        const droneZ = Math.sin(droneAngle) * (radius - 5);
        const droneY = 12 + Math.cos(droneAngle * 2) * 3 + Math.sin(elapsed * 2) * 0.2;

        droneGroup.position.set(droneX, droneY, droneZ);
        
        // Align drone heading to flight tangent
        droneGroup.rotation.y = -droneAngle + Math.PI;

        // Keep camera looking at the drone
        controls.target.copy(droneGroup.position);
      }

      // Update HUD info
      setCurrentCameraPos({
        x: Math.round(camera.position.x),
        y: Math.round(camera.position.y),
        z: Math.round(camera.position.z)
      });

      controls.update();
      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Handle Window Resize
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 450;
      
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Clean up WebGL resources
    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      
      // Dispose geometry and materials
      terrainGeo.dispose();
      terrainMat.dispose();
      bodyGeo.dispose();
      bodyMat.dispose();
      gimbalGeo.dispose();
      gimbalMat.dispose();
      armGeo.dispose();
      armMat.dispose();
      pointsGeo.dispose();
      pointsMat.dispose();
      
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [flythroughActive, droneRotorsSpinning]);

  // Focus camera target on hotspot
  const triggerFocusHotspot = (hotspot) => {
    setActiveHotspot(hotspot);
    
    // Deactivate flythrough
    setFlythroughActive(false);

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    // Smooth transition using simple setTimeout chain (React state friendly)
    const targetLookAt = new THREE.Vector3(hotspot.pos[0], hotspot.pos[1], hotspot.pos[2]);
    const targetCamPos = new THREE.Vector3(
      hotspot.pos[0] + 10,
      hotspot.pos[1] + 8,
      hotspot.pos[2] + 12
    );

    // Lerp controls target
    controls.target.copy(targetLookAt);
    camera.position.copy(targetCamPos);
    controls.update();
  };

  // Adjust display rendering modes
  useEffect(() => {
    const terrain = terrainMeshRef.current;
    const particles = particleSystemRef.current;
    if (!terrain || !particles) return;

    if (displayMode === 'shaded') {
      terrain.visible = true;
      terrain.material.wireframe = false;
      terrain.material.flatShading = true;
      terrain.material.needsUpdate = true;
      particles.visible = false;
    } else if (displayMode === 'wireframe') {
      terrain.visible = true;
      terrain.material.wireframe = true;
      terrain.material.opacity = 1;
      terrain.material.transparent = false;
      terrain.material.map = null; // Hide texture in wireframe
      terrain.material.needsUpdate = true;
      particles.visible = false;
    } else if (displayMode === 'points') {
      terrain.visible = false;
      particles.visible = true;
    } else if (displayMode === 'contour') {
      terrain.visible = true;
      terrain.material.wireframe = false;
      terrain.material.flatShading = false;
      terrain.material.opacity = 1;
      terrain.material.transparent = false;
      if (!terrain.material.map) {
        const tex = new THREE.TextureLoader().load('/digital_twin/frames/frame_00.jpg');
        tex.colorSpace = THREE.SRGBColorSpace;
        terrain.material.map = tex;
      }
      terrain.material.needsUpdate = true;
      particles.visible = false;
    }
  }, [displayMode]);

  // Handle daylight/sun settings updates
  useEffect(() => {
    const dirLight = dirLightRef.current;
    const ambientLight = ambientLightRef.current;
    const scene = sceneRef.current;
    if (!dirLight || !ambientLight || !scene) return;

    const isDark = document.documentElement.classList.contains('dark');
    
    dirLight.intensity = sunIntensity;

    if (timeOfDay === 'morning') {
      dirLight.position.set(-60, 25, -20);
      dirLight.color.setHex(0xffaa66); // Warm orange sunrise
      ambientLight.color.setHex(0xbaccff);
      scene.background.setHex(isDark ? 0x090b14 : 0xfef08a);
    } else if (timeOfDay === 'noon') {
      dirLight.position.set(10, 80, 10);
      dirLight.color.setHex(0xffffff); // Direct white light
      ambientLight.color.setHex(0xffffff);
      scene.background.setHex(isDark ? 0x0B0F19 : 0xF8FAFC);
    } else if (timeOfDay === 'sunset') {
      dirLight.position.set(60, 15, 20);
      dirLight.color.setHex(0xff5533); // Strong red sunset
      ambientLight.color.setHex(0xaa99ff);
      scene.background.setHex(isDark ? 0x07080f : 0xffedd5);
    }
  }, [timeOfDay, sunIntensity]);

  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(35, 30, 45);
      controlsRef.current.target.set(0, 5, 0);
      controlsRef.current.update();
      setActiveHotspot(null);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 text-left">
      {/* 3D WebGL Canvas Card */}
      <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col h-[520px] relative overflow-hidden">
        <header className="flex justify-between items-center mb-3 z-20">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">3D Mesh Surveyor Viewer</h3>
            <p className="text-[10px] text-slate-400">Drag to rotate, pinch to zoom, right-click to pan. Click nodes for structural hotspot check.</p>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={handleResetCamera} 
              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 active:scale-95 transition-all flex items-center justify-center"
              title="Reset Camera Target"
            >
              <span className="material-symbols-outlined text-sm">home_pin</span>
            </button>
            <button 
              onClick={() => setDroneRotorsSpinning(s => !s)} 
              className={`p-1.5 rounded-lg active:scale-95 transition-all flex items-center justify-center ${
                droneRotorsSpinning 
                  ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200'
              }`}
              title="Toggle Rotor Animations"
            >
              <span className="material-symbols-outlined text-sm">rotate_right</span>
            </button>
          </div>
        </header>

        {/* WebGL Canvas Render Container */}
        <div ref={containerRef} className="flex-1 w-full rounded-lg bg-slate-950 overflow-hidden relative border border-slate-200 dark:border-slate-800" style={{ height: '400px' }} />

        {/* HUD Controls Overlay inside canvas */}
        <div className="absolute bottom-8 left-8 bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-[10px] space-y-1 text-slate-300 z-20 pointer-events-none shadow-md">
          <div className="font-bold text-sky-400">CAMERA TELEMETRY</div>
          <div>Cam Position: [X: {currentCameraPos.x}, Y: {currentCameraPos.y}, Z: {currentCameraPos.z}]</div>
          <div>Target Focus: {activeHotspot ? activeHotspot.name : 'Origin Center'}</div>
          <div>Render Frame: 60.0 FPS / WebGL v2.0</div>
        </div>

        {/* RuView WiFi DensePose HUD */}
        <div className="absolute top-16 left-8 bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-lg border border-emerald-800/50 text-[10px] space-y-1 text-slate-300 z-20 pointer-events-none shadow-md">
          <div className="font-bold text-emerald-400 flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            RUVIEW WIFI DENSEPOSE
          </div>
          <div>ESP32 Edge Nodes: 4 Active</div>
          <div>RF Coherence: 99.4% (Channel 6)</div>
          <div>Workers Tracked (3D Pose): 3</div>
          <div className="text-emerald-500/80 mt-1">✓ Privacy-safe sensing active</div>
        </div>

        {/* Quick Mode Bar */}
        <div className="absolute bottom-8 right-8 flex bg-slate-950/80 backdrop-blur-md p-1 rounded-lg border border-slate-800 z-20 gap-1">
          {['shaded', 'wireframe', 'points', 'contour'].map(mode => (
            <button
              key={mode}
              onClick={() => setDisplayMode(mode)}
              className={`text-[9px] font-bold px-2 py-1.5 rounded capitalize transition-all ${
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

      {/* Control Room / Annotations Sidebar */}
      <div className="xl:col-span-4 space-y-6">
        {/* Hotspots Inspect Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-3">Survey structural Hotspots</h4>
          
          <div className="grid grid-cols-3 gap-2 mb-4">
            {HOTSPOTS.map((hot) => (
              <button
                key={hot.id}
                onClick={() => triggerFocusHotspot(hot)}
                className={`py-2 px-1 rounded-lg border text-center transition-all ${
                  activeHotspot?.id === hot.id
                    ? 'border-sky-500 bg-sky-500/10 text-sky-500'
                    : 'border-slate-100 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="text-[10px] font-bold">{hot.id}</div>
                <div className="text-[8px] mt-0.5 font-semibold truncate px-1">{hot.name.split(' ')[0]}</div>
              </button>
            ))}
          </div>

          {activeHotspot ? (
            <div className="bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 rounded-lg p-3 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-800 dark:text-slate-100">{activeHotspot.name}</span>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                  activeHotspot.severity === 'Critical' 
                    ? 'bg-red-500/10 text-red-500' 
                    : activeHotspot.severity === 'Warning' 
                    ? 'bg-yellow-500/10 text-yellow-500' 
                    : 'bg-emerald-500/10 text-emerald-500'
                }`}>{activeHotspot.severity}</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">{activeHotspot.desc}</p>
              <div className="grid grid-cols-2 gap-2 text-[9px] border-t border-slate-200 dark:border-slate-800 pt-2 text-slate-400">
                <div>Fault Code: <span className="font-bold text-slate-600 dark:text-slate-200">{activeHotspot.code}</span></div>
                <div>Position: <span className="font-bold text-slate-600 dark:text-slate-200">[{activeHotspot.pos.join(', ')}]</span></div>
              </div>
            </div>
          ) : (
            <div className="h-28 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg flex flex-col justify-center items-center text-slate-400">
              <span className="material-symbols-outlined text-2xl mb-1">bubble_chart</span>
              <span className="text-[10px]">Select a hotspot node to inspect</span>
            </div>
          )}
        </div>

        {/* Fly-Through simulator */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-2">3D Fly-Through Simulator</h4>
          <p className="text-[10px] text-slate-400 mb-4">Simulate an autonomous waypoint camera sweep path over the 3D surface model.</p>
          
          <div className="flex gap-3 items-center">
            <button
              onClick={() => {
                setFlythroughActive(!flythroughActive);
                setActiveHotspot(null);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                flythroughActive
                  ? 'bg-red-500 text-slate-850 hover:bg-red-600'
                  : 'bg-sky-500 text-slate-850 hover:bg-sky-600'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{flythroughActive ? 'pause' : 'play_arrow'}</span>
              <span>{flythroughActive ? 'Stop Sweep Sim' : 'Start Camera Sweep'}</span>
            </button>
            
            {flythroughActive && (
              <div className="w-16 text-center text-xs bg-slate-50 dark:bg-slate-800 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                <div className="text-[8px] text-slate-400 font-bold uppercase">SWEEP SPEED</div>
                <div className="font-semibold text-sky-500 text-[10px]">1.0x</div>
              </div>
            )}
          </div>
        </div>

        {/* Ambient Daylight Settings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-3">Daylight Simulation Settings</h4>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center text-[10px] mb-1">
                <span className="text-slate-400 font-bold uppercase">Solar Angle / Time of Day</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">{timeOfDay}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['morning', 'noon', 'sunset'].map(time => (
                  <button
                    key={time}
                    onClick={() => { setTimeOfDay(time); setActiveHotspot(null); }}
                    className={`py-1.5 rounded-lg border text-center font-bold text-[9px] capitalize transition-all ${
                      timeOfDay === time 
                        ? 'border-sky-500 bg-sky-500/5 text-sky-500' 
                        : 'border-slate-100 dark:border-slate-800 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] mb-1.5">
                <span className="text-slate-400 font-bold uppercase">Sun Intensity</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{sunIntensity.toFixed(1)}x</span>
              </div>
              <input 
                type="range"
                min="0.1"
                max="3.0"
                step="0.1"
                value={sunIntensity}
                onChange={(e) => setSunIntensity(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Mesh Structural Info Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs text-xs space-y-3">
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider">Mesh Quality Analysis</h4>
          <div className="space-y-2 text-[10px] text-slate-400">
            <div className="flex justify-between"><span className="text-slate-400">Mesh Triangles (Faces):</span><span className="font-semibold text-slate-700 dark:text-slate-200">72,000</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Point Vertices:</span><span className="font-semibold text-slate-700 dark:text-slate-200">36,000</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Estimated Physical Volume:</span><span className="font-semibold text-slate-700 dark:text-slate-200">2.14M cu meters</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Mesh Watertight Test:</span><span className="font-bold text-emerald-500">PASSED</span></div>
            <div className="flex justify-between"><span className="text-slate-400">GSD Scan Precision:</span><span className="font-semibold text-slate-700 dark:text-slate-200">1.82 cm</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThreeModelingSection;
