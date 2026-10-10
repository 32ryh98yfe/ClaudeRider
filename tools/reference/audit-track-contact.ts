// Independent dense verification of FINAL .ctrk/.vis data; never invokes the compiler or its clearance predicates.
// node tools/reference/audit-track-contact.ts report.json [--tracks id,id] [--directory path] [--spacing .75]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadContent } from '@cr/content';
import { getPropContact } from '@cr/content/prop-contact/catalog.ts';
import { ArraySink, CTRK_MAGIC, CTRK_VERSION, CVIS_MAGIC, CVIS_VERSION, createWorld, loadCtrk, makeContext, Phase, readContainer, SIM_VERSION, TFLAG, toArrayBuffer, type BakedTrack, type CtrkMeta, type HazardPose, type RaceConfig } from '@cr/sim';
import { paramsFor } from '../../packages/sim/src/kart/params.ts';
import { KART_CY, KART_R } from '../../packages/sim/src/kart/motion.ts';
import { captureTrackHazardMotion, stepTrackHazards } from '../../packages/sim/src/race/trackhazards.ts';
import { PLACEHOLDER_PROP } from '../../apps/client/src/render/props/defaults.ts';
import type { VisMeta } from '../../packages/sim/src/track/vis-format.ts';
import { barycentricSamples, flattenTriangles, normal, InstancedContactBVH, TriangleBVH, type Vec3 } from './contact-geometry.ts';

type Numeric = ArrayLike<number>;
interface PropRecord { kind:string; n:number; policy?:'solid'|'cosmetic'; contact?:'solid'|'cosmetic'; fingerprint?:string }
type Meta = Omit<CtrkMeta,'propContacts'> & { propContacts?:{version:number;sets:PropRecord[];geometries?:{prefix:string}[];structuralFirst:number;structuralCount:number} };
type VisualMeta = Omit<VisMeta,'propContactVersion'|'props'> & { propContactVersion?:number; props:PropRecord[] };
export interface ContactIssue { kind:string; detail:string; position?:Vec3; triangle?:number; prop?:string; instance?:number }
export interface ContactAudit {
  track:string; trackHash:string; ctrkSha256:string; visSha256:string; status:'passed'|'failed'|'pending'; ctrkVersion:number; visVersion:number;
  groundSamples:number; interiorSamples:number; boundarySamples:number; specialSweeps:number; propInstances:number; runtimeInstanceSamples:number; proxySamples:number; groundCredits:number; sourceModelSamples:number; exactProxyTriangles:number; exactSourceTriangles:number; hazardCases:number; sourceProxyMaxErrorM:number; proxySourceMaxErrorM:number; worldProxyMaxErrorM:number; worldProxyToleranceM:number;
  jumpLaunches:{declaredS:number;sampleS:number;position:Vec3;tangent:Vec3;landWidth:number}[]; fixedRepros:{s:number;u:number;renderContact:boolean;wallContact:boolean}[]; classified:Record<string,number>; issueCounts:Record<string,number>; uniqueIssueCounts:Record<string,number>; issues:ContactIssue[]; milliseconds:number;
}
const content=loadContent();
const DEFAULT_DIRECTORY=resolve(new URL('../../apps/client/public/tracks/',import.meta.url).pathname);
const FRAME={px:0,py:0,pz:0,tx:0,ty:0,tz:1,rx:1,ry:0,rz:0,ux:0,uy:1,uz:0,wL:0,wR:0,sMain:0,flags:0};
function emptyAudit(id:string):ContactAudit{return {track:id,trackHash:'',ctrkSha256:'',visSha256:'',status:'passed',ctrkVersion:0,visVersion:0,groundSamples:0,interiorSamples:0,boundarySamples:0,specialSweeps:0,propInstances:0,runtimeInstanceSamples:0,proxySamples:0,groundCredits:0,sourceModelSamples:0,exactProxyTriangles:0,exactSourceTriangles:0,hazardCases:0,sourceProxyMaxErrorM:0,proxySourceMaxErrorM:0,worldProxyMaxErrorM:0,worldProxyToleranceM:0,jumpLaunches:[],fixedRepros:[],classified:{},issueCounts:{},uniqueIssueCounts:{},issues:[],milliseconds:0};}
const sameArray=(a:Numeric|undefined,b:Numeric|undefined):boolean=>!!a&&!!b&&a.length===b.length&&Array.from(a).every((v,i)=>v===b[i]);
const offset=(p:Vec3,n:Vec3,d:number):[number,number,number]=>[p[0]+n[0]*d,p[1]+n[1]*d,p[2]+n[2]*d];
const dot=(a:Vec3,b:Vec3):number=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const transform=(p:Vec3,m:Numeric,o:number):[number,number,number]=>[m[o]!*p[0]+m[o+4]!*p[1]+m[o+8]!*p[2]+m[o+12]!,m[o+1]!*p[0]+m[o+5]!*p[1]+m[o+9]!*p[2]+m[o+13]!,m[o+2]!*p[0]+m[o+6]!*p[1]+m[o+10]!*p[2]+m[o+14]!];
const triangles=(a:readonly number[]):[Vec3,Vec3,Vec3][]=>Array.from({length:a.length/9},(_,i)=>{const o=i*9;return [[a[o]!,a[o+1]!,a[o+2]!],[a[o+3]!,a[o+4]!,a[o+5]!],[a[o+6]!,a[o+7]!,a[o+8]!]];});

/** Ground represents only close, tangential foundation/deck faces; an overhead or vertical obstacle gets no credit. */
export function groundRepresents(point:Vec3,ground:TriangleBVH,support:boolean):boolean{
  const hit=ground.nearest(point,.36);if(!hit)return false;
  const delta:[number,number,number]=[point[0]-hit.point[0],point[1]-hit.point[1],point[2]-hit.point[2]],height=dot(delta,hit.normal);
  const lateral=Math.sqrt(Math.max(0,hit.distance*hit.distance-height*height));
  return lateral<=.015&&height>=-.301&&height<=(support?.151:.021);
}
/** A complete kart ground footprint, not just a valid triangle at the kart's centre. */
function interior(point:Vec3,up:Vec3,ground:TriangleBVH):boolean{
  const axis:Vec3=Math.abs(up[1])<.9?[0,1,0]:[1,0,0];
  let rx=up[1]*axis[2]-up[2]*axis[1],ry=up[2]*axis[0]-up[0]*axis[2],rz=up[0]*axis[1]-up[1]*axis[0];const len=Math.hypot(rx,ry,rz);rx/=len;ry/=len;rz/=len;
  const r:Vec3=[rx,ry,rz],f:Vec3=[up[1]*rz-up[2]*ry,up[2]*rx-up[0]*rz,up[0]*ry-up[1]*rx];
  for(let i=0;i<8;i++){const a=i*Math.PI/4,at=offset(offset(point,r,Math.cos(a)*KART_R),f,Math.sin(a)*KART_R);const hit=ground.nearest(at,.12);if(!hit)return false;const delta:Vec3=[at[0]-hit.point[0],at[1]-hit.point[1],at[2]-hit.point[2]],height=dot(delta,hit.normal);if(Math.sqrt(Math.max(0,hit.distance*hit.distance-height*height))>.01)return false;}
  return true;
}

/** The baked path interpolates across the gap; takeoff uses the final actual support plane instead. */
export function physicalJumpLaunch(track:Pick<BakedTrack,'frameAt'>,ground:TriangleBVH,path:number,lipS:number):(typeof FRAME&{sampleS:number})|null {
  let launch:(typeof FRAME&{sampleS:number})|null=null;
  const hint={...FRAME},start=Math.max(0,lipS-2),steps=Math.ceil((lipS-start)/.025);
  for(let i=0;i<=steps;i++){
    const s=start+(lipS-start)*i/Math.max(1,steps);track.frameAt(path,s,hint);
    const p:Vec3=[hint.px,hint.py,hint.pz],up:Vec3=[hint.ux,hint.uy,hint.uz],hit=ground.intersectSegment(offset(p,up,1),offset(p,up,-1));
    if(!hit||Math.hypot(p[0]-hit.point[0],p[1]-hit.point[1],p[2]-hit.point[2])>.45||dot(up,hit.normal)<.5)continue;
    const tangent:Vec3=[hint.tx,hint.ty,hint.tz],d=dot(tangent,hit.normal),f=offset(tangent,hit.normal,-d),len=Math.hypot(...f);if(len<.1)continue;
    const [tx,ty,tz]=f.map(v=>v/len) as [number,number,number],[ux,uy,uz]=hit.normal;
    launch={...hint,sampleS:s,px:hit.point[0],py:hit.point[1],pz:hit.point[2],tx,ty,tz,ux,uy,uz,rx:ty*uz-tz*uy,ry:tz*ux-tx*uz,rz:tx*uy-ty*ux};
  }
  return launch;
}

export async function auditTrackContact(id:string,directory=DEFAULT_DIRECTORY,spacing=.75):Promise<ContactAudit>{
  if(!(spacing>0&&spacing<=.75))throw new Error('Audit spacing must be in(0,.75] metres');
  const start=performance.now(),report=emptyAudit(id);
  const issueLocations=new Set<string>();
  const issue=(kind:string,detail:string,extra:Partial<ContactIssue>={}):void=>{
    report.issueCounts[kind]=(report.issueCounts[kind]??0)+1;report.status='failed';
    const key=`${kind}:${extra.prop??''}:${extra.instance??''}:${extra.triangle??''}:${extra.position?.map(v=>v.toFixed(4)).join(',')??detail}`;
    if(issueLocations.has(key))return;issueLocations.add(key);report.uniqueIssueCounts[kind]=(report.uniqueIssueCounts[kind]??0)+1;
    if(report.uniqueIssueCounts[kind]!<=16)report.issues.push({kind,detail,...extra});
  };
  const classified=(kind:string):void=>{report.classified[kind]=(report.classified[kind]??0)+1;};
  const raw=readFileSync(resolve(directory,`${id}.ctrk`)),render=readFileSync(resolve(directory,`${id}.vis`));
  report.ctrkSha256=createHash('sha256').update(raw).digest('hex');report.visSha256=createHash('sha256').update(render).digest('hex');
  report.ctrkVersion=raw.readUInt16LE(4);report.visVersion=render.readUInt16LE(4);
  if(report.ctrkVersion!==CTRK_VERSION||report.visVersion!==CVIS_VERSION){report.status='pending';report.issues.push({kind:'rebake_required',detail:`Expected final formats${CTRK_VERSION}/${CVIS_VERSION}`});return report;}
  const ctrk=readContainer(toArrayBuffer(raw),CTRK_MAGIC,CTRK_VERSION),vis=readContainer(toArrayBuffer(render),CVIS_MAGIC,CVIS_VERSION);
  const meta=ctrk.meta as Meta,vm=vis.meta as VisualMeta,track=loadCtrk(toArrayBuffer(raw));
  report.trackHash=meta.hash;
  if(meta.propContacts?.version!==2||!meta.propContacts.geometries||vm.propContactVersion!==2){report.status='pending';report.issues.push({kind:'contact_metadata_required',detail:'Final prop contacts and shared transforms are required'});return report;}
  const gp=ctrk.arrays.get('g.pos')!,gi=ctrk.arrays.get('g.idx')!,gf=ctrk.arrays.get('g.flg')!,wp=ctrk.arrays.get('w.pos')!,wi=ctrk.arrays.get('w.idx')!,wf=ctrk.arrays.get('w.flg')!;
  const ground=new TriangleBVH(flattenTriangles(gp,gi)),walls=new TriangleBVH(flattenTriangles(wp,wi));
  const geometryData=meta.propContacts.geometries.map(g=>flattenTriangles(ctrk.arrays.get(`${g.prefix}.pos`)!,ctrk.arrays.get(`${g.prefix}.idx`)!));
  const instances=new InstancedContactBVH();
  for(let j=0;j<vm.props.length;j++){
    const prop=vm.props[j]!,m=ctrk.arrays.get(`prop${j}.mat`),geo=ctrk.arrays.get(`prop${j}.geo`),flags=ctrk.arrays.get(`prop${j}.flags`),contacts=ctrk.arrays.get(`prop${j}.contacts`);
    if(!m||!geo||!flags||!contacts){issue('missing_instance_arrays','All instance collision arrays are required',{prop:prop.kind});continue;}
    for(let i=0;i<prop.n;i++){const triangles=geometryData[geo[i]!];if(triangles)instances.add({triangles,matrix:Array.from({length:16},(_,k)=>m[i*16+k]!),first:contacts[i*2]!,flags:flags[i]!,name:prop.kind,instance:i});}
  }
  const arch:number[]=[],archMaterial:string[]=[];
  for(let j=0;j<vm.slots.length;j++){
    const slot=vm.slots[j]!;if(!['underside','terrain'].includes(slot.material))continue;
    const t=flattenTriangles(vis.arrays.get(`s${j}.pos`)!,vis.arrays.get(`s${j}.idx`)!);for(const value of t)arch.push(value);for(let i=0;i<t.length/9;i++)archMaterial.push(slot.material);
  }
  const architecture=new TriangleBVH(arch);const wallContacts=Array.from({length:1024},()=>({x:0,y:0,z:0,nx:0,ny:0,nz:0,depth:0,flags:0,tri:0}));
  // All real ground faces include shoulders, junction blends and plaza interiors, independently of path sample spacing.
  for(let t=0;t<gi.length/3;t++){
    if((gf[t]!&TFLAG.KILL)!==0)continue;
    const[a,b,c]=ground.triangle(t),up=normal(a,b,c);if(Math.hypot(...up)<.5)continue;
    for(const point of barycentricSamples(a,b,c,spacing)){
      report.groundSamples++;
      const center=offset(point,up,KART_CY),visual=architecture.nearest(center,KART_R-.003),wall=walls.nearest(center,KART_R-.003),propHit=instances.nearest(center,KART_R-.003);
      // Exact sphere oracle independently verifies the runtime spatial index whenever contact is expected.
      if((wall||propHit)&&!track.sphereWalls(...center,KART_R,wallContacts,wallContacts.length))issue('runtime_wall_index_gap','BVH wall sphere contact missing from game query',{position:center,triangle:wall?.triangle??propHit!.hit.triangle});
      if(!visual&&!wall&&!propHit)continue;
      const inside=interior(point,up,ground);if(inside)report.interiorSamples++;else report.boundarySamples++;
      if(visual){
        const supported=groundRepresents(visual.point,ground,false);
        if(supported)classified('ground_represented_render_foundation');
        else if(!inside)classified('render_contact_at_outer_ground_boundary');
        else {
          issue('rendered_route_intrusion',`${archMaterial[visual.triangle]} touches a fully supported kart sphere`,{position:center,triangle:visual.triangle});
          if(!walls.nearest(visual.point,.025))issue('render_collision_gap','Route-visible solid architecture has no matching wall contact',{position:visual.point});
        }
      }
      if(propHit&&inside){
        if(propHit.data.flags&TFLAG.GORE)classified('authored_gore_cushion');
        else issue('solid_prop_route_intrusion','Instanced physical prop occupies a fully supported kart footprint',{position:center,triangle:propHit.hit.triangle,prop:propHit.data.name,instance:propHit.data.instance});
      }
      if(wall&&(wf[wall.triangle]!&TFLAG.PROP)!==0&&inside){
        if((wf[wall.triangle]!&TFLAG.GORE)!==0)classified('authored_gore_cushion');
        else issue('solid_prop_route_intrusion','Physical prop occupies a fully supported kart footprint',{position:center,triangle:wall.triangle});
      }
    }
  }
  if(vm.props.length!==meta.propContacts.sets.length)issue('prop_set_count_mismatch','Visual and collision prop-set counts differ');
  let expectedVirtualTriangle=wi.length/3;
  const sourceKit=(await import(new URL(`../../apps/client/src/render/themes/${vm.themeId}/index.ts`,import.meta.url).href)).default(content);
  for(let j=0;j<vm.props.length;j++){
    const prop=vm.props[j]!,physical=meta.propContacts.sets[j],definition=getPropContact(vm.themeId,prop.kind);
    if(!definition||!physical){issue('missing_prop_policy','No explicit catalog or collision record',{prop:prop.kind});continue;}
    if(prop.kind!==physical.kind||prop.n!==physical.n||prop.contact!==physical.policy||prop.contact!==definition.policy||prop.fingerprint!==physical.fingerprint||prop.fingerprint!==definition.fingerprint)issue('prop_metadata_mismatch','Kind/count/policy/fingerprint diverged',{prop:prop.kind});
    const matrices=vis.arrays.get(`p${j}.mat`),contacts=vis.arrays.get(`p${j}.contacts`),credits=vis.arrays.get(`p${j}.support`),geo=vis.arrays.get(`p${j}.geo`),flags=vis.arrays.get(`p${j}.flags`);
    if(!sameArray(geo,ctrk.arrays.get(`prop${j}.geo`))||!sameArray(flags,ctrk.arrays.get(`prop${j}.flags`))||geo?.length!==prop.n||flags?.length!==prop.n||!sameArray(matrices,ctrk.arrays.get(`prop${j}.mat`))||!sameArray(contacts,ctrk.arrays.get(`prop${j}.contacts`))||!sameArray(credits,ctrk.arrays.get(`prop${j}.support`))||matrices?.length!==prop.n*16||contacts?.length!==prop.n*2||credits?.length!==prop.n*2){issue('prop_transform_mismatch','Render/collision matrix or triangle-range data diverged',{prop:prop.kind});continue;}
    // Bidirectional source/proxy vertex+interior distances are measured independently of Meshopt's error estimate.
    let localMax=0;
    const tolerance=(definition.proxyToleranceM??0)+.001;
    if(definition.policy==='solid'){
      const factory=sourceKit.props[prop.kind]??((definition as typeof definition&{placeholder?:boolean}).placeholder?PLACEHOLDER_PROP:undefined);if(!factory){issue('missing_render_factory','Unknown solid renderer model',{prop:prop.kind});continue;}
      const model=factory.build(sourceKit.data.palette).geometry,pos=model.getAttribute('position'),index=model.index,ranges=model.userData.contactRanges??[];
      const source:number[]=[];
      for(let i=0;i<(index?.count??pos.count);i+=3){
        const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
        if(ids.some(v=>(model.userData.contactRole??ranges.find((r:{start:number;count:number;role:string})=>v>=r.start&&v<r.start+r.count)?.role)==='cosmetic'))continue;
        for(const v of ids)source.push(pos.getX(v),pos.getY(v),pos.getZ(v));
      }
      const proxyData=[...definition.triangles,...definition.supportTriangles],local=new TriangleBVH(proxyData),sourceTree=new TriangleBVH(source);
      for(const [mesh,target,label]of [[source,local,'source_catalog_gap'],[proxyData,sourceTree,'catalog_source_gap']] as const)for(const tri of triangles(mesh)){
        const correspondingError=target.correspondingTriangleError(...tri);
        if(correspondingError!==undefined){report.exactSourceTriangles++;localMax=Math.max(localMax,correspondingError);if(label==='source_catalog_gap')report.sourceProxyMaxErrorM=Math.max(report.sourceProxyMaxErrorM,correspondingError);else report.proxySourceMaxErrorM=Math.max(report.proxySourceMaxErrorM,correspondingError);continue;}
        for(const p of barycentricSamples(...tri,Math.min(spacing,.25))){
          report.sourceModelSamples++;const distance=target.nearest(p)?.distance??Infinity;localMax=Math.max(localMax,distance);
          if(label==='source_catalog_gap')report.sourceProxyMaxErrorM=Math.max(report.sourceProxyMaxErrorM,distance);else report.proxySourceMaxErrorM=Math.max(report.proxySourceMaxErrorM,distance);
          if(distance>tolerance)issue(label,`Bidirectional source/proxy deviation exceeds${tolerance}local metres`,{prop:prop.kind,position:p});
        }
      }
      model.dispose();
    }
    const sourceFaces=[[triangles(definition.triangles),false],[triangles(definition.supportTriangles),true]] as const;
    for(let instance=0;instance<prop.n;instance++){
      report.propInstances++;const first=contacts![instance*2]!,count=contacts![instance*2+1]!;
      if(first!==expectedVirtualTriangle)issue('virtual_triangle_id_mismatch','Instance triangle IDs are not a unique contiguous sequence',{prop:prop.kind,instance});expectedVirtualTriangle+=count;
      if((count===0&&flags![instance]!==0)||(count>0&&(flags![instance]!&TFLAG.PROP)===0))issue('instance_contact_flag_mismatch','Physical flags do not match the declared instance geometry',{prop:prop.kind,instance});
      const localProxy=geo![instance]===0xffffffff?[]:geometryData[geo![instance]!];
      if(!localProxy||count!==localProxy.length/9||(count>0&&first<wi.length/3)){issue('invalid_prop_triangle_range','Virtual instance contact range does not match its shared geometry',{prop:prop.kind,instance});continue;}
      const o=instance*16,scale=Math.max(Math.hypot(matrices![o]!,matrices![o+1]!,matrices![o+2]!),Math.hypot(matrices![o+4]!,matrices![o+5]!,matrices![o+6]!),Math.hypot(matrices![o+8]!,matrices![o+9]!,matrices![o+10]!));
      report.worldProxyMaxErrorM=Math.max(report.worldProxyMaxErrorM,localMax*scale);report.worldProxyToleranceM=Math.max(report.worldProxyToleranceM,tolerance*scale);
      if(definition.policy==='cosmetic'){if(count)issue('cosmetic_has_collision','Explicitly cosmetic prop creates solid contact',{prop:prop.kind,instance});classified('explicit_cosmetic_instance');continue;}
      const transformed:number[]=[];for(let k=0;k<localProxy.length;k+=3)transformed.push(...transform([localProxy[k]!,localProxy[k+1]!,localProxy[k+2]!],matrices!,instance*16));
      const proxy=new TriangleBVH(transformed);
      for(const tri of triangles(transformed)){
        const n=normal(...tri);if(Math.hypot(...n)<.5)continue;
        const middle:Vec3=[(tri[0][0]+tri[1][0]+tri[2][0])/3,(tri[0][1]+tri[1][1]+tri[2][1])/3,(tri[0][2]+tri[1][2]+tri[2][2])/3],center=offset(middle,n,KART_R*.7);
        let hits=track.sphereWalls(...center,KART_R,wallContacts,wallContacts.length);report.runtimeInstanceSamples++;
        const found=():boolean=>{for(let i=0;i<hits;i++){const c=wallContacts[i]!;if(c.tri>=first&&c.tri<first+count)return true;}return false;};
        let expanded=false;
        while(!found()&&hits===wallContacts.length&&wallContacts.length<131072){
          const old=wallContacts.length;for(let i=0;i<old;i++)wallContacts.push({x:0,y:0,z:0,nx:0,ny:0,nz:0,depth:0,flags:0,tri:0});
          expanded=true;hits=track.sphereWalls(...center,KART_R,wallContacts,wallContacts.length);
        }
        if(expanded&&found())classified('target_omitted_by_bounded_deepest_contact_selection');
        if(!found())issue(hits===wallContacts.length?'contact_oracle_capacity_exceeded':'runtime_instance_index_gap','Independent instance face contact is absent from an exhaustive runtime query',{prop:prop.kind,instance,position:center});
      }
      for(const [list,support]of sourceFaces)for(const tri of list){
        const world=tri.map(p=>transform(p,matrices!,instance*16)) as unknown as [Vec3,Vec3,Vec3];
        if(proxy.coversTriangle(...world)){report.exactProxyTriangles++;continue;}
        for(const p of barycentricSamples(...world,spacing)){
          report.proxySamples++;
          if(proxy.nearest(p,.012))continue;
          if(groundRepresents(p,ground,support)){report.groundCredits++;continue;}
          issue('prop_proxy_gap','Rendered solid surface has neither an instance collider nor independently verified ground support',{prop:prop.kind,instance,position:p});
        }
      }
    }
  }
  // Swept spheres along complete rails, jump chords/ballistic envelopes, and15m beyond every warp exit.
  const sweep=(path:number,from:number,to:number,lift:number,label:string,lateral=0):void=>{
    let previous:Vec3|undefined;
    for(let s=from;s<=to+1e-6;s+=spacing){track.frameAt(path,s,FRAME);const p:Vec3=[FRAME.px+FRAME.rx*lateral+FRAME.ux*(KART_CY+lift),FRAME.py+FRAME.ry*lateral+FRAME.uy*(KART_CY+lift),FRAME.pz+FRAME.rz*lateral+FRAME.uz*(KART_CY+lift)];
      if(previous){report.specialSweeps++;const hit=architecture.sweep(previous,p,KART_R-.01);if(hit!==null)issue('special_route_intrusion',label,{position:p,triangle:hit});const propHit=instances.sweep(previous,p,KART_R-.01);if(propHit)issue('special_route_prop_intrusion',label,{position:p,prop:propHit.data.name,instance:propHit.data.instance});}previous=p;}
  };
  for(const rail of meta.rails)sweep(rail.path,0,track.path(rail.path).length,0,`rail ${rail.id}`);
  for(const warp of meta.warps)sweep(warp.exitPath,warp.exitS,warp.exitS+15,0,`warp exit ${warp.id}`,warp.exitU);
  for(const jump of meta.jumps){
    const lip=physicalJumpLaunch(track,ground,jump.path,jump.lipS);
    if(!lip){issue('jump_launch_support_missing',`No physical ramp support near${jump.lipS}`);continue;}
    report.jumpLaunches.push({declaredS:jump.lipS,sampleS:lip.sampleS,position:[lip.px,lip.py,lip.pz],tangent:[lip.tx,lip.ty,lip.tz],landWidth:jump.landW??0});
    const halfLanding=jump.landW?jump.landW/2:Infinity;
    for(const speed of [jump.vMin,(jump.vMin+jump.vMax)/2,jump.vMax])for(const u of [-Math.max(0,Math.min(lip.wL,halfLanding)-KART_R),0,Math.max(0,Math.min(lip.wR,halfLanding)-KART_R)]){
      let previous:Vec3|undefined;
      for(let distance=0;distance<=jump.landS1-jump.lipS;distance+=spacing){
        const time=distance/Math.max(1,speed);track.frameAt(jump.path,jump.lipS+distance,FRAME);
        const y=lip.py+speed*lip.ty*time-14*time*time;
        let p:Vec3=[lip.px+speed*lip.tx*time+lip.rx*u+lip.ux*KART_CY,y+lip.ry*u+lip.uy*KART_CY,lip.pz+speed*lip.tz*time+lip.rz*u+lip.uz*KART_CY];
        const up:Vec3=[lip.ux,lip.uy,lip.uz],landing=previous?ground.intersectSegment(offset(previous,up,-KART_CY),offset(p,up,-KART_CY)):null;
        if(landing)p=offset(landing.point,landing.normal,KART_CY);
        if(previous){report.specialSweeps++;const hit=architecture.sweep(previous,p,KART_R-.01);if(hit!==null)issue('special_route_intrusion',`jump${jump.lipS} speed=${speed} lane=${u}`,{position:p,triangle:hit});const propHit=instances.sweep(previous,p,KART_R-.01);if(propHit)issue('special_route_prop_intrusion',`jump${jump.lipS} speed=${speed} lane=${u}`,{position:p,prop:propHit.data.name,instance:propHit.data.instance});}
        if(landing){classified('ballistic_path_lands_on_actual_ground');break;}
        previous=p;
      }
    }
  }
  // Surface jump pads are distinct from authored ramp/gap primitives and must receive flight coverage too.
  const padParams=paramsFor(content.karts.get('pebble'));
  for(const pad of meta.pads.filter(p=>p.kind==='jump')){
    track.frameAt(pad.path,pad.s0+.1,FRAME);const launch={...FRAME},up:Vec3=[launch.ux,launch.uy,launch.uz];
    for(const speed of [10,padParams.vGrip,Math.max(...content.karts.all.map(k=>k.vBoost))])for(const u of [pad.u0+KART_R,(pad.u0+pad.u1)/2,pad.u1-KART_R]){
      const origin:Vec3=[launch.px+launch.rx*u,launch.py+launch.ry*u,launch.pz+launch.rz*u],velocity:Vec3=[speed*launch.tx+padParams.jumpPadSpeed*up[0],speed*launch.ty+padParams.jumpPadSpeed*up[1],speed*launch.tz+padParams.jumpPadSpeed*up[2]];
      let previous=offset(origin,up,KART_CY);
      const dt=Math.min(.02,spacing/(speed+padParams.jumpPadSpeed));
      for(let time=dt;time<=1.5;time+=dt){
        const foot:Vec3=[origin[0]+velocity[0]*time,origin[1]+velocity[1]*time-14*time*time,origin[2]+velocity[2]*time],landing=ground.intersectSegment(offset(previous,up,-KART_CY),foot);
        const p=landing?offset(landing.point,landing.normal,KART_CY):offset(foot,up,KART_CY);report.specialSweeps++;
        const hit=architecture.sweep(previous,p,KART_R-.01);if(hit!==null)issue('jump_pad_route_intrusion',`pad${pad.s0} speed=${speed} lane=${u}`,{position:p,triangle:hit});
        const propHit=instances.sweep(previous,p,KART_R-.01);if(propHit)issue('jump_pad_prop_intrusion',`pad${pad.s0} speed=${speed} lane=${u}`,{position:p,prop:propHit.data.name,instance:propHit.data.instance});
        if(landing){classified('jump_pad_lands_on_actual_ground');break;}previous=p;
      }
    }
  }
  const repros:Record<string,[number,number][]>={token_foundry:[[238,0]],sunset_arena_rally:[[134,0]],manor_catacombs:[[515.5,2]],fernwood_hollow:[[659.5,2]]};
  for(const [s,u]of repros[id]??[]){
    track.frameAt(0,s,FRAME);const center:Vec3=[FRAME.px+FRAME.rx*u+FRAME.ux*KART_CY,FRAME.py+FRAME.ry*u+FRAME.uy*KART_CY,FRAME.pz+FRAME.rz*u+FRAME.uz*KART_CY];
    const renderContact=!!architecture.nearest(center,KART_R-.003),wallContact=!!walls.nearest(center,KART_R-.003)||!!instances.nearest(center,KART_R-.003);
    report.fixedRepros.push({s,u,renderContact,wallContact});if(renderContact||wallContact)issue('known_repro_unresolved',`path0 s=${s} u=${u}`,{position:center});
  }
  hazardAudit(track,report,issue);
  report.milliseconds=Math.round(performance.now()-start);return report;
}

function hazardAudit(track:BakedTrack,report:ContactAudit,issue:(kind:string,detail:string,extra?:Partial<ContactIssue>)=>void):void{
  const cfg:RaceConfig={simVersion:SIM_VERSION,trackId:track.id,trackHash:track.hash,mode:'speed',teams:'solo',laps:1,seed:4242,introTicks:0,countdownTicks:0,slots:[{kind:'human',name:'audit',team:0,characterId:'clay',kartBodyId:'pebble',vMul:1}],rules:{retireTicks:600,friendlyFire:'off',itemSet:'standard',rubberBand:false,instantBoostInItem:true}};
  for(let id=0;id<track.hazards.length;id++){
    const h=track.hazards[id]!;
    const isolated=Object.create(track) as BakedTrack;
    Object.defineProperty(isolated,'hazards',{value:[h]});
    Object.defineProperty(isolated,'hazardPose',{value:(_id:number,tick:number,pose:HazardPose)=>track.hazardPose(id,tick,pose)});
    if(h.contact!=='solid'&&h.contact!=='trigger')issue('hazard_policy_missing',`${h.name??id} has no explicit contact policy`);
    for(const phase of new Set([h.activeFrom-1,h.activeFrom,Math.floor((h.activeFrom+h.activeTo)/2),h.activeTo-1,h.activeTo,Math.floor((h.activeTo+h.activeFrom+h.periodTicks)/2)%Math.max(1,h.periodTicks)]))for(const immune of [false,true]){
      const period=h.periodTicks||1,tick=((phase-h.offsetTicks)%period+period)%period+period,pose:HazardPose={x:0,y:0,z:0,active:0,telegraph:0};track.hazardPose(id,tick,pose);track.frameAt(h.path,h.s,FRAME);
      const up:Vec3=[pose.ux??FRAME.ux,pose.uy??FRAME.uy,pose.uz??FRAME.uz],height=h.shape==='box'?h.size[2]/2:h.shape==='cyl'&&h.kind!=='swinger'?h.size[1]/2:0;
      const center=offset([pose.x,pose.y,pose.z],up,height),foot=offset(center,up,-KART_CY),world=createWorld(cfg,track,content),kart=world.karts[0]!;
      world.phase=Phase.RACING;world.tick=tick;kart.body.px=foot[0];kart.body.py=foot[1];kart.body.pz=foot[2];kart.body.nx=up[0];kart.body.ny=up[1];kart.body.nz=up[2];kart.body.vx=10;kart.status.immuneUntil=immune?tick+1000:0;
      const events=new ArraySink(),ctx=makeContext({track:isolated,cfg,content,role:'authority',events});stepTrackHazards(world,ctx);report.hazardCases++;
      const visibleSolid=(h.contact==='solid'||h.effect==='block')&&(h.kind!=='train'||pose.active===1||pose.telegraph===1);
      if(visibleSolid&&!kart.body.wallContact)issue('solid_hazard_ignored',`${h.name??id} active, immune=${immune}`,{position:center});
      if(pose.active&&h.contact==='trigger'&&!immune&&world.effects.length===0)issue('trigger_hazard_ignored',`${h.name??id} active trigger`,{position:center});
      if(!pose.active&&(world.effects.length||(!visibleSolid&&kart.body.wallContact)))issue('inactive_hazard_contact',`${h.name??id} inactive phase=${phase}`,{position:center});
      if(pose.active&&h.contact==='trigger'&&immune&&(kart.body.wallContact||world.effects.length))issue('immune_trigger_changed_body',`${h.name??id} immune trigger`,{position:center});
      const previous:HazardPose={x:0,y:0,z:0,active:0,telegraph:0};track.hazardPose(id,tick-1,previous);
      if(pose.active&&previous.active&&phase===Math.floor((h.activeFrom+h.activeTo)/2)&&Math.hypot(pose.x-previous.x,pose.y-previous.y,pose.z-previous.z)<5){
        const travel=Math.max(...h.size)+12,forward:Vec3=[pose.fx??FRAME.tx,pose.fy??FRAME.ty,pose.fz??FRAME.tz],before=offset(foot,forward,-travel),after=offset(foot,forward,travel);
        const crossing=createWorld(cfg,track,content),k=crossing.karts[0]!;crossing.phase=Phase.RACING;crossing.tick=tick;
        k.body.px=before[0];k.body.py=before[1];k.body.pz=before[2];k.body.nx=up[0];k.body.ny=up[1];k.body.nz=up[2];k.status.immuneUntil=immune?tick+1000:0;
        captureTrackHazardMotion(crossing);k.body.px=after[0];k.body.py=after[1];k.body.pz=after[2];k.body.vx=forward[0]*50;k.body.vy=forward[1]*50;k.body.vz=forward[2]*50;
        stepTrackHazards(crossing,makeContext({track:isolated,cfg,content,role:'authority',events:new ArraySink()}));report.hazardCases++;
        if(h.contact==='solid'&&!k.body.wallContact)issue('swept_hazard_ignored',`${h.name??id} crossed between clear endpoints immune=${immune}`,{position:center});
        if(h.contact==='trigger'&&!immune&&!crossing.effects.length)issue('swept_trigger_ignored',`${h.name??id} crossed between clear endpoints`,{position:center});
      }

    }
  }
}

async function main():Promise<void>{
  const args=process.argv.slice(2),output=args.shift();if(!output)throw new Error('Output JSON path required');
  const option=(name:string):string|undefined=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
  const ids=option('--tracks')?.split(',')??content.tracks.all.map(t=>t.id),directory=option('--directory')??DEFAULT_DIRECTORY,spacing=Number(option('--spacing')??.75);
  const reports:ContactAudit[]=[];for(const id of ids){let result:ContactAudit;try{result=await auditTrackContact(id,directory,spacing);}catch(error){result={...emptyAudit(id),status:'failed',issueCounts:{audit_exception:1},issues:[{kind:'audit_exception',detail:error instanceof Error?error.stack??error.message:String(error)}]};}reports.push(result);writeFileSync(output,JSON.stringify({complete:false,plannedTrackIds:ids,spacing,tracks:reports,passed:false},null,2)+'\n');process.stderr.write(`${id}: ${result.status} samples=${result.groundSamples+result.proxySamples} issues=${JSON.stringify(result.issueCounts)}\n`);}
  const report={complete:true,simVersion:SIM_VERSION,plannedTrackIds:ids,worldStorageToleranceM:.012,sourceStorageToleranceM:.001,method:'Independent BVH distances, exact capsule/triangle sweeps, triangle correspondence(<0.000423m) and dense barycentric samples; no compiler-clearance predicate reuse',spacing,maxSphereRadius:KART_R,centerHeight:KART_CY,tracks:reports,passed:reports.every(r=>r.status==='passed')};
  writeFileSync(output,JSON.stringify(report,null,2)+'\n');if(!report.passed)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)void main();
