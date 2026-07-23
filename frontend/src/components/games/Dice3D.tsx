import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";

interface Dice3DProps {
  rollTrigger: number;
  onResult: (values: [number, number]) => void;
}

function createDiceTexture(value: number): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Rounded corner clip
  const radius = 24;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.clip();

  // Gradient background — pearl white
  const grad = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size * 0.7);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.5, "#f0f0f5");
  grad.addColorStop(1, "#d8d8e0");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle inner glow
  const innerGrad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 3);
  innerGrad.addColorStop(0, "rgba(99, 102, 241, 0.05)");
  innerGrad.addColorStop(1, "rgba(99, 102, 241, 0)");
  ctx.fillStyle = innerGrad;
  ctx.fillRect(0, 0, size, size);

  // Border — beveled look
  ctx.strokeStyle = "rgba(100, 100, 120, 0.4)";
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, size - 12, size - 12);

  ctx.fillStyle = "#1a1a2e";
  ctx.font = "bold 120px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const positions: Record<number, [number, number][]> = {
    1: [[128, 128]],
    2: [[80, 80], [176, 176]],
    3: [[80, 80], [128, 128], [176, 176]],
    4: [[80, 80], [176, 80], [80, 176], [176, 176]],
    5: [[80, 80], [176, 80], [128, 128], [80, 176], [176, 176]],
    6: [[80, 64], [176, 64], [80, 128], [176, 128], [80, 192], [176, 192]],
  };

  const dots = positions[value] || [[128, 128]];
  for (const [x, y] of dots) {
    // Drop shadow
    ctx.beginPath();
    ctx.arc(x + 3, y + 3, 15, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fill();
    // Dot — deep navy
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();
    // Inner shadow on dot
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Highlight
    ctx.beginPath();
    ctx.arc(x - 5, y - 5, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.anisotropy = 8;
  return tex;
}

function createDiceMaterials(): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  for (let i = 1; i <= 6; i++) {
    materials.push(
      new THREE.MeshStandardMaterial({
        map: createDiceTexture(i),
        roughness: 0.25,
        metalness: 0.15,
        envMapIntensity: 0.5,
      })
    );
  }
  return materials;
}

// Map face index to dice value based on BoxGeometry face order
// BoxGeometry faces: +X, -X, +Y, -Y, +Z, -Z
// We map them to: 1, 6, 2, 5, 3, 4 (opposite faces sum to 7)
const FACE_VALUES = [1, 6, 2, 5, 3, 4];

function getDiceValue(body: CANNON.Body): number {
  const up = new CANNON.Vec3(0, 1, 0);
  const quaternions = [
    { axis: new CANNON.Vec3(1, 0, 0), value: FACE_VALUES[0] },
    { axis: new CANNON.Vec3(-1, 0, 0), value: FACE_VALUES[1] },
    { axis: new CANNON.Vec3(0, 1, 0), value: FACE_VALUES[2] },
    { axis: new CANNON.Vec3(0, -1, 0), value: FACE_VALUES[3] },
    { axis: new CANNON.Vec3(0, 0, 1), value: FACE_VALUES[4] },
    { axis: new CANNON.Vec3(0, 0, -1), value: FACE_VALUES[5] },
  ];

  let maxDot = -Infinity;
  let result = 1;

  for (const { axis, value } of quaternions) {
    const worldAxis = body.quaternion.vmult(axis);
    const dot = worldAxis.dot(up);
    if (dot > maxDot) {
      maxDot = dot;
      result = value;
    }
  }

  return result;
}

export function Dice3D({ rollTrigger, onResult }: Dice3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const worldRef = useRef<CANNON.World | null>(null);
  const diceBodiesRef = useRef<CANNON.Body[]>([]);
  const diceMeshesRef = useRef<THREE.Mesh[]>([]);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rollingRef = useRef(false);
  const resultSentRef = useRef(false);
  const rollStartRef = useRef(0);
  const onResultRef = useRef(onResult);
  const [rolling, setRolling] = useState(false);
  const [diceValues, setDiceValues] = useState<[number, number] | null>(null);

  // Keep ref updated
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Setup scene
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = 340;

    // Scene with fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.Fog(0x0a0a0f, 15, 30);
    sceneRef.current = scene;

    // Camera — zoomed out to see full table
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 13, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting — warm casino spotlight + soft fills
    const ambient = new THREE.AmbientLight(0x2a2a40, 0.4);
    scene.add(ambient);

    // Main spotlight — warm, soft cone
    const spotlight = new THREE.SpotLight(0xffd9a0, 2.5, 40, Math.PI / 4.5, 0.6, 2);
    spotlight.position.set(0, 20, 10);
    spotlight.castShadow = true;
    spotlight.shadow.mapSize.width = 2048;
    spotlight.shadow.mapSize.height = 2048;
    spotlight.shadow.camera.near = 5;
    spotlight.shadow.camera.far = 35;
    spotlight.shadow.radius = 8;
    spotlight.shadow.blurSamples = 16;
    scene.add(spotlight);

    // Close point light for dice face visibility
    const diceLight = new THREE.PointLight(0xfff5e0, 0.6, 15, 2);
    diceLight.position.set(0, 6, 4);
    scene.add(diceLight);

    // Rim light — purple, for edge definition
    const rimLight = new THREE.DirectionalLight(0x6366f1, 0.3);
    rimLight.position.set(-10, 6, -10);
    scene.add(rimLight);

    // Fill — warm pink, low intensity
    const fillLight = new THREE.DirectionalLight(0xff8fa3, 0.1);
    fillLight.position.set(10, 4, -6);
    scene.add(fillLight);

    // Floor — deep dark base
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x080812,
      roughness: 1.0,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Felt table — radial gradient texture for realistic look
    const feltCanvas = document.createElement("canvas");
    feltCanvas.width = 512;
    feltCanvas.height = 512;
    const feltCtx = feltCanvas.getContext("2d")!;
    const feltGrad = feltCtx.createRadialGradient(256, 256, 50, 256, 256, 256);
    feltGrad.addColorStop(0, "#2a6d3e");
    feltGrad.addColorStop(0.6, "#1a4d2e");
    feltGrad.addColorStop(1, "#0a2818");
    feltCtx.fillStyle = feltGrad;
    feltCtx.fillRect(0, 0, 512, 512);
    // Add subtle noise texture
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      feltCtx.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0}, ${Math.random() > 0.5 ? 255 : 0}, ${Math.random() > 0.5 ? 255 : 0}, ${Math.random() * 0.03})`;
      feltCtx.fillRect(x, y, 1, 1);
    }
    const feltTex = new THREE.CanvasTexture(feltCanvas);
    feltTex.needsUpdate = true;

    const circleGeo = new THREE.CircleGeometry(7, 64);
    const circleMat = new THREE.MeshStandardMaterial({
      map: feltTex,
      roughness: 0.92,
      metalness: 0.03,
    });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.01;
    circle.receiveShadow = true;
    scene.add(circle);

    // Table border ring — gold accent
    const ringGeo = new THREE.RingGeometry(6.8, 7.2, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xc8a84e,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0x4a3a1a,
      emissiveIntensity: 0.2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);

    // Inner accent ring — subtle blue
    const innerRingGeo = new THREE.RingGeometry(5.8, 6.0, 64);
    const innerRingMat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      roughness: 0.5,
      metalness: 0.3,
      transparent: true,
      opacity: 0.3,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.015;
    scene.add(innerRing);

    // Grid — very subtle
    const grid = new THREE.GridHelper(20, 20, 0x6366f1, 0x1a1a2e);
    (grid.material as THREE.Material).opacity = 0.08;
    (grid.material as THREE.Material).transparent = true;
    grid.position.y = 0.03;
    scene.add(grid);

    // Physics world
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -35, 0),
    });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 12;
    world.allowSleep = true;
    worldRef.current = world;

    // Floor body
    const floorBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
    });
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(floorBody);

    // Walls (invisible)
    const wallPositions = [
      { pos: [0, 0, -6], axis: [0, 0, 1], angle: 0 },
      { pos: [0, 0, 6], axis: [0, 0, 1], angle: Math.PI },
      { pos: [-6, 0, 0], axis: [1, 0, 0], angle: Math.PI },
      { pos: [6, 0, 0], axis: [1, 0, 0], angle: 0 },
    ];
    for (const { pos, axis, angle } of wallPositions) {
      const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
      wall.position.set(pos[0], pos[1], pos[2]);
      wall.quaternion.setFromAxisAngle(new CANNON.Vec3(axis[0], axis[1], axis[2]), angle);
      world.addBody(wall);
    }

    // Create 2 dice — at rest on table
    const diceMaterials = createDiceMaterials();
    const diceSize = 1.3;
    for (let i = 0; i < 2; i++) {
      const shape = new CANNON.Box(new CANNON.Vec3(diceSize / 2, diceSize / 2, diceSize / 2));
      const body = new CANNON.Body({
        mass: 1,
        shape,
        material: new CANNON.Material({ friction: 0.3, restitution: 0.25 }),
      });
      // Rest flat on table — y = half size exactly
      body.position.set(-1.8 + i * 3.6, diceSize / 2, 0);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.linearDamping = 0.4;
      body.angularDamping = 0.4;
      body.allowSleep = true;
      body.sleepSpeedLimit = 0.3;
      body.sleepTimeLimit = 0.3;
      // Force sleep immediately — dice stay still until rolled
      body.sleep();
      world.addBody(body);
      diceBodiesRef.current.push(body);

      const geo = new THREE.BoxGeometry(diceSize, diceSize, diceSize);
      const mesh = new THREE.Mesh(geo, diceMaterials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      diceMeshesRef.current.push(mesh);
    }

    // Animation loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);

      if (worldRef.current) {
        worldRef.current.step(1 / 60);
      }

      // Sync meshes with bodies
      for (let i = 0; i < diceBodiesRef.current.length; i++) {
        const body = diceBodiesRef.current[i];
        const mesh = diceMeshesRef.current[i];
        mesh.position.copy(body.position as any);
        mesh.quaternion.copy(body.quaternion as any);
      }

      // Check if dice stopped rolling
      if (rollingRef.current && !resultSentRef.current) {
        const elapsed = Date.now() - rollStartRef.current;
        let allStopped = true;
        for (const body of diceBodiesRef.current) {
          if (body.velocity.length() > 0.05 || body.angularVelocity.length() > 0.05) {
            allStopped = false;
            break;
          }
        }
        // Stop if all dice are still OR if 5 seconds have passed (fallback)
        if (allStopped || elapsed > 4000) {
          resultSentRef.current = true;
          rollingRef.current = false;
          setRolling(false);
          // Force dice to sleep
          for (const body of diceBodiesRef.current) {
            body.velocity.set(0, 0, 0);
            body.angularVelocity.set(0, 0, 0);
            body.sleep();
          }
          const values = diceBodiesRef.current.map(getDiceValue) as [number, number];
          setDiceValues(values);
          setTimeout(() => onResultRef.current(values), 400);
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      renderer.dispose();
      if (mountRef.current && renderer.domElement.parentNode) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Roll trigger
  useEffect(() => {
    if (rollTrigger === 0) return;

    rollingRef.current = true;
    resultSentRef.current = false;
    rollStartRef.current = Date.now();
    setRolling(true);
    setDiceValues(null);

    // Wake up dice bodies
    for (const body of diceBodiesRef.current) {
      body.wakeUp();
    }

    for (let i = 0; i < diceBodiesRef.current.length; i++) {
      const body = diceBodiesRef.current[i];
      // Toss dice up and forward with spin
      body.position.set(-2.5 + i * 5, 6 + Math.random() * 2, Math.random() * 2 - 1);
      body.velocity.set(
        (Math.random() - 0.5) * 4,
        Math.random() * 2,
        (Math.random() - 0.5) * 3
      );
      body.angularVelocity.set(
        8 + Math.random() * 12,
        8 + Math.random() * 12,
        8 + Math.random() * 12
      );
      body.quaternion.setFromEuler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
    }
  }, [rollTrigger]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-bg-card border border-border" style={{ height: 340 }}>
      <div ref={mountRef} className="w-full h-full" />
      {/* Result overlay */}
      {diceValues && !rolling && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-3 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
          {diceValues.map((v, i) => (
            <div key={i} className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-black font-bold text-lg">
              {v}
            </div>
          ))}
          <div className="text-white font-bold text-lg flex items-center">
            = {diceValues[0] + diceValues[1]}
          </div>
        </div>
      )}
      {rolling && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
          <span className="text-accent font-medium text-sm animate-pulse">Rolling...</span>
        </div>
      )}
    </div>
  );
}
