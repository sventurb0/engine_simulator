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
