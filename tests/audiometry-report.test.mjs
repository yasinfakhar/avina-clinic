import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAudiometry, analyzeEar, classifyDegree, canMergeEarDiagnoses } from '../app/audiometry-analysis.ts';
import { composeAudiometryReport, composeEar, audiometryTerminology } from '../app/audiometry-report.ts';
import { audiometryConfig as config } from '../app/audiometry-config.mjs';
const all = n => Object.fromEntries(config.frequencies.map(f => [f, n]));
const ear = (changes = {}, bc) => {
  const ac = { ...all(15), ...changes };
  const cells = values => Object.fromEntries(Object.entries(values).map(([f, value]) => [f, { value: String(value ?? ''), modifier: 'M' }]));
  return { ac: cells(ac), bc: cells(bc ?? ac) };
};
const profile = (changes, bc) => analyzeEar('right', ear(changes, bc));
const high = {4000: 35, 6000: 50, 8000: 55};

test('bilateral normal hearing has no flat-loss shape', () => {
  const p = analyzeAudiometry(ear(), ear());
  assert.equal(p.rightEar.type, 'NORMAL'); assert.equal(p.rightEar.configuration, 'NONE');
  assert.equal(composeAudiometryReport(p), 'Bilateral normal hearing.');
});
test('bilateral symmetrical SNHL combines core diagnosis', () => {
  const p = analyzeAudiometry(ear(all(30)), ear(all(35)));
  assert.equal(p.symmetry, 'SYMMETRICAL'); assert.equal(p.bilateralEligible, true);
  assert.equal(composeAudiometryReport(p), 'Bilateral mild SNHL.');
});
for (const [name, values, shape] of [
  ['mild to severe slope', {125:35,250:35,500:40,1000:45,2000:50,3000:55,4000:60,6000:65,8000:75}, 'SLOPING'],
  ['steep slope', {125:25,250:25,500:25,1000:35,2000:45,3000:60,4000:75,6000:85,8000:90}, 'STEEPLY_SLOPING'],
  ['flat', all(35), 'FLAT'],
  ['rising', {125:65,250:65,500:55,1000:45,2000:35,3000:30,4000:25,6000:25,8000:25}, 'RISING'],
  ['cookie bite', {125:25,250:25,500:30,1000:55,2000:60,3000:30,4000:30,6000:25,8000:25}, 'COOKIE_BITE'],
  ['reverse cookie bite', {125:55,250:55,500:55,1000:30,2000:30,3000:55,4000:55,6000:55,8000:55}, 'REVERSE_COOKIE_BITE'],
]) test(name, () => {
  const p = profile(values);
  assert.equal(p.configuration, shape); assert.equal(p.type, 'SNHL');
  assert.doesNotMatch(composeEar(p), /review required/);
  if (shape === 'SLOPING') { assert.equal(p.degreeFrom,'MILD'); assert.equal(p.degreeTo,'SEVERE'); }
});
test('CHL with normal BC and repeated ABGs including exact limit', () => {
  const p = profile(all(35), all(20));
  assert.equal(p.type, 'CHL'); assert.ok(p.airBoneGapFrequencies.includes(4000));
  assert.equal(composeEar(p), 'mild CHL.');
});
test('mixed loss with repeated gaps', () => {
  const p = profile(all(55), all(35)); assert.equal(p.type,'MIXED');
  assert.equal(composeEar(p),'moderate mixed hearing loss.');
});
test('missing BC never infers type', () => {
  const p = profile(all(50), {}); assert.equal(p.type,'UNKNOWN'); assert.equal(p.confidence,'LOW');
  assert.match(composeEar(p),/type cannot be determined/);
});
test('missing BC at an abnormal supported frequency remains unknown', () => {
  const e = ear(high); delete e.bc[4000]; const p=analyzeEar('right',e);
  assert.equal(p.type,'UNKNOWN'); assert.ok(p.warnings.includes('MISSING_BC'));
});
test('supported 4 kHz BC determines overall high frequency type without 6/8 kHz BC', () => {
  const e=ear(high); delete e.bc[6000]; delete e.bc[8000]; const p=analyzeEar('right',e);
  assert.equal(p.type,'SNHL'); assert.equal(p.frequencyRegion,'HIGH_FREQUENCY');
  assert.equal(composeEar(p),'mild to moderate SNHL at high frequencies.');
});
test('loss only at unsupported BC frequencies infers SNHL', () => {
  assert.equal(profile({6000:35,8000:45}).type,'SNHL');
});
for (const [values, region, phrase] of [
  [{125:45,250:45,500:55}, 'LOW_FREQUENCY', 'low frequencies'],
  [{1000:35,2000:35,3000:35,...high}, 'MID_TO_HIGH', 'mid to high frequencies'],
  [{250:45,500:45,1000:35,2000:30}, 'LOW_TO_MID', 'low to mid frequencies'],
  [{1000:35,2000:40}, 'ISOLATED_FREQUENCY_RANGE', '1\u20132 kHz'],
]) test(`region ${region}`, () => {
  const p=profile(values); assert.equal(p.frequencyRegion,region); assert.ok(composeEar(p).includes(phrase));
});
for (const [frequency, values] of [
  [3000,{2000:25,3000:55,4000:25,6000:25,8000:25}],
  [4000,{2000:20,4000:55,6000:35,8000:25}],
  [6000,{4000:30,6000:55,8000:30}],
]) test(`${frequency} Hz notch`, () => {
  const p=profile(values); assert.equal(p.configuration,'NOTCHED'); assert.equal(p.notchFrequency,frequency);
  assert.ok(p.notchFrequency);
});
test('4 kHz notch works with sparse example C', () => {
  const p=analyzeEar('right',{ac:{2000:20,4000:50,8000:25}});
  assert.equal(p.notchFrequency,4000); assert.equal(p.type,'UNKNOWN'); assert.equal(p.pattern,'ISOLATED_FREQUENCY');
});
test('no notch without recovery data', () => {
  const p=analyzeEar('right',{ac:{2000:20,4000:50}});
  assert.equal(p.notchFrequency,null); assert.equal(p.confidence,'LOW');
});
test('single 4 kHz loss has precise wording, not general slope', () => {
  const p=profile({4000:35}); assert.equal(p.frequencyRegion,'ISOLATED_FREQUENCY'); assert.deepEqual(p.isolatedFrequencies,[4000]);
  assert.equal(composeEar(p),'mild SNHL at 4 kHz.');
});
test('two adjacent 3–4 kHz loss', () => {
  const p=profile({3000:35,4000:45}); assert.deepEqual(p.isolatedFrequencies,[3000,4000]);
  assert.equal(composeEar(p),'mild to moderate SNHL at 3–4 kHz.');
});
test('low frequency ABGs do not redefine primary SNHL', () => {
  const p=profile({...high,250:30,500:30},{...all(15),...high,250:15,500:15});
  assert.equal(p.type,'SNHL'); assert.equal(p.residualAirBoneGap,true);
  assert.deepEqual(p.airBoneGapFrequencies,[250,500]); assert.match(composeEar(p),/gap at low frequency/);
});
test('isolated gap does not establish CHL', () => {
  const p=profile({4000:40},all(15)); assert.equal(p.type,'UNKNOWN'); assert.ok(p.warnings.includes('ISOLATED_ABG'));
});
test('normal low AC gaps remain secondary to high-frequency SNHL', () => {
  const p=profile({...high,250:20,500:20},{...all(15),...high,250:0,500:0});
  assert.equal(p.type,'SNHL'); assert.equal(p.frequencyRegion,'HIGH_FREQUENCY');
  assert.equal(composeEar(p),'mild to moderate SNHL at high frequencies with gap at low frequency.');
});
test('dominant low-frequency gaps are not dismissed as residual', () => {
  const p=profile({125:40,250:40,500:40,4000:35},{...all(15),4000:35});
  assert.equal(p.residualAirBoneGap,false); assert.equal(p.type,'MIXED');
});
test('notch drop and recovery limits are inclusive and configurable', () => {
  const e={ac:{2000:20,4000:40,8000:20}};
  assert.equal(analyzeEar('right',e).notchFrequency,4000);
  assert.equal(analyzeEar('right',e,{...config,notchDifferenceDb:21}).notchFrequency,null);
});
test('flat range boundary is inclusive', () => {
  assert.equal(profile({...all(35),8000:55}).configuration,'FLAT');
});
test('directional and crossing asymmetry remain separate', () => {
  assert.equal(analyzeAudiometry(ear(all(50)),ear(all(30))).symmetry,'RIGHT_WORSE');
  const p=analyzeAudiometry(ear({...all(30),125:55,250:55,500:55}),ear({...all(30),4000:55,6000:55,8000:55}));
  assert.equal(p.symmetry,'ASYMMETRICAL'); assert.equal(p.bilateralEligible,false);
});
test('asymmetry prevents merging otherwise identical categories', () => {
  const p=analyzeAudiometry(ear(all(26)),ear(all(40)));
  assert.equal(p.symmetry,'LEFT_WORSE'); assert.equal(p.bilateralEligible,false); assert.match(composeAudiometryReport(p),/RE:.*\nLE:/);
});
test('one normal ear and one abnormal ear', () => {
  const p=analyzeAudiometry(ear(),ear(high)); assert.equal(p.bilateralEligible,false);
  assert.match(composeAudiometryReport(p),/^RE: Normal hearing\.\nLE: Mild to moderate SNHL/);
});
test('symmetry exact limit and isolated small difference', () => {
  assert.equal(analyzeAudiometry(ear(all(30)),ear(all(40))).symmetry,'SYMMETRICAL');
  assert.equal(analyzeAudiometry(ear(all(30)),ear({...all(30),4000:45})).symmetry,'SYMMETRICAL');
  assert.equal(analyzeAudiometry({ac:{500:20}},{ac:{500:20}}).symmetry,'UNKNOWN');
});
test('missing frequencies and PTA require complete numeric sets', () => {
  const p=analyzeEar('right',{ac:{500:15,1000:15,4000:15}});
  assert.equal(p.pta3,null); assert.equal(p.pta4,null); assert.match(composeEar(p),/available tested frequencies only/);
  assert.equal(analyzeEar('right').type,'UNKNOWN');
});
test('normal PTA does not hide high frequency loss', () => {
  const p=profile(high); assert.equal(p.pta3,15); assert.equal(p.pta4,20); assert.equal(p.status,'HEARING_LOSS');
});
test('NR is explicit, never numeric or used in PTA', () => {
  for (const nr of ['NR',{value:'90',modifier:'NR'}]) {
    const e=ear(); e.ac[500]=nr; const p=analyzeEar('right',e);
    assert.equal(p.pta3,null); assert.equal(p.type,'UNKNOWN'); assert.equal(p.points.find(p=>p.frequency===500).acModifier,'NR');
  }
});
test('irregular configuration lowers only shape confidence', () => {
  const p=profile({500:35,2000:45,8000:35}); assert.equal(p.configuration,'IRREGULAR'); assert.equal(p.configurationConfidence,'LOW');
  assert.doesNotMatch(composeEar(p),/review required/);
});
for (const [value,expected] of [[20,'NORMAL'],[21,'SLIGHT'],[25,'SLIGHT'],[26,'MILD'],[40,'MILD'],[41,'MODERATE'],[55,'MODERATE'],[56,'MODERATELY_SEVERE'],[70,'MODERATELY_SEVERE'],[71,'SEVERE'],[90,'SEVERE'],[91,'PROFOUND'],[null,'UNKNOWN']]) {
  test(`degree boundary ${value}`,()=>assert.equal(classifyDegree(value),expected));
}
test('numeric rules take precedence over inconsistent example A', () => {
  const p=analyzeEar('right',{ac:{250:25,500:30,1000:35,2000:45,4000:65,8000:80},bc:{250:20,500:25,1000:30,2000:40,4000:60}});
  assert.equal(p.degreeFrom,'MILD'); assert.equal(p.degreeTo,'SEVERE'); assert.equal(p.configuration,'STEEPLY_SLOPING');
  assert.equal(p.type,'SNHL'); assert.equal(p.pta3,110/3);
});
test('invalid and conflicting data request review', () => {
  const p=analyzeEar('right',{ac:{500:'bad',1000:130,2000:30},bc:{2000:40}});
  assert.ok(p.warnings.includes('INVALID_THRESHOLD')); assert.ok(p.warnings.includes('CONFLICTING_THRESHOLDS')); assert.equal(p.confidence,'LOW');
});
test('configuration and terminology can be overridden', () => {
  assert.equal(classifyDegree(25,{...config,airConductionNormalMaxDb:25}),'NORMAL');
  const p=analyzeEar('right',ear(all(35),all(20)),{...config,minimumConductivePoints:8}); assert.equal(p.type,'UNKNOWN');
  assert.equal(composeEar(profile(all(35)),{...audiometryTerminology,SNHL:'sensorineural hearing loss'}),'mild sensorineural hearing loss.');
});
test('analysis is deterministic and does not mutate input', () => {
  const e=ear(high); const before=JSON.stringify(e); const p=analyzeAudiometry(e,e);
  assert.deepEqual(analyzeAudiometry(e,e),p); assert.equal(JSON.stringify(e),before);
});

for (const [value, expected] of [[20,'NORMAL'],[25,'NORMAL'],[30,'ABNORMAL']]) test(`BC boundary ${value}`, async () => {
  const {classifyBoneConduction}=await import('../app/audiometry-analysis.ts');
  assert.equal(classifyBoneConduction(value),expected);
});
for (const f of [4000,6000,8000]) test(`isolated ${f} inference`,()=>{
  const p=profile({[f]:40});
  assert.equal(p.type,'SNHL'); assert.equal(p.pattern,'ISOLATED_FREQUENCY');
  assert.deepEqual(p.isolatedFrequencies,[f]); assert.equal(composeEar(p),`mild SNHL at ${f/1000} kHz.`);
});
for (const [a,b] of [[3000,4000],[4000,6000]]) test(`localized ${a}-${b}`,()=>{
  const p=profile({[a]:35,[b]:45}); assert.equal(p.pattern,'ISOLATED_FREQUENCY_RANGE');
  assert.equal(composeEar(p),`mild to moderate SNHL at ${a/1000}–${b/1000} kHz.`);
});
for (const ac of [{2000:15,3000:30,4000:20},{3000:35,4000:70,6000:80},{2000:20,3000:40,4000:30},{3000:35,4000:45,6000:15},{3000:null,4000:50,6000:15},{3000:'NR',4000:50,6000:15}]) test(`no false notch ${JSON.stringify(ac)}`,()=>assert.equal(profile(ac).notchFrequency,null));
test('AC/BC rules independent and configurable',()=>{
  assert.equal(profile(all(35),all(25)).type,'CHL');
  assert.equal(analyzeEar('right',ear(all(35),all(30)),{...config,significantAbgDb:5}).type,'MIXED');
  const p=profile(all(25),all(20)); assert.equal(p.degreeFrom,'SLIGHT'); assert.notEqual(p.type,'CHL');
});
const established={ac:{250:15,500:15,1000:20,2000:40,3000:45,4000:85,6000:95,8000:95},bc:{250:10,500:10,1000:15,2000:35,3000:40,4000:{value:'75',modifier:'NR',limitReason:'EQUIPMENT_MAX_OUTPUT'}}};
test('equipment NR excluded and established SNHL preserved',()=>{
  const p=analyzeEar('right',established), point=p.points.find(p=>p.frequency===4000);
  assert.equal(point.bc,null); assert.equal(point.abg,null); assert.equal(point.bcIsThreshold,false);
  assert.equal(point.bcLimitReason,'EQUIPMENT_MAX_OUTPUT'); assert.equal(p.type,'SNHL');
  assert.equal(p.typeDetermination,'INFERRED_FROM_ESTABLISHED_PATTERN');
  assert.equal(composeEar(p),'mild to profound SNHL at mid to high frequencies.');
});
test('inconsistent evidence with equipment NR stays unknown',()=>{
  const p=analyzeEar('right',{...established,bc:{...established.bc,2000:10}}); assert.equal(p.type,'UNKNOWN');
});
test('localized low gap and isolated 8k retains SNHL',()=>{
  const p=analyzeEar('left',{ac:{250:15,500:10,1000:10,2000:25,4000:20,8000:40},bc:{250:5,500:-5,1000:0,2000:20,4000:15}});
  assert.equal(p.type,'SNHL'); assert.equal(p.typeDetermination,'INFERRED_HIGH_FREQUENCY');
  assert.equal(p.airBoneGapPattern,'LOCALIZED'); assert.equal(p.airBoneGapRegion,'LOW_FREQUENCY');
  assert.equal(composeEar(p),'mild SNHL at 8 kHz with gap at low frequency.');
  assert.ok(p.exactAffectedFrequencies.includes(2000));
});
test('scattered clusters omit forced region',()=>{
  const p=analyzeEar('right',{ac:{250:20,500:20,1000:35,2000:25,3000:45,4000:55,6000:null,8000:55},bc:all(15)});
  assert.equal(p.type,'CHL'); assert.equal(p.frequencyRegion,'NONE'); assert.equal(composeEar(p),'mild to moderate CHL.');
});
test('normal splits clusters while missing bridges',()=>{
  assert.equal(profile({3000:35,4000:15,6000:45,8000:45}).frequencyRegion,'NONE');
  assert.equal(profile({3000:35,4000:null,6000:45,8000:45}).frequencyRegion,'HIGH_FREQUENCY');
});
for (const shape of ['FLAT','SLOPING','STEEPLY_SLOPING','RISING','IRREGULAR','NONE','UNKNOWN']) test(`weak ${shape} allows core merge`,()=>{
  // Shape is deliberately varied by configuration while thresholds and core stay fixed.
  const p=analyzeAudiometry(ear({...all(35),8000:55}),ear({...all(35),8000:55}),{...config,flatRangeDb:0});
  p.leftEar.configuration=shape; p.rightEar.configuration='NONE';
  assert.equal(canMergeEarDiagnoses(p.rightEar,p.leftEar),true);
  p.bilateralEligible=canMergeEarDiagnoses(p.rightEar,p.leftEar);
  assert.equal(composeAudiometryReport(p),'Bilateral mild to moderate SNHL.');
});
test('isolated and broad high losses stay separate',()=>{
  assert.equal(analyzeAudiometry(ear({8000:40}),ear({4000:35,6000:35,8000:40})).bilateralEligible,false);
});
test('configuration uncertainty stays out of comment; degree uncertainty remains visible',()=>{
  const p=profile({500:35,2000:45,8000:35}); assert.equal(p.configurationConfidence,'LOW'); assert.doesNotMatch(composeEar(p),/review/);
  const e=ear(all(35)); e.ac[8000]='NR'; assert.match(composeEar(analyzeEar('right',e)),/degree requires review/);
});

test('exact single 8k regression with optional 3k absent',()=>{
  const p=analyzeEar('right',{ac:{250:15,500:10,1000:20,2000:20,4000:20,6000:20,8000:40},bc:{250:10,500:5,1000:15,2000:15,4000:15}});
  assert.equal(p.type,'SNHL'); assert.equal(p.pattern,'ISOLATED_FREQUENCY'); assert.equal(p.degreeFrom,'MILD');
  assert.equal(composeEar(p),'mild SNHL at 8 kHz.'); assert.equal(p.typeConfidence,'HIGH'); assert.doesNotMatch(composeEar(p),/review/);
});
test('ten dB low gap with high loss supports inference',()=>{
  const p=analyzeEar('right',{ac:{250:0,500:5,1000:10,2000:10,4000:10,6000:20,8000:35},bc:{250:-5,500:-5,1000:5,2000:5,4000:5}});
  assert.equal(p.type,'SNHL'); assert.equal(composeEar(p),'mild SNHL at 8 kHz.');
});
test('only slight low frequency loss remains reportable',()=>{
  const p=profile({250:25}); assert.equal(p.degreeFrom,'SLIGHT'); assert.deepEqual(p.isolatedFrequencies,[250]); assert.match(composeEar(p),/^slight .*250 Hz/);
});
test('unknown type cannot merge into a definitive bilateral diagnosis',()=>{
  const p=profile(all(40),{}); assert.equal(canMergeEarDiagnoses(p,p),false); assert.match(composeEar(p),/type cannot be determined/);
});

test('one SNHL pair does not establish equipment-limit continuation',()=>{
  const p=analyzeEar('right',{...established,bc:{...established.bc,3000:undefined}});
  assert.equal(p.type,'UNKNOWN');
});
test('different strong locations cannot merge despite matching degrees',()=>{
  const p=profile({8000:35}); const q=profile({4000:35,6000:35,8000:35});
  assert.equal(canMergeEarDiagnoses(p,q),false);
});
