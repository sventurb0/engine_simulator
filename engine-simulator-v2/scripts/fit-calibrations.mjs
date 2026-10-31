import {build} from 'esbuild';
import fs from 'node:fs';
const root=new URL('../',import.meta.url).pathname;
const out=root+'node_modules/.cache/calibration-fit.mjs';
fs.mkdirSync(root+'node_modules/.cache',{recursive:true});
await build({stdin:{contents:fs.readFileSync(root+'src/EngineSimulatorV2.tsx','utf8')+'\nexport {presets,configForPreset,solveDynoPoint,engineCalibrations,calibrationSignature};',loader:'tsx',resolveDir:root+'src'},tsconfig:root+'tsconfig.app.json',bundle:true,platform:'node',format:'esm',outfile:out});
const m=await import(out),fits={};
for(const profile of m.engineCalibrations){
 const preset=m.presets.find(p=>p.name===profile.preset);if(!preset)throw Error('Missing preset '+profile.preset);
 const c={...m.configForPreset(preset),ambientTemp:20,altitude:0,humidity:0.45};
 const factors=[];let maxErrorPct=0;
 for(const p of profile.points.filter(p=>!p.validationOnly)){
  let lo=.05,hi=4;
  const nm=f=>m.solveDynoPoint(c,p.rpm,f).torqueLbFt*1.3558179483314004;
  if(nm(lo)>p.torqueNm||nm(hi)<p.torqueNm)throw Error('Unbracketed '+profile.id);
  for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(nm(mid)<p.torqueNm)lo=mid;else hi=mid;}
  const factor=(lo+hi)/2;factors.push([p.rpm,factor]);maxErrorPct=Math.max(maxErrorPct,Math.abs(nm(factor)/p.torqueNm-1)*100);
 }
 fits[profile.id]={factors,baselineSignature:m.calibrationSignature(c),maxErrorPct};
 console.log(profile.id, factors.map(p=>p[1].toFixed(3)).join(', '));
}
fs.writeFileSync(root+'src/data/engineCalibrationFits.json',JSON.stringify(fits,null,2)+'\n');fs.unlinkSync(out);
