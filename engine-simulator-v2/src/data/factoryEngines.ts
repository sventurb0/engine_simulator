import type { EnginePreset, SimConfig } from '../EngineSimulatorV2';

// Catalogue identities and nominal capacities. New configurations are illustrative
// petrol-engine setups: square geometry and tuning are estimates, not OEM calibration.
// Shared engine families may appear as distinct named factory applications.
const catalogue = {
  'Saab': `B201 8V|i4|1.985|na|6000
B202 Turbo 16|i4|1.985|turbo|6500
B204R|i4|1.985|turbo|6500
B205R|i4|1.985|turbo|6500
B206i|i4|1.985|na|6500
B207R|i4|1.998|turbo|6500
B234R|i4|2.290|turbo|6500
B235R Aero|i4|2.290|turbo|6500
B308E 3.0t|v6|2.962|turbo|6000
B284R 2.8T|v6|2.792|turbo|6500`,
  'Nissan': `SR20DET|i4|1.998|turbo|7500
Nissan RB26DETT|i6|2.568|turbo|8000
Nissan VG30DETT|v6|2.960|turbo|7000
CA18DET|i4|1.809|turbo|7500
RB20DET|i6|1.998|turbo|7500
RB25DET|i6|2.498|turbo|7000
VQ35DE|v6|3.498|na|6600
VQ37VHR|v6|3.696|na|7500
VR38DETT|v6|3.799|turbo|7100
L28E|i6|2.753|na|6500`,
  'Toyota': `1UZFE|v8|3.968|na|6500
2ZZ-GE|i4|1.796|na|8200
G16E-GTS|i3|1.618|turbo|7200
2JZ-GTE|i6|2.997|turbo|6800
Toyota 4A-GE 20V|i4|1.587|na|8200
Toyota 3S-GTE|i4|1.998|turbo|7200
1JZ-GTE|i6|2.491|turbo|7200
3S-GE BEAMS|i4|1.998|na|7600
1ZZ-FE|i4|1.794|na|6500
2GR-FE|v6|3.456|na|6600`,
  'Mercedes-Benz': `M113 5.0|v8|4.966|na|6200
M275 V12TT|v12|5.513|turbo|6000
AMG M156 6.2|v8|6.208|na|7200
M104 3.2|i6|3.199|na|6500
M111 Kompressor 2.3|i4|2.295|supercharger|6200
M112 3.2|v6|3.199|na|6200
M113K 5.4|v8|5.439|supercharger|6500
M157 5.5 biturbo|v8|5.461|turbo|6500
M177 4.0 biturbo|v8|3.982|turbo|7000
M139 2.0 turbo|i4|1.991|turbo|7200`,
  'Ford': `Ford Cologne V4|v4|1.498|na|6000
Ford Coyote 5.0|v8|4.951|na|7500
Ford Flathead V8|v8|3.622|na|4500
Ford Barra 4.0T|i6|3.984|turbo|6250
Windsor 302|v8|4.942|na|6000
Windsor 351|v8|5.752|na|6000
Pinto 2.0|i4|1.993|na|6200
Cosworth YB 2.0T|i4|1.993|turbo|7000
EcoBoost 2.3|i4|2.261|turbo|6500
Voodoo 5.2|v8|5.163|na|8250`,
  'Dodge': `Viper V10|v10|8.4|na|6400
426 Hemi|v8|6.974|na|6500
Slant Six 225|i6|3.687|na|5000
LA 318|v8|5.212|na|5500
LA 360|v8|5.898|na|5500
440 Magnum|v8|7.206|na|5500
HEMI 5.7|v8|5.654|na|5800
HEMI 6.1|v8|6.059|na|6400
HEMI 6.4|v8|6.417|na|6400
Hellcat 6.2|v8|6.166|supercharger|6200`,
  'Volvo': `Volvo 5 pot|i5|2.319|turbo|6500
B18B|i4|1.778|na|6000
B20B|i4|1.986|na|6000
B21ET|i4|2.127|turbo|6000
B230FT|i4|2.316|turbo|6000
B234F|i4|2.316|na|6500
B5244S|i5|2.435|na|6500
B5254T2|i5|2.521|turbo|6500
B6304S|i6|2.922|na|6500
B8444S|v8|4.414|na|6500`,
  'Honda': `Honda K20A|i4|1.998|na|8400
Honda F20C|i4|1.997|na|9000
Honda B16B|i4|1.595|na|8400
Honda K24A|i4|2.354|na|7200
B16A|i4|1.595|na|8200
B18C Type R|i4|1.797|na|8400
D16Z6|i4|1.590|na|7200
H22A|i4|2.157|na|7500
J35A|v6|3.471|na|6800
K20C1 Type R|i4|1.996|turbo|7000`,
  'Audi': `Audi 2.5 TFSI|i5|2.480|turbo|7000
WR quattro 2.1T|i5|2.144|turbo|6500
3B 2.2 20VT|i5|2.226|turbo|7200
AAN 2.2 20VT|i5|2.226|turbo|7200
AEB 1.8T|i4|1.781|turbo|6800
APB 2.7 biturbo|v6|2.671|turbo|7000
BNS RS4 4.2|v8|4.163|na|8250
BUH RS6 5.0T|v10|4.991|turbo|6700
CREC 3.0 TFSI|v6|2.995|supercharger|7000
R8 5.2 FSI|v10|5.204|na|8700`,
  'Chevrolet': `LS7 7.0|v8|7.011|na|7000
Chevy Small-Block 350|v8|5.733|na|6000
Chevrolet LS3 6.2|v8|6.162|na|6600
Small-Block 283|v8|4.638|na|6000
Big-Block 427 L72|v8|6.997|na|6500
LS1 5.7|v8|5.665|na|6200
LS2 6.0|v8|5.967|na|6500
LS9 6.2 SC|v8|6.162|supercharger|6600
LT1 Gen V 6.2|v8|6.162|na|6600
LT4 6.2 SC|v8|6.162|supercharger|6600`,
  'Ferrari': `Ferrari 458 4.5|v8|4.497|na|9000
308 GTB 2.9|v8|2.927|na|7700
328 GTB 3.2|v8|3.185|na|7700
348 3.4|v8|3.405|na|7800
F355 3.5|v8|3.496|na|8500
360 Modena 3.6|v8|3.586|na|8500
F430 4.3|v8|4.308|na|8500
488 GTB 3.9T|v8|3.902|turbo|8000
550 Maranello 5.5|v12|5.474|na|7700
812 Superfast 6.5|v12|6.496|na|8900`,
  'Porsche': `911 GT3 4.0|flat6|3.996|na|9000
Porsche 930 3.3|flat6|3.299|turbo|6800
911 2.0 (1964)|flat6|1.991|na|6800
911 Carrera RS 2.7|flat6|2.687|na|7300
964 Carrera 3.6|flat6|3.600|na|6800
993 Carrera 3.6|flat6|3.600|na|6800
996 Carrera 3.4|flat6|3.387|na|7200
997 Turbo 3.6|flat6|3.600|turbo|6750
718 Boxster 2.0T|flat4|1.988|turbo|7500
Carrera GT 5.7|v10|5.733|na|8400`,
  'BMW': `BMW M30B35|i6|3.430|na|6200
BMW S54B32|i6|3.246|na|8000
BMW S65 4.0|v8|3.999|na|8400
BMW N54|i6|2.979|turbo|7000
M20B25|i6|2.494|na|6500
S14B23|i4|2.302|na|7300
M50B25|i6|2.494|na|6500
S62B50|v8|4.941|na|7000
S85B50|v10|4.999|na|8250
B58B30|i6|2.998|turbo|7000`,
  'Alfa Romeo': `Alfa Busso 3.0|v6|2.959|na|7000
Twin Cam 1.6|i4|1.570|na|6500
Twin Cam 2.0|i4|1.962|na|6500
Boxer 1.5|flat4|1.490|na|6500
Boxer 1.7 16V|flat4|1.712|na|7000
Twin Spark 1.8 16V|i4|1.747|na|7000
Twin Spark 2.0 16V|i4|1.970|na|7000
Busso 2.5 24V|v6|2.492|na|7000
Busso 3.2 24V|v6|3.179|na|7000
690T 2.9 Quadrifoglio|v6|2.891|turbo|7000`,
  'Mitsubishi': `Mitsubishi 4G63T|i4|1.997|turbo|7500
4G13 1.3|i4|1.298|na|6500
4G15 1.5|i4|1.468|na|6500
4G18 1.6|i4|1.584|na|6500
4G92 MIVEC|i4|1.597|na|8200
4G93 GSR|i4|1.834|turbo|7500
4G64 2.4|i4|2.351|na|6500
4B11T Evo X|i4|1.998|turbo|7600
6A12 MIVEC|v6|1.998|na|8000
6G72 Twin Turbo|v6|2.972|turbo|7000`,
  'Subaru': `Subaru EJ257|flat4|2.457|turbo|6700
EA81|flat4|1.781|na|6000
EA82|flat4|1.781|na|6500
EJ18|flat4|1.820|na|6500
EJ20G|flat4|1.994|turbo|7500
EJ207|flat4|1.994|turbo|8000
EJ22E|flat4|2.212|na|6500
EZ30|flat6|2.999|na|7000
FA20D|flat4|1.998|na|7400
FA24F|flat4|2.387|turbo|6500`,
  'Buick': `Buick 3800 SC|v6|3.791|supercharger|6000
215 Aluminium V8|v8|3.528|na|5500
Nailhead 322|v8|5.277|na|5500
Nailhead 401|v8|6.569|na|5500
350 V8|v8|5.724|na|5500
455 Stage 1|v8|7.468|na|5500
LD5 Grand National|v6|3.791|turbo|5500
LN3 3800|v6|3.791|na|6000
L36 Series II|v6|3.791|na|6000
L32 Series III SC|v6|3.791|supercharger|6000`,
  'Jaguar': `Jaguar AJ133 5.0 SC|v8|5.000|supercharger|6500
XK 3.4|i6|3.442|na|5500
XK 3.8|i6|3.781|na|5500
XK 4.2|i6|4.235|na|5500
V12 5.3|v12|5.343|na|6500
V12 6.0|v12|5.993|na|6500
AJ6 3.6|i6|3.590|na|6000
AJ16 4.0|i6|3.980|na|6000
AJ26 4.0 V8|v8|3.996|na|6500
AJ126 3.0 SC|v6|2.995|supercharger|6500`,
  'Lexus': `Lexus 2UR-GSE|v8|4.969|na|7300
Toyota 1LR-GUE|v10|4.805|na|9000
1UZ-FE LS400|v8|3.968|na|6500
2UZ-FE LX470|v8|4.664|na|6000
3UZ-FE LS430|v8|4.293|na|6500
1UR-FSE LS460|v8|4.608|na|6500
1UR-FE GX460|v8|4.608|na|6000
2GR-FSE IS350|v6|3.456|na|6600
3GR-FSE GS300|v6|2.994|na|6600
8AR-FTS IS200t|i4|1.998|turbo|6000`,
  'McLaren': `McLaren M838T|v8|3.799|turbo|8500
M838TE · 540C|v8|3.799|turbo|8500
M838TE · 570S|v8|3.799|turbo|8500
M838TE · 570GT|v8|3.799|turbo|8500
M838TE · 600LT|v8|3.799|turbo|8500
M838T · 650S|v8|3.799|turbo|8500
M838TL · 675LT|v8|3.799|turbo|8500
M840T · 720S|v8|3.994|turbo|8500
M840T · 765LT|v8|3.994|turbo|8500
M840TR · Senna|v8|3.994|turbo|8500`,
  'Volkswagen': `EA827 1.6 GTI|i4|1.588|na|6500
EV 1.8 GTI|i4|1.781|na|6500
KR 1.8 16V|i4|1.781|na|7200
ABF 2.0 16V|i4|1.984|na|7000
PG G60|i4|1.781|supercharger|6500
AGU 1.8T|i4|1.781|turbo|6800
AXX 2.0 TFSI|i4|1.984|turbo|6800
CCZB 2.0 TSI|i4|1.984|turbo|6800
CHHA 2.0 TSI|i4|1.984|turbo|6800
CJXC Golf R|i4|1.984|turbo|6800`,
  'Renault': `C1J 1.4 GT Turbo|i4|1.397|turbo|6500
F7P 1.8 16V|i4|1.764|na|7200
F7R Clio Williams|i4|1.998|na|6500
F4R Clio 172|i4|1.998|na|7200
F4R Clio 182|i4|1.998|na|7200
F4R Clio 197|i4|1.998|na|7500
F4Rt Megane RS 225|i4|1.998|turbo|6500
K4M 1.6 16V|i4|1.598|na|6500
H4Jt 1.4 TCe|i4|1.397|turbo|6500
M5Pt Megane RS 280|i4|1.798|turbo|7000`,
  'Aston Martin': `DB4 3.7|i6|3.670|na|6000
DB5 4.0|i6|3.995|na|6000
DBS V8 5.3|v8|5.340|na|6500
DB7 3.2 SC|i6|3.228|supercharger|6000
DB7 Vantage 5.9|v12|5.935|na|7000
DB9 5.9|v12|5.935|na|7000
V8 Vantage 4.3|v8|4.282|na|7300
V8 Vantage 4.7|v8|4.735|na|7300
DB11 5.2TT|v12|5.204|turbo|7000
Vantage 4.0TT|v8|3.982|turbo|7000`,
  'Lamborghini': `350 GT 3.5|v12|3.464|na|7000
Miura 3.9|v12|3.929|na|7800
Urraco P250|v8|2.463|na|7800
Jalpa 3.5|v8|3.485|na|7500
Countach 5000 QV|v12|5.167|na|7500
Diablo 5.7|v12|5.707|na|7500
Murcielago 6.2|v12|6.192|na|7800
Gallardo 5.0|v10|4.961|na|8000
Huracan 5.2|v10|5.204|na|8500
Aventador 6.5|v12|6.498|na|8500`,
} as const;

export const manufacturerReferences: Record<string, { label: string; url: string }> = {
  'Toyota': {label:'Toyota engine history',url:'https://www.toyota-global.com/company/history_of_toyota/75years/data/automotive_business/products_technology/technology_development/engines/index.html'},
  'BMW': {label:'BMW M engine history',url:'https://www.bmw-m.com/en/topics/magazine-article-pool/bmw-m-engines.html'},
  'Honda': {label:'Honda engine history',url:'https://global.honda/en/about/history-digest/75years-history/chapter3/section2_8/'},
  'Nissan': {label:'Nissan engine collection',url:'https://www.nissan-global.com/EN/PLANT/assets/images/plantYokohama/yokohama_engine_list_eng.pdf'},
  'Porsche': {label:'Porsche technical specifications',url:'https://newsroom.porsche.com/en_US/media-resources/technical-specifications.html'},
  'Ford': {label:'Ford Performance engine catalogue',url:'https://performanceparts.ford.com/engines/Default.asp'},
  'McLaren': {label:'McLaren 720S specifications',url:'https://cars.mclaren.com/uk_en/legacy/720S'},
  'Mercedes-Benz': {label:'AMG engine families',url:'https://g-class.mercedes-benz.com/en/amg-engines-at-other-manufacturers'},
  'Volvo': {label:'Volvo engine specifications',url:'https://www.volvocars.com/en-ca/support/car/s60/14w46/article/84c655c2aaaa015ac0a801e801c02b97_e0858f0daab0193ac0a801e801aa008d_c9985b0db98fd440c0a801e801f83b64/'},
  'Mitsubishi': {label:'Haltech Mitsubishi technical library',url:'https://support.haltech.com/portal/en/kb/haltech/technical-library/engines/mitsubishi'},
  'Subaru': {label:'Haltech Subaru technical library',url:'https://support.haltech.com/portal/en/kb/haltech/technical-library/engines/subaru'},
  'Alfa Romeo': {label:'Alfa Romeo engine heritage',url:'https://www.media.stellantis.com/uk-en/alfa-romeo/press/revised-alfa-166-in-the-uk'},
  'Jaguar': {label:'Jaguar engineering heritage',url:'https://www.jaguarheritage.com/jaguar-engineering/'},
  'Lexus': {label:'Lexus V8 engine history',url:'https://mag.lexus.co.uk/lexus-v8-engines-all-you-need-to-know/'},
  'Chevrolet': {label:'Chevrolet Performance catalogue',url:'https://www.chevrolet.com/content/dam/chevrolet/na/us/english/index/performance/powertrain/catalog/02-pdf/2024_CP_Catalog_WEB_6-10-24.pdf'},
  'Buick': {label:'GM Buick engine heritage',url:'https://www.gm.com/heritage/collection/buick/1970-buick-gsx'},
  'Dodge': {label:'Dodge engine range',url:'https://www.dodge.com/dodge-muscle.html'},
  'Volkswagen': {label:'Volkswagen GTI engine history',url:'https://www.volkswagen-newsroom.com/en/the-new-golf-gti-edition-50-international-media-drive-20143/the-history-of-the-golf-gti-in-detail-20156'},
  'Renault': {label:'Renault Originals: Clio Williams',url:'https://theoriginals.renault.com/en/clio-williams'},
  'Aston Martin': {label:'Aston Martin past models',url:'https://www.astonmartin.com/en/models/past-models'},
  'Lamborghini': {label:'Lamborghini company history',url:'https://www.lamborghini.com/en-en/history/company'},
  'Audi': {label:'Audi engine history',url:'https://www.audi-mediacenter.com/en/press-releases/50-years-of-the-audi-five-cylinder-16921/download'},
};

const cylinderCounts: Record<string, number> = {i3:3,i4:4,i5:5,i6:6,v4:4,v6:6,flat4:4,flat6:6,v8:8,v10:10,v12:12};
export function expandFactoryPresets(legacy: EnginePreset[]): EnginePreset[] {
  const existing = new Map(legacy.filter(p=>p.group==='factory').map(p=>[p.name,p]));
  const factory: EnginePreset[] = [];
  for (const [manufacturer, text] of Object.entries(catalogue)) {
    for (const line of text.split('\n')) {
      const [name, layout, capacity, aspiration, ceiling] = line.split('|');
      const prior = existing.get(name);
      const litres = Number(capacity), redline = Number(ceiling);
      // Square cylinder geometry preserves nominal capacity; it is not an OEM measurement.
      const dimension = Math.cbrt(litres * 1e6 * 4 / (Math.PI * cylinderCounts[layout]));
      const oldPushrod = ['Buick','Chevrolet','Dodge'].includes(manufacturer) || /Windsor|Flathead/.test(name);
      const flatplane = ['Ferrari','McLaren'].includes(manufacturer) || /Voodoo/.test(name);
      const illustrative: Partial<SimConfig> = {
        engineLayout: layout as SimConfig['engineLayout'], induction: aspiration as SimConfig['induction'],
        bore: dimension, stroke: dimension, redline, compressionRatio: aspiration==='na'?10.5:9.3,
        valvetrainLayout: oldPushrod?'ohv':'dohc', valvesPerCylinder:oldPushrod?2:4,
        v8Crank:flatplane?'flatplane':'crossplane',
        camAggression:redline>=8000?0.7:oldPushrod?0.28:0.42,
        exhaustFlow:redline>=8000?0.65:0.45,topEndFlowBias:0.5,
        vvtMode:'none',liftSystem:'none',intakeType:'plenum',runnerLength:redline>=8000?'short':'medium',
        injectionType:'port',fuelType:'premium',exhaustType:'street',headerType:layout==='flat4'?'unequal':'cast',frictionClass:'normal',
        turboFamily:'small',turboArchitecture:'single',turboBearing:'journal',turbineAR:'medium',
        // Stock-road placeholder envelope; no measured turbo sizing is claimed.
        turboSpoolStartRpm:1200,turboSpoolFullRpm:2800,
        boostControl:0.25,wastegateBasePsi:8,intercoolerType:aspiration==='na'?'none':'small_fmic',
        blowerType:'roots',scBoostCap:8,
      };
      const twoValveSohc = /B201|Pinto|L28E|EA827|EV 1.8|B21ET|B230FT/.test(name);
      const classicOhv = /B18B|B20B|C1J/.test(name);
      if (twoValveSohc) { illustrative.valvetrainLayout='sohc'; illustrative.valvesPerCylinder=2; }
      if (classicOhv) { illustrative.valvetrainLayout='ohv'; illustrative.valvesPerCylinder=2; }
      // Illustrative differences between named applications of a shared family.
      const mclarenBoost: Record<string, number> = {'540C':0.18,'570S':0.24,'570GT':0.24,'600LT':0.32,'650S':0.40,'675LT':0.46,'720S':0.52,'765LT':0.62,'Senna':0.70};
      if (manufacturer==='McLaren') {
        const application=Object.keys(mclarenBoost).find(key=>name.includes(key));
        if (application) illustrative.boostControl=mclarenBoost[application];
        illustrative.headerType='equal'; illustrative.exhaustType='performance';
      }
      if (/Clio 172/.test(name)) illustrative.camAggression=0.52;
      if (/Clio 182/.test(name)) illustrative.camAggression=0.58;
      if (/Clio 197/.test(name)) illustrative.camAggression=0.64;
      factory.push({name,manufacturer,group:'factory',nominalLitres:litres,
        setupKind:prior?'existing':'illustrative',config:prior?.config??illustrative});
      existing.delete(name);
    }
  }
  if (existing.size) throw new Error(`Unassigned factory presets: ${[...existing.keys()].join(', ')}`);
  return [...factory,...legacy.filter(p=>p.group!=='factory')];
}

