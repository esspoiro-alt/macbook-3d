import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas=document.querySelector('#webgl');
const slider=document.querySelector('#progress');
const status=document.querySelector('#status');
const play=document.querySelector('#play');
const debug=document.querySelector('#debug');

const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x050505);

scene.add(new THREE.HemisphereLight(0xffffff,0x151515,2.4));
const key=new THREE.DirectionalLight(0xffffff,4.0); key.position.set(-5,10,10); scene.add(key);
const fill=new THREE.DirectionalLight(0xb9c7ff,1.7); fill.position.set(8,6,4); scene.add(fill);
const rim=new THREE.DirectionalLight(0xffffff,2.2); rim.position.set(0,9,-10); scene.add(rim);

const camera=new THREE.PerspectiveCamera(28,1,.01,1000);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;
controls.enabled=false;

let model=null, pivot=null, lidMeshes=[], baseMeshes=[];
let rootBox=null, lidBox=null, baseBox=null;
let playing=false, t0=0;
const DURATION=2600;

function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}
addEventListener('resize',resize); resize();

function fitCamera(box, front=true){
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  const maxDim=Math.max(size.x,size.y,size.z);
  const fov=THREE.MathUtils.degToRad(camera.fov);
  const dist=(maxDim/2)/Math.tan(fov/2)*1.25;
  camera.position.set(center.x, center.y+size.y*.18, center.z+dist);
  controls.target.copy(center);
  camera.near=Math.max(maxDim/1000,.001);
  camera.far=maxDim*100;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
}

function worldBox(o){ return new THREE.Box3().setFromObject(o); }

function detectLid(root){
  root.updateMatrixWorld(true);
  const all=[];
  root.traverse(o=>{
    if(!o.isMesh) return;
    const b=worldBox(o);
    const s=b.getSize(new THREE.Vector3());
    const c=b.getCenter(new THREE.Vector3());
    all.push({o,b,s,c,vol:Math.max(s.x*s.y*s.z,1e-9)});
  });
  const rb=worldBox(root);
  const rs=rb.getSize(new THREE.Vector3());
  const rc=rb.getCenter(new THREE.Vector3());

  // Lid meshes in an already-open laptop are vertically oriented:
  // high center, meaningful X/Y footprint, comparatively thin depth.
  const lid=all.filter(m=>{
    const high=m.c.y > rb.min.y + rs.y*0.47;
    const wide=m.s.x > rs.x*0.18;
    const tall=m.s.y > rs.y*0.12;
    const thinDepth=m.s.z < rs.z*0.42;
    return high && wide && tall && thinDepth;
  });

  // Expand by spatial neighborhood so bezel/camera/logo pieces join the lid group.
  const lb=new THREE.Box3();
  lid.forEach(m=>lb.union(m.b));
  const expanded=lb.clone().expandByVector(new THREE.Vector3(rs.x*.03,rs.y*.06,rs.z*.06));
  const final=all.filter(m=>{
    if(lid.includes(m)) return true;
    return expanded.intersectsBox(m.b) && m.c.y > rb.min.y + rs.y*0.40;
  });

  return {all,final,rb,rs,rc};
}

function reparentPreserveWorld(obj,newParent){
  obj.updateMatrixWorld(true);
  const world=obj.matrixWorld.clone();
  newParent.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(newParent.matrixWorld).invert();
  const local=new THREE.Matrix4().multiplyMatrices(inv,world);
  obj.matrix.copy(local);
  obj.matrix.decompose(obj.position,obj.quaternion,obj.scale);
  newParent.add(obj);
}

function rigModel(root){
  const d=detectLid(root);
  rootBox=d.rb;
  lidMeshes=d.final.map(x=>x.o);
  baseMeshes=d.all.filter(x=>!lidMeshes.includes(x.o)).map(x=>x.o);

  baseBox=new THREE.Box3();
  baseMeshes.forEach(o=>baseBox.union(worldBox(o)));

  lidBox=new THREE.Box3();
  lidMeshes.forEach(o=>lidBox.union(worldBox(o)));
  const lidCenter=lidBox.getCenter(new THREE.Vector3());
  const size=rootBox.getSize(new THREE.Vector3());

  // Hinge: lower edge of lid, near rear edge. We derive it from actual geometry.
  const hingeY=lidBox.min.y + size.y*0.01;
  const hingeZ=lidCenter.z;

  pivot=new THREE.Group();
  pivot.name='AUTO_HINGE_PIVOT';
  pivot.position.set(lidCenter.x,hingeY,hingeZ);
  scene.add(pivot);

  lidMeshes.forEach(o=>reparentPreserveWorld(o,pivot));

  const names=lidMeshes.map(o=>o.name||'(unnamed)').slice(0,80);
  debug.innerHTML=
    '<span class="good">AUTO-RIG OK</span><br>'+
    'lid meshes: '+lidMeshes.length+' / '+d.all.length+'<br>'+
    'hinge: '+pivot.position.toArray().map(v=>v.toFixed(3)).join(', ')+'<br><br>'+
    names.join('<br>');
}

function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function clamp(v){return Math.max(0,Math.min(1,v))}

let closedCamPos=new THREE.Vector3();
let closedTarget=new THREE.Vector3();
let openingCamPos=new THREE.Vector3();
let openingTarget=new THREE.Vector3();
let heroCamPos=new THREE.Vector3();
let heroTarget=new THREE.Vector3();

function setupCameras(){
  const fullSize=rootBox.getSize(new THREE.Vector3());
  const baseSize=baseBox.getSize(new THREE.Vector3());
  const baseCenter=baseBox.getCenter(new THREE.Vector3());
  const lidSize=lidBox.getSize(new THREE.Vector3());
  const lidCenter=lidBox.getCenter(new THREE.Vector3());
  const maxDim=Math.max(fullSize.x,fullSize.y,fullSize.z);
  const dist=(maxDim/2)/Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);

  // 1) CLOSED: камера почти на уровне передней кромки.
  // Из-за этого в кадре остаётся только тонкий закрытый корпус, как в твоём эскизе.
  closedCamPos.set(
    baseCenter.x,
    baseBox.min.y + baseSize.y*0.42,
    baseBox.max.z + dist*0.82
  );
  closedTarget.set(
    baseCenter.x,
    baseBox.min.y + baseSize.y*0.38,
    baseCenter.z
  );

  // 2) OPENING: камера поднимается, чтобы во время открытия хорошо видеть клавиатуру.
  openingCamPos.set(
    baseCenter.x,
    baseBox.max.y + fullSize.y*0.34,
    baseBox.max.z + dist*0.82
  );
  openingTarget.set(
    baseCenter.x,
    baseBox.max.y + fullSize.y*0.05,
    baseCenter.z - baseSize.z*0.10
  );

  // 3) HERO: камера выравнивается относительно дисплея.
  // Клавиатура естественно уходит вниз из кадра, остаются экран и тонкая нижняя кромка.
  const heroDist=(Math.max(lidSize.x,lidSize.y)/2)/Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*1.10;
  heroCamPos.set(
    lidCenter.x,
    lidCenter.y + lidSize.y*0.01,
    lidBox.max.z + heroDist
  );
  heroTarget.set(
    lidCenter.x,
    lidCenter.y + lidSize.y*0.02,
    lidCenter.z
  );

  camera.position.copy(closedCamPos);
  camera.lookAt(closedTarget);
}

function setProgress(v){
  if(!pivot) return;
  const p=clamp(Number(v)||0);

  // Крышка открывается на первых 70% скролла.
  // В исходном GLB она уже открыта, поэтому 0° = исходное открытое положение.
  const OPEN_END=.70;
  const openPhase=clamp(p/OPEN_END);
  const a=ease(openPhase);

  // 101° закрывает крышку полностью; раньше 86° оставляли заметную щель.
  const CLOSED=THREE.MathUtils.degToRad(101);
  const OPEN=THREE.MathUtils.degToRad(0);
  pivot.rotation.x=THREE.MathUtils.lerp(CLOSED,OPEN,a);

  // Камера имеет ТРИ состояния, как в твоём эскизе.
  // 0–24%: из низкого "закрытого" ракурса поднимаемся к виду на клавиатуру.
  const camRise=ease(clamp(p/.24));
  // 70–100%: после полного открытия переходим во фронтальный hero-ракурс.
  const hero=ease(clamp((p-OPEN_END)/(1-OPEN_END)));

  const phase12Pos=new THREE.Vector3().lerpVectors(closedCamPos,openingCamPos,camRise);
  const phase12Target=new THREE.Vector3().lerpVectors(closedTarget,openingTarget,camRise);

  camera.position.lerpVectors(phase12Pos,heroCamPos,hero);
  const target=new THREE.Vector3().lerpVectors(phase12Target,heroTarget,hero);
  camera.lookAt(target);

  slider.value=String(p);
  status.textContent=
    p<.02 ? '1 · полностью закрыт' :
    p<OPEN_END ? '2 · открывается · клавиатура видна' :
    p<.99 ? '3 · камера → экран' :
    '3 · открыт · клавиатура скрыта';
}

new GLTFLoader().load('./macbook_pro_14_inch_M5.glb',gltf=>{
  model=gltf.scene;
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  scene.add(model);
  model.updateMatrixWorld(true);
  rigModel(model);
  // After reparenting, recalc overall bounds from scene-visible meshes
  rootBox=new THREE.Box3().setFromObject(model);
  lidMeshes.forEach(o=>rootBox.union(worldBox(o)));
  setupCameras();
  setProgress(0);
  status.textContent='готово · закрыт';
},undefined,err=>{
  console.error(err);
  status.textContent='ошибка загрузки GLB';
  debug.textContent=String(err?.message||err);
});

slider.addEventListener('input',()=>{playing=false;setProgress(slider.value)});
play.addEventListener('click',()=>{if(!pivot)return;playing=true;t0=performance.now();setProgress(0)});

function tick(now){
  requestAnimationFrame(tick);
  if(playing){
    const p=clamp((now-t0)/DURATION);
    setProgress(p);
    if(p>=1) playing=false;
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(tick);
