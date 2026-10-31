import {build} from 'esbuild';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {OfflineAudioContext} from 'node-web-audio-api';
const root=new URL('../',import.meta.url).pathname;
const out=root+'node_modules/.cache/audio-check.mjs';
await build({stdin:{contents:`export {useEngineAudio} from './lib/engineAudio.js';export {blowerVoice,releaseVoice,recoverFireTime} from './lib/engineAudioDynamics.js';export {smoothStep} from './lib/engineAudioPrimitives.ts';`,resolveDir:root+'src',loader:'js'},bundle:true,platform:'node',format:'esm',outfile:out,alias:{react:root+'scripts/fixtures/audio-react.mjs'}});
const m=await import(out);
assert.equal(m.smoothStep(.2,.04,.2),1);assert.equal(m.smoothStep(.38,.08,.38),1);assert.ok(Math.abs(m.smoothStep(.12,.04,.2)-.5)<1e-12);
assert.equal(m.recoverFireTime(1,10),10.005);assert.equal(m.recoverFireTime(10.1,10),10.1);
const sc={induction:'supercharger',blowerType:'roots',superchargerDriveRatio:1.6,superchargerLoudness:1,scBoostCap:8};
const point={rpm:4000,boostPsi:8};
assert.ok(m.blowerVoice(sc,{...point,rpm:6000},1).frequency>m.blowerVoice(sc,point,1).frequency);
assert.ok(m.blowerVoice({...sc,superchargerDriveRatio:2},point,1).frequency>m.blowerVoice(sc,point,1).frequency);
assert.equal(m.blowerVoice({...sc,superchargerLoudness:0},point,1).gain,0);
assert.equal(m.blowerVoice({...sc,induction:'turbo'},point,1).gain,0);
assert.equal(m.blowerVoice(sc,point,0).gain,0);
assert.equal(m.releaseVoice({chargeReleaseMode:'recirc'},1).sample,'saabDump');
assert.equal(m.releaseVoice({chargeReleaseMode:'dump'},1).sample,'dumpSharp');
assert.equal(m.releaseVoice({chargeReleaseMode:'none'},1).sample,'flutter');
assert.equal(m.releaseVoice({chargeReleaseMode:'none',antiSurge:1},1).gain,0);
assert.equal(m.releaseVoice({turboLoudness:0},1).gain,0);
// Hook driver schedules the production graph on a real native offline Web Audio context.
// A deterministic control clock replaces only window timers and React's hook lifecycle.
let refs=[],effects=[],cursor=0,pending=[],intervals=new Map(),timers=[],clock=0,adapter,native;
function reset(){refs=[];effects=[];cursor=0;pending=[];intervals=new Map();timers=[];clock=0;}
globalThis.__audioHooks={useRef(value){const i=cursor++;return refs[i]??(refs[i]={current:value});},useEffect(effect,deps){const i=cursor++,old=effects[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:effect()};});}}};
let intervalId=0,starts=[];
function makeContext(){
 native=new OfflineAudioContext(1,48000*5,48000);starts=[];
 adapter=new Proxy(native,{get(target,key){if(key==='currentTime')return clock;if(key==='state')return adapter.testState??'running';if(key==='resume')return async()=>{adapter.testState='running';};if(key==='suspend')return async()=>{adapter.testState='suspended';};if(key==='close')return async()=>{adapter.testState='closed';};const value=Reflect.get(target,key,target);if(key==='createBufferSource'||key==='createOscillator')return (...args)=>{const src=value.apply(target,args),start=src.start.bind(src);src.start=(when=0,...rest)=>{assert.ok(when>=clock-1e-7,'no scheduling in the past');starts.push(when);return start(when,...rest);};return src;};return typeof value==='function'?value.bind(target):value;}});
 return adapter;
}
globalThis.window={AudioContext:makeContext,setInterval(fn){const id=++intervalId;intervals.set(id,fn);return id;},clearInterval(id){intervals.delete(id);},setTimeout(fn,ms){timers.push({at:clock+ms/1000,fn});}};
async function renderHook(config,point,throttle,enabled=true){cursor=0;const result=m.useEngineAudio(config,point,enabled,throttle);pending.splice(0).forEach(f=>f());await Promise.resolve();await Promise.resolve();return result;}
const base={engineLayout:'i4',induction:'turbo',gameMeta:{name:'B234R'},bore:90,stroke:90,redline:6200,v8Crank:'crossplane',valvetrainLayout:'dohc',valvesPerCylinder:4,vvtMode:'none',liftSystem:'none',liftSwitchRpm:6000,exhaustType:'street',headerType:'cast',soundTexture:.62,micPosition:'dyno_room',roomSize:.55,cinemaMode:true,engineLoudness:1,turboLoudness:.7,superchargerLoudness:.88,turboArchitecture:'single',wastegateBasePsi:11,boostControl:.28,chargeReleaseMode:'recirc',antiSurge:.15,blowerType:'roots',superchargerDriveRatio:1.6,scBoostCap:8};
for(const [name,changes] of [['Saab turbo',{}],['LS3 V8',{engineLayout:'v8',induction:'na',valvetrainLayout:'ohv'}],['V12',{engineLayout:'v12',induction:'na'}],['Roots blower',{...sc}],['Twin screw',{...sc,blowerType:'twinscrew'}],['Centrifugal',{...sc,blowerType:'centrifugal'}],['Maximum mix',{...sc,engineLayout:'v8',v8Crank:'crossplane',valvetrainLayout:'ohv',engineLoudness:2,superchargerLoudness:1.8,micPosition:'rear_exhaust',roomSize:1}]]){
 reset();let seed=42;const random=Math.random;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 const config={...base,...changes};
 for(let step=0;step<240;step++){
  clock=step*.02;const throttle=clock<.8?.04:clock<3.5?.9:.05;
  const rpm=clock<.8?950:clock<3.5?1200+(clock-.8)*1700:5500-(clock-3.5)*2500;
  await renderHook(config,{rpm,dispL:config.engineLayout==='v8'?6.2:2.3,boostPsi:config.induction==='na'?0:throttle*8,mapKpa:throttle>.2?150:35,chargeTempC:30},throttle);
  for(const fn of intervals.values())fn();
 }
 const buffer=await native.startRendering();let peak=0,energy=0;const data=buffer.getChannelData(0);for(const sample of data){assert.ok(Number.isFinite(sample));peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}
 const rms=Math.sqrt(energy/data.length);assert.ok(peak<.98,`${name}: headroom peak ${peak}`);assert.ok(rms>.0001,`${name}: audible signal energy`);console.log(`${name}: peak ${peak.toFixed(4)}, RMS ${rms.toFixed(4)}, ${starts.length} scheduled sources`);
 Math.random=random;
}
// A long stall must not generate a backlog proportional to the missed time.
reset();const p={rpm:4000,dispL:2.3,boostPsi:8,mapKpa:150,chargeTempC:30};await renderHook(base,p,.8);for(const fn of intervals.values())fn();clock=3;const count=starts.length;for(const fn of intervals.values())fn();assert.ok(starts.length-count<100,'bounded recovery after 3s stall');
// A delayed OFF must not suspend a subsequently restarted context.
await renderHook(base,p,.8,false);await renderHook(base,p,.8,true);clock+=.1;timers.splice(0).forEach(t=>t.fn());await Promise.resolve();assert.equal(adapter.state,'running');
console.log('PASS: throttle blends, blower controls, valve choices, stall recovery, restart race and seven actual offline renders. This does not assess subjective sound quality.');fs.unlinkSync(out);
