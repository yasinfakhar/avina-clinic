import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAudiometry, analyzeEar } from '../app/audiometry-analysis.ts';
import { composeAudiometryReport, composeEar } from '../app/audiometry-report.ts';
import { audiometryConfig } from '../app/audiometry-config.mjs';
const fs = audiometryConfig.frequencies;
function ear(ac = {}, bc = ac) {
  const row = values => Object.fromEntries(fs.map(f => [f, { value: String(values[f] ?? 15), modifier: 'M' }]));
  return { ac: row(ac), bc: row(bc) };
}
const profile = (ac, bc) => analyzeEar('right', ear(ac, bc));
const text = (ac, bc) => composeEar(profile(ac, bc));
const high = {4000:35,6000:50,8000:55};
const all = n => Object.fromEntries(fs.map(f => [f,n]));
test('bilateral normal', () => assert.equal(composeAudiometryReport(analyzeAudiometry(ear(),ear())), 'Bilateral normal hearing.'));
test('unilateral normal', () => assert.match(composeAudiometryReport(analyzeAudiometry(ear(),ear(high))), /RE: Normal hearing/));
test('mild SNHL', () => assert.equal(text(all(35)), 'mild SNHL.'));
test('mild to moderate SNHL', () => assert.match(text({...all(35),2000:50}), /mild to moderate SNHL/));
test('high frequency SNHL', () => assert.equal(text(high), 'mild to moderate SNHL at high frequencies.'));
test('mid to high frequency SNHL', () => assert.match(text({1000:35,2000:35,3000:35,...high}), /mid to high frequencies/));
test('low frequency loss', () => assert.match(text({125:35,250:35,500:35}), /low frequencies/));
test('single 4 kHz regression A', () => assert.match(text({4000:35}), /at 4 kHz/));
test('single 6 kHz', () => assert.match(text({6000:35}), /at 6 kHz/));
test('adjacent 3–4 kHz regressions B/C', () => {
  assert.equal(text({3000:35,4000:35}), 'mild SNHL at 3–4 kHz.');
  assert.match(text({3000:35,4000:50}), /^mild to moderate SNHL at 3–4 kHz/);
});
test('two nonadjacent frequencies regressions D', () => {
  assert.match(text({2000:35,6000:35}), /at 2 and 6 kHz/);
  assert.match(text({4000:35,8000:35}), /at 4 and 8 kHz/);
});
test('CHL repeated gaps', () => assert.equal(profile({250:35,500:35},{}).type,'CHL'));
test('mixed repeated gaps', () => assert.equal(profile({250:55,500:55},{250:35,500:35}).type,'MIXED'));
test('high SNHL plus low normal AC gaps regression E', () => {
  const p = profile({...high,125:20,250:20,500:20},{...high,125:0,250:0,500:0});
  assert.equal(p.type,'SNHL'); assert.match(composeEar(p), /air-bone gap at low frequencies/);
});
test('4 kHz notch', () => assert.deepEqual(profile({4000:40}).notch,[4000]));
test('6 kHz notch', () => assert.deepEqual(profile({4000:30,6000:55,8000:30}).notch,[6000]));
test('sloping configuration', () => assert.equal(profile(Object.fromEntries(fs.map((f,i) => [f,10+i*5]))).configuration,'SLOPING'));
test('rising configuration', () => assert.equal(profile(Object.fromEntries(fs.map((f,i) => [f,60-i*5]))).configuration,'RISING'));
test('flat configuration', () => assert.equal(profile(all(35)).configuration,'FLAT'));
test('cookie bite', () => assert.equal(profile({...all(45),125:15,8000:15}).configuration,'COOKIE_BITE'));
test('different right/left degree', () => assert.equal(analyzeAudiometry(ear(all(35)),ear(all(50))).bilateralEligible,false));
test('equivalent bilateral profiles', () => assert.equal(analyzeAudiometry(ear(all(30)),ear(all(35))).bilateralEligible,true));
test('missing BC regression F', () => {
  const e=ear(all(50)); e.bc={}; const p=analyzeEar('right',e);
  assert.equal(p.type,'UNDETERMINED'); assert.match(composeEar(p),/type cannot be determined/); assert.equal(p.confidence,'LOW');
});
test('partial BC does not infer remaining type', () => {
  const e=ear(high); delete e.bc[6000]; const p=analyzeEar('right',e);
  assert.equal(p.points.find(p => p.frequency===6000).type,'UNDETERMINED'); assert.ok(p.warnings.includes('MISSING_BC'));
});
test('NR is not numeric', () => {
  const e=ear(); e.ac[4000]={value:'90',modifier:'NR'};
  const p=analyzeEar('right',e); assert.equal(p.points.find(p => p.frequency===4000).ac,null); assert.equal(p.type,'UNDETERMINED');
});
test('isolated ABG never confirms conductive loss', () => {
  const p=profile({4000:40},{}); assert.equal(p.type,'UNDETERMINED'); assert.ok(p.warnings.includes('ISOLATED_ABG'));
});
test('borderline ABG', () => assert.ok(profile({250:35},{250:25}).warnings.includes('BORDERLINE_ABG')));
test('irregular preserves discrete frequencies', () => {
  const p=profile({500:35,2000:45,8000:35}); assert.equal(p.configuration,'IRREGULAR'); assert.equal(p.frequencyPattern.kind,'MULTIPLE_DISCRETE_FREQUENCIES');
});
test('all frequency loss omits qualifier', () => assert.equal(text(all(50)),'moderate SNHL.'));
test('normal conventional PTA preserves localized high loss', () => assert.match(text(high),/mild to moderate SNHL at high frequencies/));
test('empty input cannot be normal', () => assert.equal(analyzeEar('right').type,'UNDETERMINED'));
test('invalid and contradictory inputs require review', () => {
  const e=ear(); e.ac[4000].value='37'; e.bc[500].value='40';
  const p=analyzeEar('right',e); assert.ok(p.warnings.includes('INVALID_THRESHOLD')); assert.ok(p.warnings.includes('CONFLICTING_THRESHOLDS'));
});
test('raw input remains unchanged and deterministic', () => {
  const e=ear(high); const before=JSON.stringify(e); const a=analyzeAudiometry(e,e);
  assert.deepEqual(a,analyzeAudiometry(e,e)); assert.equal(JSON.stringify(e),before);
});
test('custom normal threshold and degree boundaries', () => {
  const e=ear(all(25)); const c={...audiometryConfig,normalThresholdDb:20}; assert.equal(analyzeEar('right',e,c).type,'SNHL');
});
test('no notch with missing neighbors', () => {
  const e=ear({4000:40}); delete e.ac[3000]; assert.deepEqual(analyzeEar('right',e).notch,[]);
});


