import {build} from 'esbuild';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url).pathname,out=root+'node_modules/.cache/calibration-check.mjs';
await build({stdin:{contents:fs.readFileSync(root+'src/EngineSimulatorV2.tsx','utf8')+'\nexport {presets,configForPreset,solveDynoPoint,engineCalibrations,calibrationFits,mapEfficiency,correctedFlow,compressorMaps};',loader:'tsx',resolveDir:root+'src'},tsconfig:root+'tsconfig.app.json',bundle:true,platform:'node',format:'esm',outfile:out});
const m=await import(out);let count=0;
for(const profile of m.engineCalibrations){
 const c={...m.configForPreset(m.presets.find(p=>p.name===profile.preset)),ambientTemp:20,altitude:0,humidity:.45};
 for(const p of profile.points){const row=m.solveDynoPoint(c,p.rpm);const error=Math.abs(row.torqueLbFt*1.3558179483314004/p.torqueNm-1)*100;assert.ok(error<(p.validationOnly?4:.001),`${profile.id} ${p.rpm}: ${error}%`);console.log(profile.id,p.rpm,p.validationOnly?'holdout':'fit',error.toFixed(3)+'%');count++;}
 const rpm=profile.points[0].rpm,base=m.solveDynoPoint(c,rpm);
 assert.ok(m.solveDynoPoint({...c,ambientTemp:45},rpm).brakeHp<base.brakeHp);
 assert.ok(Math.abs(m.solveDynoPoint({...c,camAggression:c.camAggression+.1},rpm).brakeHp-base.brakeHp)>.01,'hardware response');
 assert.ok(Math.abs(m.solveDynoPoint({...c,calibrationEnabled:false},rpm).brakeHp-base.brakeHp)>.01,'disable');
}
for(const [key,map] of Object.entries(m.compressorMaps))for(const slice of map.slices)for(const [flow,eff] of slice.samples)assert.ok(Math.abs(m.mapEfficiency(key,flow,slice.pr)-eff)<1e-10);
assert.equal(m.mapEfficiency('g25-550',1,2),null);assert.equal(m.mapEfficiency('g25-550',25,4),null);
assert.ok(Math.abs(m.correctedFlow(20,545/1.8,13.95*6894.757293168)-20)<1e-10);
let sampled=0;
for(const preset of m.presets.filter(p=>p.group==='factory')){
 const c=m.configForPreset(preset);assert.equal(c.compressorMap,'generic','no retrofit assumed');
 for(let rpm=1500;rpm<c.redline;rpm+=500){const p=m.solveDynoPoint(c,rpm);assert.ok(Number.isFinite(p.brakeHp));assert.ok(Math.abs(p.brakeHp-p.torqueLbFt*p.rpm/5252.11312203255)<1e-6);}
 if(c.induction==='turbo')for(const key of Object.keys(m.compressorMaps))for(let rpm=2000;rpm<c.redline;rpm+=500){const p=m.solveDynoPoint({...c,compressorMap:key},rpm);assert.ok(Number.isFinite(p.chargeTempC));if(p.compressorMapStatus==='sampled'){sampled++;assert.ok(Math.abs(m.mapEfficiency(key,p.correctedAirLbMin,p.pr)-p.compressorEff)<.001);}}
}
assert.ok(sampled>0);console.log(`PASS: ${count} reference points, fixed-fit responses, both map tables, fallback, units and all factory configurations; ${sampled} sampled map operating points.`);fs.unlinkSync(out);
