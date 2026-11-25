# Engine Simulator V2

A local Vite + React + TypeScript version of the engine simulator, focused on car engines only.

## What it includes

- Dyno graph for horsepower, torque, and boost
- Diagnostics graph toggle
- Car engine presets
- Live throttle mode
- Dyno sweep mode
- Procedural audio synthesis
- Save, export, and copy preset support
- Dark UI

## Notes

- This is an approximate physics and audio simulator for exploration and tuning feel.
- It is not engineering-grade analysis software.

## Setup

```bash
npm install
```

## Run locally

```bash
npm run dev
```

## Production build

```bash
npm run build
```


## Engine library and sidebar

The persistent sidebar header contains Run/Stop Dyno and Audio on every tab. Library, Engine, Boost, Drive, Test setup and Sound separate browsing, tuning and running. Search spans all manufacturers; the manufacturer selector narrows browsing.

The catalogue contains 240 petrol-engine or named factory-application examples across 24 manufacturers (ten each). Original presets are preserved. Additional entries are clearly labelled approximate: nominal capacity and architecture identify the example, but square bore/stroke geometry, rev limits, compression, boost and tuning are illustrative, not independently verified OEM specifications or calibrated output. Some named vehicle applications share an engine family. Manufacturer reference links provide background, not verification of every setting.

Run `npm run test:library` to verify counts, preserved presets, capacity calculations and finite dyno outputs for every example.

## Physics model

The calculator is a semi-empirical steady-state four-stroke model, not a calibrated thermodynamic or knock simulation. Airflow comes from displacement, RPM, VE, manifold pressure, temperature and dry-air fraction. Combustible fuel energy and estimated indicated efficiency produce indicated power; friction, pumping and supercharger enthalpy/drive losses are subtracted once. Shaft torque, mechanical horsepower and BMEP use consistent SI conversions. There is no minimum-torque override or post-hoc curve reshaping.

Reference dyno sweeps use fuel-specific target lambda and estimated best-torque timing. The same point solver supplies chart values, cursor diagnostics and dependent quantities. Drive uses the selected gasoline-scale AFR (lambda = AFR / 14.7) and ignition setting. Injector sizing uses model fuel flow, representative fuel density and 85% duty; it is an estimate rather than an injector recommendation. E30/E85 use fixed representative fuel properties.

Live motion integrates signed net shaft/brake torque through estimated inertia at 120 Hz, with elapsed-time accumulation, a 100 ms background-tab catch-up cap, and explicit idle/rev-limit boundaries. Trace labels use simulation time. Roller inertia is a relative control, converted to an estimated engine-referred inertia; it is not a measured roller specification. Brake load is an independent opposing torque.

Limitations: generic VE/efficiency and friction models, empirical boost-vs-RPM scheduling, only coarse compressor-efficiency map samples, no turbine maps, transient manifold filling, turbo shaft inertia, knock, heat soak or full per-engine validation. Power changes from earlier versions reflect removal of artificial torque support, not verification against a factory rating. Most examples still use the generic model; see the calibration evidence below.

Validation: `npm run test:physics` checks SI identities, shaft-energy balance, humidity/temperature/altitude trends, fuel blends, mixture/timing effects, intercooling, blower losses, signed acceleration and all factory dyno rows.

Reference definitions:
- [NIST unit conversions](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9)
- [National Academies: SI engine efficiency fundamentals](https://www.nationalacademies.org/read/21744/chapter/17)
- [HP Academy: stoichiometric ratios](https://www.hpacademy.com/assets/Uploads/045852edfc/Stoichiometric-air-to-fuel-ratios-of-common-fuels-Sheet1-3.pdf)
- [Garrett: compressor-map concepts](https://www.garrettmotion.com/knowledge-center-category/oem/expert/)

The empirical efficiency constants and response curves are implementation assumptions, not values prescribed by these sources.


## Source-based calibration (first batch)

Six optional fixed charge-flow correction profiles: LS3 2021 crate, US 2002 F20C, EU LFA 1LR-GUE, E92 S65, JDM 1997 VVT-i 2JZ-GTE and MY95 Saab 9000 Aero manual B234R. Selecting these factory examples loads the specific variant. Calibration can be disabled under Engine. Modified hardware retains the baseline correction; its output is a prediction, not re-fitted to stock ratings. Fuel flow and shaft power continue through the shared energy balance.

Only the LS3 uses a digitised manufacturer dyno curve (Chevrolet Performance 2021, printed p.52, PDF p.54). Chart reading tolerance is approximately ±4%; two points at 4300/4700 rpm are excluded from fitting and used as interpolation holdouts (0.30%/0.16% error against the same chart). These are not independent test-bench measurements. The other five profiles use published anchors and maximum-output constraints; their intervening curves remain inferred. Source URLs, variants and notes are recorded in `src/data/engineCalibrations.ts` and shown in the app. Additional S65 point source: https://www.bmw-m.com/en/topics/magazine-article-pool/bmw-m3-e92-e90-and-e93.html .

Reference normalisation assumes 20°C, sea level, 45% humidity and default vehicle speed. This does not reconstruct OEM test conditions or apply an SAE correction standard. Fitting uses fixed effective charge/VE multipliers, not measured VE. Chart corrections interpolate linearly between source anchors. Rating-only profiles additionally fit a 25-rpm inferred grid from 1200 rpm to the stock redline, using the original anchored charge curve as a prior and parabolic torque/power upper envelopes centred on their published peak RPMs (curvature coefficients 0.15/0.25, normalised by redline). These envelopes are modelling assumptions, not measured curve points. They constrain the offline stock fit, not runtime output; modified hardware can exceed stock ratings. Corrections hold their endpoint outside the fitted range; accuracy outside that range is unknown. The Saab boost onset is inferred to support its early torque anchor, not derived from a boost trace. Hardware, fuel and environmental changes are unvalidated predictions.

Garrett G25-550 and GTX3071R Gen II are explicit aftermarket compressor-efficiency choices under Boost; no factory engine is assumed to use either. Sparse manual reads of the linked manufacturer contours interpolate only inside a limited interior region, with approximately ±3 percentage-point reading uncertainty (not a statistical confidence interval). Outside that region the generic efficiency model is used and labelled. No surge/choke envelope, speed-line limit, wastegate dynamics or turbine matching is modelled. These options change compressor heating, charge density and resulting power; they do not replace empirical boost scheduling. Corrected flow uses Garrett's 545°R / 13.95 psia convention, which the product images do not independently specify: https://www.garrettmotion.com/wp-content/uploads/2023/02/737639-34_781328_Speed_Sensor_Kit_Installation_Instructions_revG.pdf . Airflow uses the solver's dry-air approximation; inlet duct pressure loss is omitted.

Run `npm run fit:calibration` after changing baseline physics, then review and commit generated coefficients. `npm run test:calibration` checks fitted anchors, whole-sweep maxima and peak RPMs on a separate 7-rpm grid, continuity, calibrated energy balance, LS3 holdouts, tuning/weather response, map nodes/fallback and all factory configurations. Matching fitted points demonstrates fitting consistency, not independent model validation.


The peak-constraint pass corrects F20C hardware to a plenum intake, discrete VTEC lift switching without continuous intake cam phasing, and a 4-2-1 header. It also corrects the S65 to a cross-plane crank. Hardware sources: [Honda S2000 powertrain](https://hondanews.com/en-US/honda-automobiles/releases/release-5cf69ff7f30a01d81cc648004c34c870-honda-s2000-powertrain), [BMW M3 engine media information, March 2007](https://www.press.bmwgroup.com/global/article/attachment/T0012000EN/16623). Existing approximate turbo scheduling is retained; this pass does not claim to reconstruct factory boost traces.

At the reference conditions, all six profiles have both peak magnitudes within 0.5% of published values on the independent RPM grid, and peak locations within 200 rpm. This is a fitting consistency result, not a claim of 0.5% physical accuracy. The 234 other examples remain unverified against measured output. Existing saved setups retain their hardware settings; reselect the factory example to load corrected hardware.

## Audio quality pass

The established subtype voices, firing patterns, pulse accents and cinematic V8/V12 cadence are retained. The audio-only smooth-step helper now handles fractional throttle ranges correctly, so idle texture fades out under load. The shared physics calculations are unaffected.

Superchargers add a separate two-harmonic whine layer, driven by RPM, drive ratio, load, boost, blower type and the existing loudness control. Harmonic orders are sound-design approximations, not measured compressor acoustics. Recirculation produces a softer filtered return, atmospheric dump a sharper hiss, and no valve a restrained flutter illustration reduced by the anti-surge setting. This does not simulate physical compressor surge.

Exhaust keeps its existing saturation. Intake, mechanical, induction and effect buses bypass that shaper; their clean gain matches its small-signal gain. Dry and room returns now share compression, microphone filtering and output protection. The final oversampled soft guard is linear below amplitude 0.8 and rounds transient overshoots above that level. Cinema gain now responds immediately to configuration changes.

Missed combustion events are skipped after a scheduling stall; stop/restart is protected against a delayed suspend from an earlier stop. Transient sources disconnect on completion. The main-thread lookahead scheduler remains in use; this is not an AudioWorklet migration.

`npm run test:audio` checks fractional blends, blower pitch and mute controls, valve options, stale-event recovery and restart races. It renders the production audio graph through the native `node-web-audio-api` offline context for turbo, V8, V12, three blower types and a maximum-mix case, checking finite non-silent output and peak headroom. It uses a deterministic control clock and React hook driver, not browser playback, and does not establish subjective sound quality or cross-browser equivalence. A browser listening comparison remains necessary.

## Component acoustics (default across all 240 factory examples)

The AudioWorklet acoustic model now derives its construction from hardware settings for all 11 supported layouts. Neither engine name, calibration ID nor manufacturer participates in descriptor generation. The three original B234R/F20C/LS3 examples are regression/listening references only. They no longer dispatch special sound profiles. The legacy voices remain selectable under Sound and are used as fallback if AudioWorklet cannot run. Existing saved configurations explicitly selecting legacy retain that choice; missing model settings migrate to component acoustics.

Cylinder count and crank layout determine four-stroke event cadence and bank routing. Cross-plane V8s use a representative bank sequence; exact OEM firing-order variations are not individually encoded. Runner/collector/tailpipe delays, signed reflections, damped feedback and muffler/turbo filtering shape the note. Pulse envelopes follow displacement per cylinder, valve count and cam aggression; compression modifies excitation strength. Intake type, runner length, air cleaner, secondary-throttle construction and variable lift shape induction noise. Port/TBI/direct/dual injection add different subtle injector/pump layers; carburettors have no injector tick and retain combustion on overrun. Cam-drive belt/chain/gear options shape the mechanical layer. Exhaust crossovers and catalyst choice modify acoustic filtering. Sound texture modifies the stochastic/mechanical detail, not engine identity.

Idle lope is an inferred consequence of overlap, resolved idle RPM, throttle, inertia and combustion variation, with bounded cyclic speed variation around the actual RPM. The model does not halve the firing rate to make a V8 sound deeper. Automatic idle-overlap inference accounts for low-lift operation and variable cam phasing; these are assumptions, not OEM cam maps. Explicit overlap overrides the inference. OHV/carb alone never enable heavy lope. Lope fades above idle and under load. Flywheel inertia also participates in the existing Drive acceleration calculation; its default 0.18 kg·m² preserves the prior baseline inertia. Steady dyno ratings are unchanged.

Sound → Acoustic components and assumptions exposes estimated overlap, optional explicit overlap, air cleaner, carb secondaries, cam drive, crossover, catalyst, flywheel inertia, idle trim and exhaust dimensions. The existing Engine tab controls cam aggression, lift, intake/runner construction, injection, crank and valvetrain. New geometry/catalyst/overlap controls affect sound only and do not constitute a new power or gas-flow calculation. Restore inferred dimensions/overlap returns those values to hardware-based estimates. All unmeasured choices are labelled assumptions.

The pipe dimensions, 520 m/s exhaust wave speed, cam estimates, reflection/filter coefficients, fuel-cut thresholds and injector levels are inferred acoustic parameters, not measured engineering specifications. The model supports 11 petrol engine layouts; it does not claim a diesel combustion, rotary or detailed ECU model. Four-stroke cadence is explicit, but uneven-fire OEM arrangements and OEM bank numbering remain future measured-hardware inputs. The synthetic stereo room/cabin response is not a measured impulse response. Match listening loudness for A/B comparisons; neither mode is perceptually loudness calibrated. No recording-based accuracy or life-like certification is claimed.

`npm run test:acoustics` renders all 240 examples and checks physical event cadence, default selection, component signatures and identical waveforms after renaming. It covers all 11 layouts at 44.1/48/96 kHz, overrun/recovery, bank routing, hardware-dependent layer changes, mild/heavy overlap, flywheel effects on ripple and Drive, sample-block invariance, mode fades and broad B234R/F20C/LS3 pulse/filter reference ranges. It also registers and renders the actual AudioWorklet for every layout using the native offline Web Audio runtime. `npm run test:audio` exercises the selectable legacy graph, blower/valve controls, restart/stall handling and peak headroom. These checks do not replace listening comparisons.

Reference capture checklist: warm stock engine; identify variant, exhaust modifications and microphone position/distance; avoid automatic level control where possible; capture idle, steady 2000/4000 RPM, a loaded sweep and closed-throttle coast-down with recording permission. Free revs and loaded pulls are separate references. Compare the same microphone position and match loudness before changing acoustic coefficients.

Background sources (support mechanisms, not our numerical coefficients): [Holley cam/idle discussion](https://www.holley.com/support/fuel_injection/hilborn_efi_and_mfi/), [SAE high-pressure fuel-system acoustics](https://saemobilus.sae.org/papers/acoustic-noise-assessment-gasoline-direct-injection-gdi-components-using-taguchi-methods-application-gdi-high-pressure-pumps-2010-01-0586), [Bosch port/direct injection](https://www.bosch-mobility.com/en/solutions/powertrain/gasoline/gasoline-port-fuel-injection/).


## Planes

Open `?section=planes` or select **Planes**. Twenty fictional engine names retain their real historical references in `src/data/planeEngines.ts`, grouped into Inline, Flat, Radial, V, Rotary and W. Cars retain their separate 240-example library.

Aircraft profiles use low-speed VE estimates, their own RPM/geometry ranges and a fixed upstream charge coefficient normalised at the listed representative rating and altitude. Some ratings are museum/manufacturer figures; others are explicitly representative family settings. This is not validation of the intervening curve or altitude boost regulation. Unknown geometry is inferred from nominal capacity. Runtime tuning still changes performance; loading/exporting a setup preserves the fixed coefficient.

The shared acoustic worklet supports flat twins, 5/7/9-cylinder radials, a 14-cylinder two-row radial, nine-cylinder rotating rotaries and a three-bank W12. Odd-row radial outlets use every-other-cylinder positions; unknown multirow and W12 bank assignments are representative. Short exhaust stubs bypass automotive collector reflections; sleeve valves reduce poppet tick. A separate fourth audio output carries procedural propeller blade-passage and tip-speed noise, driven by engine RPM × reduction ratio, blade count and diameter. It does not calculate thrust, pitch control or aerodynamic shaft load. The rotary ignition-cut control suppresses both combustion audio and indicated torque; historical selective ignition controls are not yet modelled. Propeller diameter/reduction/blade choices describe illustrative installations.

`npm run test:planes` checks all twenty rating references, finite curves, altitude response, tuning response, saving round trips, identity-independent audio, physical firing cadence, propeller speed/blade controls and rotary cut. It also renders the native four-output worklet for seven new architectures at three sample rates. These are implementation checks, not measured-recording validation.

### Aircraft exhaust and texture pass

New plane selections default to collector/tailpipe; saved explicit stub selections remain available. Stubs retain their own travel time and open-end reflections instead of acting as an almost bare pulse source. The approved flat, V8, rotary and W combustion/propeller sources are retained. Nine immutable pre-pass waveform hashes guard those collector voices and representative car engines.

Inline engines, radial distribution manifolds and six-cylinder banks now use cylinder mixture differences, correlated cycle variation, a small inertia-dependent speed variation and filtered turbulence inside each exhaust pulse. These are shared hardware/topology rules, not engine-name dispatch. Sound texture controls their intensity. Mild weak combustions occur near idle, not arbitrary cylinder cuts at full power. Carburettor throttle snaps can leave a short, bounded afterfire tail; gradual closure, steady power and injected fuel cut do not trigger it. This is an audio fuel-residue approximation, not a new thermal or fuel-film solver, and does not alter torque/power.

The V12 bank mix retains the six-per-cycle exhaust rhythm (RPM/20 Hz per bank) with a fuller low-frequency envelope and less crossfeed. A bore-scaled, explicitly approximate far-bank propagation path stops the low order from disappearing during mono fold-down. Poppet valves produce timed mechanical transients and a damped structural response; radial exposure raises their contribution. Sleeve valves suppress those impacts. Gear drive uses a quieter tone plus broadband contact noise, reducing the old pure-tone whine. Propeller synthesis, RPM, gearing and power calibration are unchanged.

References are linked under **Planes → Real engine sound references**:

- [Pole Position Production, Tiger Moth/Gipsy Major](https://pole.se/product/tiger-moth-dh-82-a-1943/): identifies separate exhaust, engine and distance recordings; a related inline reference rather than an exact Gipsy III or Cirrus recording.
- [Wings Aviation Museum, Merlin XX run](https://www.wingsmuseum.co.uk/video-halifax-ii-jd150-rolls-royce-merlin-xx-engine-run-august-2021/): museum video with Halifax saxophone exhausts, illustrating why the installation must be identified.
- [Infrastructure Recordings, Mable the Merlin](https://www.asoundeffect.com/sound-library/mable-the-merlin/): recordist describes pops on throttle closure; several static microphone perspectives.
- [Aircraft Engine Historical Society sound archive](https://www.enginehistory.org/sounds.shtml): donated radial and Allison recordings; its Hercules notes distinguish sleeve-valve exhaust bark from poppet-valve clatter. Later engine variants are architectural references, not exact interwar recordings.
- [J. C. Bennett, Merlin acoustic analysis, DOI 10.1177/09544100211033403](https://doi.org/10.1177/09544100211033403): supports bank event frequency and cylinder/cycle variability. The subject aircraft was undergoing fault investigation, so its severe high-speed irregularity is not adopted as healthy baseline behaviour.

Reference pages and the published analysis were accessible; direct reference-audio downloads returned 403/406 in this workspace. No recording was imported, sampled or claimed as a measured spectrum match. The numerical reflection, variation, radiation and mechanical coefficients remain acoustic estimates. The catalogue's Kestrel, D-12 and Hispano-Suiza V12s have not been relabelled as Merlins.

`npm run test:plane-audio` checks preserved waveform hashes, all 20 engines with both exhaust paths, texture/cycle variability, bounded throttle-off afterfires, quiet injected overrun, V12 120 Hz bank energy at 2400 RPM including mono, sleeve-valve contrast, block-size independence, profile changes and three sample rates. `test:planes` now covers 30 native worklet renders, adding aircraft inline and V12 configurations. `test:audio` additionally renders four complete aircraft production graphs at high mix settings and checks headroom. These tests verify signal behaviour and stability; they are not a subjective listening certification.

### Rotary and smaller-bank follow-up

The same aircraft combustion variation, exhaust turbulence, mechanical transients and bounded throttle-off afterfire now cover rotating-cylinder engines, V layouts (including editable V4 and V8) and the flat-four example. There is no historical V4 preset in the twenty-engine catalogue; V4 is an editable architecture, not a newly invented historical engine. V engines retain their own cylinder count and bank sequence, including flat-plane versus cross-plane V8. The bank-body and propagation treatment uses those actual events instead of a V12 cadence override. Cars, flat twins and the W source stay unchanged.

Rotary ignition cut clears queued afterfires and inhibits new ones while held. Mechanical rotation and propeller audio continue; combustion fades back in after release, without replaying stored pops. The rotary still uses rotating outlet radiation and now scales its mechanical impact approximation for one versus two valves. This is not a complete historical ignition/fuel-control simulation.

The separate propeller output now carries a short transition tail when changing engine/propeller settings, matching the continuity treatment already used by the other audio outputs. Explicit propeller mute settles to silence; the older four-output API avoids adding that tail twice.

Tests retain the original waveform baselines and explicitly expect changes only for the newly requested aircraft voices. Thirteen additional hashes from commit `6be318f` protect the approved inline/radial/V12 results. Coverage includes both rotary presets during cut and restart, low-speed V4/V8 transients, different V8 cranks, name-independent custom V4 audio, propeller transitions, 39 native worklet renders at three sample rates, and eight complete aircraft graphs at high mix settings. Acoustic coefficients remain estimates; this pass does not change power, torque or propeller flight physics.


### Boats catalogue and marine sound

Open `?section=boats` for 20 fictional game engines with their real historical references, grouped into working singles/twins, paraffin workboats, launch fours/sixes, outboards and aircraft-powered racers. Every entry identifies estimated geometry and RPM. Period availability follows the initial through-1929 catalogue; older surplus engines are included.

The source is driven by cylinder geometry, two/four-stroke cycle and firing intervals. The Kelvin E2/F2 180°/540° rhythm follows the manufacturer's `2-1-0-0` sequence. Early Johnson simultaneous firing assignments remain illustrative pending variant manuals. Port-controlled two-strokes omit the poppet-valve and cam-drive sound layer. The Bolinder uses the museum's 9 hp / 375 RPM reference, with estimated 5 L geometry, high flywheel inertia and a longer blowdown pulse.

Marine exhaust cooling (wet/dry), outlet (above/submerged), enclosure, silencers and pipe lengths are independent installation controls. Water discharge is synthesized by filtering and pressure-driven noise; this is not a measured hydrodynamic model. There are no recordings in the synthesis or name-selected voices. Air-propeller audio is disabled for boats.

Drive adds a fixed-pitch propeller torque proportional to RPM squared, normalized to the selected engine's full-load reference torque. The load coefficient is editable and does not predict hull speed, propeller efficiency, cavitation or thrust. The bench sweep still measures full-load engine output independent of installation load. Rating normalization is a fixed upstream charge coefficient: editing components still changes output. Two-strokes use one cycle per revolution in airflow/event-rate calculations and the corresponding BMEP convention. Hot-bulb and petrol/paraffin thermodynamics remain approximate, with warm operation assumed.

Historical sources are linked in each preset in `src/data/boatEngines.ts`: Powerhouse Bolinder collection; October 1926 Motor Boating Gray advertisement; Bergius-Kelvin E/F/G operating manual; Tahoe Maritime Museum catalogue; AOMCI Johnson history; Kermath restoration account; ACBS Liberty conversion history; Science Museum Miss England I record. The marine Lion is a 1929 racing installation, not the later production Sea Lion. Unknown specifications are documented as estimates, not silently presented as archival measurements.

Validation: `npm run test:boats` covers all 20 ratings, persistence, physical cadence, three sample rates, wet/dry exhaust, mute tails, name independence, flywheel/propeller load and eight native worklet layouts. `npm run test:audio` includes four production marine audio graphs alongside the existing aircraft/car cases. Approved car and aircraft waveform checks remain in their existing suites. These checks establish stable synthesis, not subjective or historical recording accuracy.

### Moving 3D engine workspace

The workspace above the dyno builds a component assembly from the selected configuration. Cylinder count, inline/V/flat/W/radial layout, bore and stroke, crank type, valve gear, injection, intake, headers, induction and intercooler determine the visible parts. Two-strokes omit poppet valves; sleeve-valve and rotating-cylinder examples have their own mechanisms. Radials use shared rear intake and exhaust collectors. Valve-cover style and colour are cosmetic and saved locally for each named engine.

Drag to orbit, right-drag to pan, and scroll or pinch to zoom. Assembled, adjustable cutaway and exploded views share component visibility, click selection and isolation. Freeze and 15-degree stepping affect only the model; Pause simulator pauses the running simulation. Animation defaults to 1/50 speed for inspection, with real time available. Aircraft start/cut commands also drive a visual warm-start approximation. Expand opens a larger workspace; Escape closes it.

The models represent engine architecture, not OEM CAD. Unknown bank angles, firing orders, casting shapes, cam profiles and pipe routing are illustrative. Radial master/articulated rods and sleeve motion are simplified. No visual component changes power or audio calibration. Existing hardware controls remain the source of truth.

Three.js loads separately from the main simulator. Stationary geometry is batched by component and material; moving assemblies retain individual transforms. Pixel ratio is capped at 1.5, offscreen/background rendering pauses, and GPU resources are released when rebuilding or unmounting. WebGL 2 is required; a rendering failure leaves the simulator controls available.

`npm run test:assembly` checks every catalogue configuration for finite slider-crank motion, constant rod length, travel limits, firing at TDC and valve lift bounds, then builds representative layouts and hardware variants with geometry/draw budgets, visibility and cutaway/exploded checks. The existing library, physics, plane and boat suites remain applicable.
