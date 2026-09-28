import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL =
  'https://raw.githubusercontent.com/AnubhavChaturvedi-GitHub/macbook-pro-threejs/main/MacBook%20Pro.glb';

const canvas = document.querySelector('#webgl');
const slider = document.querySelector('#progress');
const status = document.querySelector('#status');
const playButton = document.querySelector('#play');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060606);

const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 250);
camera.position.set(0, 15.5, 47);
camera.lookAt(0, 5.1, 2.0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x101014, 1.65));

const key = new THREE.DirectionalLight(0xffffff, 3.0);
key.position.set(-18, 28, 24);
key.castShadow = true;
scene.add(key);

const fill = new THREE.DirectionalLight(0xc9d8ff, 1.0);
fill.position.set(22, 10, 16);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffffff, 1.8);
rim.position.set(2, 16, -24);
scene.add(rim);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
  new THREE.ShadowMaterial({ opacity: 0.28 })
);
floor.position.y = -0.15;
floor.receiveShadow = true;
scene.add(floor);

const deg = THREE.MathUtils.degToRad;
const OPEN_ANGLE = -deg(108);
let laptop = null;
let lid = null;
let playing = false;
let playStartedAt = 0;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(t) {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}

function setProgress(raw) {
  const p = clamp01(Number(raw) || 0);
  const eased = smoothstep(p);

  if (lid) {
    // В исходной модели 0° = полностью закрыто, -108° = открыто.
    lid.rotation.x = THREE.MathUtils.lerp(0, OPEN_ANGLE, eased);
  }

  slider.value = String(p);
  status.textContent = lid ? `${Math.round(p * 100)}% · ${Math.round(eased * 108)}°` : 'Загружаю 3D…';
}

function findSilver14(root) {
  return (
    root.getObjectByName('MacBook_Pro_14_Silver') ||
    root.children.find((o) => /14.*Silver|Silver.*14/i.test(o.name || '')) ||
    root.children.find((o) => /Silver/i.test(o.name || '')) ||
    root
  );
}

function findLid(root) {
  // GLB был экспортирован в открытом состоянии -108°. Ищем вращаемую группу крышки.
  let best = null;
  let bestDelta = Infinity;

  root.traverse((obj) => {
    if (!obj.isGroup) return;
    const delta = Math.abs(obj.rotation.x - OPEN_ANGLE);
    if (delta < bestDelta) {
      best = obj;
      bestDelta = delta;
    }
  });

  return bestDelta < deg(4) ? best : null;
}

function centerModel(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());

  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  model.updateMatrixWorld(true);
}

function createFallbackTexture() {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = 1000;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#fbfbfc';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.fillStyle = '#eef1f6';
  ctx.fillRect(0, 0, 310, c.height);

  ctx.fillStyle = '#347ff2';
  ctx.fillRect(30, 120, 245, 55);

  ctx.fillStyle = '#252338';
  ctx.font = '700 38px Arial';
  ctx.fillText('Правила компании', 340, 78);

  ctx.fillStyle = '#6c6c76';
  ctx.font = '26px Arial';

  const rows = [
    'Превращаем простой текст в преимущества',
    'Схемы оформления сотрудников',
    'Составление договоров',
    'Оптимизация рабочих процессов',
    'Стандарты внутренней коммуникации',
    'Регламенты взаимодействия отделов',
    'Контроль качества документов',
    'Протоколы утверждения задач',
    'Алгоритмы обработки запросов'
  ];

  rows.forEach((text, i) => {
    const y = 190 + i * 72;
    ctx.fillText(text, 340, y);
    ctx.strokeStyle = '#dedee2';
    ctx.beginPath();
    ctx.moveTo(330, y + 26);
    ctx.lineTo(1530, y + 26);
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

async function loadScreenTexture() {
  const loader = new THREE.TextureLoader();

  return new Promise((resolve) => {
    loader.load(
      './screen.png',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        resolve(texture);
      },
      undefined,
      () => resolve(createFallbackTexture())
    );
  });
}

async function putScreenOnLid(targetLid) {
  const texture = await loadScreenTexture();

  // Точные активные размеры 14" модели из исходного проекта.
  const screenW = 30.24;
  const screenH = 19.64;
  const chin = 1.26;
  const screenCenterZ = chin + screenH / 2;

  const geometry = new THREE.PlaneGeometry(screenW, screenH);
  geometry.rotateX(Math.PI / 2);

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false
  });

  const screen = new THREE.Mesh(geometry, material);
  screen.position.set(0, -0.065, screenCenterZ);
  screen.renderOrder = 50;
  targetLid.add(screen);
}

new GLTFLoader().load(
  MODEL_URL,
  async (gltf) => {
    laptop = findSilver14(gltf.scene);

    if (laptop.parent) laptop.parent.remove(laptop);
    scene.add(laptop);

    centerModel(laptop);

    laptop.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    lid = findLid(laptop);

    if (!lid) {
      status.textContent = 'Не нашла группу крышки';
      console.error('Lid group not found');
      return;
    }

    await putScreenOnLid(lid);

    // Стартовое состояние всегда закрыто.
    setProgress(0);
    status.textContent = 'готово · закрыт';
  },
  (event) => {
    if (event.total) {
      status.textContent = `3D ${Math.round((event.loaded / event.total) * 100)}%`;
    }
  },
  (error) => {
    console.error(error);
    status.textContent = 'Ошибка загрузки 3D';
  }
);

slider.addEventListener('input', () => {
  playing = false;
  playButton.textContent = 'Проверить';
  setProgress(slider.value);
});

window.addEventListener(
  'scroll',
  () => {
    if (playing) return;
    const max = document.documentElement.scrollHeight - innerHeight;
    setProgress(max > 0 ? scrollY / max : 0);
  },
  { passive: true }
);

playButton.addEventListener('click', () => {
  playing = !playing;
  playStartedAt = performance.now();
  playButton.textContent = playing ? 'Стоп' : 'Проверить';
});

function render(time) {
  requestAnimationFrame(render);

  if (playing && lid) {
    const phase = (time - playStartedAt) / 1800;
    const p = (Math.sin(phase - Math.PI / 2) + 1) / 2;
    setProgress(p);
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(render);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
