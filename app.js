import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const canvas = document.querySelector('#webgl');
const slider = document.querySelector('#progress');
const status = document.querySelector('#status');
const playButton = document.querySelector('#play');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070707);

const camera = new THREE.PerspectiveCamera(26, innerWidth / innerHeight, 0.1, 200);

// Stage A camera: чуть сверху — хорошо видно физическое открытие и клавиатуру.
const CAMERA_OPEN = {
  position: new THREE.Vector3(0, 13.5, 43),
  target: new THREE.Vector3(0, 4.3, 0)
};
// Stage B camera: фронтальный product-shot — клавиатура уходит из кадра.
const CAMERA_HERO = {
  position: new THREE.Vector3(0, 10.9, 38.5),
  target: new THREE.Vector3(0, 10.8, -0.4)
};
const cameraTarget = CAMERA_OPEN.target.clone();
camera.position.copy(CAMERA_OPEN.position);
camera.lookAt(cameraTarget);

scene.add(new THREE.HemisphereLight(0xffffff, 0x151515, 1.9));
const key = new THREE.DirectionalLight(0xffffff, 3.6);
key.position.set(-14, 22, 18);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);

const fill = new THREE.DirectionalLight(0xbfd0ff, 1.3);
fill.position.set(18, 10, 10);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffffff, 2.1);
rim.position.set(0, 15, -18);
scene.add(rim);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2),
  new THREE.ShadowMaterial({ opacity: 0.28 })
);
floor.position.y = -0.18;
floor.receiveShadow = true;
scene.add(floor);

const laptop = new THREE.Group();
scene.add(laptop);

const silver = new THREE.MeshStandardMaterial({
  color: 0xd0d1d4,
  metalness: 0.96,
  roughness: 0.23
});
const silverDark = new THREE.MeshStandardMaterial({
  color: 0xaaaeb4,
  metalness: 0.93,
  roughness: 0.28
});
const black = new THREE.MeshStandardMaterial({
  color: 0x070708,
  metalness: 0.06,
  roughness: 0.38
});
const keyMat = new THREE.MeshStandardMaterial({
  color: 0x121214,
  metalness: 0.03,
  roughness: 0.5
});

// -------- BASE / DECK --------
// Чуть тоньше и ближе по пропорциям к MacBook Pro 14.
const base = new THREE.Mesh(
  new RoundedBoxGeometry(31.26, 0.76, 22.12, 8, 0.72),
  silver
);
base.position.y = 0.28;
base.castShadow = base.receiveShadow = true;
laptop.add(base);

const deck = new THREE.Mesh(
  new RoundedBoxGeometry(30.82, 0.16, 21.65, 6, 0.60),
  silverDark
);
deck.position.y = 0.73;
deck.castShadow = true;
laptop.add(deck);

const trackpad = new THREE.Mesh(
  new RoundedBoxGeometry(12.6, 0.028, 7.75, 5, 0.34),
  new THREE.MeshStandardMaterial({
    color: 0xc8cacf,
    metalness: 0.82,
    roughness: 0.19
  })
);
trackpad.position.set(0, 0.842, 5.52);
laptop.add(trackpad);

// -------- REALISTIC MAC-STYLE KEYBOARD --------
// Не сетка 14x6: разные ширины клавиш, отдельный function-row и большой spacebar.
const keyboard = new THREE.Group();
const keyHeight = 0.145;
const keyDepth = 1.26;
const gapX = 0.18;
const gapZ = 0.22;
const unit = 1.36;

function addKey(x, z, units = 1, depth = keyDepth) {
  const width = Math.max(0.72, units * unit + (units - 1) * gapX);
  const k = new THREE.Mesh(
    new RoundedBoxGeometry(width, keyHeight, depth, 3, 0.16),
    keyMat
  );
  k.position.set(x, 0.90, z);
  k.castShadow = true;
  keyboard.add(k);
  return width;
}

function addKeyboardRow(units, z, scale = 1) {
  const widths = units.map(u => Math.max(0.72, u * unit * scale + (u - 1) * gapX));
  const total = widths.reduce((a,b)=>a+b,0) + gapX * (widths.length - 1);
  let x = -total / 2;
  widths.forEach((w, i) => {
    const unitsScaled = w / unit;
    const width = addKey(x + w/2, z, unitsScaled);
    x += w + gapX;
  });
}

// Function row
addKeyboardRow(new Array(12).fill(1), -7.35, 0.78);
// Number row
addKeyboardRow([1,1,1,1,1,1,1,1,1,1,1,1,1,1.55], -5.80);
// QWERTY row
addKeyboardRow([1.5,1,1,1,1,1,1,1,1,1,1,1,1.5], -4.28);
// ASDF row
addKeyboardRow([1.78,1,1,1,1,1,1,1,1,1,1,1.85], -2.76);
// ZXCV row
addKeyboardRow([2.22,1,1,1,1,1,1,1,1,1,2.22], -1.24);
// Bottom row with large spacebar
addKeyboardRow([1.32,1.25,1.25,1.18,5.2,1.18,1.18,1.18,1.05,1.05], 0.30, 0.93);

laptop.add(keyboard);

// Speaker grilles — характерный MacBook Pro силуэт по бокам клавиатуры.
const grilleMat = new THREE.MeshStandardMaterial({
  color: 0x34363a,
  metalness: 0.32,
  roughness: 0.56
});
const grilleL = new THREE.Mesh(
  new RoundedBoxGeometry(2.0, 0.025, 9.2, 4, 0.20),
  grilleMat
);
grilleL.position.set(-13.45, 0.82, -3.35);
const grilleR = grilleL.clone();
grilleR.position.x = 13.45;
laptop.add(grilleL, grilleR);

// -------- HINGE --------
const hingeLeft = new THREE.Mesh(
  new RoundedBoxGeometry(7.4, 0.24, 0.48, 5, 0.18),
  silverDark
);
hingeLeft.position.set(-8.15, 0.82, -10.72);
const hingeRight = hingeLeft.clone();
hingeRight.position.x = 8.15;
laptop.add(hingeLeft, hingeRight);

const lidPivot = new THREE.Group();
lidPivot.position.set(0, 0.92, -10.64);
laptop.add(lidPivot);

// -------- LID --------
const lidShell = new THREE.Mesh(
  new RoundedBoxGeometry(31.0, 0.46, 21.18, 8, 0.78),
  silver
);
lidShell.rotation.x = Math.PI / 2;
lidShell.position.set(0, 10.60, 0.20);
lidShell.castShadow = true;
lidPivot.add(lidShell);

const bezel = new THREE.Mesh(
  new RoundedBoxGeometry(30.28, 0.18, 20.48, 7, 0.68),
  black
);
bezel.rotation.x = Math.PI / 2;
bezel.position.set(0, 10.58, -0.055);
lidPivot.add(bezel);

// Небольшой notch — чтобы экран выглядел ближе к MacBook Pro.
const notch = new THREE.Mesh(
  new RoundedBoxGeometry(4.8, 0.19, 1.15, 4, 0.28),
  black
);
notch.rotation.x = Math.PI / 2;
notch.position.set(0, 20.16, -0.072);
lidPivot.add(notch);

function createFallbackScreenTexture() {
  const c = document.createElement('canvas');
  c.width = 1512;
  c.height = 982;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f7f7f8';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#111114';
  ctx.font = '700 62px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillText('Diana Ro', 90, 110);
  ctx.fillStyle = '#efeff2';
  ctx.fillRect(90, 165, 1332, 3);
  const cards = [
    ['#17171a','Portfolio'],
    ['#ececf0','Selected work'],
    ['#d9d9df','Product design'],
    ['#f0f0f2','UX / UI']
  ];
  cards.forEach((it,i)=>{
    const x = 90 + (i%2)*655;
    const y = 225 + Math.floor(i/2)*300;
    ctx.fillStyle = it[0];
    ctx.fillRect(x,y,610,245);
    ctx.fillStyle = i===0 ? '#fff' : '#202026';
    ctx.font='600 38px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText(it[1], x+32, y+58);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const screenMat = new THREE.MeshBasicMaterial({
  map: createFallbackScreenTexture(),
  toneMapped: false
});

new THREE.TextureLoader().load(
  './screen.png',
  (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    screenMat.map = tex;
    screenMat.needsUpdate = true;
  },
  undefined,
  () => console.info('screen.png пока не добавлен — оставляю тестовый экран')
);

const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(29.15, 18.9),
  screenMat
);
screen.position.set(0, 10.52, -0.17);
lidPivot.add(screen);

// -------- APPLE-STYLE BACK LOGO --------
// Видно только на внешней стороне крышки, пока ноут закрыт / открывается.
function createAppleLogoTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);
  ctx.fillStyle = 'rgba(25,25,28,0.92)';

  // Стилизованный силуэт яблока.
  ctx.beginPath();
  ctx.moveTo(255, 170);
  ctx.bezierCurveTo(210, 135, 145, 155, 128, 220);
  ctx.bezierCurveTo(105, 310, 168, 390, 215, 400);
  ctx.bezierCurveTo(244, 406, 258, 387, 286, 400);
  ctx.bezierCurveTo(336, 398, 402, 315, 378, 224);
  ctx.bezierCurveTo(362, 160, 298, 137, 255, 170);
  ctx.closePath();
  ctx.fill();

  // "bite"
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(374, 225, 42, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(25,25,28,0.92)';
  ctx.save();
  ctx.translate(285, 115);
  ctx.rotate(-0.55);
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const appleLogo = new THREE.Mesh(
  new THREE.PlaneGeometry(4.45, 4.45),
  new THREE.MeshBasicMaterial({
    map: createAppleLogoTexture(),
    transparent: true,
    depthWrite: false,
    toneMapped: false
  })
);
appleLogo.position.set(0, 10.7, 0.46);
lidPivot.add(appleLogo);

// -------- ANIMATION --------
// 0%   : закрыт
// 0–68%: физически открывается, клавиатура видна
// 68–100%: product-shot — камера опускается и выравнивается по экрану,
//          клавиатура постепенно уходит из кадра.
const CLOSED_ANGLE = THREE.MathUtils.degToRad(90);
const OPEN_ANGLE = THREE.MathUtils.degToRad(0); // полностью вертикально
const OPEN_STAGE_END = 0.68;

let playing = false;
let playStartedAt = 0;
const PLAY_DURATION = 2200;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function easeInOutCubic(t) {
  t = clamp01(t);
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t) {
  t = clamp01(t);
  return 1 - Math.pow(1 - t, 3);
}

function setProgress(raw) {
  const p = clamp01(Number(raw) || 0);

  const lidP = clamp01(p / OPEN_STAGE_END);
  const lidEase = easeInOutCubic(lidP);
  lidPivot.rotation.x = THREE.MathUtils.lerp(
    CLOSED_ANGLE,
    OPEN_ANGLE,
    lidEase
  );

  const heroP = clamp01((p - OPEN_STAGE_END) / (1 - OPEN_STAGE_END));
  const heroEase = easeOutCubic(heroP);

  camera.position.lerpVectors(
    CAMERA_OPEN.position,
    CAMERA_HERO.position,
    heroEase
  );
  cameraTarget.lerpVectors(
    CAMERA_OPEN.target,
    CAMERA_HERO.target,
    heroEase
  );
  camera.lookAt(cameraTarget);

  // Лёгкий подъем всей модели в product-shot фазе.
  laptop.position.y = THREE.MathUtils.lerp(0, 0.72, heroEase);
  laptop.position.z = THREE.MathUtils.lerp(0, -0.75, heroEase);

  slider.value = String(p);

  if (p <= 0.001) {
    status.textContent = 'готово · закрыт';
  } else if (p < OPEN_STAGE_END) {
    status.textContent = `${Math.round(p * 100)}% · открывается`;
  } else if (p < 0.999) {
    status.textContent = 'открыт · выравниваю ракурс';
  } else {
    status.textContent = 'готово · фронтальный вид';
  }
}

setProgress(0);
playButton.textContent = 'Проверить';

slider.addEventListener('input', () => {
  playing = false;
  playButton.textContent = 'Проверить';
  setProgress(slider.value);
});

window.addEventListener('scroll', () => {
  if (playing) return;
  const max = document.documentElement.scrollHeight - innerHeight;
  setProgress(max > 0 ? scrollY / max : 0);
}, { passive: true });

playButton.addEventListener('click', () => {
  playing = true;
  playStartedAt = performance.now();
  playButton.textContent = 'Открываю…';
  setProgress(0);
});

function render(time) {
  requestAnimationFrame(render);

  if (playing) {
    const p = clamp01((time - playStartedAt) / PLAY_DURATION);
    setProgress(p);

    if (p >= 1) {
      playing = false;
      playButton.textContent = 'Повторить';
    }
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(render);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
