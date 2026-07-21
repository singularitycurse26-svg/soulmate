import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";

interface Dice3DProps {
  rollTrigger: number;
  onResult: (values: [number, number]) => void;
}

function createDiceTexture(value: number): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#f8f8f8";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  ctx.fillStyle = "#1a1a2e";
  ctx.font = "bold 72px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const positions: Record<number, [number, number][]> = {
    1: [[64, 64]],
    2: [[40, 40], [88, 88]],
    3: [[40, 40], [64, 64], [88, 88]],
    4: [[40, 40], [88, 40], [40, 88], [88, 88]],
    5: [[40, 40], [88, 40], [64, 64], [40, 88], [88, 88]],
    6: [[40, 32], [88, 32], [40, 64], [88, 64], [40, 96], [88, 96]],
  };

  const dots = positions[value] || [[64, 64]];
  for (const [x, y] of dots) {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createDiceMaterials(): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  for (let i = 1; i <= 6; i++) {
    materials.push(
      new THREE.MeshStandardMaterial({
        map: createDiceTexture(i),
        roughness: 0.4,
        metalness: 0.1,
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
  const [rolling, setRolling] = useState(false);

  // Setup scene
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = 320;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 8, 8);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambient);

    const spotlight = new THREE.SpotLight(0xffe4b5, 2, 30, Math.PI / 4, 0.5, 1);
    spotlight.position.set(0, 15, 5);
    spotlight.castShadow = true;
    spotlight.shadow.mapSize.width = 1024;
    spotlight.shadow.mapSize.height = 1024;
    scene.add(spotlight);

    const fillLight = new THREE.DirectionalLight(0x6366f1, 0.3);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.8,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid
    const grid = new THREE.GridHelper(20, 20, 0x6366f1, 0x2a2a3e);
    (grid.material as THREE.Material).opacity = 0.3;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Physics world
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -30, 0),
    });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;
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
      { pos: [0, 0, -5], axis: [0, 0, 1] },
      { pos: [0, 0, 5], axis: [0, 0, 1] },
      { pos: [-5, 0, 0], axis: [1, 0, 0] },
      { pos: [5, 0, 0], axis: [1, 0, 0] },
    ];
    for (const { pos, axis } of wallPositions) {
      const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
      wall.position.set(pos[0], pos[1], pos[2]);
      wall.quaternion.setFromAxisAngle(new CANNON.Vec3(axis[0], axis[1], axis[2]), Math.PI);
      world.addBody(wall);
    }

    // Create 2 dice
    const diceMaterials = createDiceMaterials();
    for (let i = 0; i < 2; i++) {
      const size = 1.2;
      const shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
      const body = new CANNON.Body({
        mass: 1,
        shape,
        material: new CANNON.Material({ friction: 0.4, restitution: 0.3 }),
      });
      body.position.set(-1.5 + i * 3, 0.6, 0);
      world.addBody(body);
      diceBodiesRef.current.push(body);

      const geo = new THREE.BoxGeometry(size, size, size);
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
        let allStopped = true;
        for (const body of diceBodiesRef.current) {
          if (body.velocity.length() > 0.1 || body.angularVelocity.length() > 0.1) {
            allStopped = false;
            break;
          }
        }
        if (allStopped) {
          resultSentRef.current = true;
          rollingRef.current = false;
          setRolling(false);
          const values = diceBodiesRef.current.map(getDiceValue) as [number, number];
          setTimeout(() => onResult(values), 500);
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
    setRolling(true);

    for (let i = 0; i < diceBodiesRef.current.length; i++) {
      const body = diceBodiesRef.current[i];
      body.position.set(-2 + i * 4, 5 + Math.random() * 2, 0);
      body.velocity.set(
        (Math.random() - 0.5) * 5,
        0,
        (Math.random() - 0.5) * 3
      );
      body.angularVelocity.set(
        Math.random() * 15,
        Math.random() * 15,
        Math.random() * 15
      );
      body.quaternion.setFromEuler(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
    }
  }, [rollTrigger]);

  return (
    <div ref={mountRef} className="w-full rounded-xl overflow-hidden bg-bg-card border border-border" style={{ height: 320 }} />
  );
}
