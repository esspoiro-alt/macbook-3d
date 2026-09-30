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
let rootBox=null, lidBox=null;
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

let baseCamPos=new THREE.Vector3();
let baseTarget=new THREE.Vector3();
let heroCamPos=new THREE.Vector3();
let heroTarget=new THREE.Vector3();

function setupCameras(){
  const size=rootBox.getSize(new THREE.Vector3());
  const center=rootBox.getCenter(new THREE.Vector3());
  const maxDim=Math.max(size.x,size.y,size.z);
  const dist=(maxDim/2)/Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);

  baseCamPos.set(center.x, center.y+size.y*.16, rootBox.max.z + dist*.92);
  baseTarget.set(center.x, center.y+size.y*.05, center.z);

  // final = lower camera, almost frontal to screen, keyboard slips out below frame
  heroCamPos.set(center.x, center.y+size.y*.02, rootBox.max.z + dist*.78);
  heroTarget.set(center.x, center.y+size.y*.28, center.z-size.z*.05);

  camera.position.copy(baseCamPos);
  camera.lookAt(baseTarget);
}

function setProgress(v){
  if(!pivot) return;
  const p=clamp(Number(v)||0);

  // Phase 1: close -> open. Current imported model is open, so p=0 closes lid.
  const openPhase=clamp(p/.68);
  const a=ease(openPhase);
  // Imported model is treated as the open pose at 0 rotation.
  const CLOSED=THREE.MathUtils.degToRad(86);
  const OPEN=THREE.MathUtils.degToRad(0);
  pivot.rotation.x=THREE.MathUtils.lerp(CLOSED,OPEN,a);

  // Phase 2: camera moves into presentation framing
  const q=ease(clamp((p-.68)/.32));
  camera.position.lerpVectors(baseCamPos,heroCamPos,q);
  const target=new THREE.Vector3().lerpVectors(baseTarget,heroTarget,q);
  camera.lookAt(target);

  slider.value=String(p);
  status.textContent=p<.02?'закрыт':p<.68?'открывается':p<.99?'камера → фронтально':'готово';
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
