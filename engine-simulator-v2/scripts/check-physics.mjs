import {build} from 'esbuild';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url).pathname;
const bundlePath=root+'node_modules/.cache/engine-physics-test.mjs';
fs.mkdirSync(root+'node_modules/.cache',{recursive:true});
await build({stdin:{contents:fs.readFileSync(root+'src/EngineSimulatorV2.tsx','utf8')+'\nexport {presets,defaultConfig,sanitizeConfig,solvePoint,solveDynoPoint,buildDynoSweep,stepRuntime,atmosphere};',loader:'tsx',resolveDir:root+'src'},tsconfig:root+'tsconfig.app.json',bundle:true,platform:'node',format:'esm',outfile:bundlePath});
const mathPath=root+'node_modules/.cache/engine-math-test.mjs';
await build({entryPoints:[root+'src/lib/powertrainMath.ts'],bundle:true,platform:'node',format:'esm',outfile:mathPath});
const m=await import(bundlePath), u=await import(mathPath);
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
close(u.powerHpFromTorque(100,u.HP_RPM_FACTOR),100);
close(u.torqueFromPowerHp(100,u.HP_RPM_FACTOR),100);
// Four-stroke: 100 N m in 1 litre corresponds to 4*pi*100/0.001 Pa.
close(u.bmepPsiFromTorque(100/u.NM_PER_LBFT,1)*u.PA_PER_PSI,4*Math.PI*100/0.001,1e-6);
assert.ok(u.ignitionEfficiency(24,24)>u.ignitionEfficiency(4,24));
assert.ok(u.ignitionEfficiency(24,24)>u.ignitionEfficiency(44,24));
const c={...m.defaultConfig,induction:'na',humidity:0,ambientTemp:20,altitude:0};
const reference=m.solveDynoPoint(c,4000);
const conditions=[['heat',{ambientTemp:45}],['altitude',{altitude:3000}],['humidity',{humidity:1}]];
for(const [name,change] of conditions){const p=m.solveDynoPoint({...c,...change},4000);assert.ok(p.airLbMin<reference.airLbMin,name+' airflow');assert.ok(p.brakeHp<reference.brakeHp,name+' power');}
const runtime={rpm:4000,throttle:1,afr:reference.targetAfr/14.7*14.7,ignitionDeg:reference.ignitionDeg};
for(const ignitionDeg of [0,45]) assert.ok(m.solvePoint(c,{...runtime,ignitionDeg}).brakeHp<reference.brakeHp,'timing penalty '+ignitionDeg);
for(const afr of [8,20])assert.ok(m.solvePoint(c,{...runtime,afr}).brakeHp<reference.brakeHp,'mixture penalty '+afr);
const wet=m.solveDynoPoint({...c,fuelType:'e85'},4000);
assert.ok(wet.targetAfr<reference.targetAfr,'E85 actual AFR');
assert.ok(wet.injectorCc>reference.injectorCc*1.25,'E85 fuel volume');
for(const induction of ['turbo','supercharger']){const p=m.solvePoint({...c,induction},{...runtime,throttle:0});close(p.boostPsi,0);close(p.pr,1);if(induction==='supercharger')close(p.driveLossHp,0);}
const boost={...c,induction:'turbo',wastegateBasePsi:14,boostControl:0.7};
const cooled=m.solveDynoPoint({...boost,intercoolerType:'large_fmic',icCoreSize:1},5000);
const hot=m.solveDynoPoint({...boost,intercoolerType:'none'},5000);
assert.ok(cooled.chargeTempC<hot.chargeTempC,'intercooling heat');assert.ok(cooled.brakeHp>hot.brakeHp,'intercooling power');
const scLow=m.solveDynoPoint({...c,induction:'supercharger'},2500),scHigh=m.solveDynoPoint({...c,induction:'supercharger'},5500);
assert.ok(scHigh.driveLossHp>scLow.driveLossHp,'blower drive scales with airflow');
// Signed net torque must allow deceleration above the old 8% throttle threshold.
const loaded={...c,dynoBrakeLoad:60};const prev={rpm:5000,throttle:0.15,afr:13.1,ignitionDeg:24};
assert.ok(m.stepRuntime(loaded,prev,0.15,1/120).rpm<prev.rpm,'brake can slow engine');
assert.ok(m.stepRuntime({...c,dynoBrakeLoad:0}, {...prev,throttle:1},1,1/120).rpm>prev.rpm,'unloaded WOT accelerates');
// Exponential throttle response is invariant to the chosen step subdivision.
close(u.throttleAfterStep(u.throttleAfterStep(0,1,0.05),1,0.05),u.throttleAfterStep(0,1,0.1));
let checked=0;
for(const preset of m.presets.filter(p=>p.group==='factory')){
 const config=m.sanitizeConfig({...m.defaultConfig,...preset.config});
 for(const row of m.buildDynoSweep(config)){
  const raw=m.solveDynoPoint(config,row.rpm);assert.deepEqual(row,raw,'dyno shares raw solver');
  close(row.brakeHp,u.powerHpFromTorque(row.torqueLbFt,row.rpm));
  close(row.bmepPsi,u.bmepPsiFromTorque(row.torqueLbFt,row.dispL));
  const losses=u.powerHpFromTorque(row.frictionTorqueLbFt+row.pumpingTorqueLbFt,row.rpm)+row.driveLossHp;
  close(row.indicatedHp-losses,row.brakeHp);
  assert.ok(row.brakeThermalEfficiency>=0&&row.brakeThermalEfficiency<0.5,'bounded efficiency');
  assert.ok(row.injectorCc>0&&row.fuelFlowKgHr>0,'fuel requirement');checked++;
 }
}
const odd=m.buildDynoSweep({...c,redline:6537});assert.equal(odd.at(-1).rpm,6537,'include exact redline');
console.log(`PASS: units, energy balance, weather, fuel blends, mixture/timing, intercooling, blower losses, signed acceleration and ${checked} shared dyno points across 240 engines.`);
fs.unlinkSync(bundlePath);fs.unlinkSync(mathPath);
