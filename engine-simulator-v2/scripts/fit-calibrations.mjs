import {build} from 'esbuild';
import fs from 'node:fs';
const root=new URL('../',import.meta.url).pathname;
const out=root+'node_modules/.cache/calibration-fit.mjs';
fs.mkdirSync(root+'node_modules/.cache',{recursive:true});
await build({stdin:{contents:fs.readFileSync(root+'src/EngineSimulatorV2.tsx','utf8')+'\nexport {presets,configForPreset,solveDynoPoint,engineCalibrations,calibrationSignature};',loader:'tsx',resolveDir:root+'src'},tsconfig:root+'tsconfig.app.json',bundle:true,platform:'node',format:'esm',outfile:out});
const m=await import(out),fits={};
const interpolate=(points,rpm)=>{if(rpm<=points[0][0])return points[0][1];for(let i=1;i<points.length;i++)if(rpm<=points[i][0]){const a=points[i-1],b=points[i];return a[1]+(b[1]-a[1])*(rpm-a[0])/(b[0]-a[0]);}return points.at(-1)[1];};
for(const profile of m.engineCalibrations){
 const preset=m.presets.find(p=>p.name===profile.preset);if(!preset)throw Error('Missing preset '+profile.preset);
 const c={...m.configForPreset(preset),ambientTemp:20,altitude:0,humidity:0.45};
 const factors=[];let maxErrorPct=0;
 const nm=(rpm,f)=>m.solveDynoPoint(c,rpm,f).torqueLbFt*1.3558179483314004;
 const fit=(rpm,target)=>{
  let lo=.05,hi=4;
  if(nm(rpm,lo)>target||nm(rpm,hi)<target)throw Error('Unbracketed '+profile.id);
  for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(nm(rpm,mid)<target)lo=mid;else hi=mid;}
  return (lo+hi)/2;
 };
 for(const p of profile.points.filter(p=>!p.validationOnly)){
  const factor=fit(p.rpm,p.torqueNm);factors.push([p.rpm,factor]);maxErrorPct=Math.max(maxErrorPct,Math.abs(nm(p.rpm,factor)/p.torqueNm-1)*100);
 }
 // Published maxima constrain the entire STOCK baseline, not just the rated RPM.
 // These synthetic envelope points are inferred constraints, never measured evidence.
 // Fit upstream charge multipliers once; do not clamp runtime torque or re-fit tuned engines.
 if(profile.evidence==='rating-anchors'){
  const torque=profile.points.find(p=>p.basis==='torque-rating');
  const power=profile.points.find(p=>p.basis==='power-rating');
  const powerNmRpm=power.torqueNm*power.rpm;
  const anchors=new Map(profile.points.map(p=>[p.rpm,p.torqueNm]));
  const grid=new Set([...anchors.keys(),1200,c.redline]);
  for(let rpm=1200;rpm<=c.redline;rpm+=25)grid.add(rpm);
  const inferred=[];
  for(const rpm of [...grid].sort((a,b)=>a-b)){
   const prior=nm(rpm,interpolate(factors,rpm));
   // Gentle parabolic envelopes place maxima at their published RPMs.
   // Their curvature is an explicit modelling assumption, not source data.
   const plateau=profile.points.filter(p=>p.basis==='torque-rating'&&p.torqueNm===torque.torqueNm).map(p=>p.rpm);
   const distance=rpm<Math.min(...plateau)?rpm-Math.min(...plateau):rpm>Math.max(...plateau)?rpm-Math.max(...plateau):0;
   const tqCeiling=torque.torqueNm*(1-.15*(distance/c.redline)**2);
   const hpCeiling=powerNmRpm/rpm*(1-.25*((rpm-power.rpm)/c.redline)**2);
   const target=anchors.get(rpm)??Math.min(prior,tqCeiling,hpCeiling);
   inferred.push([rpm,fit(rpm,target)]);
  }
  factors.splice(0,factors.length,...inferred);
 }
 fits[profile.id]={factors:factors.map(([rpm,factor])=>[rpm,Number(factor.toFixed(10))]),baselineSignature:m.calibrationSignature(c),maxErrorPct,
  method:profile.evidence==='dyno-chart'?'chart-anchors':'rating-constrained-charge',
  inferredGridRpm:profile.evidence==='rating-anchors'?25:null};
 console.log(profile.id, `${factors.length} fixed charge coefficients`);
}
fs.writeFileSync(root+'src/data/engineCalibrationFits.json',JSON.stringify(fits)+'\n');fs.unlinkSync(out);

