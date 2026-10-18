import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEar } from '../app/audiometry-analysis.ts';
import { composeEar } from '../app/audiometry-report.ts';
import { audiometryConfig } from '../app/audiometry-config.mjs';

const normal = () => Object.fromEntries(audiometryConfig.frequencies.map(f => [f, 15]));

test('clinic: AC NR establishes SNHL even when measured thresholds are normal', () => {
  for (const nr of ['NR', { value: '90', modifier: 'NR' }]) {
    const p = analyzeEar('right', { ac: { ...normal(), 500: nr } });
    assert.equal(p.type, 'SNHL');
    assert.equal(p.status, 'HEARING_LOSS');
    assert.equal(p.pta3, null);
    assert.match(composeEar(p), /SNHL/);
    assert.doesNotMatch(composeEar(p), /normal hearing|unknown/i);
  }
});

test('clinic: isolated 6/8 kHz loss establishes SNHL without any BC', () => {
  for (const changes of [{ 6000: 40 }, { 8000: 45 }, { 6000: 40, 8000: 45 }]) {
    const p = analyzeEar('right', { ac: { ...normal(), ...changes } });
    assert.equal(p.type, 'SNHL');
    assert.equal(p.status, 'HEARING_LOSS');
    assert.ok(!p.warnings.includes('MISSING_BC'));
    assert.match(composeEar(p), /SNHL/);
  }
});

test('clinic: BC NR alone does not turn normal AC into SNHL', () => {
  const p = analyzeEar('right', { ac: normal(), bc: { 500: 'NR' } });
  assert.equal(p.type, 'NORMAL');
});
