// Coarse manual reads of the linked Garrett efficiency contours, 2026-10-31.
// Samples cover an interior subregion, NOT the surge/choke/speed envelope.
// No extrapolation: outside this region the solver explicitly falls back to its generic model.
export type CompressorMapKey='generic'|'g25-550'|'gtx3071r-gen2';
type Slice={pr:number; samples:[number,number][]};
export const compressorMaps={
 'g25-550':{name:'Garrett G25-550',source:'https://www.garrettmotion.com/racing-and-performance/performance-catalog/turbo/g-series-g25-550/',image:'https://www.garrettmotion.com/wp-content/uploads/2022/06/G25-550-Comp-Map-kg-sec-scaled.jpg',uncertainty:0.03,slices:[
 {pr:1.5,samples:[[14,.72],[18,.77],[22,.76],[26,.72],[30,.68]]},
 {pr:2,samples:[[14,.70],[20,.77],[26,.80],[32,.78],[38,.74],[43,.68]]},
 {pr:2.5,samples:[[18,.71],[24,.77],[30,.80],[35,.79],[40,.76],[44,.72],[46,.68]]},
 {pr:3,samples:[[20,.70],[26,.75],[32,.78],[37,.78],[41,.76],[44,.72],[47,.68]]},
 {pr:3.5,samples:[[25,.70],[31,.73],[36,.76],[40,.76],[44,.73],[47,.68]]}] as Slice[]},
 'gtx3071r-gen2':{name:'Garrett GTX3071R Gen II',source:'https://www.garrettmotion.com/racing-and-performance/performance-catalog/turbo/gtx3071r-gen-ii/',image:'https://www.garrettmotion.com/wp-content/uploads/2022/06/GTX3071R-G2-Comp-Map-Kg-Sec-scaled.jpg',uncertainty:0.03,slices:[
 {pr:1.5,samples:[[17,.67],[22,.70],[26,.71],[30,.69],[35,.66]]},
 {pr:2,samples:[[20,.67],[26,.71],[31,.72],[37,.71],[43,.68],[48,.63]]},
 {pr:2.5,samples:[[23,.67],[30,.71],[36,.72],[42,.71],[48,.69],[53,.63]]},
 {pr:3,samples:[[27,.66],[34,.70],[40,.71],[45,.70],[50,.68],[55,.62]]},
 {pr:3.5,samples:[[35,.65],[41,.68],[46,.69],[50,.67],[53,.63]]}] as Slice[]},
};
// Garrett published speed-sensor instructions use 545 deg R and 13.95 psia.
// The product map images do not repeat reference conditions; this convention is explicit.
export const correctedFlow=(actualLbMin:number,inletK:number,inletPa:number)=>actualLbMin*Math.sqrt(inletK/(545/1.8))/(inletPa/(13.95*6894.757293168));
const readSlice=(slice:Slice,flow:number):number|null=>{
 const p=slice.samples;if(flow<p[0][0]||flow>p[p.length-1][0])return null;
 for(let i=1;i<p.length;i++)if(flow<=p[i][0]){const a=p[i-1],b=p[i],t=(flow-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t;}
 return p[p.length-1][1];
};
export function mapEfficiency(key:CompressorMapKey|undefined,flow:number,pr:number):number|null {
 if(!key||key==='generic')return null;
 const slices=compressorMaps[key].slices;if(pr<slices[0].pr||pr>slices[slices.length-1].pr)return null;
 const exact=slices.find(s=>Math.abs(s.pr-pr)<1e-10);if(exact)return readSlice(exact,flow);
 for(let i=1;i<slices.length;i++)if(pr<=slices[i].pr){const a=slices[i-1],b=slices[i],lo=readSlice(a,flow),hi=readSlice(b,flow);if(lo===null||hi===null)return null;return lo+(hi-lo)*(pr-a.pr)/(b.pr-a.pr);}
 return null;
}
