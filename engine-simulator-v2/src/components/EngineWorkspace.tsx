import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { SimConfig } from '../EngineSimulatorV2';
import { EngineStartCycle } from '../lib/engineStartCycle.js';
import { planAssembly, TAU, type PartId } from '../lib/engineAssembly';
import { createEngineAssembly, type AssemblyView, type AssemblyAppearance } from '../lib/engineAssemblyScene';
import './engine-workspace.css';

type Props = {
  config: SimConfig;
  rpm: number;
  running: boolean;
  startCommand?: { action: string; serial: number };
  onToggleRunning: () => void;
};
type StoredAppearance = Record<string, AssemblyAppearance>;
const finishKey = 'apex-engine-finishes-v1';
const defaultAppearance: AssemblyAppearance = { colour: '#9b3535', cover: 'ribbed' };
const colours = [ ['Oxide red', '#9b3535'], ['Graphite', '#343c45'], ['Bare alloy', '#9ba7ae'], ['Racing green', '#285b49'], ['Cobalt', '#305f94'], ['Warm ivory', '#c4b899'] ];
const hardwareKeys: (keyof SimConfig)[] = ['engineLayout','bore','stroke','compressionRatio','v8Crank','engineCycle','valvesPerCylinder','valvetrainLayout','sleeveValves','valveEvents','camDrive','intakeType','runnerLength','airCleaner','injectionType','headerType','exhaustType','silencerCount','applicationType','planeExhaust','marineExhaust','marineFiring','induction','turboFamily','turboCount','turboArchitecture','blowerType','superchargerDriveRatio','intercoolerType','icCoreSize'];

export default function EngineWorkspace({ config, rpm, running, startCommand, onToggleRunning }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<AssemblyView['mode']>('assembled');
  const [cut, setCut] = useState(.5);
  const [axis, setAxis] = useState<'x' | 'z'>('x');
  const [explode, setExplode] = useState(.7);
  const [speed, setSpeed] = useState(.02);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hidden, setHidden] = useState<Set<PartId>>(() => new Set());
  const [selected, setSelected] = useState<PartId | null>(null);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ triangles: 0, calls: 0 });
  const [expanded, setExpanded] = useState(false);
  const [finishes, setFinishes] = useState<StoredAppearance>(() => {
    try { return JSON.parse(localStorage.getItem(finishKey) ?? '{}'); } catch { return {}; }
  });
  const identity = config.gameMeta?.name ?? 'Custom engine';
  const savedFinish = finishes?.[identity];
  const appearance: AssemblyAppearance = {
    colour: savedFinish && /^#[0-9a-f]{6}$/i.test(savedFinish.colour) ? savedFinish.colour : defaultAppearance.colour,
    cover: savedFinish && ['ribbed', 'smooth', 'classic'].includes(savedFinish.cover) ? savedFinish.cover : defaultAppearance.cover,
  };
  const key = JSON.stringify(hardwareKeys.map(k => config[k]));
  // Runtime changes update a ref; only hardware/finish changes rebuild geometry.
  const plan = useMemo(() => planAssembly(config), [key]);
  const live = useRef({ rpm, running, paused, speed, startCommand, config });
  live.current = { rpm, running, paused, speed, startCommand, config };
  const view = useRef<AssemblyView>({ mode, cut, axis, explode, hidden, selected });
  view.current = { mode, cut, axis, explode, hidden, selected };
  const commands = useRef<{ reset?: () => void; preset?: (view: 'front' | 'side' | 'top') => void; step?: () => void }>({});

  function finish(change: Partial<AssemblyAppearance>) {
    setFinishes(current => {
      const next = { ...current, [identity]: { ...appearance, ...change } };
      try { localStorage.setItem(finishKey, JSON.stringify(next)); } catch { /* Cosmetic settings can remain session-only. */ }
      return next;
    });
  }
  useEffect(() => { setHidden(new Set()); setSelected(null); }, [identity, config.engineLayout]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [expanded]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    setError('');
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch {
      setError('The 3D workspace needs WebGL 2. Enable hardware acceleration in your browser and reload to try again.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.localClippingEnabled = true;
    renderer.domElement.setAttribute('aria-label', 'Interactive engine model. Drag to rotate, right-drag to pan, scroll to zoom.');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d151e');
    const camera = new THREE.PerspectiveCamera(37, 1, .01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .09; controls.screenSpacePanning = true;
    controls.listenToKeyEvents(renderer.domElement);
    controls.minDistance = 1; controls.maxDistance = 90;
    const hemi = new THREE.HemisphereLight('#d8e9ff', '#343036', 1.8); scene.add(hemi);
    const keyLight = new THREE.DirectionalLight('#fff1de', 2.5); keyLight.position.set(5, 8, 4); scene.add(keyLight);
    const rim = new THREE.DirectionalLight('#7eb9e9', 2.2); rim.position.set(-6, 3, -6); scene.add(rim);
    const environmentScene = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(environmentScene, .05);
    scene.environment = environment.texture;
    environmentScene.dispose(); pmrem.dispose();
    const assembly = createEngineAssembly(config, appearance); scene.add(assembly.root);
    const bounds = assembly.bounds;
    const centre = bounds.getCenter(new THREE.Vector3());
    const span = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
    const grid = new THREE.GridHelper(Math.ceil(span * 2), 24, '#354657', '#1a2a38');
    grid.position.y = bounds.min.y - plan.bore * .35; scene.add(grid);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(span * .65, 64), new THREE.MeshBasicMaterial({ color: '#111e2a', transparent: true, opacity: .65 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = grid.position.y + .001; scene.add(floor);
    function frame(direction = new THREE.Vector3(1.25, .75, -1.35)) {
      controls.target.copy(centre);
      const distance = span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * Math.max(1, 1 / camera.aspect) * 1.22;
      camera.position.copy(centre).addScaledVector(direction.normalize(), distance);
      controls.minDistance = plan.bore * .7; controls.maxDistance = distance * 5;
      controls.update();
    }
    let firstResize = true;
    const resize = new ResizeObserver(() => {
      const width = container.clientWidth, height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
      if (firstResize) { frame(); firstResize = false; }
    });
    resize.observe(container);
    let angle = 0;
    commands.current = {
      reset: () => frame(),
      preset: name => frame(name === 'front' ? new THREE.Vector3(0, .05, -1) : name === 'top' ? new THREE.Vector3(0, 1, -.001) : new THREE.Vector3(1, .05, 0)),
      step: () => { angle += Math.PI / 12; },
    };
    const cycle = new EngineStartCycle(config);
    let command = startCommand;
    if (command?.action === 'stop') { cycle.state = 'stopped'; cycle.rpm = 0; }
    let visible = true, last = performance.now(), lastStats = 0, frameId = 0;
    const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; });
    intersection.observe(container);
    const raycaster = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || e.button !== 0) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hits = raycaster.intersectObject(assembly.root, true);
      for (const hit of hits) {
        let object: THREE.Object3D | null = hit.object, id: PartId | undefined, shown = true;
        while (object) { if (!object.visible) shown = false; if (object.userData.part) id = object.userData.part; object = object.parent; }
        const material = (hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (!shown || material?.clippingPlanes?.some(p => p.distanceToPoint(hit.point) < 0)) continue;
        if (id) { setSelected(id); return; }
      }
      setSelected(null);
    };
    const contextLost = (e: Event) => { e.preventDefault(); setError('The browser interrupted 3D rendering. Reload this page to restore the workspace.'); };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    function render(now: number) {
      frameId = requestAnimationFrame(render);
      const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
      if (!visible || document.hidden) return;
      const state = live.current;
      let modelRpm = state.rpm;
      if (config.applicationType === 'plane') {
        cycle.config = state.config;
        if (state.startCommand !== command) {
          command = state.startCommand;
          if (command?.action === 'restart') { cycle.rpm = 0; cycle.state = 'stopped'; cycle.start(); }
          if (command?.action === 'stop') cycle.stop();
        }
        if (state.running) cycle.step(dt, state.rpm);
        modelRpm = cycle.rpm;
      }
      if (!state.paused && state.running) angle = (angle + modelRpm / 60 * TAU * dt * state.speed) % (TAU * 200);
      assembly.update(angle, view.current);
      controls.update(); renderer.render(scene, camera);
      if (now - lastStats > 1500) { lastStats = now; setStats({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls }); }
    }
    frameId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frameId); resize.disconnect(); intersection.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      assembly.dispose(); grid.geometry.dispose();
      (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(m => m.dispose());
      floor.geometry.dispose(); floor.material.dispose(); environment.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); commands.current = {};
    };
  }, [key, appearance.colour, appearance.cover]);

  const selectedPart = plan.parts.find(p => p.id === selected);
  const button = (active = false) => `ew-button${active ? ' ew-active' : ''}`;
  function toggle(id: PartId) { setHidden(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  return <section ref={panel} className={`engine-workspace${expanded ? ' ew-expanded' : ''}`} aria-label="Engine 3D workspace">
    <header className="ew-header">
      <div><div className="ew-eyebrow">ENGINE WORKSPACE</div><h2>{identity}</h2><p>{plan.count} cylinders <span>·</span> {config.engineCycle === 'two' ? 'Two-stroke' : config.sleeveValves ? 'Sleeve valves' : config.valvetrainLayout.toUpperCase()} <span>·</span> {config.induction === 'na' ? 'Naturally aspirated' : config.induction === 'turbo' ? 'Turbocharged' : 'Supercharged'}</p></div>
      <button className={button()} onClick={() => setExpanded(v => !v)} aria-label={expanded ? 'Close expanded workspace' : 'Expand workspace'}>{expanded ? 'Close ↙' : 'Expand ↗'}</button>
    </header>
    <div className="ew-toolbar" role="group" aria-label="Model view">
      {(['assembled', 'cutaway', 'exploded'] as const).map(v => <button key={v} className={button(mode === v)} aria-pressed={mode === v} onClick={() => setMode(v)}>{v === 'assembled' ? 'Assembled' : v === 'cutaway' ? 'Cutaway' : 'Exploded'}</button>)}
      <div className="ew-toolbar-spacer" />
      <button className={button()} onClick={() => commands.current.reset?.()}>Reset view</button>
    </div>
    {mode === 'cutaway' && <div className="ew-adjust"><label>Cut position<input aria-label="Cut position" type="range" min="0" max="1" step=".01" value={cut} onChange={e => setCut(Number(e.target.value))}/></label><select aria-label="Cut direction" value={axis} onChange={e => setAxis(e.target.value as 'x' | 'z')}><option value="x">Across engine</option><option value="z">Along crankshaft</option></select></div>}
    {mode === 'exploded' && <div className="ew-adjust"><label>Separation<input aria-label="Exploded separation" type="range" min="0" max="1.5" step=".01" value={explode} onChange={e => setExplode(Number(e.target.value))}/></label></div>}
    <div className="ew-stage">
      <div ref={host} className="ew-canvas" data-testid="engine-viewport" />
      {error ? <div className="ew-error" role="status">{error}</div> : <>
        <div className="ew-rpm"><strong>{Math.round(rpm).toLocaleString()}</strong><span>ENGINE RPM</span><small>{paused ? 'Visual paused' : !running ? 'Simulation paused' : speed === 1 ? 'Real time' : `${Math.round(1 / speed)}× slower motion`}</small></div>
        <div className="ew-camera" role="group" aria-label="Camera views">{(['front', 'side', 'top'] as const).map(v => <button key={v} onClick={() => commands.current.preset?.(v)}>{v}</button>)}</div>
        <div className="ew-hint">Drag to orbit · Right-drag to move · Scroll / pinch to zoom</div>
      </>}
    </div>
    <div className="ew-playback">
      <button className={button()} aria-pressed={paused} onClick={() => setPaused(v => !v)}>{paused ? '▶ Animate' : 'Ⅱ Freeze model'}</button>
      <button className={button()} onClick={() => { setPaused(true); commands.current.step?.(); }}>Step 15°</button>
      <label>Motion<select aria-label="Animation speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value="0.01">1/100 speed</option><option value="0.02">1/50 speed</option><option value="0.1">1/10 speed</option><option value="1">Real time</option></select></label>
      <button className={button(running)} onClick={onToggleRunning}>{running ? 'Pause simulator' : 'Run simulator'}</button>
    </div>
    <div className="ew-bottom">
      <details className="ew-parts" open><summary>Components <span>{plan.parts.length} assemblies</span></summary>
        <div className="ew-part-list">{plan.parts.map(p => <div className={`ew-part${selected === p.id ? ' ew-selected' : ''}`} key={p.id}><input type="checkbox" aria-label={`Show ${p.label.toLowerCase()}`} checked={!hidden.has(p.id)} onChange={() => toggle(p.id)}/><button aria-pressed={selected === p.id} onClick={() => setSelected(selected === p.id ? null : p.id)}>{p.label}</button></div>)}</div>
        <div className="ew-part-actions"><button onClick={() => setHidden(new Set())}>Show all</button>{selected && <button onClick={() => setHidden(new Set(plan.parts.filter(p => p.id !== selected).map(p => p.id)))}>Isolate selected</button>}</div>
        {selectedPart && <p className="ew-inspector"><strong>{selectedPart.label}</strong> {selectedPart.detail}</p>}
      </details>
      <details className="ew-finish"><summary>Workshop finish</summary><label>Valve cover<select aria-label="Valve cover style" value={appearance.cover} onChange={e => finish({ cover: e.target.value as AssemblyAppearance['cover'] })}><option value="ribbed">Ribbed alloy</option><option value="smooth">Smooth pressed cover</option><option value="classic">Classic rocker boxes</option></select></label><div className="ew-swatches">{colours.map(([name, colour]) => <button key={name} title={name} aria-label={`${name} valve covers`} aria-pressed={appearance.colour === colour} style={{ background: colour }} onClick={() => finish({ colour })}/>)}<input aria-label="Custom valve cover colour" type="color" value={appearance.colour} onChange={e => finish({ colour: e.target.value })}/></div><p>Finish saved for this engine.</p></details>
    </div>
    <footer className="ew-footer"><span>Procedural assembly · representative component shapes and firing order</span><span>{(stats.triangles / 1000).toFixed(1)}k triangles · {stats.calls} draws</span></footer>
  </section>;
}
