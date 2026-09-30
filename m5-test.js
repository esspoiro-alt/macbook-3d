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
  const baseCenter=baseBox.getCenter(new THREE.Vector3());
  const baseSize=baseBox.getSize(new THREE.Vector3());

  // Determine which Z edge of the base is actually the hinge edge.
  // We choose the edge physically closest to the bottom/center plane of the open lid,
  // instead of assuming min.z or max.z.
  const distToMinZ=Math.abs(lidCenter.z-baseBox.min.z);
  const distToMaxZ=Math.abs(lidCenter.z-baseBox.max.z);
  const hingeZ=distToMinZ<distToMaxZ ? baseBox.min.z : baseBox.max.z;

  // The real hinge height is where the lower edge of the lid meets the top of the base.
  const hingeY=(lidBox.min.y+baseBox.max.y)*0.5;

  pivot=new THREE.Group();
  pivot.name='AUTO_HINGE_PIVOT';
  pivot.position.set(baseCenter.x,hingeY,hingeZ);
  scene.add(pivot);

  lidMeshes.forEach(o=>reparentPreserveWorld(o,pivot));

  // After reparenting, test BOTH possible closing directions.
  // One direction puts the lid over the keyboard; the other sends it under the laptop.
  // We score both and keep the physically correct one.
  const scoreAngle=(angle)=>{
    pivot.rotation.x=angle;
    pivot.updateMatrixWorld(true);
    const b=new THREE.Box3();
    lidMeshes.forEach(o=>b.union(worldBox(o)));
    const center=b.getCenter(new THREE.Vector3());
    const size=b.getSize(new THREE.Vector3());

    // Strongly reward lid being ABOVE the base, never underneath it.
    const above = center.y >= baseCenter.y ? 1 : -1;
    const minAbovePenalty=Math.abs(Math.min(0,b.min.y-(baseBox.max.y-baseSize.y*0.18)))*100;

    // Reward footprint overlap with the base in Z when closed.
    const overlapZ=Math.max(0,Math.min(b.max.z,baseBox.max.z)-Math.max(b.min.z,baseBox.min.z));
    const zScore=overlapZ/Math.max(size.z,1e-6);

    // Closed lid should be thin vertically.
    const flatScore=1/(1+size.y*20);

    return above*100 + zScore*25 + flatScore*10 - minAbovePenalty;
  };

  const plus=THREE.MathUtils.degToRad(90);
  const minus=THREE.MathUtils.degToRad(-90);
  const plusScore=scoreAngle(plus);
  const minusScore=scoreAngle(minus);
  window.__CLOSED_ANGLE = plusScore>=minusScore ? plus : minus;

  // Restore open pose after solving.
  pivot.rotation.x=0;
  pivot.updateMatrixWorld(true);

  const names=lidMeshes.map(o=>o.name||'(unnamed)').slice(0,80);
  debug.innerHTML=
    '<span class="good">AUTO-RIG OK</span><br>'+
    'lid meshes: '+lidMeshes.length+' / '+d.all.length+'<br>'+
    'hinge edge: '+(distToMinZ<distToMaxZ?'minZ':'maxZ')+'<br>'+
    'hinge: '+pivot.position.toArray().map(v=>v.toFixed(3)).join(', ')+'<br>'+
    'close direction: '+(window.__CLOSED_ANGLE>0?'+90°':'-90°')+
    ' | scores '+plusScore.toFixed(1)+' / '+minusScore.toFixed(1)+'<br><br>'+
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
  // Recalculate boxes in the imported OPEN pose.
  baseBox=new THREE.Box3();
  baseMeshes.forEach(o=>baseBox.union(worldBox(o)));
  lidBox=new THREE.Box3();
  lidMeshes.forEach(o=>lidBox.union(worldBox(o)));
  rootBox=baseBox.clone().union(lidBox);

  const fullSize=rootBox.getSize(new THREE.Vector3());
  const baseSize=baseBox.getSize(new THREE.Vector3());
  const baseCenter=baseBox.getCenter(new THREE.Vector3());
  const lidSize=lidBox.getSize(new THREE.Vector3());
  const lidCenter=lidBox.getCenter(new THREE.Vector3());
  const maxDim=Math.max(fullSize.x,fullSize.y,fullSize.z);
  const vFov=THREE.MathUtils.degToRad(camera.fov);
  const dist=(maxDim/2)/Math.tan(vFov/2);

  // 1) CLOSED: low front view of a thin shut laptop.
  closedCamPos.set(
    baseCenter.x,
    baseBox.min.y + baseSize.y*0.46,
    baseBox.max.z + dist*0.82
  );
  closedTarget.set(
    baseCenter.x,
    baseBox.min.y + baseSize.y*0.42,
    baseCenter.z
  );

  // 2) OPENING: lift camera so keyboard is clearly visible while lid opens.
  openingCamPos.set(
    baseCenter.x,
    baseBox.max.y + fullSize.y*0.38,
    baseBox.max.z + dist*0.88
  );
  openingTarget.set(
    baseCenter.x,
    baseBox.max.y + fullSize.y*0.02,
    baseCenter.z
  );

  // 3) HERO: frame the lid itself almost edge-to-edge.
  // This crops the keyboard out naturally; only the thin lower MacBook rim can remain.
  const hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);
  const distForWidth=(lidSize.x*0.5)/Math.tan(hFov/2);
  const heroDist=distForWidth*1.06;

  heroCamPos.set(
    lidCenter.x,
    lidCenter.y + lidSize.y*0.015,
    lidBox.max.z + heroDist
  );
  heroTarget.set(
    lidCenter.x,
    lidCenter.y + lidSize.y*0.08,
    lidCenter.z
  );

  camera.position.copy(closedCamPos);
  camera.lookAt(closedTarget);
}

function setProgress(v){
  if(!pivot) return;
  const p=clamp(Number(v)||0);

  // Phase 1+2: real hinge motion.
  // Imported model is the fully OPEN reference pose (rotation 0).
  const OPEN_END=.72;
  const openPhase=clamp(p/OPEN_END);
  const a=ease(openPhase);

  // Use the automatically solved physical closing direction.
  const CLOSED=(window.__CLOSED_ANGLE ?? THREE.MathUtils.degToRad(-90))*0.992;
  const OPEN=0;
  pivot.rotation.x=THREE.MathUtils.lerp(CLOSED,OPEN,a);
  pivot.updateMatrixWorld(true);

  // Camera rises early while the lid opens, then switches to the tight frontal hero shot.
  const camRise=ease(clamp(p/.30));
  const hero=ease(clamp((p-.76)/.24));

  const phase12Pos=new THREE.Vector3().lerpVectors(closedCamPos,openingCamPos,camRise);
  const phase12Target=new THREE.Vector3().lerpVectors(closedTarget,openingTarget,camRise);

  camera.position.lerpVectors(phase12Pos,heroCamPos,hero);
  const target=new THREE.Vector3().lerpVectors(phase12Target,heroTarget,hero);
  camera.lookAt(target);

  slider.value=String(p);
  status.textContent=
    p<.02 ? '1 · полностью закрыт' :
    p<OPEN_END ? '2 · открывается · клавиатура видна' :
    p<.99 ? '3 · камера → фронтальный экран' :
    '3 · экран + тонкая нижняя кромка';
}

new GLTFLoader().load('./macbook_pro_14_inch_M5.glb',gltf=>{
  model=gltf.scene;
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  scene.add(model);
  model.updateMatrixWorld(true);
  rigModel(model);
  // rigModel leaves the laptop in the imported OPEN pose.
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
