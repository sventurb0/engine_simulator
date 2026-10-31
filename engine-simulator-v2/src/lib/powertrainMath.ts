// SI-unit identities; empirical engine parameters live in the caller.
export const WATTS_PER_HP = 745.6998715822702;
export const NM_PER_LBFT = 1.3558179483314004;
export const HP_RPM_FACTOR = WATTS_PER_HP / NM_PER_LBFT * 60 / (2 * Math.PI);
export const PA_PER_PSI = 6894.757293168;
export const KG_S_TO_LB_MIN = 60 / 0.45359237;
export const powerHpFromTorque = (torqueLbFt: number, rpm: number) => torqueLbFt * rpm / HP_RPM_FACTOR;
export const torqueFromPowerHp = (hp: number, rpm: number) => rpm > 0 ? hp * HP_RPM_FACTOR / rpm : 0;
export const bmepPsiFromTorque = (torqueLbFt: number, displacementL: number) => displacementL > 0 ? 4 * Math.PI * torqueLbFt * NM_PER_LBFT / (displacementL / 1000) / PA_PER_PSI : 0;

// Representative fixed blends, not a fuel-composition sensor or knock model.
export function fuelProperties(kind: string) {
  if (kind === 'e85') return {stoich:9.8, lowerHeatingValue:29.2e6, densityKgL:0.785};
  if (kind === 'e30') return {stoich:12.8, lowerHeatingValue:38e6, densityKgL:0.760};
  return {stoich:14.7, lowerHeatingValue:43e6, densityKgL:0.745};
}
export function mixtureEfficiency(lambda: number, targetLambda: number) {
  const width = lambda < targetLambda ? 0.30 : 0.42;
  return Math.exp(-Math.pow((lambda-targetLambda)/width,2));
}
export function ignitionEfficiency(actual: number, mbt: number) {
  // Advancing past estimated MBT is not free power; this is not a knock predictor.
  const width = actual > mbt ? 18 : 34;
  return Math.exp(-Math.pow((actual-mbt)/width,2));
}
export function injectorCcFromFuel(fuelKgS: number, densityKgL: number, cylinders: number, duty=0.85) {
  return fuelKgS / densityKgL * 60000 / (cylinders*duty);
}
export function angularAccelerationRpmS(netTorqueLbFt: number, inertiaKgM2: number) {
  return netTorqueLbFt * NM_PER_LBFT / inertiaKgM2 * 60 / (2*Math.PI);
}
export function throttleAfterStep(current: number, target: number, dt: number) {
  return target+(current-target)*Math.exp(-dt/0.11);
}
