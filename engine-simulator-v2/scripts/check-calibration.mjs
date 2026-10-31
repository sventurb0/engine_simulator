import {build} from 'esbuild';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url).pathname,out=root+'node_modules/.cache/calibration-check.mjs';
await build({stdin:{contents:fs.readFileSync(root+'src/EngineSimulatorV2.tsx','utf8')+'\nexport {presets,configForPreset,solveDynoPoint,engineCalibrations,calibrationFits,mapEfficiency,correctedFlow,compressorMaps};',loader:'tsx',resolveDir:root+'src'},tsconfig:root+'tsconfig.app.json',bundle:true,platform:'node',format:'esm',outfile:out});
const m=await import(out);let count=0;
for(const profile of m.engineCalibrations){
 const c={...m.configForPreset(m.presets.find(p=>p.name===profile.preset)),ambientTemp:20,altitude:0,humidity:.45};
 for(const p of profile.points){const row=m.solveDynoPoint(c,p.rpm);const error=Math.abs(row.torqueLbFt*1.3558179483314004/p.torqueNm-1)*100;assert.ok(error<(p.validationOnly?4:.001),`${profile.id} ${p.rpm}: ${error}%`);console.log(profile.id,p.rpm,p.validationOnly?'holdout':'fit',error.toFixed(3)+'%');count++;}
 // Dense independent RPM sampling catches overshoot BETWEEN fitted grid points.
 const rows=[];for(let rpm=1200;rpm<=c.redline;rpm+=7)rows.push(m.solveDynoPoint(c,rpm));
 for(const p of profile.points)rows.push(m.solveDynoPoint(c,p.rpm));
 const tqRating=profile.points.find(p=>p.basis==='torque-rating');
 const hpRating=profile.points.find(p=>p.basis==='power-rating');
 const hpReference=hpRating.torqueNm*hpRating.rpm*2*Math.PI/60/745.6998715822702;
 const hpPeak=rows.reduce((a,b)=>a.brakeHp>b.brakeHp?a:b);
 const tqPeak=rows.reduce((a,b)=>a.torqueLbFt>b.torqueLbFt?a:b);
 const hpError=Math.abs(hpPeak.brakeHp/hpReference-1),tqError=Math.abs(tqPeak.torqueLbFt*1.3558179483314004/tqRating.torqueNm-1);
 assert.ok(hpError<.05&&tqError<.05,profile.id+' peak magnitudes');
 assert.ok(Math.abs(hpPeak.rpm-hpRating.rpm)<=200,profile.id+' power peak RPM');
 assert.ok(Math.abs(tqPeak.rpm-tqRating.rpm)<=200,profile.id+' torque peak RPM');
 for(const row of rows){
  const loss=(row.frictionTorqueLbFt+row.pumpingTorqueLbFt)*row.rpm/5252.11312203255+row.driveLossHp;
  assert.ok(Math.abs(row.indicatedHp-loss-row.brakeHp)<1e-7,'calibrated energy balance');
  const next=m.solveDynoPoint(c,Math.min(c.redline,row.rpm+1));
  assert.ok(Math.abs(next.torqueLbFt-row.torqueLbFt)<1,'no charge-curve discontinuity');
 }
 console.log(`${profile.id} peak power error ${(hpError*100).toFixed(3)}%, torque ${(tqError*100).toFixed(3)}%; RPM ${hpPeak.rpm}/${tqPeak.rpm}`);
 if(c.induction==='turbo'){
  const tuned={...c,wastegateBasePsi:c.wastegateBasePsi+5};
  assert.ok(m.solveDynoPoint(tuned,hpRating.rpm).brakeHp>hpReference*1.05,'tuned engine not clamped to stock power');
 }
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
const m157=m.configForPreset(m.presets.find(p=>p.name==='M157 5.5 biturbo'));
const early=m.solveDynoPoint(m157,2000),late=m.solveDynoPoint(m157,5000);
assert.ok(early.boostPsi>12&&early.boostPsi>late.boostPsi*.9,'M157 loaded boost is established at 2000, not redline');
assert.ok(Math.abs(early.torqueLbFt*1.3558179483314004-800)<.1,'M157 standard-launch torque anchor');
const saab=m.configForPreset(m.presets.find(p=>p.name==='B234R'));
assert.ok(m.solveDynoPoint(saab,1200).boostPsi<.1);assert.ok(m.solveDynoPoint(saab,1800).boostPsi<m.solveDynoPoint(saab,2200).boostPsi,'Saab progression is not full boost at 1800');
for(const preset of m.presets.filter(p=>p.group==='factory'&&p.setupKind==='illustrative'&&p.config.induction==='turbo')){
 const c=m.configForPreset(preset);assert.ok(m.solveDynoPoint(c,Math.min(c.redline,3000)).boostPsi>3,preset.name+' reasonable placeholder spool');
}
const generic={...m157,calibrationEnabled:false,turboSpoolStartRpm:undefined,turboSpoolFullRpm:undefined,turboFamily:'medium',turboCount:1,bore:86,stroke:86,boostOnsetBias:0};
const little=m.solveDynoPoint(generic,2800).boostPsi;
const big=m.solveDynoPoint({...generic,bore:108,stroke:108},2800).boostPsi;
assert.ok(big>little,'same turbo receives more exhaust flow from greater displacement');
assert.ok(m.solveDynoPoint({...generic,bore:108,stroke:108,turboCount:2},2800).boostPsi<big,'parallel turbos split exhaust flow at fixed turbo size');
console.log('PASS: M157 early loaded boost and torque, Saab boost progression, all illustrative turbo envelopes.');
assert.ok(sampled>0);console.log(`PASS: ${count} reference points, fixed-fit responses, both map tables, fallback, units and all factory configurations; ${sampled} sampled map operating points.`);fs.unlinkSync(out);

