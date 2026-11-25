import * as THREE from 'three';
import type { SimConfig } from '../EngineSimulatorV2';
import type { AssemblyPlan, PartId } from './engineAssembly';

type XYZ = [number, number, number];
type Material = THREE.MeshStandardMaterial;
export type InductionSceneContext = {
  part: (id: PartId, angle?: number, offset?: THREE.Vector3) => THREE.Group;
  moving: (parent: THREE.Object3D) => THREE.Group;
  mesh: (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: Material, x?: number, y?: number, z?: number) => THREE.Mesh;
  box: (parent: THREE.Object3D, w: number, h: number, d: number, material: Material, x?: number, y?: number, z?: number, rounded?: boolean) => THREE.Mesh;
  cyl: (parent: THREE.Object3D, radius: number, height: number, material: Material, x?: number, y?: number, z?: number, axis?: 'x' | 'y' | 'z', segments?: number) => THREE.Mesh;
  ring: (parent: THREE.Object3D, radius: number, thickness: number, material: Material, x?: number, y?: number, z?: number, horizontal?: boolean) => THREE.Mesh;
  pipe: (parent: THREE.Object3D, points: number[][], radius: number, material: Material) => THREE.Mesh;
  materials: { aluminium: Material; steel: Material; iron: Material; dark: Material; brass: Material; rubber: Material; exhaustMetal: Material };
  updates: ((angle: number) => void)[];
  front: number;
  rear: number;
};

// The positions are representative installations. A twin-scroll is one divided
// turbine, and a centrifugal blower has a mechanical drive instead of a turbine.
export function inductionLayout(config: SimConfig, plan: AssemblyPlan) {
  const b = plan.bore;
  const isTurbo = config.induction === 'turbo';
  const count = isTurbo ? config.turboArchitecture === 'sequential' ? 2 : config.turboCount === 2 ? 2 : 1 : config.induction === 'supercharger' ? 1 : 0;
  const banked = !plan.radial && plan.bankCount > 1;
  const maxAngle = banked ? Math.max(...plan.cylinders.map(c => Math.abs(c.angle))) : 0;
  const externalX = banked ? Math.sin(maxAngle) * plan.deck + b * 1.2 : b * 2.25;
  const radius = b * (config.turboFamily === 'small' ? .43 : config.turboFamily === 'large' ? .66 : .54);
  const units = Array.from({ length: count }, (_, i) => ({
    centre: [banked && count === 2 ? (i ? -externalX : externalX) : externalX, plan.deck * .47, count === 2 && !banked ? (i ? 1 : -1) * Math.min(plan.length * .24, b * 1.05) : 0] as XYZ,
    radius: radius * (config.turboArchitecture === 'sequential' ? i ? 1.1 : .86 : 1),
    role: count === 1 ? 'single' : config.turboArchitecture === 'sequential' ? i ? 'secondary' : 'primary' : `parallel-bank-${i + 1}`,
  }));
  const transformBank = (p: XYZ, angle: number): XYZ => {
    const x = angle < 0 ? -p[0] : p[0];
    return [x * Math.cos(angle) + p[1] * Math.sin(angle), -x * Math.sin(angle) + p[1] * Math.cos(angle), p[2]];
  };
  const intakePorts: XYZ[] = [], exhaustPorts: XYZ[] = [], exhaustScrollPorts: XYZ[][] = [];
  if (plan.radial) {
    intakePorts.push([0, -b * 1.1, plan.length / 2 + b * .6]);
    exhaustPorts.push([b * 1.3, 0, plan.length / 2 + b]);
    exhaustScrollPorts.push([-1, 1].map(lane => [b * 1.3, 0, plan.length / 2 + b + lane * b * .18] as XYZ));
  } else {
    for (const bank of [...new Set(plan.cylinders.map(c => c.bank))]) {
      const cylinders = plan.cylinders.filter(c => c.bank === bank);
      const angle = cylinders[0].angle;
      const centreZ = (cylinders[0].z + cylinders[cylinders.length - 1].z) / 2;
      const length = plan.pitch * (cylinders.length - 1) + b * 1.08;
      const reach = config.headerType === 'cast' ? .95 : config.headerType === 'shorty' ? 1.2 : 1.7;
      intakePorts.push(transformBank([-b * 1.6, plan.deck + b * .6, centreZ - length / 2], angle));
      exhaustPorts.push(transformBank([b * (reach + .25), b * .2, centreZ + length * .35], angle));
      exhaustScrollPorts.push([-1, 1].map(lane => transformBank([b * (reach + .25), b * .2, centreZ + length * .35 + lane * b * .18], angle)));
    }
  }
  return { isTurbo, count, banked, units, intakePorts, exhaustPorts, exhaustScrollPorts, radius, externalX };
}

function sweptVolute(radius: number, depth: number) {
  const vertices: number[] = [], uvs: number[] = [], indices: number[] = [], steps = 44, segments = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, angle = -1.33 * Math.PI + t * Math.PI * 1.83;
    const centre = radius * (.68 + .26 * t), tube = radius * (.12 + .17 * t);
    for (let j = 0; j <= segments; j++) {
      const a = j / segments * Math.PI * 2;
      vertices.push(Math.cos(angle) * (centre + tube * Math.cos(a)), Math.sin(angle) * (centre + tube * Math.cos(a)), Math.sin(a) * depth);
      uvs.push(t, j / segments);
    }
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < segments; j++) {
    const a = i * (segments + 1) + j, c = a + segments + 1;
    indices.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function lobedRotor(radius: number, length: number, lobes: number, twist: number) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [], steps = 24, segments = 48;
  for (let z = 0; z <= steps; z++) for (let n = 0; n <= segments; n++) {
    const a = n / segments * Math.PI * 2;
    const r = radius * (.72 + .28 * Math.cos(lobes * (a - twist * z / steps)));
    positions.push(r * Math.cos(a), r * Math.sin(a), (z / steps - .5) * length);
    uvs.push(n / segments, z / steps);
  }
  for (let z = 0; z < steps; z++) for (let n = 0; n < segments; n++) {
    const a = z * (segments + 1) + n, b = a + segments + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function buildInductionScene(config: SimConfig, plan: AssemblyPlan, context: InductionSceneContext) {
  const layout = inductionLayout(config, plan);
  if (config.induction === 'na') return layout;
  const { part, moving, mesh, box, cyl, ring, pipe, updates, front, rear, materials: m } = context;
  const b = plan.bore, deck = plan.deck;
  const induction = part('induction', 0, new THREE.Vector3(b * .9, b * .35, 0));
  induction.name = config.induction === 'turbo' ? `${layout.count} ${config.turboArchitecture} turbocharger installation` : `${config.blowerType} mechanically driven supercharger`;
  induction.userData.induction = { kind: config.induction, architecture: config.induction === 'turbo' ? config.turboArchitecture : config.blowerType, count: layout.count };
  const add = (p: XYZ, x = 0, y = 0, z = 0): XYZ => [p[0] + x, p[1] + y, p[2] + z];
  const outletPoints: XYZ[] = [];
  function route(group: THREE.Group, name: string, points: XYZ[], radius: number, material = m.aluminium) {
    const item = pipe(group, points, radius, material); item.name = name;
    // Exact endpoint metadata survives geometry batching on its assembly group.
    const ports = group.userData.connections ?? (group.userData.connections = []);
    ports.push({ name, start: points[0], end: points[points.length - 1] });
    return item;
  }
  function tubeCoupling(group: THREE.Group, point: XYZ, radius: number, axis: 'z' | 'y' | 'x' = 'z') {
    cyl(group, radius * 1.1, b * .2, m.rubber, ...point, axis);
    for (const offset of [-.075, .075]) {
      const p: XYZ = [...point]; p[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] += b * offset;
      const clamp = ring(group, radius * 1.13, b * .015, m.steel, ...p, axis === 'y');
      if (axis === 'x') clamp.rotation.y = Math.PI / 2;
    }
  }
  function compressor(group: THREE.Group, centre: XYZ, radius: number, turbine: boolean) {
    const [x, y, z] = centre;
    mesh(group, sweptVolute(radius, radius * .29), m.aluminium, x, y, z);
    const inlet = mesh(group, new THREE.CylinderGeometry(radius * .48, radius * .67, radius * .42, 24, 1, true), m.aluminium, x, y, z - radius * .27); inlet.rotation.x = Math.PI / 2;
    ring(group, radius * .49, b * .025, m.steel, x, y, z - radius * .48, false);
    const wheel = turbine ? new THREE.Group() : moving(group); if (turbine) group.add(wheel); wheel.position.set(x, y, z - radius * .12);
    wheel.name = turbine ? 'Compressor impeller — inspection geometry; solved shaft speed unavailable' : 'Centrifugal compressor impeller';
    wheel.userData.impeller = true; wheel.userData.requiresSolvedShaftSpeed = turbine;
    cyl(wheel, radius * .12, radius * .18, m.steel, 0, 0, 0, 'z');
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9;
      const blade = box(wheel, radius * .055, radius * .63, radius * .15, m.steel, Math.sin(angle) * radius * .23, Math.cos(angle) * radius * .23, 0);
      blade.rotation.z = -angle + .25;
    }
    const outlet: XYZ = [x + radius * .05, y + radius * .93, z];
    cyl(group, b * .14, b * .28, m.aluminium, ...outlet);
    return { inlet: [x, y, z - radius * .48] as XYZ, outlet: add(outlet, 0, b * .14), wheel };
  }
  function pulleyDrive(group: THREE.Group, centre: XYZ, ratio: number) {
    const crankRadius = b * .42, drivenRadius = crankRadius / Math.max(1, ratio);
    const crank = moving(group); crank.position.set(0, 0, front - b * .15);
    const driven = moving(group); driven.position.set(centre[0], centre[1], front - b * .15);
    for (const [p, radius] of [[crank, crankRadius], [driven, drivenRadius]] as const) {
      cyl(p, radius, b * .15, m.dark, 0, 0, 0, 'z', 28);
      for (let n = 0; n < 4; n++) { const a = n * Math.PI / 2; cyl(p, b * .035, b * .16, m.steel, Math.cos(a) * radius * .65, Math.sin(a) * radius * .65, 0, 'z', 6); }
    }
    const delta = new THREE.Vector2(centre[0], centre[1]), distance = delta.length();
    const direction = Math.atan2(delta.y, delta.x), shift = Math.acos(Math.min(.9, (crankRadius - drivenRadius) / Math.max(distance, b)));
    for (const sign of [-1, 1]) {
      const a = direction + sign * shift;
      const p0: XYZ = [Math.cos(a) * crankRadius, Math.sin(a) * crankRadius, front - b * .15];
      const p1: XYZ = [centre[0] + Math.cos(a) * drivenRadius, centre[1] + Math.sin(a) * drivenRadius, front - b * .15];
      route(group, 'Aligned supercharger drive belt span', [p0, p1], b * .027, m.rubber);
    }
    ring(group, crankRadius, b * .025, m.rubber, 0, 0, front - b * .15, false);
    ring(group, drivenRadius, b * .025, m.rubber, centre[0], centre[1], front - b * .15, false);
    updates.push(angle => { crank.rotation.z = -angle; driven.rotation.z = -angle * ratio; });
    return driven;
  }

  if (layout.isTurbo) {
    const exhaust = part('exhaust', 0, new THREE.Vector3(b * 1.3, -b * .3, b * .7));
    exhaust.name = 'Turbine outlets and downpipes';
    for (const [index, unit] of layout.units.entries()) {
      const group = new THREE.Group(); induction.add(group); group.name = `${unit.role} turbocharger`; group.userData.turbo = { role: unit.role, radius: unit.radius, architecture: config.turboArchitecture };
      const [x, y, z] = unit.centre, size = unit.radius;
      const cold = compressor(group, unit.centre, size, true); outletPoints.push(cold.outlet);
      cyl(group, size * .23, b * .52, m.dark, x, y, z + b * .32, 'z');
      const hotZ = z + b * .63;
      mesh(group, sweptVolute(size * .86, size * .25), m.exhaustMetal, x, y, hotZ);
      ring(group, size * .56, b * .035, m.steel, x, y, hotZ + b * .18, false);
      const inlet: XYZ = [x, y + size * .85, hotZ];
      route(group, 'Turbocharger oil feed', [[x, y + size * .2, z + b * .3], [x - Math.sign(x) * b * .45, y + b * .55, z + b * .3], [Math.sign(x) * b * .65, deck * .5, z + b * .3]], b * .022, m.steel);
      route(group, 'Turbocharger gravity oil drain', [[x, y - size * .2, z + b * .3], [x - Math.sign(x) * b * .3, b * .05, z + b * .3], [Math.sign(x) * b * .65, -b * .3, z]], b * .05, m.dark);
      const source = layout.exhaustPorts[layout.banked && layout.count === 2 ? index % layout.exhaustPorts.length : 0];
      const split = config.turboArchitecture === 'twinscroll';
      if (split) {
        box(group, b * .44, b * .15, b * .43, m.exhaustMetal, ...inlet, true);
        box(group, b * .035, b * .19, b * .44, m.steel, ...inlet);
        const bankIndex = layout.banked && layout.count === 2 ? index % layout.exhaustScrollPorts.length : 0;
        for (const [laneIndex, laneSource] of layout.exhaustScrollPorts[bankIndex].entries()) {
          const lane = laneIndex ? 1 : -1;
          route(induction, `Separated twin-scroll runner ${laneIndex + 1}`, [laneSource, [x + lane * b * .2, y + size * 1.3, laneSource[2]], add(inlet, lane * b * .11)], b * .085, m.exhaustMetal);
          if (layout.count === 1) for (const bankPorts of layout.exhaustScrollPorts.slice(1)) {
            const otherSource = bankPorts[laneIndex];
            route(induction, `Opposite-bank separated scroll ${laneIndex + 1} crossover`, [otherSource, [0, -b * (.75 + laneIndex * .22), otherSource[2]], laneSource], b * .085, m.exhaustMetal);
          }
        }
      } else route(induction, 'Exhaust collector to turbine inlet', [source, [x + b * .5, source[1] + b * .3, source[2]], inlet], b * .14, m.exhaustMetal);
      if (!split && layout.exhaustPorts.length > 1 && layout.count === 1) for (const source2 of layout.exhaustPorts.slice(1)) route(induction, 'Opposite-bank turbine crossover', [source2, [0, -b * .85, source2[2]], source], b * .14, m.exhaustMetal);
      if (config.turboArchitecture === 'vgt') {
        cyl(group, size * .21, b * .16, m.dark, x + size * 1.08, y + size * .1, hotZ);
        route(group, 'VGT actuator linkage', [[x + size * 1.08, y + size * .1, hotZ], [x + size * .7, y + size * .5, hotZ]], b * .025, m.steel);
        for (let vane = 0; vane < 9; vane++) { const a = vane * Math.PI * 2 / 9; const guide = box(group, size * .06, size * .23, b * .06, m.steel, x + Math.cos(a) * size * .47, y + Math.sin(a) * size * .47, hotZ); guide.rotation.z = a + .45; }
      } else {
        cyl(group, size * .2, b * .18, m.aluminium, x + size * .95, y - size * .25, z + b * .1);
        route(group, 'Wastegate actuator linkage', [[x + size * .95, y - size * .25, z + b * .1], [x + size * .7, y - size * .4, hotZ]], b * .025, m.steel);
      }
      const outlet: XYZ = [x, y, hotZ + b * .22];
      const tail: XYZ = [x, -b * .6, rear + b * 1.5];
      route(exhaust, 'Turbine outlet to exhaust tailpipe', [outlet, [x + b * .45, y - b * .5, hotZ + b * .8], [x, -b * .6, rear - b * .2], tail], b * .18, m.exhaustMetal);
      for (let s = 0; s < (config.silencerCount ?? (config.exhaustType === 'race' ? 0 : 1)); s++) cyl(exhaust, b * .28, b * .72, m.steel, x, -b * .6, rear + b * (.4 + s * .8), 'z');
      const fresh: XYZ = add(cold.inlet, 0, 0, -b * .55);
      route(induction, 'Filtered fresh-air compressor inlet', [cold.inlet, fresh], b * .19);
      cyl(induction, b * .27, b * .4, m.rubber, ...add(fresh, 0, 0, -b * .2), 'z');
      tubeCoupling(induction, fresh, b * .19);
    }
    if (config.turboArchitecture === 'sequential') {
      const a = layout.units[0].centre, c = layout.units[1].centre;
      route(induction, 'Sequential turbine bypass crossover', [add(a, 0, -.2 * b, .63 * b), [a[0] + b, a[1], (a[2] + c[2]) / 2], add(c, 0, .3 * b, .63 * b)], b * .12, m.exhaustMetal);
      cyl(induction, b * .2, b * .25, m.dark, a[0] + b, a[1], (a[2] + c[2]) / 2, 'z');
    }
  } else if (config.blowerType === 'centrifugal') {
    const aircraft = config.applicationType === 'plane';
    const centre: XYZ = aircraft ? [0, plan.radial ? 0 : deck * .35, rear + b * .95] : [-b * 2.0, deck * .65, front + b * .9];
    // The compressor inlet faces aft; the forward-facing input pulley belongs
    // on the gearbox side, rather than blocking the compressor inlet mouth.
    const casing = new THREE.Group(); induction.add(casing); casing.position.set(...centre); casing.rotation.y = Math.PI;
    const cold = compressor(casing, [0, 0, 0], b * .64, false);
    const coldOutlet: XYZ = [centre[0] - cold.outlet[0], centre[1] + cold.outlet[1], centre[2] - cold.outlet[2]];
    outletPoints.push(coldOutlet);
    updates.push(a => { cold.wheel.rotation.z = -a * config.superchargerDriveRatio; });
    cold.wheel.userData.mechanicalDriveRatio = config.superchargerDriveRatio;
    // The visible drive is connected to the crank. No exhaust turbine is fitted.
    if (aircraft) {
      cyl(induction, b * .42, b * .7, m.iron, centre[0], centre[1], centre[2] + b * .5, 'z');
      const gear = moving(induction); gear.position.set(centre[0], centre[1], centre[2] + b * .9);
      cyl(gear, b * .3, b * .1, m.steel, 0, 0, 0, 'z'); updates.push(a => { gear.rotation.z = -a * config.superchargerDriveRatio; });
    } else {
      const driven = pulleyDrive(induction, centre, config.superchargerDriveRatio);
      cyl(induction, b * .26, Math.abs(centre[2] - driven.position.z), m.dark, centre[0], centre[1], (centre[2] + driven.position.z) / 2, 'z');
    }
  } else {
    const screw = config.blowerType === 'twinscrew', banked = layout.banked;
    const centre: XYZ = [banked ? 0 : -b * 1.6, deck + b * 1.15, 0];
    const length = Math.max(b * 1.2, Math.min(plan.length * .7, b * 3.5));
    box(induction, b * 1.25, b * .67, length + b * .2, m.aluminium, ...centre, true);
    box(induction, b * 1.32, b * .07, length + b * .25, m.steel, centre[0], centre[1] - b * .34, centre[2]);
    for (let fin = 0; fin < 8; fin++) box(induction, b * 1.27, b * .045, b * .035, m.dark, centre[0], centre[1] + b * .34, (fin / 7 - .5) * length * .85);
    for (const index of [0, 1]) {
      const rotor = moving(induction); rotor.position.set(centre[0] + (index ? 1 : -1) * b * .25, centre[1], 0);
      rotor.name = screw ? `${index ? 'Female five-flute' : 'Male three-flute'} screw rotor` : 'Three-lobe Roots rotor';
      const lobes = screw ? index ? 5 : 3 : 3;
      mesh(rotor, lobedRotor(b * .285, length, lobes, screw ? (index ? -1 : 1) * Math.PI * 1.3 : .2), m.steel);
      cyl(rotor, b * .06, length + b * .35, m.steel, 0, 0, 0, 'z');
      updates.push(a => { rotor.rotation.z = -a * config.superchargerDriveRatio * (index ? screw ? -3 / 5 : -1 : 1) + (index ? Math.PI / lobes : 0); });
    }
    const driven = pulleyDrive(induction, centre, config.superchargerDriveRatio);
    cyl(induction, b * .16, Math.abs(driven.position.z + length / 2), m.dark, centre[0], centre[1], (driven.position.z - length / 2) / 2, 'z');
    const inlet: XYZ = [centre[0], centre[1], length / 2 + b * .18];
    const intakeEnd: XYZ = [centre[0] - b * 1.1, centre[1] + b * .25, length / 2 + b * .7];
    route(induction, 'Supercharger throttle inlet', [inlet, intakeEnd], b * .2);
    cyl(induction, b * .28, b * .35, m.rubber, ...intakeEnd, 'z');
    outletPoints.push([centre[0], centre[1] - b * .37, 0]);
  }

  const chargeJoin: XYZ = outletPoints.length === 1 ? outletPoints[0] : [layout.units[0].centre[0], deck + b * .35, front - b * .4];
  if (outletPoints.length > 1) for (const source of outletPoints) route(induction, 'Parallel compressor outlet merge', [source, [source[0], deck + b * .5, front - b * .2], chargeJoin], b * .15);
  const intakeJoin: XYZ = layout.intakePorts.length === 1 ? layout.intakePorts[0] : [0, deck + b * .65, front - b * .3];
  let finalCharge = chargeJoin;
  if (config.intercoolerType !== 'none') {
    const ic = part('intercooler', 0, new THREE.Vector3(0, 0, -b * 1.4));
    const water = config.intercoolerType === 'water_air', side = config.intercoolerType === 'sidemount';
    const positiveDisplacement = config.induction === 'supercharger' && config.blowerType !== 'centrifugal';
    const width = b * (water ? 1.25 : side ? 1.25 : config.intercoolerType === 'large_fmic' ? 3.6 : 2.5) * (.72 + .28 * config.icCoreSize);
    const centre: XYZ = water ? [positiveDisplacement && !layout.banked ? -b * 1.6 : 0, deck + b * .55, 0] : [side ? -b * 2.8 : 0, b * .2, front - b * 1.5];
    ic.name = water ? 'Enclosed water-to-air charge cooler with coolant circuit' : `${side ? 'Side' : 'Front'}-mount air-to-air intercooler`;
    box(ic, width, b * (water ? .48 : .9), b * (water ? 1.15 : .36), m.aluminium, ...centre, true);
    if (water) {
      for (let fin = 0; fin < 9; fin++) box(ic, width * .8, b * .02, b * .85, m.dark, centre[0], centre[1] + (fin - 4) * b * .04, centre[2]);
      const coolantPorts: XYZ[] = [];
      for (const side of [-1, 1]) {
        cyl(ic, b * .06, b * .22, m.brass, centre[0] + side * width * .32, centre[1] + b * .35, centre[2]);
        coolantPorts.push([centre[0] + side * width * .32, centre[1] + b * .46, centre[2]]);
      }
      const coolantZ = rear + b, pump: XYZ = [centre[0] + b * .95, -b * .45, coolantZ];
      box(ic, b * 1.3, b * .65, b * .22, m.aluminium, centre[0], -b * .5, coolantZ, true);
      for (let row = 0; row < 8; row++) box(ic, b * 1.22, b * .015, b * .24, m.dark, centre[0], -b * .77 + row * b * .075, coolantZ);
      cyl(ic, b * .19, b * .3, m.dark, ...pump, 'z');
      const coolerIn: XYZ = [centre[0] + b * .68, -b * .5, coolantZ], coolerOut: XYZ = [centre[0] - b * .68, -b * .5, coolantZ];
      const pumpIn: XYZ = add(pump, 0, 0, -b * .15), pumpOut: XYZ = add(pump, 0, b * .19);
      route(ic, 'Warm coolant return to low-temperature radiator', [coolantPorts[1], [centre[0] + b * 1.3, centre[1] + b * .7, rear], coolerIn], b * .045, m.rubber);
      route(ic, 'Low-temperature radiator to circulation pump', [coolerOut, [centre[0] - b, -b * .9, coolantZ - b * .3], pumpIn], b * .045, m.rubber);
      route(ic, 'Pumped coolant feed to charge cooler', [pumpOut, [centre[0] - b * 1.3, centre[1] + b * .65, rear], coolantPorts[0]], b * .045, m.rubber);
    } else {
      for (let row = 0; row < 14; row++) box(ic, width * .85, b * .018, b * .38, m.dark, centre[0], centre[1] + b * (row / 16 - .4), centre[2]);
      for (const side of [-1, 1]) box(ic, b * .19, b * .95, b * .43, m.aluminium, centre[0] + side * width / 2, centre[1], centre[2], true);
    }
    const inPort: XYZ = add(centre, width / 2 + b * .1), outPort: XYZ = add(centre, -width / 2 - b * .1);
    if (water && positiveDisplacement) {
      route(ic, 'Blower discharge to charge cooler', [chargeJoin, add(centre, 0, b * .32)], b * .2);
    } else route(ic, 'Compressor hot-charge to intercooler', [chargeJoin, [Math.max(chargeJoin[0], inPort[0]) + b * .5, centre[1] + b * .3, centre[2] + b * .5], inPort], b * .15);
    route(ic, 'Intercooler cold-charge to intake manifold', [outPort, [outPort[0] - b * .45, intakeJoin[1], front - b * .6], intakeJoin], b * .15);
    tubeCoupling(ic, inPort, b * .15, 'x'); tubeCoupling(ic, outPort, b * .15, 'x');
    finalCharge = intakeJoin;
  } else {
    if (chargeJoin !== intakeJoin) route(induction, 'Compressor discharge to intake manifold', [chargeJoin, [chargeJoin[0], intakeJoin[1] + b * .25, front - b * .4], intakeJoin], b * .15);
    finalCharge = intakeJoin;
  }
  if (layout.intakePorts.length > 1) for (const target of layout.intakePorts) route(induction, 'Charge distribution to bank plenum', [finalCharge, [target[0], finalCharge[1], front - b * .5], target], b * .14);
  return layout;
}
