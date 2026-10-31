// Standalone ES module: also loaded directly by AudioWorklet.addModule.
// Geometry and acoustic coefficients are explicit starting assumptions, NOT measured hardware/IRs.
export const acousticProfiles = {
  b234r: {id:'b234r',name:'Saab B234R',cylinders:4,banks:[0,0,0,0],runners:[.42,.50,.46,.55],collector:1.1,tailpipe:2.5,cutoff:1150,pulseMs:4.2,turbo:true},
  ls3: {id:'ls3',name:'Chevrolet LS3',cylinders:8,banks:[0,1,0,1,1,0,1,0],runners:[.48,.52,.44,.56,.50,.46,.54,.49],collector:1.8,tailpipe:2.7,cutoff:2300,pulseMs:5.5,turbo:false},
  f20c: {id:'f20c',name:'Honda F20C',cylinders:4,banks:[0,0,0,0],runners:[.48,.50,.49,.51],collector:1.5,tailpipe:2.4,cutoff:3300,pulseMs:2.8,turbo:false},
};
export function acousticProfileFor(config) {
  const name=config.gameMeta?.name??'';
  if((config.calibrationId==='b234r-my95'||name==='B234R')&&config.engineLayout==='i4')return acousticProfiles.b234r;
  if((config.calibrationId==='ls3-2021-crate'||name==='Chevrolet LS3 6.2')&&config.engineLayout==='v8')return acousticProfiles.ls3;
  if((config.calibrationId==='f20c-us-2002'||name==='Honda F20C')&&config.engineLayout==='i4')return acousticProfiles.f20c;
  return null;
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const read=(buffer,index,delay)=>{const pos=(index-delay+buffer.length*2)%buffer.length,a=Math.floor(pos),t=pos-a;return buffer[a]*(1-t)+buffer[(a+1)%buffer.length]*t;};
export class EngineAcousticModel {
  constructor(sr=48000){this.sr=sr;this.phase=0;this.slot=0;this.events=0;this.seed=713;this.rpm=900;this.throttle=0;this.load=0;this.active=0;this.fuel=1;this.cut=false;this.target={rpm:900,throttle:0,load:0,active:false};this.configure(acousticProfiles.b234r);}
  configure(profile){
    if(this.profile?.id===profile.id)return;
    this.transitionL=this.lastL??0;this.transitionR=this.lastR??0;
    this.transitionI=this.lastI??0;this.transitionM=this.lastM??0;this.active=0;
    this.profile=profile;this.slot=0;this.phase=0;this.index=0;
    this.slow=new Float64Array(profile.cylinders);this.fast=new Float64Array(profile.cylinders);
    this.lines=Array.from({length:profile.cylinders},()=>new Float32Array(4096));
    this.collectors=[new Float32Array(4096),new Float32Array(4096)];
    this.low=[0,0];this.hpX=[0,0];this.hpY=[0,0];this.intakeLow=0;this.intakeHigh=0;this.mechLow=0;
  }
  update(message){if(acousticProfiles[message.profile])this.configure(acousticProfiles[message.profile]);this.target={...this.target,...message};}
  noise(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/2147483648-1;}
  render(outputs){
    const [exhaust,intake,mechanical,right]=outputs,n=exhaust.length,p=this.profile,sr=this.sr,t=this.target;
    if(!t.active && this.active<1e-6){outputs.forEach(channel=>channel.fill(0));return;}
    const smoothing=1-Math.exp(-1/(sr*.035)),fade=1-Math.exp(-1/(sr*.025)),transitionDecay=Math.exp(-1/(sr*.012));
    const speed=520; // assumed mean exhaust acoustic speed, m/s
    const runnerScale=t.header==='unequal'?1.35:t.header==='equal'?.98:1;
    const delays=p.runners.map(length=>(length*runnerScale+p.collector)*sr/speed);
    const reflections=p.runners.map(length=>length*2*sr/speed);
    const tailDelay=p.tailpipe*2*sr/speed;
    const restriction=t.exhaust==='restrictive'?.65:t.exhaust==='race'?1.3:1;
    const lp=1-Math.exp(-2*Math.PI*p.cutoff*restriction/sr),hp=Math.exp(-2*Math.PI*32/sr);
    const slowDecay=Math.exp(-1/(sr*p.pulseMs*.001)),fastDecay=Math.exp(-1/(sr*.00035));
    const intakeLp=1-Math.exp(-2*Math.PI*(p.id==='f20c'?2600:1600)/sr),intakeHp=1-Math.exp(-2*Math.PI*300/sr);
    for(let i=0;i<n;i++){
      this.rpm+=(clamp(t.rpm??900,0,14000)-this.rpm)*smoothing;
      this.throttle+=(clamp(t.throttle??0,0,1)-this.throttle)*smoothing;
      this.load+=(clamp(t.load??0,0,1)-this.load)*smoothing;
      this.active+=((t.active?1:0)-this.active)*fade;
      if(this.throttle<.035&&this.rpm>1900)this.cut=true;
      else if(this.throttle>.065||this.rpm<1400)this.cut=false;
      this.fuel+=((this.cut?0:1)-this.fuel)*fade;
      const step=this.rpm/120*p.cylinders/sr;
      this.phase+=step;
      if(this.phase>=1){
        this.phase-=1;const cylinder=this.slot;
        const variation=1+this.noise()*.035;
        const amplitude=(.20+this.load*.80)*this.fuel*variation;
        this.slow[cylinder]+=amplitude;this.fast[cylinder]+=amplitude;
        this.slot=(this.slot+1)%p.cylinders;this.events++;
      }
      let bank0=0,bank1=0,intakeExcitation=0;
      for(let c=0;c<p.cylinders;c++){
        this.slow[c]*=slowDecay;this.fast[c]*=fastDecay;
        const pulse=this.slow[c]-this.fast[c];
        const line=this.lines[c];line[this.index]=pulse;
        const d=delays[c]+p.banks[c]*.25*sr/speed,r=reflections[c];
        const arriving=read(line,this.index,d)-.32*read(line,this.index,d+r)+.10*read(line,this.index,d+r*2);
        if(p.banks[c]===0)bank0+=arriving;else bank1+=arriving;
        intakeExcitation+=this.slow[c];
      }
            for(let b=0;b<2;b++){
        const direct=b===0?bank0:bank1;
        const echo=read(this.collectors[b],this.index,tailDelay+b*.3*sr/speed);
        this.collectors[b][this.index]=direct+echo*.23;
        this.low[b]+=(direct+echo*.35-this.low[b])*lp;
      }
      for(let b=0;b<2;b++){
        const raw=this.low[b]/Math.sqrt(p.cylinders)*(p.turbo?.60:1);
        const y=hp*(this.hpY[b]+raw-this.hpX[b]);this.hpX[b]=raw;this.hpY[b]=y;
      }
      const stereo=p.cylinders===8&&right;
      exhaust[i]=(stereo?this.hpY[0]+this.hpY[1]*.35:this.hpY[0]+this.hpY[1])*this.active*.75;
      if(right)right[i]=(stereo?this.hpY[1]+this.hpY[0]*.35:this.hpY[0]+this.hpY[1])*this.active*.75;
      const air=this.noise();
      this.intakeLow+=(air*(.18+intakeExcitation)-this.intakeLow)*intakeLp;
      this.intakeHigh+=(this.intakeLow-this.intakeHigh)*intakeHp;
      const lift=p.id==='f20c'?1+.4*clamp((this.rpm-5600)/600,0,1):1;
      intake[i]=(this.intakeLow-this.intakeHigh)*this.throttle*lift*this.active*.075;
      this.mechLow+=(air-this.mechLow)*.08;
      mechanical[i]=(air-this.mechLow)*(.002+this.rpm/14000*.007)*this.active;
      const tail=transitionDecay;
      this.transitionL*=tail;this.transitionR*=tail;this.transitionI*=tail;this.transitionM*=tail;
      exhaust[i]+=this.transitionL;if(right)right[i]+=this.transitionR;
      intake[i]+=this.transitionI;mechanical[i]+=this.transitionM;
      this.lastL=exhaust[i];this.lastR=right?right[i]:exhaust[i];this.lastI=intake[i];this.lastM=mechanical[i];
      this.index=(this.index+1)%4096;
    }
  }
}

if(typeof registerProcessor==='function') {
  class EngineAcousticProcessor extends AudioWorkletProcessor {
    constructor(){super();this.engine=new EngineAcousticModel(sampleRate);this.port.onmessage=event=>this.engine.update(event.data);this.port.postMessage({type:"ready"});}
    process(_inputs,outputs){if(outputs.length<3||!outputs[0][0])return true;this.engine.render([outputs[0][0],outputs[1][0],outputs[2][0],outputs[0][1]]);return true;}
  }
  registerProcessor('apex-engine-acoustics',EngineAcousticProcessor);
}
