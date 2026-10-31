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
