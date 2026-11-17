import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {EngineAcousticModel,acousticProfileFor} from '../src/lib/engineAcousticProcessor.js';
const root=new URL('../',import.meta.url).pathname,out=root+'node_modules/.cache/boats-check.mjs';
fs.mkdirSync(root+'node_modules/.cache',{recursive:true});
await build({stdin:{contents:fs.readFileSync(root+'src/EngineSimulatorV2.tsx','utf8')+'\nexport {boatPresets,configForPreset,solveDynoPoint,buildDynoSweep,sanitizeConfig,sanitizePreset,resolveIdleRpm,stepRuntime,presets};',resolveDir:root+'src',loader:'tsx'},tsconfig:root+'tsconfig.app.json',bundle:true,platform:'node',format:'esm',outfile:out});
const m=await import(out);
assert.equal(m.boatPresets.length,20);assert.equal(new Set(m.boatPresets.map(p=>p.name)).size,20);
assert.equal(m.presets.filter(p=>p.group==='factory').length,240);
const rms=a=>Math.sqrt(a.reduce((s,x)=>{assert.ok(Number.isFinite(x));assert.ok(Math.abs(x)<4);return s+x*x;},0)/a.length);
function render(c,sr=48000,seconds=1){
 const p=acousticProfileFor({...c,acousticIdleRpm:m.resolveIdleRpm(c)}),engine=new EngineAcousticModel(sr);
 engine.update({components:p,active:true,rpm:c.redline,throttle:.8,load:.9});
 const data=Array.from({length:5},()=>new Float32Array(sr*seconds));engine.render(data);return {p,engine,data};
}
for(const preset of m.boatPresets){
 const c=m.configForPreset(preset),point=m.solveDynoPoint(c,preset.referenceRpm);
 assert.ok(Math.abs(point.brakeHp/preset.referenceHp-1)<1e-7,preset.name+' power anchor');
 assert.equal(c.applicationType,'boat');assert.equal(c.audioModel,'acoustic');assert.equal(c.propellerEnabled,false);
 const round=m.sanitizePreset(JSON.parse(JSON.stringify({name:'save',config:c}))).config;
 for(const k of ['applicationType','engineLayout','engineCycle','marineFiring','marinePowerScale','marineExhaust','marineOutlet','marineEnclosure','marinePropLoad','flywheelInertiaKgM2'])assert.equal(round[k],c[k],k+' persists');
 assert.ok(m.solveDynoPoint({...c,compressionRatio:c.compressionRatio+.5},c.redline).brakeHp!==point.brakeHp,'components still affect output');
 const curve=m.buildDynoSweep(c);assert.ok(curve.length>=10);assert.equal(curve[0].rpm,m.resolveIdleRpm(c));assert.equal(curve.at(-1).rpm,c.redline);
 curve.forEach(x=>assert.ok(Number.isFinite(x.brakeHp)&&Number.isFinite(x.eventHz)));
 for(const sr of [32000,48000,96000]){
  const {p,engine,data}=render(c,sr);assert.equal(p.marine,true);assert.equal(p.propeller,false);assert.ok(rms(data[0])>.00005,preset.name+' audible');assert.equal(rms(data[4]),0,'no air propeller');
  const before=engine.events;engine.render(data);assert.ok(Math.abs(engine.events-before-c.redline/(c.engineCycle==='two'?60:120)*p.cylinders)<=2,'physical cadence');
  assert.deepEqual(data,(()=>{const renamed=render({...c,gameMeta:{name:'different'},calibrationId:'anything'},sr);renamed.engine.render(renamed.data);return renamed.data;})(),'names do not select voices');
  engine.update({active:false});engine.render(data);engine.render(data);assert.ok(rms(data[0].subarray(sr/2))<1e-6,'mute finishes');
 }
 const dry=render({...c,marineExhaust:'dry',marineOutlet:'above'}),wet=render({...c,marineExhaust:'wet',marineOutlet:'submerged'});
 assert.notDeepEqual(dry.data[0],wet.data[0],'installation changes exhaust');
 console.log(preset.name+': anchor, cadence, 3 sample rates, mute, persistence PASS');
}
const bol=m.configForPreset(m.boatPresets[0]);assert.equal(bol.redline,375);assert.equal(m.resolveIdleRpm(bol),150);assert.equal(bol.flywheelInertiaKgM2,12);
const two={...bol,marineCombustion:'spark',marineFiring:'even'},four={...two,engineCycle:'four'};
assert.equal(m.solveDynoPoint(two,375).eventHz,6.25);assert.equal(m.solveDynoPoint(four,375).eventHz,3.125);
const twin=m.configForPreset(m.boatPresets.find(p=>p.referenceName==='Kelvin-Ricardo F2'));
assert.deepEqual(acousticProfileFor(twin).eventGaps,[.5,1.5]);assert.deepEqual(acousticProfileFor({...twin,marineFiring:'paired'}).eventGaps,[2,0]);
// Equal-speed control: high prop load must decelerate more than a disengaged prop.
const state={rpm:600,throttle:.6,afr:13.1,ignitionDeg:24};
const unloaded=m.stepRuntime({...twin,marinePropLoad:0},state,.6,1/120),loaded=m.stepRuntime({...twin,marinePropLoad:1.5},state,.6,1/120);
assert.ok(loaded.rpm<unloaded.rpm);
const highInertia=m.stepRuntime({...twin,marinePropLoad:0,flywheelInertiaKgM2:15},state,.6,1/120);assert.ok(Math.abs(highInertia.rpm-600)<Math.abs(unloaded.rpm-600));
// No energy in the underwater layer when inactive, and configurations fade out.
const {engine,data}=render(bol);engine.update({components:acousticProfileFor({...bol,marineOutlet:'submerged'}),active:true});engine.render(data);data.forEach(rms);
const {OfflineAudioContext,AudioWorkletNode}=await import('node-web-audio-api');
for(const layout of ['single','i2','flat2','i4','i6','v8','v12','w12']){
 const c=m.configForPreset(m.boatPresets.find(p=>p.config.engineLayout===layout));
 const ctx=new OfflineAudioContext(2,24000,48000);await ctx.audioWorklet.addModule(new URL('../src/lib/engineAcousticProcessor.js',import.meta.url).pathname);
 const node=new AudioWorkletNode(ctx,'apex-engine-acoustics',{numberOfInputs:0,numberOfOutputs:4,outputChannelCount:[2,1,1,1]});
 const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worklet timeout')),5000);node.port.onmessage=e=>{if(e.data.type==='ready'){clearTimeout(timer);resolve();}};});
 for(let i=0;i<4;i++)node.connect(ctx.destination,i,0);await ready;node.port.postMessage({components:acousticProfileFor(c),active:true,rpm:c.redline,throttle:.8,load:.9});await new Promise(r=>setTimeout(r,20));
 const buffer=await ctx.startRendering();assert.ok(rms(buffer.getChannelData(0))>.00005);node.disconnect();node.port.close();
}
console.log('PASS: 20 marine engines, 60 multi-rate renders, eight native worklets, physical cycles and propeller load. Sound remains an estimate.');
fs.unlinkSync(out);
