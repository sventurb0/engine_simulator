// Synthetic room response for comparison. No measured room/cabin recording is claimed.
export function acousticRoomBuffer(ctx,position='dyno_room') {
  const cabin=position==='cockpit',duration=cabin?.22:.85;
  const buffer=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate);
  let seed=91;
  for(let channel=0;channel<2;channel++){
    const data=buffer.getChannelData(channel);
    for(let i=0;i<data.length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const time=i/ctx.sampleRate;
      if(time<(cabin?.004:.01))continue;
      data[i]=(seed/2147483648-1)*Math.exp(-time/(cabin?.035:.16))*.008;
    }
    const taps=cabin?[[.004,.24],[.009,.13],[.016,.08]]:[[.014,.22],[.029,.16],[.047,.11],[.073,.06]];
    for(const [time,gain] of taps)data[Math.round((time+channel*.0007)*ctx.sampleRate)]+=gain;
  }
  return buffer;
}
