import type { SimConfig } from '../EngineSimulatorV2';
import { engineLayouts } from './engineAudioPrimitives';

export const TAU = Math.PI * 2;
export type PartId = 'block' | 'crank' | 'pistons' | 'head' | 'valvetrain' | 'covers' | 'intake' | 'fuel' | 'headers' | 'induction' | 'intercooler' | 'exhaust';
export type Cylinder = { index: number; bank: number; angle: number; z: number; firing: number };
export type AssemblyPlan = ReturnType<typeof planAssembly>;
const orders: Record<string, number[]> = {
  single: [0], i2: [0, 1], i3: [0, 2, 1], i4: [0, 2, 3, 1],
  i5: [0, 1, 3, 4, 2], i6: [0, 4, 2, 5, 1, 3],
  flat2: [0, 1], flat4: [0, 2, 1, 3], flat6: [0, 3, 1, 4, 2, 5],
  v4: [0, 2, 1, 3], v6: [0, 3, 4, 1, 2, 5],
  v8: [0, 7, 3, 2, 5, 4, 6, 1], v10: [0, 5, 4, 9, 1, 6, 2, 7, 3, 8],
  v12: [0, 7, 4, 11, 2, 9, 5, 6, 1, 8, 3, 10],
  w12: [0, 4, 8, 3, 7, 11, 6, 10, 2, 9, 1, 5],
};

// One scene unit is 100 mm. Unknown bank angles and firing orders are representative.
// Firing-sound overrides deliberately do not change physical crank geometry.
export function planAssembly(config: SimConfig) {
  const layout = config.engineLayout;
  const count = engineLayouts[layout].cylinders;
  const radial = layout.startsWith('radial') || layout === 'rotary9';
  const rows = layout === 'radial14' ? 2 : 1;
  const rotating = layout === 'rotary9';
  const flat = layout.startsWith('flat');
  const bankCount = radial ? count : layout === 'w12' ? 3 : flat || layout.startsWith('v') ? 2 : 1;
  const perBank = count / bankCount;
  const bore = config.bore / 100;
  const radius = config.stroke / 200;
  const rod = Math.max(radius * 3.4, bore * 1.45);
  const pistonHeight = bore * .62;
  const deck = radius + rod + pistonHeight * .5 + bore * .08;
  const pitch = bore * 1.2;
  const length = radial ? pitch * (rows + .3) : pitch * perBank + bore * .22;
  let order = layout === 'radial14' ? [0, 11, 2, 13, 4, 8, 6, 10, 1, 12, 3, 7, 5, 9] : orders[layout] ?? Array.from({ length: count }, (_, i) => (i * 2) % count);
  if (layout === 'v8' && config.v8Crank === 'flatplane') order = [0, 4, 3, 7, 5, 2, 6, 1];
  const cycle = config.engineCycle === 'two' ? TAU : TAU * 2;
  const cylinders: Cylinder[] = Array.from({ length: count }, (_, index) => {
    const bank = radial ? index : index % bankCount;
    const row = radial ? Math.floor(index / (count / rows)) : Math.floor(index / bankCount);
    const angle = radial ? index % (count / rows) * TAU / (count / rows) + (row ? Math.PI / 7 : 0)
      : flat ? (bank === 0 ? -Math.PI / 2 : Math.PI / 2)
      : layout === 'w12' ? (bank - 1) * Math.PI / 3
      : bankCount === 2 ? (bank === 0 ? -1 : 1) * (layout === 'v6' || layout === 'v12' ? Math.PI / 6 : Math.PI / 4) : 0;
    let firing = order.indexOf(index) * cycle / count;
    if (config.applicationType === 'boat' && count === 2) {
      if (config.marineFiring === 'paired') firing = 0;
      if (config.marineFiring === 'uneven_twin' && config.engineCycle !== 'two') firing = index * Math.PI;
    }
    return { index, bank, angle, z: radial ? (row - (rows - 1) / 2) * pitch : (row - (perBank - 1) / 2) * pitch + (bankCount > 1 ? (bank - (bankCount - 1) / 2) * bore * .18 : 0), firing };
  });
  const parts: { id: PartId; label: string; detail: string }[] = [
    { id: 'block', label: 'Block & sump', detail: radial ? `${rows}-row radial crankcase and finned barrels` : `${engineLayouts[layout].label} · ${config.bore.toFixed(0)} × ${config.stroke.toFixed(0)} mm` },
    { id: 'crank', label: 'Crankshaft', detail: radial ? 'Master and articulated rods (simplified)' : layout === 'v8' ? `${config.v8Crank} crank` : 'Crank throws and counterweights' },
    { id: 'pistons', label: 'Pistons & rods', detail: `${count} pistons · slider-crank motion` },
    { id: 'head', label: 'Cylinder heads', detail: config.engineCycle === 'two' ? 'Ported two-stroke cylinders' : config.sleeveValves ? 'Sleeve-valve heads' : `${config.valvesPerCylinder} valves per cylinder` },
  ];
  if (config.engineCycle !== 'two') parts.push({ id: 'valvetrain', label: config.sleeveValves ? 'Sleeve valves' : 'Valve gear', detail: config.sleeveValves ? 'Illustrative reciprocating sleeves' : `${config.valvetrainLayout.toUpperCase()} · half-speed cam drive` });
  parts.push(
    { id: 'covers', label: config.engineCycle === 'two' ? 'Head covers' : 'Valve covers', detail: 'Cosmetic finish and cover style' },
    { id: 'intake', label: 'Intake', detail: `${config.intakeType} · ${config.runnerLength} runners` },
    { id: 'fuel', label: 'Fuel system', detail: `${config.injectionType === 'carb' ? 'Carburettor' : config.injectionType + ' injection'}` },
    { id: 'headers', label: 'Headers', detail: `${config.headerType} · ${config.applicationType === 'plane' ? config.planeExhaust ?? 'stubs' : config.exhaustType}` },
  );
  if (config.induction !== 'na') parts.push({ id: 'induction', label: config.induction === 'turbo' ? 'Turbochargers' : 'Supercharger', detail: config.induction === 'turbo' ? `${config.turboCount ?? 1} × ${config.turboFamily} · ${config.turboArchitecture}` : config.blowerType });
  if (config.induction !== 'na' && config.intercoolerType !== 'none') parts.push({ id: 'intercooler', label: 'Intercooler', detail: config.intercoolerType.replace(/_/g, ' ') });
  if (!(config.applicationType === 'plane' && config.planeExhaust === 'stubs')) parts.push({ id: 'exhaust', label: 'Exhaust', detail: config.applicationType === 'boat' ? `${config.marineExhaust ?? 'wet'} marine exhaust` : `${config.exhaustType} · ${config.silencerCount ?? 1} silencer(s)` });
  return { layout, count, radial, rows, rotating, flat, bankCount, perBank, bore, radius, rod, pistonHeight, deck, pitch, length, cycle, cylinders, parts };
}

export function cylinderMotion(plan: AssemblyPlan, cylinder: Cylinder, angle: number) {
  // A radial shares a single crankpin per row; other layouts have phased throws.
  const rearRow = plan.rows === 2 && cylinder.index >= plan.count / 2;
  const phase = plan.radial ? angle - cylinder.angle - (rearRow ? Math.PI : 0) : angle - cylinder.firing;
  const pinX = plan.radius * Math.sin(phase);
  const pinY = plan.radius * Math.cos(phase);
  const pistonY = pinY + Math.sqrt(Math.max(0, plan.rod ** 2 - pinX ** 2));
  const cycleAngle = ((angle - cylinder.firing) % plan.cycle + plan.cycle) % plan.cycle;
  return { pinX, pinY, pistonY, cycleAngle };
}

export function valveLift(config: SimConfig, cycleAngle: number, intake: boolean) {
  const degrees = cycleAngle * 180 / Math.PI;
  const events = config.valveEvents;
  const open = intake ? 360 - (events?.inletOpen ?? 10) : 180 - (events?.exhaustOpen ?? 40);
  const duration = intake ? 180 + (events?.inletOpen ?? 10) + (events?.inletClose ?? 40) : 180 + (events?.exhaustOpen ?? 40) + (events?.exhaustClose ?? 10);
  const elapsed = ((degrees - open) % 720 + 720) % 720;
  const peak = (intake ? events?.inletLiftMm : events?.exhaustLiftMm) ?? 9;
  return elapsed < duration ? Math.sin(elapsed / duration * Math.PI) ** 2 * peak / 100 : 0;
}
