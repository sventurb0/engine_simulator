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

Limitations: generic VE/efficiency and friction models, empirical boost-vs-RPM scheduling, no measured compressor/turbine maps, transient manifold filling, turbo shaft inertia, knock, heat soak or per-engine dyno calibration. Power changes from earlier versions reflect removal of artificial torque support, not verification against a factory rating. Some high-rev modern engines may need individual VE/efficiency calibration.

Validation: `npm run test:physics` checks SI identities, shaft-energy balance, humidity/temperature/altitude trends, fuel blends, mixture/timing effects, intercooling, blower losses, signed acceleration and all factory dyno rows.

Reference definitions:
- [NIST unit conversions](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9)
- [National Academies: SI engine efficiency fundamentals](https://www.nationalacademies.org/read/21744/chapter/17)
- [HP Academy: stoichiometric ratios](https://www.hpacademy.com/assets/Uploads/045852edfc/Stoichiometric-air-to-fuel-ratios-of-common-fuels-Sheet1-3.pdf)
- [Garrett: compressor-map concepts](https://www.garrettmotion.com/knowledge-center-category/oem/expert/)

The empirical efficiency constants and response curves are implementation assumptions, not values prescribed by these sources.
