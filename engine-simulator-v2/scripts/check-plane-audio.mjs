import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {EngineAcousticModel,acousticProfileFor} from '../src/lib/engineAcousticProcessor.js';

const root=new URL('../',import.meta.url).pathname;
const out=root+'node_modules/.cache/plane-audio-presets.mjs';
await build({entryPoints:[root+'src/data/planeEngines.ts'],bundle:true,platform:'node',format:'esm',outfile:out});
const {planePresets}=await import(out);
const rms=a=>Math.sqrt(a.reduce((sum,x)=>{assert.ok(Number.isFinite(x));assert.ok(Math.abs(x)<4);return sum+x*x;},0)/a.length);
function block(model,seconds=1,sr=48000,size=128){
  const a=Array.from({length:5},()=>new Float32Array(Math.round(seconds*sr)));
  for(let i=0;i<a[0].length;i+=size)model.render(a.map(c=>c.subarray(i,Math.min(i+size,c.length))));
  a.forEach(rms);return a;
}
function run(config,{rpm=2400,throttle=.8,load=.9,sr=48000,seconds=2,size=128}={}){
  const model=new EngineAcousticModel(sr);
  model.update({components:acousticProfileFor({...config,acousticIdleRpm:config.idleRpm}),active:true,rpm,throttle,load});
  return {model,a:block(model,seconds,sr,size)};
}
function tone(a,hz,sr=48000){
  let re=0,im=0;
  for(let i=0;i<a.length;i++){
    const w=.5-.5*Math.cos(2*Math.PI*i/(a.length-1));
    re+=a[i]*w*Math.cos(i*2*Math.PI*hz/sr);im+=a[i]*w*Math.sin(i*2*Math.PI*hz/sr);
  }
  return Math.hypot(re,im)/a.length;
}
function cycleResidual(a,rpm,sr=48000){
  const cycle=Math.round(120/rpm*sr),tail=a.subarray(sr),difference=tail.slice(cycle);
  for(let i=0;i<difference.length;i++)difference[i]-=tail[i];
  return rms(difference)/rms(tail);
}
// Immutable pre-pass renders: preserve the car source and approved aircraft
// combustion/propeller voices with the same collector installation.
const golden=JSON.parse(fs.readFileSync(root+'scripts/fixtures/plane-audio-approved.json'));
for(const test of golden.cases){
  const {a}=run(test.config,{rpm:test.rpm,seconds:golden.seconds});
  const hash=createHash('sha256');a.forEach(c=>hash.update(Buffer.from(c.buffer)));
  assert.equal(hash.digest('hex'),test.sha256,test.name+' approved waveform');
}
console.log('PASS: nine unchanged car/flat/V8/rotary/W reference waveforms.');

for(const preset of planePresets){
  const c=preset.config;
  for(const planeExhaust of ['stubs','collector']){
    const {a}=run({...c,planeExhaust},{rpm:c.redline});
    assert.ok(rms(a[0].subarray(48000))>.005,preset.name+' audible exhaust');
    assert.ok(Math.abs(a[0].subarray(48000).reduce((s,x)=>s+x,0)/48000)<.01,'no persistent DC');
  }
}
for(const layout of ['i4','i6','radial5','radial7','radial9','radial14','v12']){
  const c=planePresets.find(p=>p.config.engineLayout===layout).config;
  const rough=run({...c,soundTexture:1}),smooth=run({...c,soundTexture:0});
  assert.ok(cycleResidual(rough.a[0],2400)>cycleResidual(smooth.a[0],2400)*1.5,layout+' non-repeating combustion');
  assert.equal(rough.model.afterfireCount,0,'steady power has no scheduled afterfires');
  rough.model.update({throttle:0,load:.05});block(rough.model,2);
  assert.ok(rough.model.afterfireCount>0,layout+' sharp lift causes bounded afterfires');
  const count=rough.model.afterfireCount;block(rough.model,3);
  assert.equal(rough.model.afterfireCount,count,'transient ends rather than perpetual crackle');
  const gentle=run(c);for(let throttle=.8;throttle>=0;throttle-=.02){gentle.model.update({throttle});block(gentle.model,.08);}
  assert.equal(gentle.model.afterfireCount,0,'gentle closure is not a throttle snap');
  const injected=run({...c,injectionType:'port'});injected.model.update({throttle:0,load:0});const coast=block(injected.model,2);
  assert.equal(injected.model.afterfireCount,0,'injected fuel cut has no carb afterfire');
  assert.ok(rms(coast[0].subarray(48000))<.001,'fuel-cut exhaust becomes quiet');
  const one=run(c,{size:96000}),small=run(c,{size:97});assert.deepEqual(one.a,small.a,'independent of render quantum');
}
for(const preset of planePresets.filter(p=>p.config.engineLayout==='v12')){
  const {a}=run(preset.config),left=a[0].subarray(48000),right=a[3].subarray(48000);
  const mono=Float32Array.from(left,(x,i)=>(x+right[i])*.5);
  assert.ok(tone(left,120)>tone(left,240)*1.5,'V12 near-bank 120 Hz body at 2400 RPM');
  assert.ok(tone(mono,120)>tone(mono,240)*.7,'V12 low bank order survives mono fold-down');
}
const radial=planePresets.find(p=>p.config.engineLayout==='radial9').config;
assert.ok(rms(run({...radial,sleeveValves:false}).a[2])>rms(run({...radial,sleeveValves:true}).a[2])*2,'poppet clatter exceeds sleeve-valve mechanics');
for(const sr of [32000,48000,96000]){
  const c={...radial,soundTexture:1,exhaustRunnerM:1.5,collectorLengthM:3,tailpipeLengthM:5,silencerCount:2,silencerVolumeL:25};
  const {model}=run(c,{sr});model.update({components:acousticProfileFor({...c,engineLayout:'v12',planeExhaust:'stubs'}),throttle:0});block(model,1,sr);
  model.update({active:false});const silent=block(model,1,sr);assert.ok(rms(silent[0].subarray(sr/2))<.0001,'profile switching and stop decay');
}
fs.unlinkSync(out);
console.log('PASS: 20 exhaust pairs, combustion texture, transient afterfire, V12 bank spectrum/mono, sleeve-valve contrast, transitions and sample rates.');
