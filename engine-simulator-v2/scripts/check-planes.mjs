import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {EngineAcousticModel,acousticProfileFor} from '../src/lib/engineAcousticProcessor.js';
const root=new URL('../',import.meta.url).pathname,out=root+'node_modules/.cache/planes-check.mjs';
fs.mkdirSync(root+'node_modules/.cache',{recursive:true});
await build({stdin:{contents:fs.readFileSync(root+'src/EngineSimulatorV2.tsx','utf8')+'\nexport {planePresets,configForPreset,solveDynoPoint,buildDynoSweep,sanitizeConfig,resolveIdleRpm,stepRuntime,presets};',resolveDir:root+'src',loader:'tsx'},tsconfig:root+'tsconfig.app.json',bundle:true,platform:'node',format:'esm',outfile:out});
const m=await import(out);
assert.equal(m.planePresets.length,20);assert.equal(m.presets.filter(p=>p.group==='factory').length,240);
assert.equal(new Set(m.planePresets.map(p=>p.name)).size,20);
assert.deepEqual([...new Set(m.planePresets.map(p=>p.category))].sort(),['Flat','Inline','Radial','Rotary','V','W']);
const rms=a=>Math.sqrt(a.reduce((sum,x)=>{assert.ok(Number.isFinite(x));assert.ok(Math.abs(x)<4);return sum+x*x;},0)/a.length);
function render(c,control={},seconds=1,sr=48000){
 const p=acousticProfileFor({...c,acousticIdleRpm:m.resolveIdleRpm(c)}),engine=new EngineAcousticModel(sr);
 engine.update({active:true,components:p,rpm:c.planeRatedRpm,throttle:.8,load:.9,...control});
 const data=Array.from({length:5},()=>new Float32Array(sr*seconds));engine.render(data);
 data.forEach(rms);return {engine,data,p};
}
for(const preset of m.planePresets){
 const c=m.configForPreset(preset),p=acousticProfileFor(c);
 assert.equal(c.applicationType,'plane');assert.equal(c.audioModel,'acoustic');assert.ok(p.plane);assert.ok(preset.source.startsWith('https://'));
 const round=m.sanitizeConfig(JSON.parse(JSON.stringify(c)));assert.equal(round.applicationType,'plane');assert.equal(round.engineLayout,c.engineLayout);assert.equal(round.propellerRatio,c.propellerRatio);
 const point=m.solveDynoPoint(c,preset.referenceRpm);assert.ok(Math.abs(point.brakeHp/preset.referenceHp-1)<1e-7,preset.name+' representative rating');
 const curve=m.buildDynoSweep(c);assert.ok(curve.length>20);assert.equal(curve[0].rpm,m.resolveIdleRpm(c));assert.equal(curve.at(-1).rpm,c.redline);curve.forEach(row=>assert.ok(Number.isFinite(row.brakeHp)&&Number.isFinite(row.torqueLbFt)));
 assert.ok(m.solveDynoPoint({...c,altitude:c.altitude+1500},c.planeRatedRpm).brakeHp<point.brakeHp,'altitude loses power with unregulated boost');
 assert.notEqual(m.solveDynoPoint({...c,compressionRatio:c.compressionRatio+1},c.planeRatedRpm).brakeHp,point.brakeHp,'mods change output after fixed rating normalisation');
 const {data,engine}=render(c);assert.ok(rms(data[0])>.001);assert.ok(rms(data[4])>.001);
 assert.ok(Math.abs(engine.propRpm-c.planeRatedRpm*c.propellerRatio)<.01);assert.ok(Math.abs(engine.bladeHz-engine.propRpm/60*c.propellerBlades)<1e-8);
 assert.deepEqual(data,render({...c,gameMeta:{name:'Unrelated name'},calibrationId:'arbitrary'}).data,'names never choose voices');
 const before=engine.events;engine.render(data);assert.ok(Math.abs(engine.events-before-c.planeRatedRpm/120*p.cylinders)<=1,'physical firing cadence');
 const muted=render({...c,propellerEnabled:false});assert.equal(rms(muted.data[4]),0);
 if(c.engineLayout==='rotary9'){
  const cut=render(c,{rotaryBlip:true},2);assert.ok(rms(cut.data[0].subarray(48000))<rms(data[0])*.001,'rotary ignition cut silences combustion');assert.ok(rms(cut.data[4].subarray(48000))>.001,'prop sound continues');
  assert.ok(m.solveDynoPoint({...c,rotaryBlip:true},c.planeRatedRpm).brakeHp<0,'cut torque leaves friction losses');
 }
 console.log(preset.name+': power anchor, cadence, geometry, propeller and persistence PASS');
}
const plane=m.configForPreset(m.planePresets[8]);
assert.notDeepEqual(render(plane).data[4],render({...plane,propellerBlades:3}).data[4]);
assert.notDeepEqual(render(plane).data[4],render({...plane,propellerRatio:.8}).data[4]);
assert.notDeepEqual(render(plane).data[0],render({...plane,planeExhaust:'collector'}).data[0]);
const w=m.configForPreset(m.planePresets.find(p=>p.category==='W'));assert.equal(acousticProfileFor(w).bankCount,3);assert.ok(acousticProfileFor(w).banks.includes(2));
const silent=new EngineAcousticModel();silent.render(Array.from({length:4},()=>new Float32Array(128)));
const {OfflineAudioContext,AudioWorkletNode}=await import('node-web-audio-api');
for(const sr of [32000,48000,96000])for(const layout of ['flat2','radial5','radial7','radial9','radial14','rotary9','w12']){
 const c=m.configForPreset(m.planePresets.find(p=>p.config.engineLayout===layout));
 const ctx=new OfflineAudioContext(2,sr/2,sr);await ctx.audioWorklet.addModule(new URL('../src/lib/engineAcousticProcessor.js',import.meta.url).pathname);
 const node=new AudioWorkletNode(ctx,'apex-engine-acoustics',{numberOfInputs:0,numberOfOutputs:4,outputChannelCount:[2,1,1,1]});
 const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worklet timeout')),5000);node.port.onmessage=e=>{if(e.data.type==='ready'){clearTimeout(timer);resolve();}};});
 const errors=[];node.onprocessorerror=e=>errors.push(e);for(let i=0;i<4;i++)node.connect(ctx.destination,i,0);await ready;
 node.port.postMessage({components:acousticProfileFor(c),active:true,rpm:c.planeRatedRpm,throttle:.8,load:.9});await new Promise(r=>setTimeout(r,15));
 const result=await ctx.startRendering();assert.ok(rms(result.getChannelData(0))>.001);assert.equal(errors.length,0);node.disconnect();node.port.close();
}
console.log('PASS: 20 planes; 21 native four-output worklet renders; 240 cars retained. No recorded-sound or flight-dynamics accuracy is claimed.');
fs.unlinkSync(out);
