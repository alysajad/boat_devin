/** Game-scaled Chundan Vallam section. Forward is -z; the raised stern is +z. */
export function chundanSection(u: number) {
  const t=Math.min(1,Math.abs(u));
  const end=Math.max(0,(t-.72)/.28);
  const rise=(u>0?2.8:.52)*end*end*(3-2*end);
  return {width:Math.max(.012,.78*Math.pow(Math.max(0,1-t**4),.6)),rise,rim:.46+rise};
}

/** Convex planar outline, x/downstream metres. Shared with the rendered section. */
export function chundanFootprint(length: number) {
 const points: number[]=[];
 // A conservative straight midsection avoids Rapier's near-collinear vertex pruning
 // on long hulls (at most 3 cm outside the rendered profile at u=±0.5).
 const sections=[-1,-.9375,-.875,-.75,-.5,.5,.75,.875,.9375,1];
 for(const side of [-1,1])for(const u of side<0?sections:[...sections].reverse()){
  points.push(side*(Math.abs(u)<=.5?chundanSection(0).width:chundanSection(u).width),-u*length/2);
 }
 return new Float32Array(points);
}
export function mooredHouseboat(chunk: number, riverWidth: number) {
 if(chunk<0||chunk>=54||chunk%3!==0)return null;
 const side=(chunk/3)%2?1:-1;
 return {x:side*(riverWidth/2-1.4),distance:chunk*40+12,side};
}
/** Elliptical hull plus the overhanging rectangular deck used by scenery.ts. */
export function houseboatFootprint() {
 const points=[-.9,-3.75,.9,-3.75,.9,3.75,-.9,3.75];
 for(let i=0;i<32;i++){const a=i*Math.PI/16;points.push(Math.cos(a)*1.04,Math.sin(a)*4.8);}
 return new Float32Array(points);
}
