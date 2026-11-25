import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = root + 'node_modules/.cache/assembly-check.mjs';
await fs.mkdir(root + 'node_modules/.cache', { recursive: true });
const app = await fs.readFile(root + 'src/EngineSimulatorV2.tsx', 'utf8');
await build({ stdin: { contents: app + '\nexport { presets, configForPreset, defaultConfig, sanitizeConfig };\nexport { planAssembly, cylinderMotion, valveLift, valveLayout, camLobePhase, TAU } from "./lib/engineAssembly";\nexport { createEngineAssembly } from "./lib/engineAssemblyScene";\nexport { inductionLayout } from "./lib/engineInductionScene";', resolveDir: root + 'src', loader: 'tsx' }, tsconfig: root + 'tsconfig.app.json', bundle: true, platform: 'node', format: 'esm', loader: { '.css': 'empty' }, outfile: out });
const { presets, configForPreset, defaultConfig, sanitizeConfig, planAssembly, cylinderMotion, valveLift, valveLayout, camLobePhase, TAU, createEngineAssembly, inductionLayout } = await import(pathToFileURL(out).href);
let cylinderChecks = 0, sceneChecks = 0, maxTriangles = 0, maxDraws = 0;
try {
  for (const count of [1, 2, 3, 4, 5]) {
    const config = { ...defaultConfig, engineCycle: 'four', sleeveValves: false, valvesPerCylinder: count };
    const seats = valveLayout(config), b = config.bore / 100;
    assert.equal(seats.length, count, 'Valve count follows selected head');
    assert.equal(new Set(seats.map(v => `${v.x},${v.z}`)).size, count, 'Every valve has a distinct seat');
    for (const v of seats) assert.ok(Math.hypot(v.x, v.z) + v.radius < b / 2, 'Valve head fits inside bore');
    for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) {
      assert.ok(Math.hypot(seats[i].x - seats[j].x, seats[i].z - seats[j].z) > seats[i].radius + seats[j].radius, 'Valve heads do not overlap');
    }
    if (count === 5) { assert.equal(seats.filter(v => v.inlet).length, 3); assert.equal(seats.filter(v => !v.inlet).length, 2); }
    for (const inlet of [true, false]) {
      const event = config.valveEvents;
      const open = inlet ? 360 - (event?.inletOpen ?? 10) : 180 - (event?.exhaustOpen ?? 40);
      const duration = inlet ? 180 + (event?.inletOpen ?? 10) + (event?.inletClose ?? 40) : 180 + (event?.exhaustOpen ?? 40) + (event?.exhaustClose ?? 10);
      const peakAngle = (open + duration / 2) * Math.PI / 180;
      const firing = Math.PI * 1.5;
      const phaseAtPeak = camLobePhase(config, firing, inlet) + (firing + peakAngle) / 2;
      assert.ok(Math.abs(Math.cos(phaseAtPeak) + 1) < 1e-9, 'Cam tip meets follower at peak valve lift');
      assert.ok(valveLift(config, peakAngle, inlet) > 0, 'Cam lobe and valve lift share timing');
    }
  }
  assert.equal(valveLayout({ ...defaultConfig, engineCycle: 'two' }).length, 0, 'Two strokes have no poppet valves');
  assert.equal(valveLayout({ ...defaultConfig, sleeveValves: true }).length, 0, 'Sleeve heads have no poppet valves');
  for (const crank of ['crossplane', 'flatplane']) {
    const config = { ...defaultConfig, engineLayout: 'v8', v8Crank: crank };
    const plan = planAssembly(config);
    const phases = [];
    for (let row = 0; row < 4; row++) {
      const pair = plan.cylinders.slice(row * 2, row * 2 + 2);
      for (const angle of [0, .7, 2.1]) {
        const world = pair.map(c => {
          const m = cylinderMotion(plan, c, angle);
          return { x: m.pinX * Math.cos(c.angle) + m.pinY * Math.sin(c.angle), y: -m.pinX * Math.sin(c.angle) + m.pinY * Math.cos(c.angle) };
        });
        assert.ok(Math.hypot(world[0].x - world[1].x, world[0].y - world[1].y) < 1e-9, 'Opposite V8 rods share the same journal');
      }
      phases.push(((pair[0].angle - pair[0].firing) % TAU + TAU) % TAU);
    }
    const distinct = new Set(phases.map(v => v.toFixed(6)));
    assert.equal(distinct.size, crank === 'crossplane' ? 4 : 2, 'Crank throw planes match crank selection');
  }
  for (const [layout, bankCount, throwPlanes] of [['v12', 2, 3], ['w12', 3, 2]]) {
    const plan = planAssembly({ ...defaultConfig, engineLayout: layout });
    const phases = [];
    for (let row = 0; row < plan.perBank; row++) {
      const cylinders = plan.cylinders.slice(row * bankCount, row * bankCount + bankCount);
      for (const angle of [0, .7, 2.1]) {
        const world = cylinders.map(c => {
          const m = cylinderMotion(plan, c, angle);
          return { x: m.pinX * Math.cos(c.angle) + m.pinY * Math.sin(c.angle), y: -m.pinX * Math.sin(c.angle) + m.pinY * Math.cos(c.angle) };
        });
        for (const pin of world.slice(1)) assert.ok(Math.hypot(pin.x - world[0].x, pin.y - world[0].y) < 1e-9, layout + ' rods share their journal');
      }
      phases.push(((cylinders[0].angle - cylinders[0].firing) % TAU + TAU) % TAU);
    }
    assert.equal(new Set(phases.map(v => v.toFixed(6))).size, throwPlanes, layout + ' generic throw planes');
  }
  for (const preset of presets) {
    const config = configForPreset(preset), plan = planAssembly(config);
    assert.equal(plan.cylinders.length, plan.count, preset.name);
    assert.equal(new Set(plan.cylinders.map(c => c.index)).size, plan.count);
    for (const c of plan.cylinders) {
      for (let step = 0; step <= 96; step++) {
        const angle = step / 96 * TAU * 2;
        const m = cylinderMotion(plan, c, angle);
        Object.values(m).forEach(v => assert.ok(Number.isFinite(v), preset.name));
        assert.ok(Math.abs(Math.hypot(m.pinX, m.pistonY - m.pinY) - plan.rod) < 1e-9, preset.name + ' rod length');
        assert.ok(m.pistonY >= plan.rod - plan.radius - 1e-9 && m.pistonY <= plan.rod + plan.radius + 1e-9, preset.name + ' stroke envelope');
        for (const intake of [true, false]) { const lift = valveLift(config, m.cycleAngle, intake); assert.ok(lift >= 0 && lift < .2, preset.name + ' valve lift'); }
        for (const seat of valveLayout(config)) {
          const lift = valveLift(config, m.cycleAngle, seat.inlet);
          const valveBottom = plan.deck + plan.bore * .04 - lift * Math.cos(seat.tilt) - plan.bore * .02;
          assert.ok(valveBottom > m.pistonY + plan.pistonHeight / 2, preset.name + ' valve/piston clearance');
        }
        cylinderChecks++;
      }
    }
    if (config.engineCycle !== 'two') for (const c of plan.cylinders) {
      assert.ok(Math.abs(cylinderMotion(plan, c, c.firing).pistonY - plan.rod - plan.radius) < 1e-9, 'Ignition at TDC');
    }
    const present = new Set(plan.parts.map(p => p.id));
    assert.equal(present.has('induction'), config.induction !== 'na');
    assert.equal(present.has('intercooler'), config.induction !== 'na' && config.intercoolerType !== 'none');
    assert.equal(present.has('valvetrain'), config.engineCycle !== 'two');
  }
  const representative = [...new Map(presets.map(p => [p.config.engineLayout, configForPreset(p)])).values()];
  const variants = [
    ...[1, 2, 3, 4, 5].map(valvesPerCylinder => ({ ...defaultConfig, valvesPerCylinder })),
    ...['ohv', 'sohc', 'dohc'].map(valvetrainLayout => ({ ...defaultConfig, valvetrainLayout })),
    ...['na', 'turbo', 'supercharger'].map(induction => ({ ...defaultConfig, induction })),
    ...['single', 'twinscroll', 'sequential', 'vgt'].map(turboArchitecture => ({ ...defaultConfig, induction: 'turbo', turboArchitecture, turboCount: 1 })),
    { ...defaultConfig, engineLayout: 'v8', induction: 'turbo', turboCount: 2, turboArchitecture: 'single' },
    ...['carb', 'tbi', 'port', 'direct', 'dual'].map(injectionType => ({ ...defaultConfig, injectionType })),
    ...['none', 'sidemount', 'small_fmic', 'large_fmic', 'water_air'].map(intercoolerType => ({ ...defaultConfig, induction: 'turbo', intercoolerType })),
    ...['cast', 'shorty', 'fourtwoone', 'fourone', 'equal', 'unequal'].map(headerType => ({ ...defaultConfig, headerType })),
    ...['roots', 'twinscrew', 'centrifugal'].map(blowerType => ({ ...defaultConfig, induction: 'supercharger', blowerType })),
    { ...defaultConfig, engineLayout: 'v8', induction: 'supercharger', blowerType: 'roots', intercoolerType: 'water_air' },
    { ...defaultConfig, engineLayout: 'v8', induction: 'supercharger', blowerType: 'twinscrew', intercoolerType: 'water_air' },
    { ...defaultConfig, applicationType: 'plane', engineLayout: 'radial9', induction: 'supercharger', blowerType: 'centrifugal', intercoolerType: 'none' },
    { ...defaultConfig, engineLayout: 'radial14', applicationType: 'plane', sleeveValves: true },
    { ...defaultConfig, engineLayout: 'single', applicationType: 'boat', engineCycle: 'two' },
    { ...defaultConfig, engineLayout: 'flat6', intakeType: 'itb', airCleaner: 'trumpets' },
    { ...defaultConfig, turboCount: 4, turboFamily: 'large', icCoreSize: 1 },
    ...presets.map(configForPreset).filter(c => c.visualModel?.orientation === 'inverted'),
  ];
  for (const [i, config] of [...representative, ...variants].entries()) {
    const assembly = createEngineAssembly(config, { colour: '#9b3535', cover: ['ribbed', 'smooth', 'classic'][i % 3] });
    const view = { mode: 'assembled', cut: .5, axis: 'x', explode: .7, hidden: new Set(), selected: null };
    const valves = [], roles = new Map(), inductionGroups = [], turboGroups = [], exhaustGroups = [], connectionSets = [], pistons = new Map(), rods = new Map(), throws = new Map(), camRings = [], scrollLanes = [];
    assembly.root.traverse(o => {
      if (o.userData.mechanism === 'valve') valves.push(o);
      if (o.userData.mechanism === 'piston') pistons.set(o.userData.cylinderIndex, o);
      if (o.userData.mechanism === 'conrod') rods.set(o.userData.cylinderIndex, o);
      if (o.userData.mechanism === 'crank-throw') throws.set(o.userData.cylinderIndex, o);
      if (o.userData.mechanism === 'radial-cam-ring') camRings.push(o);
      if (o.userData.role) roles.set(o.userData.role, o);
      if (o.userData.induction) inductionGroups.push(o);
      if (o.userData.turbo) turboGroups.push(o);
      if (o.userData.part === 'exhaust') exhaustGroups.push(o);
      if (o.userData.connections) connectionSets.push(o.userData.connections);
      if (o.userData.scrollLanes) scrollLanes.push(...o.userData.scrollLanes);
    });
    assert.equal(inductionGroups.length, config.induction === 'na' ? 0 : 1, 'Exactly one installation metadata group per forced-induction engine');
    const connections = connectionSets.flat();
    for (const connection of connections) {
      assert.ok(connection.name.length > 0, 'Every flow route has a defined function');
      for (const endpoint of [connection.start, connection.end]) { assert.equal(endpoint.length, 3); endpoint.forEach(v => assert.ok(Number.isFinite(v), 'Finite flow-route endpoint')); }
    }
    if (config.induction !== 'na') {
      const metadata = inductionGroups[0].userData.induction;
      const layout = inductionLayout(config, assembly.plan);
      assert.equal(metadata.kind, config.induction);
      assert.equal(metadata.architecture, config.induction === 'turbo' ? config.turboArchitecture : config.blowerType);
      assert.equal(metadata.count, layout.count);
      for (const endpoint of [...layout.intakePorts, ...layout.exhaustPorts]) endpoint.forEach(v => assert.ok(Number.isFinite(v)));
      if (config.induction === 'turbo') {
        assert.equal(turboGroups.length, config.turboArchitecture === 'sequential' || config.turboCount === 2 ? 2 : 1, 'Physical turbo count follows installation architecture');
        const tailpipeAssemblies = exhaustGroups.filter(g => g.userData.role !== 'upstream-exhaust-collector');
        assert.equal(tailpipeAssemblies.length, 1, 'Turbo tailpipes leave the turbines; radial upstream collector rings are permitted');
        assert.equal(tailpipeAssemblies[0].name, 'Turbine outlets and downpipes');
        assert.equal(connections.filter(c => c.name === 'Turbine outlet to exhaust tailpipe').length, turboGroups.length);
        if (config.turboArchitecture === 'twinscroll') assert.equal(connections.filter(c => c.name.startsWith('Separated twin-scroll runner')).length, turboGroups.length * 2);
        if (config.turboArchitecture === 'twinscroll') {
          assert.equal(scrollLanes.length, assembly.plan.count, 'Every cylinder has a separate upstream scroll assignment');
          assert.deepEqual([...new Set(scrollLanes.map(c => c.lane))].sort(), [0, 1], 'Both scroll lanes remain independent upstream');
          for (const lane of scrollLanes) (lane.localPort ?? lane.worldPort).forEach(v => assert.ok(Number.isFinite(v)));
        }
        if (config.turboArchitecture === 'vgt') assert.equal(connections.filter(c => c.name === 'VGT actuator linkage').length, turboGroups.length);
        if (config.turboArchitecture === 'sequential') { assert.ok(connections.some(c => c.name === 'Sequential turbine bypass crossover')); assert.deepEqual(turboGroups.map(g => g.userData.turbo.role), ['primary', 'secondary']); }
      } else {
        assert.equal(turboGroups.length, 0, 'Mechanical superchargers have no exhaust turbine assemblies');
        assert.equal(connections.filter(c => /turbine/i.test(c.name)).length, 0, 'Mechanical blower routes never pass through an exhaust turbine');
        if (config.blowerType === 'centrifugal') {
          const impellers = []; assembly.root.traverse(o => { if (o.userData.impeller) impellers.push(o); });
          assert.equal(impellers.length, 1); assert.equal(impellers[0].userData.requiresSolvedShaftSpeed, false);
          assert.equal(impellers[0].userData.mechanicalDriveRatio, config.superchargerDriveRatio);
        }
        if (config.blowerType === 'twinscrew' || config.blowerType === 'roots') {
          const rotorNames = []; assembly.root.traverse(o => { if (/screw rotor|Roots rotor/.test(o.name)) rotorNames.push(o.name); });
          assert.equal(rotorNames.length, 2, 'Positive-displacement blower has two actual rotors');
          assert.ok(rotorNames.every(name => config.blowerType === 'twinscrew' ? /screw rotor/.test(name) : /Roots rotor/.test(name)));
        }
      }
      const cooler = assembly.plan.parts.some(p => p.id === 'intercooler');
      assert.equal(cooler, config.intercoolerType !== 'none');
      if (cooler) {
        assert.ok(connections.some(c => c.name === 'Intercooler cold-charge to intake manifold'));
        if (config.intercoolerType === 'water_air') for (const route of ['Warm coolant return to low-temperature radiator', 'Low-temperature radiator to circulation pump', 'Pumped coolant feed to charge cooler']) assert.ok(connections.some(c => c.name === route), 'Water-to-air coolant circuit includes ' + route);
      } else assert.ok(connections.some(c => c.name === 'Compressor discharge to intake manifold'));
    }
    assert.ok(Math.abs(assembly.root.rotation.z - (config.visualModel?.orientation === 'inverted' ? Math.PI : 0)) < 1e-9, 'Inverted visual metadata controls physical engine orientation');
    if (config.visualModel) assert.deepEqual(sanitizeConfig(JSON.parse(JSON.stringify(config))).visualModel, config.visualModel, 'Visual-era metadata survives configuration round-trip');
    assert.equal(valves.length, assembly.plan.count * valveLayout(config).length, 'Generated valve groups match the actual head configuration');
    assert.equal(pistons.size, assembly.plan.count); assert.equal(rods.size, assembly.plan.count); assert.equal(throws.size, assembly.plan.count);
    for (const ring of camRings) assert.ok(Math.abs(Math.abs(ring.userData.camRatio) * ring.userData.lobeCount - .5) < 1e-9, 'Cam-ring lobes produce one valve event per two crank revolutions');
    const fixedMatrices = new Map();
    assembly.update(0, view); assembly.root.updateMatrixWorld(true);
    if (assembly.plan.rotating) {
      for (const name of ['fixed-accessories', 'fixed-crankshaft', 'fixed-engine-mount', 'fixed-fuel-feed']) {
        assert.ok(roles.has(name), 'Rotary has ' + name);
        fixedMatrices.set(name, roles.get(name).matrixWorld.elements.slice());
      }
      assert.ok(roles.has('rotating-case'));
      assert.ok(roles.has('rotary-open-exhaust-ports'));
      assert.equal(assembly.plan.parts.some(p => p.id === 'exhaust'), false, 'No collector/tailpipe on a rotary');
    }
    for (const angle of [0, Math.PI / 2, Math.PI, TAU * 2]) {
      assembly.update(angle, view); assembly.root.updateMatrixWorld(true);
      for (const ring of camRings) assert.ok(Math.abs(ring.rotation.z - angle * ring.userData.camRatio) < 1e-9, 'Rendered cam-ring speed matches its event ratio');
      const point = (object, x, y, z) => {
        const e = object.matrixWorld.elements;
        return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
      };
      const gap = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
      for (const c of assembly.plan.cylinders) {
        const rod = rods.get(c.index);
        const top = point(rod, 0, assembly.plan.rod / 2, 0), bottom = point(rod, 0, -assembly.plan.rod / 2, 0);
        assert.ok(gap(top, point(pistons.get(c.index), 0, 0, 0)) < 1e-8, 'Rendered conrod small end stays attached to piston pin');
        assert.ok(gap(bottom, point(throws.get(c.index), 0, assembly.plan.radius, 0)) < 1e-8, 'Rendered conrod big end stays attached to crank throw');
      }
      for (const [name, before] of fixedMatrices) assert.deepEqual(roles.get(name).matrixWorld.elements, before, name + ' stays fixed while cylinders revolve');
      if (config.valvesPerCylinder === 5 && valveLayout(config).length) for (const c of assembly.plan.cylinders) {
        const cylinderValves = valves.filter(v => v.userData.cylinderIndex === c.index);
        assert.equal(cylinderValves.length, 5, 'Five rendered valves per cylinder');
        assert.equal(cylinderValves.filter(v => v.userData.inlet).length, 3, 'Three rendered intake valves');
        assert.equal(cylinderValves.filter(v => !v.userData.inlet).length, 2, 'Two rendered exhaust valves');
        assert.equal(new Set(cylinderValves.map(v => v.position.toArray().map(n => n.toFixed(8)).join(','))).size, 5, 'Five rendered valve positions stay distinct through movement');
      }
      assembly.root.traverse(object => {
        object.matrixWorld.elements.forEach(v => assert.ok(Number.isFinite(v), 'finite transform'));
        if (object.isMesh) for (const value of object.geometry.attributes.position.array) assert.ok(Number.isFinite(value), 'finite vertex');
      });
    }
    if (assembly.plan.rotating) {
      assembly.update(.6, view); assembly.root.updateMatrixWorld(true);
      assert.ok(Math.abs(roles.get('rotating-case').rotation.z) > .5, 'Rotary cylinder case actually revolves');
    }
    if (config.valvesPerCylinder === 5 && valveLayout(config).length) {
      const first = assembly.plan.cylinders[0];
      const seats = valveLayout(config);
      const target = valves.find(v => v.userData.cylinderIndex === first.index && v.userData.valveIndex === 0);
      assembly.update(first.firing, view);
      const closed = target.position.clone();
      assembly.update(first.firing + 465 * Math.PI / 180, view);
      assert.ok(target.position.distanceTo(closed) > .01, 'Rendered valve movement follows the intake event');
      assert.ok(seats[0].inlet);
    }
    let triangles = 0, draws = 0;
    assembly.root.traverse(o => { if (o.isMesh) { triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; draws++; } });
    maxTriangles = Math.max(maxTriangles, triangles); maxDraws = Math.max(maxDraws, draws);
    assert.ok(triangles < 250000, config.engineLayout + ' triangle budget');
    assert.ok(draws < 500, config.engineLayout + ' draw budget');
    assembly.update(1, { ...view, mode: 'cutaway', axis: 'z', selected: 'block' });
    assembly.update(1, { ...view, mode: 'exploded', hidden: new Set(['covers']) });
    assembly.root.traverse(o => { if (o.userData.part === 'covers') assert.equal(o.visible, false); });
    assembly.dispose(); sceneChecks++;
  }
  console.log(`PASS: ${presets.length} engine configurations; ${cylinderChecks} cylinder-motion checks; ${sceneChecks} component assemblies; max ${Math.round(maxTriangles)} triangles / ${maxDraws} mesh draws.`);
} finally { await fs.rm(out, { force: true }); }
