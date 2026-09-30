import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas=document.querySelector('#webgl');
const status=document.querySelector('#status');
const tree=document.querySelector('#tree');
const fitBtn=document.querySelector('#fit');

const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0a0a0a);
scene.add(new THREE.HemisphereLight(0xffffff,0x202020,2.1));
const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(5,8,8);scene.add(key);
const rim=new THREE.DirectionalLight(0xaac6ff,1.4);rim.position.set(-6,4,-8);scene.add(rim);

const camera=new THREE.PerspectiveCamera(35,1,.01,1000);
camera.position.set(0,2.5,8);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;

let root=null;
function resize(){
  const el=canvas.parentElement;
  const w=el.clientWidth,h=el.clientHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
}
addEventListener('resize',resize);resize();

function fit(){
  if(!root)return;
  const box=new THREE.Box3().setFromObject(root);
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  const maxDim=Math.max(size.x,size.y,size.z);
  const fov=THREE.MathUtils.degToRad(camera.fov);
  let dist=(maxDim/2)/Math.tan(fov/2);
  dist*=1.35;
  camera.near=Math.max(maxDim/1000,.001);
  camera.far=Math.max(1000,maxDim*100);
  camera.updateProjectionMatrix();
  camera.position.set(center.x,center.y+maxDim*.18,center.z+dist);
  controls.target.copy(center);
  controls.update();
}
fitBtn.onclick=fit;

function describe(root){
  let lines=[];
  let meshCount=0;
  root.updateMatrixWorld(true);
  root.traverse(o=>{
    const depth=(()=>{let d=0,p=o.parent;while(p&&p!==root){d++;p=p.parent}return d})()
    const pad='  '.repeat(Math.min(depth,12));
    const type=o.isMesh?'MESH':o.isBone?'BONE':o.type.toUpperCase();
    if(o.isMesh)meshCount++;
    let extra='';
    if(o.isMesh){
      const box=new THREE.Box3().setFromObject(o);
      const size=box.getSize(new THREE.Vector3());
      const center=box.getCenter(new THREE.Vector3());
      const mat=(Array.isArray(o.material)?o.material.map(m=>m?.name||'(unnamed)').join(','):o.material?.name||'(unnamed)');
      extra=` | mat=${mat} | size=${size.x.toFixed(3)},${size.y.toFixed(3)},${size.z.toFixed(3)} | center=${center.x.toFixed(3)},${center.y.toFixed(3)},${center.z.toFixed(3)}`;
    }
    lines.push(`${pad}[${type}] ${o.name||'(unnamed)'}${extra}`);
  });
  return {meshCount,text:lines.join('\n')};
}

const loader=new GLTFLoader();
loader.load('./macbook_pro_14_inch_M5.glb',gltf=>{
  root=gltf.scene;
  scene.add(root);
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  const d=describe(root);
  const animations=(gltf.animations||[]).map(a=>a.name||'(unnamed)').join(', ')||'нет';
  status.className='ok';
  status.textContent=`Открыто ✓ | meshes: ${d.meshCount} | animations: ${animations}`;
  tree.textContent=d.text;
  fit();
},xhr=>{
  if(xhr.total)status.textContent=`Загрузка: ${Math.round(xhr.loaded/xhr.total*100)}%`;
},err=>{
  console.error(err);
  status.className='bad';
  status.textContent='Не удалось открыть GLB. Проверь, что файл лежит в корне репозитория и называется macbook_pro_14_inch_M5.glb';
  tree.textContent=String(err?.message||err);
});

function tick(){
  requestAnimationFrame(tick);
  controls.update();
  renderer.render(scene,camera);
}
tick();

const raycaster=new THREE.Raycaster();
const pointer=new THREE.Vector2();
let selected=null;
let originalMaterial=null;

function selectMesh(mesh){
  if(selected && originalMaterial){
    selected.material=originalMaterial;
  }
  selected=mesh;
  if(!mesh) return;
  originalMaterial=mesh.material;
  const highlight=new THREE.MeshStandardMaterial({color:0xff3b30,metalness:0.1,roughness:0.45,emissive:0x220000});
  mesh.material=highlight;
  const box=new THREE.Box3().setFromObject(mesh);
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  status.className='ok';
  status.textContent=`SELECTED: ${mesh.name||'(unnamed)'} | size ${size.x.toFixed(3)}, ${size.y.toFixed(3)}, ${size.z.toFixed(3)} | center ${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)}`;
}

canvas.addEventListener('click',e=>{
  if(!root)return;
  const r=canvas.getBoundingClientRect();
  pointer.x=((e.clientX-r.left)/r.width)*2-1;
  pointer.y=-((e.clientY-r.top)/r.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObject(root,true);
  const hit=hits.find(h=>h.object?.isMesh);
  if(hit) selectMesh(hit.object);
});
