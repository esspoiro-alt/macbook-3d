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
camera.position.set(0, 13.5, 43);
camera.lookAt(0, 4.3, 0);

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
floor.position.y = -0.25;
floor.receiveShadow = true;
scene.add(floor);

const laptop = new THREE.Group();
scene.add(laptop);

const silver = new THREE.MeshStandardMaterial({ color: 0xc8c9cd, metalness: 0.92, roughness: 0.28 });
const silverDark = new THREE.MeshStandardMaterial({ color: 0xa9abb0, metalness: 0.95, roughness: 0.3 });
const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, metalness: 0.08, roughness: 0.42 });
const keyMat = new THREE.MeshStandardMaterial({ color: 0x101012, metalness: 0.04, roughness: 0.6 });

const base = new THREE.Mesh(new RoundedBoxGeometry(31.26, 1.18, 22.12, 8, 1.0), silver);
base.position.y = 0.45;
base.castShadow = base.receiveShadow = true;
laptop.add(base);

const deck = new THREE.Mesh(new RoundedBoxGeometry(30.6, 0.24, 21.45, 6, 0.85), silverDark);
deck.position.y = 1.09;
deck.castShadow = true;
laptop.add(deck);

const trackpad = new THREE.Mesh(new RoundedBoxGeometry(12.9, 0.035, 8.1, 5, 0.45), new THREE.MeshStandardMaterial({ color: 0xbfc1c6, metalness: 0.78, roughness: 0.24 }));
trackpad.position.set(0, 1.235, 5.55);
laptop.add(trackpad);

const kb = new THREE.Group();
const cols = 14, rows = 6;
const keyW = 1.42, keyD = 1.33, gapX = 0.28, gapZ = 0.28;
const startX = -((cols - 1) * (keyW + gapX)) / 2;
const startZ = -6.95;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const k = new THREE.Mesh(new RoundedBoxGeometry(keyW, 0.18, keyD, 3, 0.18), keyMat);
    k.position.set(startX + c * (keyW + gapX), 1.33, startZ + r * (keyD + gapZ));
    k.castShadow = true;
    kb.add(k);
  }
}
laptop.add(kb);

const hingeLeft = new THREE.Mesh(new RoundedBoxGeometry(7.8, 0.28, 0.56, 5, 0.2), silverDark);
hingeLeft.position.set(-8.25, 1.2, -10.7);
const hingeRight = hingeLeft.clone();
hingeRight.position.x = 8.25;
laptop.add(hingeLeft, hingeRight);

const lidPivot = new THREE.Group();
lidPivot.position.set(0, 1.38, -10.62);
laptop.add(lidPivot);

const lidShell = new THREE.Mesh(new RoundedBoxGeometry(31.0, 0.52, 21.18, 8, 0.9), silver);
lidShell.rotation.x = Math.PI / 2;
lidShell.position.set(0, 10.6, 0.22);
lidShell.castShadow = true;
lidPivot.add(lidShell);

const bezel = new THREE.Mesh(new RoundedBoxGeometry(30.28, 0.20, 20.48, 7, 0.72), black);
bezel.rotation.x = Math.PI / 2;
bezel.position.set(0, 10.58, -0.06);
lidPivot.add(bezel);

function createScreenTexture() {
  const c = document.createElement('canvas');
  c.width = 1512; c.height = 982;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f7f7f8'; ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle = '#111114'; ctx.font = '700 62px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillText('Diana Ro', 90, 110);
  ctx.fillStyle = '#efeff2'; ctx.fillRect(90, 165, 1332, 3);
  const cards = [
    ['#17171a','Portfolio'],['#ececf0','Selected work'],['#d9d9df','Product design'],['#f0f0f2','UX / UI']
  ];
  cards.forEach((it,i)=>{
    const x = 90 + (i%2)*655, y = 225 + Math.floor(i/2)*300;
    ctx.fillStyle = it[0]; ctx.fillRect(x,y,610,245);
    ctx.fillStyle = i===0 ? '#fff' : '#202026'; ctx.font='600 38px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText(it[1], x+32, y+58);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

const screenMat = new THREE.MeshBasicMaterial({ map: createScreenTexture(), toneMapped: false });
const screen = new THREE.Mesh(new THREE.PlaneGeometry(29.15, 18.9), screenMat);
screen.position.set(0, 10.52, -0.18);
lidPivot.add(screen);

const logo = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), new THREE.MeshStandardMaterial({ color: 0xaeb0b5, metalness: 0.65, roughness: 0.3 }));
logo.rotation.x = -Math.PI / 2;
logo.position.set(0, 10.55, 0.51);
lidPivot.add(logo);

// Для этой геометрии: 90° = крышка лежит на базе (закрыто), -18° = раскрыта на 108°.
const CLOSED_ANGLE = THREE.MathUtils.degToRad(90);
const OPEN_ANGLE = THREE.MathUtils.degToRad(-18);
let playing = false;
let playStartedAt = 0;
const PLAY_DURATION = 1600;

function clamp01(v){ return Math.max(0, Math.min(1, v)); }
function easeInOutCubic(t){
  t = clamp01(t);
  return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
}
function setProgress(raw){
  const p = clamp01(Number(raw)||0);
  const eased = easeInOutCubic(p);
  lidPivot.rotation.x = THREE.MathUtils.lerp(CLOSED_ANGLE, OPEN_ANGLE, eased);
  slider.value = String(p);
  status.textContent = p <= 0.001 ? 'готово · закрыт' : p >= 0.999 ? 'готово · открыт 108°' : `${Math.round(p*100)}% · открытие`;
}

setProgress(0);
playButton.textContent = 'Проверить';

slider.addEventListener('input',()=>{
  playing=false;
  playButton.textContent='Проверить';
  setProgress(slider.value);
});

window.addEventListener('scroll',()=>{
  if (playing) return;
  const max = document.documentElement.scrollHeight-innerHeight;
  setProgress(max>0?scrollY/max:0);
},{passive:true});

playButton.addEventListener('click',()=>{
  playing=true;
  playStartedAt=performance.now();
  playButton.textContent='Открываю…';
  setProgress(0);
});

function render(time){
  requestAnimationFrame(render);
  if(playing){
    const p = clamp01((time-playStartedAt)/PLAY_DURATION);
    setProgress(p);
    if(p >= 1){
      playing=false;
      playButton.textContent='Повторить';
    }
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(render);

window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
