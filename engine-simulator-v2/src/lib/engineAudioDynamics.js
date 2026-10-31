import { clamp } from './engineAudioPrimitives';

// Preserve the established combustion voices; this is a separate induction layer.
// Mesh orders are sound-design approximations, not measured blower specifications.
export function blowerVoice(config, point, throttle, sampleRate = 48000) {
  const loudness = clamp(config.superchargerLoudness ?? 0.88, 0, 1.8);
  const shaftHz = Math.max(0, point.rpm) * Math.max(0, config.superchargerDriveRatio ?? 1) / 60;
  const centrifugal = config.blowerType === 'centrifugal';
  const order = centrifugal ? 12 : config.blowerType === 'twinscrew' ? 5 : 6;
  const frequency = clamp(shaftHz * order, 80, Math.min(9000, sampleRate * 0.2));
  const load = clamp(throttle, 0, 1);
  const boost = clamp((point.boostPsi ?? 0) / Math.max(1, config.scBoostCap ?? 8), 0, 1);
  const gain = config.induction === 'supercharger'
    ? loudness * (centrifugal ? 0.010 : 0.014) * load * (0.25 + 0.75 * boost)
    : 0;
  return { frequency, gain, harmonicGain: gain * (centrifugal ? 0.14 : 0.28) };
}

export function releaseVoice(config, strength) {
  const mode = config.chargeReleaseMode ?? 'recirc';
  const amount = clamp(strength, 0.05, 1.45);
  const level = clamp(config.turboLoudness ?? 0.7, 0, 1.8);
  if (mode === 'none') {
    // No valve hiss. A restrained flutter illustration, reduced by anti-surge.
    return { sample: 'flutter', gain: 0.018 * amount * level * (1 - clamp(config.antiSurge ?? 0, 0, 1)), rate: 0.78, filterType: 'bandpass', filterFreq: 1150, q: 1.0 };
  }
  if (mode === 'dump') return { sample: 'dumpSharp', gain: 0.045 * amount * level, rate: 0.95, filterType: 'highpass', filterFreq: 1500, q: 0.7 };
  return { sample: 'saabDump', gain: 0.026 * amount * level, rate: 0.72, filterType: 'lowpass', filterFreq: 1100, q: 0.7 };
}

// Missed pulses must be skipped rather than replayed in a burst after a UI stall.
export const recoverFireTime = (next, now) => next < now + 0.005 ? now + 0.005 : next;


// Loaded compressor sound: pressure ratio and per-turbo airflow proxy control
// frequency/energy. Blade-pass frequency is an approximation without a speed map.
export function turboVoice(config,point,throttle,sampleRate=48000) {
 const level=clamp(config.turboLoudness??.7,0,1.8),boost=Math.max(0,point.boostPsi??0);
 const pressure=clamp(boost/14.5,0,2),flow=clamp((point.airLbMin??0)/(config.turboCount??1)/25,0,2);
 const loaded=clamp(throttle,0,1)*Math.sqrt(pressure)*(.4+.6*Math.sqrt(flow));
 const enclosure=config.airCleaner==='open_filter'||config.airCleaner==='trumpets'?1.3:.85;
 const amount=config.induction==='turbo'?level*loaded*enclosure:0;
 const frequency=clamp(1700+2600*Math.sqrt(pressure)+900*Math.sqrt(flow),1000,Math.min(8500,sampleRate*.2));
 return {frequency,hissGain:amount*.060,whineGain:amount*.090,toneGain:amount*.0020};
}
