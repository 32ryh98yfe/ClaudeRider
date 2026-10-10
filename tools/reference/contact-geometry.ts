// Independent verification geometry. Deliberately does not import the compiler's clipping/clearance implementation.
export type Vec3 = readonly [number, number, number];
export interface NearestHit { distance: number; triangle: number; point: [number, number, number]; normal: [number, number, number] }
interface Node { bounds: number[]; ids?: number[]; left?: Node; right?: Node }
const sq = (n: number): number => n*n;
const dot = (a: Vec3,b: Vec3): number => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub = (a: Vec3,b: Vec3): [number,number,number] => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add = (a: Vec3,b: Vec3,t: number): [number,number,number] => [a[0]+b[0]*t,a[1]+b[1]*t,a[2]+b[2]*t];
const cross = (a: Vec3,b: Vec3): [number,number,number] => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length = (a: Vec3): number => Math.hypot(...a);
const dist2 = (a: Vec3,b: Vec3): number => sq(a[0]-b[0])+sq(a[1]-b[1])+sq(a[2]-b[2]);

/** Voronoi-region closest point, including edges and triangle interiors. */
export function closestTriangle(p: Vec3,a: Vec3,b: Vec3,c: Vec3): [number,number,number] {
  const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0)return [...a];
  const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return [...b];
  const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return add(a,ab,d1/(d1-d3));
  const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return [...c];
  const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return add(a,ac,d2/(d2-d6));
  const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0)return add(b,sub(c,b),(d4-d3)/((d4-d3)+(d5-d6)));
  const total=va+vb+vc;if(Math.abs(total)<1e-20)return [...a];
  return add(add(a,ab,vb/total),ac,vc/total);
}
function segmentDistance2(p: Vec3,q: Vec3,a: Vec3,b: Vec3): number {
  const u=sub(q,p),v=sub(b,a),w=sub(p,a),A=dot(u,u),B=dot(u,v),C=dot(v,v),D=dot(u,w),E=dot(v,w);
  let s=0,t=0;
  if(A<1e-16)t=C>0?Math.max(0,Math.min(1,E/C)):0;
  else if(C<1e-16)s=Math.max(0,Math.min(1,-D/A));
  else {
    const den=A*C-B*B;s=den>1e-16?Math.max(0,Math.min(1,(B*E-C*D)/den)):0;
    t=(B*s+E)/C;
    if(t<0){t=0;s=Math.max(0,Math.min(1,-D/A));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(B-D)/A));}
  }
  return dist2(add(p,u,s),add(a,v,t));
}
/** Exact segment-to-triangle distance; capsule contact cannot tunnel between sampled endpoints. */
export function segmentTriangleDistance2(p: Vec3,q: Vec3,a: Vec3,b: Vec3,c: Vec3): number {
  const n=cross(sub(b,a),sub(c,a)),v=sub(q,p),den=dot(n,v);
  if(Math.abs(den)>1e-16){const t=dot(n,sub(a,p))/den;if(t>=0&&t<=1){const x=add(p,v,t);if(dist2(x,closestTriangle(x,a,b,c))<1e-16)return 0;}}
  return Math.min(dist2(p,closestTriangle(p,a,b,c)),dist2(q,closestTriangle(q,a,b,c)),segmentDistance2(p,q,a,b),segmentDistance2(p,q,b,c),segmentDistance2(p,q,c,a));
}
export function normal(a: Vec3,b: Vec3,c: Vec3): [number,number,number] {
  const n=cross(sub(b,a),sub(c,a)),l=length(n);return l>1e-15?[n[0]/l,n[1]/l,n[2]/l]:[0,0,0];
}
export function* barycentricSamples(a: Vec3,b: Vec3,c: Vec3,spacing=.75): Generator<[number,number,number]> {
  yield [(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];
  for(const [p,q]of [[a,b],[b,c],[c,a]] as const){const n=Math.max(1,Math.ceil(length(sub(q,p))/spacing));for(let i=0;i<=n;i++)yield add(p,sub(q,p),i/n);}
  // Work in metres rather than an equal barycentric lattice: long thin trunk/rope faces must not get
  // thousands of redundant samples across their few-centimetre width. The strip pitch bounds coverage
  // by spacing in both surface directions and includes every boundary plus genuine interior rows.
  if(length(sub(a,c))>length(sub(a,b))&&length(sub(a,c))>=length(sub(b,c)))[b,c]=[c,b];
  else if(length(sub(b,c))>length(sub(a,b)))[a,b,c]=[b,c,a];
  const base=length(sub(b,a)),height=base>1e-12?length(cross(sub(b,a),sub(c,a)))/base:0,pitch=spacing/Math.SQRT2;
  const rows=Math.max(2,Math.ceil(height/pitch));
  for(let j=0;j<=rows;j++){
    const t=j/rows,left=add(a,sub(c,a),t),right=add(b,sub(c,b),t),n=Math.max(1,Math.ceil(length(sub(right,left))/pitch));
    for(let i=0;i<=n;i++)yield add(left,sub(right,left),i/n);
  }
}
export function flattenTriangles(pos: ArrayLike<number>,indices?: ArrayLike<number>,first=0,count=(indices?.length??pos.length/3)/3): number[] {
  const out:number[]=[];for(let t=first;t<first+count;t++)for(let k=0;k<3;k++){const i=(indices?indices[t*3+k]!:t*3+k)*3;out.push(pos[i]!,pos[i+1]!,pos[i+2]!);}return out;
}
export class TriangleBVH {
  readonly triangles: readonly number[];
  private root: Node;
  private triangleKeys: Map<string,number> | undefined;
  constructor(triangles: readonly number[]){
    this.triangles=triangles;
    const boxes=Array.from({length:triangles.length/9},(_,id)=>{
      const t=triangles.slice(id*9,id*9+9),b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
      for(let i=0;i<9;i++) {const ax=i%3;b[ax]=Math.min(b[ax]!,t[i]!);b[ax+3]=Math.max(b[ax+3]!,t[i]!);}return b;
    });
    const build=(ids:number[]):Node=>{
      const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
      for(const id of ids)for(let k=0;k<3;k++){bounds[k]=Math.min(bounds[k]!,boxes[id]![k]!);bounds[k+3]=Math.max(bounds[k+3]!,boxes[id]![k+3]!);}
      if(ids.length<=12)return {bounds,ids};
      let axis=0;for(let k=1;k<3;k++)if(bounds[k+3]!-bounds[k]!>bounds[axis+3]!-bounds[axis]!)axis=k;
      ids.sort((a,b)=>(boxes[a]![axis]!+boxes[a]![axis+3]!)-(boxes[b]![axis]!+boxes[b]![axis+3]!));
      const m=ids.length>>1;return {bounds,left:build(ids.slice(0,m)),right:build(ids.slice(m))};
    };
    this.root=build(boxes.map((_,i)=>i));
  }
  triangle(id:number):[Vec3,Vec3,Vec3]{const t=this.triangles,o=id*9;return [[t[o]!,t[o+1]!,t[o+2]!],[t[o+3]!,t[o+4]!,t[o+5]!],[t[o+6]!,t[o+7]!,t[o+8]!]];}
  nearest(p:Vec3,maxDistance=Infinity):NearestHit|null{
    let best=maxDistance*maxDistance,hit:NearestHit|null=null;const stack=[this.root];
    while(stack.length){const node=stack.pop()!;let bound=0;for(let k=0;k<3;k++)bound+=sq(Math.max(node.bounds[k]!-p[k]!,0,p[k]!-node.bounds[k+3]!));if(bound>best)continue;
      if(node.ids)for(const id of node.ids){const[a,b,c]=this.triangle(id),point=closestTriangle(p,a,b,c),d=dist2(p,point);if(d<=best){best=d;hit={distance:Math.sqrt(d),triangle:id,point,normal:normal(a,b,c)};}}
      else{stack.push(node.left!,node.right!);}
    }return hit;
  }
  /** Paired vertex displacement bounds the entire matched triangular surface, including all interiors. */
  correspondingTriangleError(a:Vec3,b:Vec3,c:Vec3):number|undefined {
    const vertexKey=(p:Vec3):string=>p.map(v=>Math.round(v*4096)).join(',');
    const key=(tri:readonly Vec3[]):string=>tri.map(vertexKey).sort().join(';');
    if(!this.triangleKeys){this.triangleKeys=new Map();for(let i=0;i<this.triangles.length/9;i++)this.triangleKeys.set(key(this.triangle(i)),i);}
    const id=this.triangleKeys.get(key([a,b,c]));if(id===undefined)return undefined;
    const target=this.triangle(id);let error=0;
    for(const p of [a,b,c]){const q=target.find(q=>vertexKey(q)===vertexKey(p));if(!q)return undefined;error=Math.max(error,Math.sqrt(dist2(p,q)));}
    return error;
  }
  /** Identical vertex triples at1/4096m imply a continuous surface bound<0.000423m, including interiors. */
  coversTriangle(a:Vec3,b:Vec3,c:Vec3):boolean { return this.correspondingTriangleError(a,b,c)!==undefined; }
  intersectsBox(bounds:readonly number[]):boolean {
    const stack=[this.root];while(stack.length){const node=stack.pop()!;if([0,1,2].some(k=>node.bounds[k]!>bounds[k+3]!||node.bounds[k+3]!<bounds[k]!))continue;
      if(node.ids){for(const id of node.ids){const t=this.triangle(id);if([0,1,2].every(k=>Math.min(...t.map(p=>p[k]!))<=bounds[k+3]!&&Math.max(...t.map(p=>p[k]!))>=bounds[k]!))return true;}}
      else stack.push(node.left!,node.right!);
    }return false;
  }
  /** First front-facing ground intersection, independent of the game's ray/hash implementation. */
  intersectSegment(p:Vec3,q:Vec3):{point:Vec3;normal:Vec3;t:number}|null {
    const vector=sub(q,p),bounds=[Math.min(p[0],q[0])-1e-6,Math.min(p[1],q[1])-1e-6,Math.min(p[2],q[2])-1e-6,Math.max(p[0],q[0])+1e-6,Math.max(p[1],q[1])+1e-6,Math.max(p[2],q[2])+1e-6];
    let result:{point:Vec3;normal:Vec3;t:number}|null=null;const stack=[this.root];
    while(stack.length){const node=stack.pop()!;if([0,1,2].some(k=>node.bounds[k]!>bounds[k+3]!||node.bounds[k+3]!<bounds[k]!))continue;
      if(node.ids){for(const id of node.ids){const[a,b,c]=this.triangle(id),n=normal(a,b,c),den=dot(n,vector);if(den>=-1e-12)continue;
        const t=dot(n,sub(a,p))/den;if(t<=1e-7||t>1||(result&&t>=result.t))continue;
        const point=add(p,vector,t);if(dist2(point,closestTriangle(point,a,b,c))<1e-12)result={point,normal:n,t};
      }}else stack.push(node.left!,node.right!);
    }return result;
  }
  sweep(p:Vec3,q:Vec3,radius:number):number|null{
    const b=[Math.min(p[0],q[0])-radius,Math.min(p[1],q[1])-radius,Math.min(p[2],q[2])-radius,Math.max(p[0],q[0])+radius,Math.max(p[1],q[1])+radius,Math.max(p[2],q[2])+radius];
    const stack=[this.root];while(stack.length){const n=stack.pop()!;if([0,1,2].some(k=>n.bounds[k]!>b[k+3]!||n.bounds[k+3]!<b[k]!))continue;
      if(n.ids){for(const id of n.ids){const[a,x,c]=this.triangle(id);if(segmentTriangleDistance2(p,q,a,x,c)<radius*radius)return id;}}
      else stack.push(n.left!,n.right!);
    }return null;
  }
}

export interface ContactInstance { triangles:readonly number[]; matrix:NumericMatrix; first:number; flags:number; name:string; instance:number }
type NumericMatrix=ArrayLike<number>;
/** Independent world-space oracle with a bounded cache: handles nonuniform instance scales without inflating R. */
export class InstancedContactBVH {
  private records:{data:ContactInstance; bounds:number[]}[]=[];
  private cells=new Map<string,number[]>();
  private localBounds=new Map<readonly number[],number[]>();
  private cache=new Map<number,TriangleBVH>();
  add(data:ContactInstance):void{
    if(!data.triangles.length)return;
    let l=this.localBounds.get(data.triangles);if(!l){l=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(let i=0;i<data.triangles.length;i++){const a=i%3;l[a]=Math.min(l[a]!,data.triangles[i]!);l[a+3]=Math.max(l[a+3]!,data.triangles[i]!);}this.localBounds.set(data.triangles,l);}
    const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity],m=data.matrix;
    for(const x of [l[0]!,l[3]!])for(const y of [l[1]!,l[4]!])for(const z of [l[2]!,l[5]!]){
      const p=[m[0]!*x+m[4]!*y+m[8]!*z+m[12]!,m[1]!*x+m[5]!*y+m[9]!*z+m[13]!,m[2]!*x+m[6]!*y+m[10]!*z+m[14]!];
      for(let a=0;a<3;a++){bounds[a]=Math.min(bounds[a]!,p[a]!);bounds[a+3]=Math.max(bounds[a+3]!,p[a]!);}
    }
    const id=this.records.length;this.records.push({data,bounds});
    for(let x=Math.floor(bounds[0]!/32);x<=Math.floor(bounds[3]!/32);x++)for(let z=Math.floor(bounds[2]!/32);z<=Math.floor(bounds[5]!/32);z++){
      const key=`${x}:${z}`,list=this.cells.get(key)??[];if(!this.cells.has(key))this.cells.set(key,list);list.push(id);
    }
  }
  private mesh(id:number):TriangleBVH{
    const old=this.cache.get(id);if(old)return old;
    const {data}=this.records[id]!,m=data.matrix,a=data.triangles,t:number[]=[];
    for(let i=0;i<a.length;i+=3)t.push(m[0]!*a[i]!+m[4]!*a[i+1]!+m[8]!*a[i+2]!+m[12]!,m[1]!*a[i]!+m[5]!*a[i+1]!+m[9]!*a[i+2]!+m[13]!,m[2]!*a[i]!+m[6]!*a[i+1]!+m[10]!*a[i+2]!+m[14]!);
    const mesh=new TriangleBVH(t);if(this.cache.size>=32)this.cache.delete(this.cache.keys().next().value!);this.cache.set(id,mesh);return mesh;
  }
  nearest(p:Vec3,radius:number):{hit:NearestHit;data:ContactInstance}|null{
    let result:{hit:NearestHit;data:ContactInstance}|null=null;const seen=new Set<number>();
    for(let x=Math.floor((p[0]-radius)/32);x<=Math.floor((p[0]+radius)/32);x++)for(let z=Math.floor((p[2]-radius)/32);z<=Math.floor((p[2]+radius)/32);z++)for(const id of this.cells.get(`${x}:${z}`)??[]){
      if(seen.has(id))continue;seen.add(id);const rec=this.records[id]!;
      if([0,1,2].some(k=>p[k]!+radius<rec.bounds[k]!||p[k]!-radius>rec.bounds[k+3]!))continue;
      const hit=this.mesh(id).nearest(p,radius);if(hit&&(!result||hit.distance<result.hit.distance))result={hit:{...hit,triangle:rec.data.first+hit.triangle},data:rec.data};
    }return result;
  }
  sweep(p:Vec3,q:Vec3,radius:number):{triangle:number;data:ContactInstance}|null{
    const seen=new Set<number>();for(let x=Math.floor((Math.min(p[0],q[0])-radius)/32);x<=Math.floor((Math.max(p[0],q[0])+radius)/32);x++)for(let z=Math.floor((Math.min(p[2],q[2])-radius)/32);z<=Math.floor((Math.max(p[2],q[2])+radius)/32);z++)for(const id of this.cells.get(`${x}:${z}`)??[]){
      if(seen.has(id))continue;seen.add(id);const rec=this.records[id]!,triangle=this.mesh(id).sweep(p,q,radius);if(triangle!==null)return{triangle:rec.data.first+triangle,data:rec.data};
    }return null;
  }
}
