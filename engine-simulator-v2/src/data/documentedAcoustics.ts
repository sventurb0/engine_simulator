import type { SimConfig } from "../EngineSimulatorV2";
// Evidence is kept at the preset boundary. The DSP only sees components.
// Do not invent installation-specific pipe lengths, chamber volumes or AGU cam timings.
export const documentedAcoustics: {name:string;base:string;evidence:string;source:string;overrides:Partial<SimConfig>}[] = [
  {name:"VW AGU 1.8T · documented",base:"AGU 1.8T",
    evidence:"AGU: 81 × 86.4 mm, 9.5:1, five valves, port injection; belt driving exhaust cam and short chain driving intake cam. SSP 23 covers the shared Octavia AGU engine, not Golf-specific exhaust dimensions. Cam events remain unknown.",
    source:"https://www.vag-technique.fr/ext_files/ssp/skoda/SSP_023_Moteurs_%C3%A0_essence_1,8_l110_kW_et_1,8_l92_kW.pdf",
    overrides:{bore:81,stroke:86.4,compressionRatio:9.5,valvesPerCylinder:5,valvetrainLayout:"dohc",vvtMode:"none",camDrive:"belt_chain",injectionType:"port",airCleaner:"airbox",catalyst:"stock"}},
  {name:"Saab B204L · documented",base:"B204R",
    evidence:"B204L MY1994 valve events: inlet 14° BTDC / 46° ABDC, exhaust 44° BBDC / 16° ATDC; 8.65 mm lift. WIS does not state checking lift. This is a separate B204L acoustic comparison; inherited boost settings are illustrative, not a B204L output calibration.",
    source:"https://saabwisonline.com/900/1998/2-engine/basic-engine-4-cylinder/technical-data/camshafts",
    overrides:{camDrive:"chain",vvtMode:"none",airCleaner:"airbox",valveEvents:{inletOpen:14,inletClose:46,exhaustOpen:44,exhaustClose:16,inletLiftMm:8.65,exhaustLiftMm:8.65}}},
  {name:"Nissan S14 SR20DET · documented",base:"SR20DET",
    evidence:"S14 manual EM-77: 240° intake/exhaust duration, 9.2 mm lift; inlet opens 6° ATDC and closes 66° ABDC, exhaust opens 53° BBDC and closes 7° ATDC. EC-28 shows 20° intake advance and overlap changing 1° → 21°. Auto is a warm loaded-sweep approximation of ECU control.",
    source:"https://www.eatsleepboost.lt/files/manuals/s14_200sx_sr20det_repair_manual.pdf",
    overrides:{camDrive:"chain",vvtMode:"intake",airCleaner:"airbox",intakeCamAdvanceDeg:20,acousticVtcMode:"auto",valveEvents:{inletOpen:-6,inletClose:66,exhaustOpen:53,exhaustClose:7,inletLiftMm:9.2,exhaustLiftMm:9.2}}}
];
