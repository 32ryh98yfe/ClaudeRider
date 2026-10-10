import type { FrameSample } from '@cr/sim';
import { describe,expect,it } from 'vitest';
import { barycentricSamples, InstancedContactBVH, TriangleBVH } from '../reference/contact-geometry.ts';
import { groundRepresents, physicalJumpLaunch } from '../reference/audit-track-contact.ts';

describe('independent contact audit oracle',()=>{
  it('detects a large triangle crossing the road even when every vertex is outside the road',()=>{
    const wall=new TriangleBVH([-20,-2,0,20,-2,0,0,12,0]);
    expect(wall.nearest([0,.6,.5],.85)?.distance).toBeCloseTo(.5,8);
    expect(wall.sweep([0,.6,-4],[0,.6,4],.85)).toBe(0);
  });
  it('does not report collision through the true opening of an arch',()=>{
    const triangles=[-4,0,0,-2,0,0,-2,8,0,-4,0,0,-2,8,0,-4,8,0,2,0,0,4,0,0,4,8,0,2,0,0,4,8,0,2,8,0,-4,6,0,4,6,0,4,8,0,-4,6,0,4,8,0,-4,8,0];
    const bvh=new TriangleBVH(triangles);expect(bvh.sweep([0,.6,-2],[0,.6,2],.85)).toBeNull();expect(bvh.sweep([2.1,.6,-2],[2.1,.6,2],.85)).not.toBeNull();
  });
  it('sees a thin obstacle between endpoints that are both individually clear',()=>{
    const wall=new TriangleBVH([-2,0,0,2,0,0,0,3,0]);
    expect(wall.nearest([0,.6,-8],.85)).toBeNull();expect(wall.nearest([0,.6,8],.85)).toBeNull();expect(wall.sweep([0,.6,-8],[0,.6,8],.85)).toBe(0);
  });
  it('samples triangle interiors and long edges at at most0.75m instead of just route centre lines',()=>{
    const points=[...barycentricSamples([0,0,0],[12,0,0],[0,0,9],.75)];
    expect(points.length).toBeGreaterThan(200);expect(points.some(p=>p[0]>4&&p[0]<5&&p[2]>3&&p[2]<4)).toBe(true);
    const edge=points.filter(p=>p[2]===0).sort((a,b)=>a[0]-b[0]);for(let i=1;i<edge.length;i++)expect(edge[i]![0]-edge[i-1]![0]).toBeLessThanOrEqual(.750001);
  });
  it('stops a flight at the actual front-facing ground instead of carrying it through the underside',()=>{
    const ground=new TriangleBVH([-10,0,-10,0,0,10,10,0,-10]);
    expect(ground.intersectSegment([0,2,0],[0,-2,0])?.point).toEqual([0,0,0]);
    expect(ground.intersectSegment([0,-2,0],[0,2,0])).toBeNull();
  });
  it('credits an existing ground-supported foundation without excusing overhead/sideways gaps',()=>{
    const ground=new TriangleBVH([-10,0,-10,0,0,10,10,0,-10]);
    expect(groundRepresents([0,-.25,0],ground,false)).toBe(true);
    expect(groundRepresents([0,.12,0],ground,true)).toBe(true);
    expect(groundRepresents([0,-.25,0],ground,true)).toBe(true); // support faces also receive the common foundation credit
    expect(groundRepresents([0,.2,0],ground,true)).toBe(false);
    expect(groundRepresents([0,.4,0],ground,false)).toBe(false);
    expect(groundRepresents([12,-.1,0],ground,false)).toBe(false);
  });
});


describe('independent instanced contact oracle',()=>{
  it('uses true world-space sphere distance under nonuniform scaling and returns stable virtualtriangle IDs',()=>{
    const mesh=new InstancedContactBVH();
    mesh.add({triangles:[-1,0,0,1,0,0,0,2,0],matrix:[2,0,0,0,0,.5,0,0,0,0,3,0,4,0,7,1],first:42,flags:16,name:'scaled',instance:0});
    expect(mesh.nearest([4,.6,7.5],.85)?.hit.triangle).toBe(42);
    expect(mesh.nearest([4,.6,8],.85)).toBeNull();
    expect(mesh.sweep([4,.6,0],[4,.6,12],.85)?.triangle).toBe(42);
    expect(mesh.sweep([12,.6,0],[12,.6,12],.85)).toBeNull();
  });
});


describe('jump launch geometry',()=>{
  it('uses the actual upslope normal when the path hint blends downward into the gap',()=>{
    const ground=new TriangleBVH([-3,-.3,-4,0,0,4,0,0,-4,-3,-.3,-4,-3,-.3,4,0,0,4]);
    const track={frameAt:(_path:number,s:number,out:FrameSample):void=>{Object.assign(out,{px:s,py:s<0?s*.1:0,pz:0,tx:.98,ty:-.2,tz:0,ux:.2,uy:.98,uz:0,wL:4,wR:4});}};
    const launch=physicalJumpLaunch(track,ground,0,.5);
    expect(launch).not.toBeNull(); expect(launch!.ty).toBeGreaterThan(0); expect(launch!.tx).toBeGreaterThan(.99);
  });
});
