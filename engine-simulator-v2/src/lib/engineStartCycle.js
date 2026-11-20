// Warm-start approximation shared by the simulator and flight game.
// Times vary with displacement and inertia. No recorded clips or engine-name rules.
export class EngineStartCycle {
  constructor(config,running=true){this.config=config;this.state=running?'running':'stopped';this.time=0;this.rpm=running?this.idle:0;this.firing=running?1:0;this.starter=0;this.power=running?1:0;}
  get idle(){return this.config.acousticIdleRpm??this.config.idleRpm??600;}
  start(){if(this.state==='running'||this.state==='cranking'||this.state==='catching')return;this.state='cranking';this.time=0;}
  stop(){if(this.state==='stopped')return;this.state='stopping';this.time=0;this.firing=0;this.starter=0;}
  step(dt,targetRpm){
    dt=Math.max(0,Math.min(.1,dt));this.time+=dt;
    const c=this.config,litres=Math.PI/4*(c.bore/1000)**2*(c.stroke/1000)*1000;
    const mass=Math.min(4,Math.max(.3,litres+(c.flywheelInertiaKgM2??.5)));
    const crank=100+80/(1+mass),wait=1.2+mass*.65;
    this.starter=0;
    if(this.state==='cranking'){
      this.starter=1;this.firing=0;this.rpm+=(crank-this.rpm)*(1-Math.exp(-dt*4));
      if(this.time>wait){this.state='catching';this.time=0;this.firing=.12;}
    }else if(this.state==='catching'){
      const progress=Math.min(1,this.time/(1.5+mass*.6));
      this.firing=.12+.88*progress;this.starter=progress<.55?1:0;
      const surge=this.idle*(.30+1.03*Math.sin(progress*Math.PI*.66));
      this.rpm+=(surge-this.rpm)*(1-Math.exp(-dt*3));
      if(progress===1){this.state='settling';this.time=0;}
    }else if(this.state==='settling'){
      this.firing=1;this.rpm+=(this.idle-this.rpm)*(1-Math.exp(-dt*2));
      if(this.time>1.5){this.state='running';this.time=0;}
    }else if(this.state==='running'){
      this.firing=1;this.rpm=targetRpm;
    }else if(this.state==='stopping'){
      this.firing=0;this.rpm*=Math.exp(-dt/(.7+mass*.6));
      this.rpm=Math.max(0,this.rpm-dt*20);
      if(this.rpm<8){this.state='stopped';this.rpm=0;}
    }else{this.rpm=0;this.firing=0;}
    this.power=this.state==='running'?1:this.state==='settling'?.25:0;
    return this;
  }
}
