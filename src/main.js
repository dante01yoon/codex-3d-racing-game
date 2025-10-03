import * as THREE from '../vendor/three.module.js';

// ----- DOM References -----
let canvas = document.getElementById('game-canvas');
if (!canvas) {
  canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvas.style.display = 'block';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  const firstChild = document.body.firstChild;
  if (firstChild) document.body.insertBefore(canvas, firstChild);
  else document.body.appendChild(canvas);
}
const hudElements = {
  lap: document.getElementById('hud-lap'),
  time: document.getElementById('hud-time'),
  last: document.getElementById('hud-last'),
  best: document.getElementById('hud-best'),
  checkpoints: document.getElementById('hud-checkpoints'),
  points: document.getElementById('hud-points')
};

const minimapContainer = document.getElementById('hud-minimap');
let minimapCanvas = document.getElementById('minimap-canvas');
if (!minimapCanvas && minimapContainer) {
  minimapCanvas = document.createElement('canvas');
  minimapCanvas.id = 'minimap-canvas';
  minimapCanvas.width = 200;
  minimapCanvas.height = 200;
  minimapContainer.insertBefore(minimapCanvas, minimapContainer.firstChild);
}
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

const finishElements = {
  container: document.getElementById('race-finish'),
  summary: document.getElementById('race-summary'),
  summaryPoints: document.getElementById('summary-points'),
  summaryBest: document.getElementById('summary-best'),
  summaryLast: document.getElementById('summary-last')
};

// ----- Constants -----
const TRACK_HALF_WIDTH = 8.2;
const CHECKPOINT_COUNT = 16;
const CAR_RIDE_HEIGHT = 0.45;
const CAR_COLLISION_RADIUS = 1.2;
const NPC_COLLISION_RADIUS = 1.1;
const COLLISION_RESTITUTION = 0.6;
const POINTS_PER_CHECKPOINT = 150;
const POINTS_PER_LAP = 500;
const RACE_TIME_LIMIT = 210; // seconds
const RACE_LAP_TARGET = 3;

// ----- Renderer & Scene -----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101428);
scene.fog = new THREE.Fog(0x0d1024, 80, 260);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 800);
scene.add(camera);

// ----- Lighting -----
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const sunLight = new THREE.DirectionalLight(0xfff3d4, 1.15);
sunLight.position.set(-120, 180, 80);
sunLight.castShadow = true;
sunLight.shadow.camera.near = 20;
sunLight.shadow.camera.far = 400;
sunLight.shadow.camera.left = -160;
sunLight.shadow.camera.right = 160;
sunLight.shadow.camera.top = 160;
sunLight.shadow.camera.bottom = -160;
sunLight.shadow.mapSize.set(2048, 2048);
scene.add(sunLight);

scene.add(new THREE.HemisphereLight(0x6a8dff, 0x08090d, 0.3));

// ----- Ground -----
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(800, 800),
  new THREE.MeshStandardMaterial({ color: 0x0a0b10, metalness: 0.1, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.08;
ground.receiveShadow = true;
scene.add(ground);

// ----- Track & Environment -----
function createTrack() {
  const controlPoints = [
    new THREE.Vector3(0, 0, 60),
    new THREE.Vector3(60, 0, 70),
    new THREE.Vector3(130, 0, 30),
    new THREE.Vector3(120, 0, -50),
    new THREE.Vector3(40, 0, -90),
    new THREE.Vector3(-30, 0, -80),
    new THREE.Vector3(-120, 0, -40),
    new THREE.Vector3(-110, 0, 50),
    new THREE.Vector3(-40, 0, 90)
  ];

  const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.15);
  const trackGeometry = new THREE.TubeGeometry(curve, 700, 8, 16, true);
  trackGeometry.scale(1, 0.08, 1);

  const trackMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c2f37,
    metalness: 0.05,
    roughness: 0.85,
    emissive: 0x050607,
    emissiveIntensity: 0.3
  });

  const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
  trackMesh.receiveShadow = true;
  scene.add(trackMesh);

  const edgeGeometry = new THREE.EdgesGeometry(trackGeometry, 45);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffd54f });
  scene.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

  const checkpoints = [];
  const checkpointProgresses = [];
  for (let i = 0; i < CHECKPOINT_COUNT; i += 1) {
    const progress = i / CHECKPOINT_COUNT;
    checkpoints.push(curve.getPointAt(progress));
    checkpointProgresses.push(progress);
  }

  return {
    curve,
    pointsDense: curve.getSpacedPoints(600),
    length: curve.getLength(),
    checkpoints,
    checkpointProgresses
  };
}

const trackData = createTrack();
const trackNormal = new THREE.Vector3();

function createGuardRails() {
  const guardGroup = new THREE.Group();
  const postGeom = new THREE.CylinderGeometry(0.18, 0.22, 1.4, 8);
  postGeom.translate(0, 0.7, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4c4f57, metalness: 0.2, roughness: 0.6 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.55, roughness: 0.25, emissive: 0x1c2632, emissiveIntensity: 0.1 });
  const offset = TRACK_HALF_WIDTH + 1.6;

  for (let i = 0; i < 140; i += 1) {
    const t = i / 140;
    const point = trackData.curve.getPointAt(t);
    const tangent = trackData.curve.getTangentAt(t);
    trackNormal.set(-tangent.z, 0, tangent.x).normalize();
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(postGeom, postMat);
      post.position.copy(point).addScaledVector(trackNormal, side * offset);
      post.castShadow = true;
      guardGroup.add(post);
    });
  }

  const railSamples = 320;
  const railRadius = 0.18;
  [-1, 1].forEach((side) => {
    const points = [];
    for (let i = 0; i <= railSamples; i += 1) {
      const t = i / railSamples;
      const point = trackData.curve.getPointAt(t);
      const tangent = trackData.curve.getTangentAt(t);
      trackNormal.set(-tangent.z, 0, tangent.x).normalize();
      const offsetPoint = point.clone().addScaledVector(trackNormal, side * offset);
      offsetPoint.y += 1.05;
      points.push(offsetPoint);
    }
    const offsetCurve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.1);
    const railGeom = new THREE.TubeGeometry(offsetCurve, railSamples * 2, railRadius, 6, true);
    guardGroup.add(new THREE.Mesh(railGeom, railMat));
  });

  scene.add(guardGroup);
}

createGuardRails();

function scatterTrees(count) {
  const trees = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, metalness: 0.05, roughness: 0.9 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, metalness: 0.1, roughness: 0.7, emissive: 0x0f210f, emissiveIntensity: 0.25 });
  const trunkGeom = new THREE.CylinderGeometry(0.35, 0.45, 3.6, 10);
  trunkGeom.translate(0, 1.8, 0);

  for (let i = 0; i < count; i += 1) {
    const t = Math.random();
    const point = trackData.curve.getPointAt(t);
    const tangent = trackData.curve.getTangentAt(t);
    trackNormal.set(-tangent.z, 0, tangent.x).normalize();
    const side = Math.random() > 0.5 ? 1 : -1;
    const distance = TRACK_HALF_WIDTH + 8 + Math.random() * 34;
    const treePos = point.clone().addScaledVector(trackNormal, side * distance);

    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    const layers = 3 + Math.floor(Math.random() * 3);
    for (let layer = 0; layer < layers; layer += 1) {
      const radius = 2.4 - layer * 0.5 + Math.random() * 0.4;
      const foliageGeom = new THREE.ConeGeometry(radius, 2.2, 12);
      const foliage = new THREE.Mesh(foliageGeom, foliageMat);
      foliage.position.y = 2.1 + layer * 1.1;
      foliage.castShadow = true;
      foliage.receiveShadow = true;
      tree.add(foliage);
    }

    tree.position.copy(treePos);
    tree.rotation.y = Math.random() * Math.PI * 2;
    trees.add(tree);
  }

  scene.add(trees);
}

scatterTrees(55);
function createBillboard(position, rotationY, color) {
  const group = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 6),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.35, side: THREE.DoubleSide })
  );
  panel.position.y = 5;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0x252a35, metalness: 0.2, roughness: 0.6 })
  );
  pole.position.y = 2;
  pole.castShadow = true;
  panel.castShadow = true;
  group.add(panel, pole);
  group.position.copy(position);
  group.rotation.y = rotationY;
  scene.add(group);
}

createBillboard(new THREE.Vector3(40, 0, 60), Math.PI / 5, 0x2196f3);
createBillboard(new THREE.Vector3(-80, 0, -30), -Math.PI / 3, 0xee5555);
createBillboard(new THREE.Vector3(100, 0, -20), Math.PI / 2.2, 0x4caf50);

const checkpointMaterial = new THREE.MeshStandardMaterial({ color: 0x84ffff, emissive: 0x29cfff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1 });
const startMaterial = new THREE.MeshStandardMaterial({ color: 0xfff176, emissive: 0xffd54f, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.15 });
const checkpointGeometry = new THREE.CylinderGeometry(1.2, 1.2, 0.5, 16);
const checkpointMarkers = [];

for (let i = 0; i < CHECKPOINT_COUNT; i += 1) {
  const marker = new THREE.Mesh(checkpointGeometry, i === 0 ? startMaterial : checkpointMaterial);
  marker.position.copy(trackData.checkpoints[i]);
  marker.position.y = 0.1;
  marker.receiveShadow = true;
  scene.add(marker);
  checkpointMarkers.push(marker);
}

function createGrandstand(progress, side) {
  const point = trackData.curve.getPointAt(progress);
  const tangent = trackData.curve.getTangentAt(progress).setY(0).normalize();
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

  const stand = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.2, roughness: 0.7 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.3, roughness: 0.4 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x1a237e, metalness: 0.6, roughness: 0.2, emissive: 0x0d1b5e, emissiveIntensity: 0.4 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(20, 1.5, 9), baseMat);
  base.position.y = 0.75;
  base.castShadow = true;
  base.receiveShadow = true;
  stand.add(base);

  for (let i = 0; i < 5; i += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(18 - i * 1.4, 0.6, 8 - i * 0.8), seatMat);
    step.position.set(0, 1.4 + i * 0.65, -0.6 + i * 0.65);
    step.castShadow = true;
    step.receiveShadow = true;
    stand.add(step);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 10), roofMat);
  roof.position.set(0, 5.2, -1.5);
  roof.rotation.x = THREE.MathUtils.degToRad(8);
  roof.castShadow = true;
  stand.add(roof);

  const offset = TRACK_HALF_WIDTH + 14;
  stand.position.copy(point).addScaledVector(normal, side * offset);
  stand.position.y = 0;
  const lookTarget = point.clone();
  stand.lookAt(lookTarget.x, stand.position.y + 4, lookTarget.z);
  scene.add(stand);
}

createGrandstand(0.05, 1);
createGrandstand(0.28, -1);
createGrandstand(0.62, 1);

function createTrackLights() {
  const lights = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.35, roughness: 0.6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff7d6, emissive: 0xfff9c4, emissiveIntensity: 1.2 });
  const postGeom = new THREE.CylinderGeometry(0.18, 0.22, 4.4, 10);
  postGeom.translate(0, 2.2, 0);
  const lampGeom = new THREE.SphereGeometry(0.35, 14, 14);

  for (let i = 0; i < 24; i += 1) {
    const progress = i / 24;
    const point = trackData.curve.getPointAt(progress);
    const tangent = trackData.curve.getTangentAt(progress);
    trackNormal.set(-tangent.z, 0, tangent.x).normalize();
    const side = i % 2 === 0 ? 1 : -1;
    const offset = TRACK_HALF_WIDTH + 2.4;

    const group = new THREE.Group();
    const post = new THREE.Mesh(postGeom, postMat);
    const lamp = new THREE.Mesh(lampGeom, lampMat);
    const pointLight = new THREE.PointLight(0xfff7d6, 0.65, 32, 2.2);
    lamp.position.y = 4.4;
    pointLight.position.y = 4.4;
    group.add(post, lamp, pointLight);
    group.position.copy(point).addScaledVector(trackNormal, side * offset);
    lights.add(group);
  }

  scene.add(lights);
}

createTrackLights();

function createAmbientMist() {
  const count = 650;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const radius = 120 + Math.random() * 120;
    const angle = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 6 + Math.random() * 18;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    const tint = 0.5 + Math.random() * 0.5;
    colors[i * 3] = 0.45 * tint;
    colors[i * 3 + 1] = 0.7 * tint;
    colors[i * 3 + 2] = 1 * tint;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({ size: 0.65, vertexColors: true, transparent: true, opacity: 0.18, depthWrite: false });
  const mist = new THREE.Points(geometry, material);
  scene.add(mist);
  return mist;
}

const ambientMist = createAmbientMist();
// ----- Car Creation -----
function createCar({ bodyColor = 0xe53935, accentColor = 0x111111, glassColor = 0xb3e5fc } = {}) {
  const car = new THREE.Group();
  const shell = new THREE.Group();
  shell.rotation.y = -Math.PI / 2;
  car.add(shell);

  const primaryMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.55, roughness: 0.32 });
  const secondaryMat = new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.3, roughness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: glassColor, metalness: 0.85, roughness: 0.06, transparent: true, opacity: 0.68 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 1.55), primaryMat);
  chassis.position.set(-0.3, 0.2, 0);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  shell.add(chassis);

  const sidePods = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.5, 2.05), primaryMat);
  sidePods.position.set(-0.4, -0.05, 0);
  sidePods.castShadow = true;
  shell.add(sidePods);

  const noseCone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.65, 2.4, 18), primaryMat);
  noseCone.rotation.z = Math.PI / 2;
  noseCone.position.set(1.9, -0.1, 0);
  noseCone.castShadow = true;
  shell.add(noseCone);

  const frontWing = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 2.6), secondaryMat);
  frontWing.position.set(3, -0.22, 0);
  frontWing.castShadow = true;
  shell.add(frontWing);

  const frontWingPlanes = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 2.8), secondaryMat);
  frontWingPlanes.position.set(2.35, -0.18, 0);
  frontWingPlanes.castShadow = true;
  shell.add(frontWingPlanes);

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.05), glassMat);
  cockpit.position.set(-0.95, 0.5, 0);
  cockpit.castShadow = true;
  shell.add(cockpit);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 12, 24, Math.PI), secondaryMat);
  halo.rotation.x = Math.PI / 2;
  halo.position.set(-0.95, 0.65, 0);
  halo.castShadow = true;
  shell.add(halo);

  const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.7), secondaryMat);
  airbox.position.set(-1.8, 0.62, 0);
  airbox.castShadow = true;
  shell.add(airbox);

  const rearWingSupport = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), secondaryMat);
  rearWingSupport.position.set(-2.6, 0.55, 0);
  shell.add(rearWingSupport);

  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 2.3), secondaryMat);
  rearWing.position.set(-3.1, 0.75, 0);
  rearWing.castShadow = true;
  shell.add(rearWing);

  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 1.8), secondaryMat);
  diffuser.position.set(-2.7, -0.15, 0);
  diffuser.castShadow = true;
  shell.add(diffuser);

  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.35, roughness: 0.4 });
  const tyreGeom = new THREE.CylinderGeometry(0.52, 0.52, 0.32, 22);
  tyreGeom.rotateZ(Math.PI / 2);

  const rimMat = new THREE.MeshStandardMaterial({ color: 0xdcdcdc, metalness: 0.7, roughness: 0.25 });
  const rimGeom = new THREE.CylinderGeometry(0.26, 0.26, 0.36, 18);
  rimGeom.rotateZ(Math.PI / 2);

  function createWheel(x, z) {
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeom, tyreMat);
    tyre.castShadow = true;
    tyre.receiveShadow = true;
    wheel.add(tyre);
    const rim = new THREE.Mesh(rimGeom, rimMat);
    rim.castShadow = true;
    wheel.add(rim);
    wheel.position.set(x, -0.05, z);
    return wheel;
  }

  [[2.15, 0.98], [2.15, -0.98], [-1.55, 0.98], [-1.55, -0.98]].forEach(([x, z]) => shell.add(createWheel(x, z)));

  return car;
}

const car = createCar();
scene.add(car);

const trafficCars = [];
function spawnTrafficCars() {
  const presets = [
    { bodyColor: 0x29b6f6, accentColor: 0x0d47a1, laneOffset: 2.6, speed: 38, progress: 0.18 },
    { bodyColor: 0xffc107, accentColor: 0x8d6e63, laneOffset: -2.6, speed: 42, progress: 0.55 },
    { bodyColor: 0x8e24aa, accentColor: 0x5e35b1, laneOffset: 0.6, speed: 34, progress: 0.82 }
  ];

  presets.forEach((preset) => {
    const npc = createCar({ bodyColor: preset.bodyColor, accentColor: preset.accentColor, glassColor: 0xd1c4e9 });
    npc.scale.setScalar(0.94 + Math.random() * 0.08);
    scene.add(npc);
    trafficCars.push({
      mesh: npc,
      laneOffset: preset.laneOffset,
      targetLaneOffset: preset.laneOffset,
      baseLaneOffset: preset.laneOffset,
      speed: preset.speed,
      baseSpeed: preset.speed,
      progress: preset.progress,
      point: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      minimapColor: `#${preset.bodyColor.toString(16).padStart(6, '0')}`,
      velocity: new THREE.Vector3(),
      prevPosition: new THREE.Vector3()
    });
  });
}

spawnTrafficCars();
// ----- State -----
const carState = {
  speed: 0,
  heading: 0,
  maxSpeed: 120,
  maxReverseSpeed: -30,
  progress: 0
};

const lapTracker = {
  lapIndex: 1,
  nextCheckpointIndex: 1,
  currentLapTime: 0,
  lastLapTime: null,
  bestLapTime: null,
  prevProgress: 0,
  totalCheckpoints: CHECKPOINT_COUNT
};

const raceState = {
  points: 0,
  finished: false,
  timeRemaining: RACE_TIME_LIMIT,
  checkpointsCleared: 0,
  lapsCompleted: 0
};

const checkpointEffects = [];
const rewardRingGeometry = new THREE.TorusGeometry(1.05, 0.09, 14, 36);
const cameraBaseOffset = new THREE.Vector3(0, 6, -12);
const cameraLookOffset = new THREE.Vector3(0, 1.2, 0);
const cameraTemp = new THREE.Vector3();
const cameraOffsetTemp = new THREE.Vector3();
const tempVector = new THREE.Vector3();
const forwardVector = new THREE.Vector3();
const lateralVector = new THREE.Vector3();
const carVelocity = new THREE.Vector3();
const collisionNormal = new THREE.Vector3();
const collisionRelative = new THREE.Vector3();

// ----- Utility Functions -----
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothApproach(current, target, rate, delta) {
  return current + (target - current) * (1 - Math.exp(-rate * delta));
}

function formatTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '--';
  const mins = Math.floor(seconds / 60);
  const remaining = seconds - mins * 60;
  const secs = Math.floor(remaining);
  const millis = Math.floor((remaining - secs) * 1000);
  return `${mins}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function computeCompletedCheckpoints() {
  return (lapTracker.nextCheckpointIndex + lapTracker.totalCheckpoints - 1) % lapTracker.totalCheckpoints;
}

function updateHUD() {
  if (!hudElements.lap) return;
  hudElements.lap.textContent = `Lap ${lapTracker.lapIndex}`;
  if (hudElements.time) hudElements.time.textContent = formatTime(raceState.timeRemaining);
  if (hudElements.last) hudElements.last.textContent = formatTime(lapTracker.lastLapTime);
  if (hudElements.best) hudElements.best.textContent = formatTime(lapTracker.bestLapTime);
  if (hudElements.checkpoints) hudElements.checkpoints.textContent = `${computeCompletedCheckpoints()}/${lapTracker.totalCheckpoints}`;
  if (hudElements.points) hudElements.points.textContent = raceState.points;
}

function createPointsSprite(label, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 124px sans-serif';
  ctx.fillStyle = '#0b1020';
  ctx.shadowColor = 'rgba(12, 18, 36, 0.4)';
  ctx.shadowBlur = 12;
  ctx.fillText(label, canvas.width / 2 + 4, canvas.height / 2 + 4);
  ctx.fillStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
  ctx.shadowBlur = 0;
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.8, 2.8, 1);
  return { sprite, texture };
}

function spawnPointBurst(position, amount, colorHex) {
  const group = new THREE.Group();
  group.position.copy(position).add(new THREE.Vector3(0, 1.1, 0));
  const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.92 });
  const ring = new THREE.Mesh(rewardRingGeometry, ringMat);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const spriteData = createPointsSprite(`+${amount}`, colorHex);
  let sprite = null;
  let texture = null;
  if (spriteData) {
    sprite = spriteData.sprite;
    texture = spriteData.texture;
    sprite.position.y = 0.9;
    group.add(sprite);
  }

  scene.add(group);
  checkpointEffects.push({ group, ring, sprite, texture, ttl: 1.25, maxTtl: 1.25 });
}

function updateCheckpointEffects(delta) {
  for (let i = checkpointEffects.length - 1; i >= 0; i -= 1) {
    const effect = checkpointEffects[i];
    effect.ttl -= delta;
    const lifeRatio = Math.max(effect.ttl / effect.maxTtl, 0);
    const progress = 1 - lifeRatio;
    effect.group.position.y += delta * 1.2;
    effect.ring.scale.setScalar(1 + progress * 1.5);
    effect.ring.material.opacity = lifeRatio;
    if (effect.sprite) {
      effect.sprite.material.opacity = lifeRatio;
      effect.sprite.scale.setScalar(2.2 + progress * 1.6);
    }
    if (effect.ttl <= 0) {
      scene.remove(effect.group);
      effect.ring.material.dispose();
      if (effect.texture) effect.texture.dispose();
      if (effect.sprite) effect.sprite.material.dispose();
      checkpointEffects.splice(i, 1);
    }
  }
}

function addPoints(amount, colorHex, position) {
  raceState.points += amount;
  if (hudElements.points) hudElements.points.textContent = raceState.points;
  if (position) spawnPointBurst(position.clone(), amount, colorHex);
}

function awardCheckpointReward(isLapReward) {
  if (raceState.finished) return;
  const reward = isLapReward ? POINTS_PER_LAP : POINTS_PER_CHECKPOINT;
  const colorHex = isLapReward ? 0xfff176 : 0x81d4fa;
  raceState.checkpointsCleared += 1;
  addPoints(reward, colorHex, car.position);
  if (isLapReward) raceState.lapsCompleted += 1;
}

function resetRaceState() {
  raceState.points = 0;
  raceState.finished = false;
  raceState.timeRemaining = RACE_TIME_LIMIT;
  raceState.checkpointsCleared = 0;
  raceState.lapsCompleted = 0;
  if (finishElements.container) finishElements.container.classList.add('hidden');
  if (hudElements.points) hudElements.points.textContent = raceState.points;
  if (hudElements.time) hudElements.time.textContent = formatTime(raceState.timeRemaining);

  for (let i = checkpointEffects.length - 1; i >= 0; i -= 1) {
    const effect = checkpointEffects[i];
    scene.remove(effect.group);
    effect.ring.material.dispose();
    if (effect.texture) effect.texture.dispose();
    if (effect.sprite) effect.sprite.material.dispose();
    checkpointEffects.splice(i, 1);
  }
  carVelocity.set(0, 0, 0);
}

function finishRace(reason) {
  if (raceState.finished) return;
  raceState.finished = true;
  raceState.timeRemaining = Math.max(raceState.timeRemaining, 0);
  if (finishElements.container) finishElements.container.classList.remove('hidden');
  const lapsText = raceState.lapsCompleted === 1 ? '1 lap' : `${raceState.lapsCompleted} laps`;
  const summary = reason === 'laps'
    ? `You crossed the ${RACE_LAP_TARGET}-lap target with ${formatTime(raceState.timeRemaining)} left on the clock.`
    : `Time expired after ${lapsText}.`;
  if (finishElements.summary) finishElements.summary.textContent = summary;
  if (finishElements.summaryPoints) finishElements.summaryPoints.textContent = raceState.points;
  if (finishElements.summaryBest) finishElements.summaryBest.textContent = formatTime(lapTracker.bestLapTime);
  if (finishElements.summaryLast) finishElements.summaryLast.textContent = formatTime(lapTracker.lastLapTime);
}

function updateRaceClock(delta) {
  if (raceState.finished) return;
  raceState.timeRemaining = Math.max(raceState.timeRemaining - delta, 0);
  if (hudElements.time) hudElements.time.textContent = formatTime(raceState.timeRemaining);
  if (raceState.lapsCompleted >= RACE_LAP_TARGET) finishRace('laps');
  else if (raceState.timeRemaining <= 0) finishRace('timeout');
}

function resetLapTracker() {
  lapTracker.lapIndex = 1;
  lapTracker.nextCheckpointIndex = 1 % lapTracker.totalCheckpoints;
  lapTracker.currentLapTime = 0;
  lapTracker.lastLapTime = null;
  lapTracker.bestLapTime = null;
  lapTracker.prevProgress = carState.progress;
  updateHUD();
}

function completeLap() {
  lapTracker.lastLapTime = lapTracker.currentLapTime;
  if (lapTracker.bestLapTime == null || lapTracker.lastLapTime < lapTracker.bestLapTime) lapTracker.bestLapTime = lapTracker.lastLapTime;
  lapTracker.lapIndex += 1;
  lapTracker.currentLapTime = 0;
  updateHUD();
}

function placeCarAtStart() {
  const startPoint = trackData.curve.getPointAt(0);
  const startTangent = trackData.curve.getTangentAt(0);
  car.position.copy(startPoint);
  car.position.y = CAR_RIDE_HEIGHT;
  carState.heading = Math.atan2(startTangent.x, startTangent.z);
  car.rotation.y = carState.heading;
  carState.speed = 0;
  carState.progress = 0;
  resetRaceState();
  resetLapTracker();
}

placeCarAtStart();
// ----- Input Handling -----
const inputState = { forward: false, backward: false, left: false, right: false };
const KEY_BINDINGS = {
  ArrowUp: 'forward', ArrowDown: 'backward', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'forward', s: 'backward', a: 'left', d: 'right'
};

function resolveBinding(key) {
  return KEY_BINDINGS[key] ?? KEY_BINDINGS[key.toLowerCase()];
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.key === 'm' || event.key === 'M') {
    event.preventDefault();
    setMinimapVisibility(!minimapState.enabled);
    return;
  }
  const binding = resolveBinding(event.key);
  if (binding) {
    event.preventDefault();
    inputState[binding] = true;
  }
  if (event.key === 'r' || event.key === 'R') {
    event.preventDefault();
    placeCarAtStart();
  }
});

window.addEventListener('keyup', (event) => {
  const binding = resolveBinding(event.key);
  if (binding) {
    event.preventDefault();
    inputState[binding] = false;
  }
});

// ----- Minimap Helpers -----
const minimapState = {
  enabled: true,
  width: minimapCanvas ? minimapCanvas.width : 0,
  height: minimapCanvas ? minimapCanvas.height : 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  trackPath: [],
  checkpointPath: []
};

function projectToMinimap(x, z) {
  return {
    x: x * minimapState.scale + minimapState.offsetX,
    y: minimapState.height - (z * minimapState.scale + minimapState.offsetY)
  };
}

function setMinimapVisibility(enabled) {
  minimapState.enabled = enabled;
  if (minimapContainer) minimapContainer.classList.toggle('hidden', !enabled);
  if (!enabled && minimapCtx) minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
}

function setupMinimap() {
  if (!minimapCanvas || !minimapCtx) return;
  minimapState.width = minimapCanvas.width;
  minimapState.height = minimapCanvas.height;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  trackData.pointsDense.forEach((point) => {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  });

  const padding = 18;
  const widthAvailable = Math.max(maxX - minX, 1);
  const heightAvailable = Math.max(maxZ - minZ, 1);
  minimapState.scale = Math.min(
    (minimapState.width - padding * 2) / widthAvailable,
    (minimapState.height - padding * 2) / heightAvailable
  );
  minimapState.offsetX = minimapState.width / 2 - ((minX + maxX) / 2) * minimapState.scale;
  minimapState.offsetY = minimapState.height / 2 - ((minZ + maxZ) / 2) * minimapState.scale;

  minimapState.trackPath = trackData.pointsDense.map((point) => projectToMinimap(point.x, point.z));
  minimapState.checkpointPath = trackData.checkpoints.map((point) => projectToMinimap(point.x, point.z));
}

setupMinimap();
setMinimapVisibility(true);
function recalculateCarProgress() {
  let minDistance = Infinity;
  let closestIndex = 0;
  for (let i = 0; i < trackData.pointsDense.length; i += 1) {
    const point = trackData.pointsDense[i];
    const dist = tempVector.copy(car.position).sub(point).length();
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }
  carState.progress = closestIndex / (trackData.pointsDense.length - 1);
  return minDistance;
}

function updateCar(delta) {
  if (raceState.finished) {
    forwardVector.set(Math.sin(carState.heading), 0, Math.cos(carState.heading));
    carState.speed = smoothApproach(carState.speed, 0, 24, delta);
    car.position.addScaledVector(forwardVector, carState.speed * delta);
    car.position.y = CAR_RIDE_HEIGHT;
    car.rotation.y = carState.heading;
    carVelocity.copy(forwardVector).multiplyScalar(carState.speed);
    return;
  }

  if (inputState.forward) carState.speed += 55 * delta;
  else if (inputState.backward) carState.speed -= 65 * delta;
  else carState.speed = smoothApproach(carState.speed, 0, 12, delta);

  carState.speed = clamp(carState.speed, carState.maxReverseSpeed, carState.maxSpeed);

  const speedFactor = clamp(Math.abs(carState.speed) / carState.maxSpeed, 0, 1);
  const steeringDelta = 2.8 * (0.35 + 0.65 * speedFactor) * delta;
  if (inputState.left) carState.heading += steeringDelta;
  if (inputState.right) carState.heading -= steeringDelta;

  forwardVector.set(Math.sin(carState.heading), 0, Math.cos(carState.heading));
  carVelocity.copy(forwardVector).multiplyScalar(carState.speed);
  car.position.addScaledVector(forwardVector, carState.speed * delta);
  car.position.y = CAR_RIDE_HEIGHT;
  car.rotation.y = carState.heading;

  const minDistance = recalculateCarProgress();
  if (minDistance > TRACK_HALF_WIDTH * 1.35) carState.speed = smoothApproach(carState.speed, 0, 9, delta);
  else if (minDistance > TRACK_HALF_WIDTH) carState.speed = smoothApproach(carState.speed, carState.speed * 0.5, 4, delta);

  carVelocity.copy(forwardVector).multiplyScalar(carState.speed);
}

function syncCarStateFromVelocity() {
  const speedMagnitude = carVelocity.length();
  if (speedMagnitude < 0.05) {
    carState.speed = 0;
    return;
  }
  carState.heading = Math.atan2(carVelocity.x, carVelocity.z);
  forwardVector.set(Math.sin(carState.heading), 0, Math.cos(carState.heading));
  const directionSign = Math.sign(carVelocity.dot(forwardVector)) || 1;
  carState.speed = clamp(speedMagnitude * directionSign, carState.maxReverseSpeed, carState.maxSpeed);
  car.rotation.y = carState.heading;
  carVelocity.copy(forwardVector).multiplyScalar(carState.speed);
}

function updateTraffic(delta) {
  if (trafficCars.length === 0) return;
  const laneLimit = TRACK_HALF_WIDTH - 1.4;

  trafficCars.forEach((npc) => {
    npc.prevPosition.copy(npc.mesh.position);
    npc.progress = (npc.progress + (npc.speed * delta) / trackData.length) % 1;
    npc.point.copy(trackData.curve.getPointAt(npc.progress));
    npc.tangent.copy(trackData.curve.getTangentAt(npc.progress)).setY(0).normalize();
    npc.normal.set(-npc.tangent.z, 0, npc.tangent.x).normalize();
  });

  trafficCars.forEach((npc, index) => {
    let targetLane = npc.baseLaneOffset;
    let targetSpeed = npc.baseSpeed;

    tempVector.copy(car.position).sub(npc.point);
    const forwardDistance = tempVector.dot(npc.tangent);
    const lateralDistance = tempVector.dot(npc.normal);
    if (forwardDistance > -2 && forwardDistance < 12 && Math.abs(lateralDistance) < 3.5) {
      targetSpeed = Math.min(targetSpeed, npc.baseSpeed * 0.55);
      const evasiveDirection = lateralDistance >= 0 ? -1 : 1;
      const preferred = Math.abs(lateralDistance) < 0.3 ? Math.sign(npc.baseLaneOffset || 1) : evasiveDirection;
      targetLane += preferred * 1.2;
    }

    for (let j = 0; j < trafficCars.length; j += 1) {
      if (index === j) continue;
      const other = trafficCars[j];
      lateralVector.copy(other.point).sub(npc.point);
      const forwardGap = lateralVector.dot(npc.tangent);
      const sideGap = lateralVector.dot(npc.normal);
      if (forwardGap > 0 && forwardGap < 8 && Math.abs(sideGap) < 2.4) {
        targetSpeed = Math.min(targetSpeed, npc.baseSpeed * 0.7);
        targetLane -= Math.sign(sideGap) * 0.8;
      }
    }

    npc.targetLaneOffset = clamp(targetLane, -laneLimit, laneLimit);
    npc.speed = smoothApproach(npc.speed, targetSpeed, 2.4, delta);
    npc.laneOffset = smoothApproach(npc.laneOffset, npc.targetLaneOffset, 6, delta);

    npc.mesh.position.copy(npc.point).addScaledVector(npc.normal, npc.laneOffset);
    npc.mesh.position.y = CAR_RIDE_HEIGHT;
    npc.mesh.rotation.y = Math.atan2(npc.tangent.x, npc.tangent.z);

    if (delta > 0) {
      if (npc.prevPosition.lengthSq() === 0) npc.velocity.set(0, 0, 0);
      else npc.velocity.copy(npc.mesh.position).sub(npc.prevPosition).divideScalar(delta);
    }
    npc.prevPosition.copy(npc.mesh.position);
  });
}

function hasCrossedCheckpoint(previous, current, target) {
  if (previous <= current) return previous <= target && current >= target;
  return previous <= target || current >= target;
}

function updateLapTimer(delta) {
  if (raceState.finished) return;
  lapTracker.currentLapTime += delta;

  const prevProgress = lapTracker.prevProgress;
  const currentProgress = carState.progress;
  let forwardDelta = currentProgress - prevProgress;
  if (forwardDelta < -0.5) forwardDelta += 1;
  else if (forwardDelta > 0.5) forwardDelta -= 1;

  if (forwardDelta >= 0) {
    const targetIndex = lapTracker.nextCheckpointIndex;
    const targetProgress = trackData.checkpointProgresses[targetIndex];
    if (hasCrossedCheckpoint(prevProgress, currentProgress, targetProgress)) {
      const isLapReward = targetIndex === 0;
      awardCheckpointReward(isLapReward);
      lapTracker.nextCheckpointIndex = (targetIndex + 1) % lapTracker.totalCheckpoints;
      if (isLapReward) completeLap();
    }
  }

  lapTracker.prevProgress = currentProgress;
  updateHUD();
}

function resolvePlayerNpcCollision(npc) {
  collisionNormal.copy(car.position).sub(npc.mesh.position);
  const distance = collisionNormal.length();
  const minDistance = CAR_COLLISION_RADIUS + NPC_COLLISION_RADIUS;
  if (distance >= minDistance || distance === 0) return;

  collisionNormal.divideScalar(distance);
  const separation = minDistance - distance;
  car.position.addScaledVector(collisionNormal, separation * 0.6);
  npc.mesh.position.addScaledVector(collisionNormal, -separation * 0.4);
  npc.laneOffset += collisionNormal.dot(npc.normal) * -separation * 0.4;

  const relativeVel = collisionRelative.copy(carVelocity).sub(npc.velocity);
  const impactSpeed = relativeVel.dot(collisionNormal);
  if (impactSpeed < 0) {
    const impulse = -(1 + COLLISION_RESTITUTION) * impactSpeed;
    carVelocity.addScaledVector(collisionNormal, impulse * 0.6);
    npc.velocity.addScaledVector(collisionNormal, -impulse * 0.4);
  } else {
    const push = separation * 4;
    carVelocity.addScaledVector(collisionNormal, push * 0.6);
    npc.velocity.addScaledVector(collisionNormal, -push * 0.4);
  }

  npc.prevPosition.copy(npc.mesh.position);
  const npcSpeed = npc.velocity.length();
  npc.speed = clamp(npcSpeed, 8, npc.baseSpeed * 1.35);
  if (npcSpeed > 0.05) {
    npc.tangent.copy(npc.velocity).setY(0).normalize();
    npc.mesh.rotation.y = Math.atan2(npc.tangent.x, npc.tangent.z);
  }
}

function resolveNpcCollision(npcA, npcB) {
  collisionNormal.copy(npcA.mesh.position).sub(npcB.mesh.position);
  const distance = collisionNormal.length();
  const minDistance = NPC_COLLISION_RADIUS * 2;
  if (distance >= minDistance || distance === 0) return;

  collisionNormal.divideScalar(distance);
  const separation = minDistance - distance;
  npcA.mesh.position.addScaledVector(collisionNormal, separation * 0.5);
  npcB.mesh.position.addScaledVector(collisionNormal, -separation * 0.5);
  npcA.laneOffset += collisionNormal.dot(npcA.normal) * separation * 0.5;
  npcB.laneOffset += collisionNormal.dot(npcB.normal) * -separation * 0.5;

  const relativeVel = collisionRelative.copy(npcA.velocity).sub(npcB.velocity);
  const impactSpeed = relativeVel.dot(collisionNormal);
  if (impactSpeed < 0) {
    const impulse = -(1 + COLLISION_RESTITUTION) * impactSpeed * 0.5;
    npcA.velocity.addScaledVector(collisionNormal, impulse);
    npcB.velocity.addScaledVector(collisionNormal, -impulse);
  }

  const speedA = npcA.velocity.length();
  const speedB = npcB.velocity.length();
  npcA.speed = clamp(speedA, 8, npcA.baseSpeed * 1.35);
  npcB.speed = clamp(speedB, 8, npcB.baseSpeed * 1.35);

  if (speedA > 0.05) {
    npcA.tangent.copy(npcA.velocity).setY(0).normalize();
    npcA.mesh.rotation.y = Math.atan2(npcA.tangent.x, npcA.tangent.z);
  }
  if (speedB > 0.05) {
    npcB.tangent.copy(npcB.velocity).setY(0).normalize();
    npcB.mesh.rotation.y = Math.atan2(npcB.tangent.x, npcB.tangent.z);
  }

  npcA.prevPosition.copy(npcA.mesh.position);
  npcB.prevPosition.copy(npcB.mesh.position);
}

function handleCollisions() {
  if (!raceState.finished) trafficCars.forEach(resolvePlayerNpcCollision);
  for (let i = 0; i < trafficCars.length; i += 1) {
    for (let j = i + 1; j < trafficCars.length; j += 1) {
      resolveNpcCollision(trafficCars[i], trafficCars[j]);
    }
  }
  syncCarStateFromVelocity();
  recalculateCarProgress();
}

function drawMinimapHeading(ctx, x, y, heading, color, size = 10) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(-Math.cos(heading), Math.sin(heading)));
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.65, -size * 0.55);
  ctx.lineTo(-size * 0.65, size * 0.55);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(6, 8, 14, 0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawMinimap() {
  if (!minimapCtx || !minimapState.enabled) return;
  minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  if (minimapState.trackPath.length > 1) {
    minimapCtx.beginPath();
    minimapCtx.moveTo(minimapState.trackPath[0].x, minimapState.trackPath[0].y);
    for (let i = 1; i < minimapState.trackPath.length; i += 1) minimapCtx.lineTo(minimapState.trackPath[i].x, minimapState.trackPath[i].y);
    minimapCtx.closePath();
    minimapCtx.fillStyle = 'rgba(32, 45, 78, 0.4)';
    minimapCtx.fill();
    minimapCtx.lineWidth = 2.2;
    minimapCtx.strokeStyle = 'rgba(126, 168, 255, 0.75)';
    minimapCtx.stroke();
  }

  minimapState.checkpointPath.forEach((checkpoint, index) => {
    minimapCtx.beginPath();
    minimapCtx.arc(checkpoint.x, checkpoint.y, index === 0 ? 4 : 3, 0, Math.PI * 2);
    minimapCtx.fillStyle = index === 0 ? 'rgba(255, 213, 79, 0.95)' : 'rgba(129, 212, 250, 0.9)';
    minimapCtx.fill();
  });

  const playerProjected = projectToMinimap(car.position.x, car.position.z);
  drawMinimapHeading(minimapCtx, playerProjected.x, playerProjected.y, carState.heading, 'rgba(255, 235, 59, 0.95)', 11);

  trafficCars.forEach((npc) => {
    const projected = projectToMinimap(npc.mesh.position.x, npc.mesh.position.z);
    const heading = Math.atan2(npc.tangent.x || Math.sin(npc.mesh.rotation.y), npc.tangent.z || Math.cos(npc.mesh.rotation.y));
    drawMinimapHeading(minimapCtx, projected.x, projected.y, heading, npc.minimapColor, 8);
  });
}

// ----- Animation Loop -----
const clock = new THREE.Clock();
updateHUD();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  updateCar(delta);
  updateLapTimer(delta);
  updateRaceClock(delta);
  updateTraffic(delta);
  handleCollisions();
  updateCheckpointEffects(delta);
  drawMinimap();
  if (ambientMist) ambientMist.rotation.y += delta * 0.02;
  const pivot = cameraTemp.copy(car.position).add(cameraLookOffset);
  const offset = cameraOffsetTemp.copy(cameraBaseOffset).applyAxisAngle(new THREE.Vector3(0, 1, 0), carState.heading);
  camera.position.lerp(pivot.clone().add(offset), 1 - Math.exp(-4 * delta));
  camera.lookAt(pivot);
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  setupMinimap();
});
