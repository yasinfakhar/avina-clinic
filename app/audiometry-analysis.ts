import { audiometryConfig } from './audiometry-config.mjs';

export type AudiometryConfig = typeof audiometryConfig;
export type AudiogramThreshold = number | string | null | { value: string; modifier: string };
export type AudiometryInput = { ac: Record<string, AudiogramThreshold>; bc?: Record<string, AudiogramThreshold> };
export type HearingDegree = 'NORMAL' | 'SLIGHT' | 'MILD' | 'MODERATE' | 'MODERATELY_SEVERE' | 'SEVERE' | 'PROFOUND' | 'UNKNOWN';
export type LossType = 'NORMAL' | 'SNHL' | 'CHL' | 'MIXED' | 'UNKNOWN';
export type Region = 'LOW' | 'MID' | 'HIGH';
export type FrequencyRegion = 'BROAD' | 'LOW_FREQUENCY' | 'MID_FREQUENCY' | 'HIGH_FREQUENCY' | 'MID_TO_HIGH' | 'LOW_TO_MID' | 'ISOLATED_FREQUENCY' | 'UNKNOWN';
export type Warning = 'MISSING_BC' | 'INSUFFICIENT_DATA' | 'NO_RESPONSE_PRESENT' | 'ISOLATED_ABG' | 'BORDERLINE_ABG' | 'REVIEW_REQUIRED' | 'INVALID_THRESHOLD' | 'CONFLICTING_THRESHOLDS' | 'PARTIAL_AC' | 'UNMASKED_ABG' | 'ISOLATED_THRESHOLD';
export type FrequencyPoint = { frequency: number; ac: number | null; bc: number | null; acModifier: string; bcModifier: string; abg: number | null };
export type EarProfile = {
  ear: 'right' | 'left'; status: 'NORMAL' | 'HEARING_LOSS' | 'UNKNOWN'; type: LossType;
  points: FrequencyPoint[]; degreeFrom: HearingDegree; degreeTo: HearingDegree;
  frequencyRegion: FrequencyRegion; isolatedFrequencies: number[]; exactAffectedFrequencies: number[];
  airBoneGapFrequencies: number[]; residualAirBoneGap: boolean;
  configuration: 'FLAT' | 'SLOPING' | 'STEEPLY_SLOPING' | 'RISING' | 'NOTCHED' | 'COOKIE_BITE' | 'REVERSE_COOKIE_BITE' | 'IRREGULAR' | 'NONE' | 'UNKNOWN';
  notchFrequency: number | null; pta3: number | null; pta4: number | null;
  regionalAverages: Record<Region, number | null>;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'; warnings: Warning[];
};
export type SymmetryClassification = 'SYMMETRICAL' | 'ASYMMETRICAL' | 'RIGHT_WORSE' | 'LEFT_WORSE' | 'UNKNOWN';
export type AudiometryReportProfile = { rightEar: EarProfile; leftEar: EarProfile; symmetry: SymmetryClassification; bilateralEligible: boolean; interauralDifferences: { frequency: number; differenceDb: number }[]; warnings: Warning[] };
const region = (f: number): Region => f <= 500 ? 'LOW' : f < 3000 ? 'MID' : 'HIGH';
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function classifyDegree(value: number | null, config = audiometryConfig): HearingDegree {
  if (value === null || !Number.isFinite(value)) return 'UNKNOWN';
  if (value <= config.normalThresholdDb) return 'NORMAL';
  return (config.degrees.find(d => value <= d.maximum)?.name ?? 'UNKNOWN') as HearingDegree;
}

export function analyzeEar(ear: 'right' | 'left', input?: AudiometryInput, config: AudiometryConfig = audiometryConfig): EarProfile {
  const warnings = new Set<Warning>();
  const parse = (cell: AudiogramThreshold | undefined): [number | null, string] => {
    const value = typeof cell === 'object' && cell !== null ? cell.value : cell;
    const modifier = typeof cell === 'object' && cell !== null ? cell.modifier : '';
    if (modifier === 'NR' || String(value).trim().toUpperCase() === 'NR') {
      warnings.add('NO_RESPONSE_PRESENT'); return [null, 'NR'];
    }
    if (value == null || String(value).trim() === '') return [null, modifier];
    const n = Number(value);
    if (!Number.isFinite(n) || n < config.minimumDb || n > config.maximumDb) {
      warnings.add('INVALID_THRESHOLD'); return [null, modifier];
    }
    return [n, modifier];
  };
  const points = config.frequencies.map(frequency => {
    const [ac, acModifier] = parse(input?.ac[frequency]);
    const [bc, bcModifier] = config.boneFrequencies.includes(frequency) ? parse(input?.bc?.[frequency]) : [null, ''] as const;
    const abg = ac !== null && bc !== null ? ac - bc : null;
    if (abg !== null && abg < 0) warnings.add('CONFLICTING_THRESHOLDS');
    if (abg !== null && abg >= config.borderlineAbgDb && abg < config.significantAbgDb) warnings.add('BORDERLINE_ABG');
    return { frequency, ac, bc, acModifier, bcModifier, abg };
  });
  const valid = points.filter(p => p.ac !== null);
  const affected = valid.filter(p => p.ac! > config.normalThresholdDb);
  const fs = affected.map(p => p.frequency);
  const gaps = points.filter(p => p.abg !== null && p.abg >= config.significantAbgDb);
  const pairs = valid.filter(p => p.bc !== null && p.bc <= p.ac!);
  const abnormalPairs = pairs.filter(p => p.ac! > config.normalThresholdDb);
  const missingRequiredBone = affected.some(p => config.boneFrequencies.includes(p.frequency) && p.bc === null);
  const sensorineuralPairs = abnormalPairs.filter(p => p.bc! > config.normalThresholdDb && p.abg! < config.significantAbgDb);
  // Low-frequency gaps must not redefine separately supported mid/high-frequency SNHL.
  const meaningfulGaps = abnormalPairs.filter(p => p.abg! >= config.significantAbgDb);
  const residualAirBoneGap = gaps.length > 0 && gaps.every(p => region(p.frequency) === 'LOW') && sensorineuralPairs.some(p => region(p.frequency) !== 'LOW') && meaningfulGaps.length / affected.length <= config.maximumResidualGapProportion;
  let type: LossType = 'UNKNOWN';
  if (affected.length && !warnings.has('CONFLICTING_THRESHOLDS') && !missingRequiredBone && pairs.length >= config.minimumBonePoints && abnormalPairs.length) {
    if (meaningfulGaps.length >= config.minimumConductivePoints && !residualAirBoneGap) {
      type = abnormalPairs.some(p => p.bc! > config.normalThresholdDb) ? 'MIXED' : 'CHL';
    } else if (sensorineuralPairs.length && (meaningfulGaps.length === 0 || residualAirBoneGap)) type = 'SNHL';
  }
  if (affected.length && (missingRequiredBone || pairs.length < config.minimumBonePoints || !abnormalPairs.length)) warnings.add('MISSING_BC');
  if (gaps.length && meaningfulGaps.length < config.minimumConductivePoints) warnings.add('ISOLATED_ABG');
  if (gaps.some(p => p.bcModifier !== 'M' && p.bcModifier !== 'MD')) warnings.add('UNMASKED_ABG');
  if (valid.length < config.minimumNormalPoints) warnings.add('INSUFFICIENT_DATA');
  if (config.requiredNormalFrequencies.some(f => !valid.some(p => p.frequency === f))) warnings.add('PARTIAL_AC');
  if (!affected.length && valid.length >= config.minimumNormalPoints && !warnings.has('NO_RESPONSE_PRESENT') && !warnings.has('INVALID_THRESHOLD') && !warnings.has('CONFLICTING_THRESHOLDS')) type = 'NORMAL';
  const status = affected.length ? 'HEARING_LOSS' : type === 'NORMAL' ? 'NORMAL' : 'UNKNOWN';
  const degreeFrom = affected.length ? classifyDegree(Math.min(...affected.map(p => p.ac!)), config) : type === 'NORMAL' ? 'NORMAL' : 'UNKNOWN';
  const degreeTo = affected.length ? classifyDegree(Math.max(...affected.map(p => p.ac!)), config) : degreeFrom;
  const regionalAverages = Object.fromEntries((['LOW', 'MID', 'HIGH'] as Region[]).map(r => [r, mean(valid.filter(p => region(p.frequency) === r).map(p => p.ac!))])) as Record<Region, number | null>;
  // Missing frequencies are never treated as measured normal surroundings.
  const first = config.frequencies.indexOf(fs[0]);
  const last = config.frequencies.indexOf(fs.at(-1)!);
  const bounded = valid.some(p => p.frequency < fs[0] && p.ac! <= config.normalThresholdDb) && valid.some(p => p.frequency > fs.at(-1)! && p.ac! <= config.normalThresholdDb);
  const isolatedFrequencies = fs.length <= 2 && fs.length > 0 && (fs.length === 1 || last - first === 1) && bounded ? fs : [];
  if (isolatedFrequencies.length === 1) warnings.add('ISOLATED_THRESHOLD');
  const regions = new Set(affected.map(p => region(p.frequency)));
  const hasAllRegions = (['LOW', 'MID', 'HIGH'] as Region[]).every(r => regionalAverages[r] !== null);
  let frequencyRegion: FrequencyRegion = 'UNKNOWN';
  if (isolatedFrequencies.length) frequencyRegion = 'ISOLATED_FREQUENCY';
  else if (hasAllRegions && regions.size) {
    frequencyRegion = regions.size === 3 || (regions.has('LOW') && regions.has('HIGH')) ? 'BROAD' : regions.size === 2 ? (regions.has('LOW') ? 'LOW_TO_MID' : 'MID_TO_HIGH') : regions.has('LOW') ? 'LOW_FREQUENCY' : regions.has('MID') ? 'MID_FREQUENCY' : 'HIGH_FREQUENCY';
  }
  const acAt = (f: number) => points.find(p => p.frequency === f)?.ac ?? null;
  const notches = [3000, 4000, 6000].filter(f => {
    const before = acAt(f === 6000 ? 4000 : 2000);
    const after = acAt(f === 3000 ? 4000 : 8000);
    const at = acAt(f);
    return at !== null && at > config.normalThresholdDb && before !== null && after !== null && at - before >= config.notchDifferenceDb && at - after >= config.notchRecoveryDb;
  }).sort((a, b) => acAt(b)! - acAt(a)! || a - b);
  const notchFrequency = notches[0] ?? null;
  let configuration: EarProfile['configuration'] = status === 'NORMAL' ? 'NONE' : 'UNKNOWN';
  const { LOW: low, MID: mid, HIGH: high } = regionalAverages;
  if (affected.length && valid.length >= config.minimumNormalPoints) {
    const values = valid.map(p => p.ac!);
    configuration = notchFrequency !== null ? 'NOTCHED'
      : low !== null && mid !== null && high !== null && mid - low >= config.shapeDifferenceDb && mid - high >= config.shapeDifferenceDb ? 'COOKIE_BITE'
      : low !== null && mid !== null && high !== null && low - mid >= config.shapeDifferenceDb && high - mid >= config.shapeDifferenceDb ? 'REVERSE_COOKIE_BITE'
      : Math.max(...values) - Math.min(...values) <= config.flatRangeDb ? 'FLAT'
      : low !== null && high !== null && high - low >= config.steepSlopeDifferenceDb ? 'STEEPLY_SLOPING'
      : low !== null && high !== null && high - low >= config.shapeDifferenceDb ? 'SLOPING'
      : low !== null && high !== null && low - high >= config.shapeDifferenceDb ? 'RISING' : 'IRREGULAR';
  }
  if (type === 'UNKNOWN' || configuration === 'IRREGULAR' || warnings.has('INSUFFICIENT_DATA') || warnings.has('NO_RESPONSE_PRESENT') || warnings.has('INVALID_THRESHOLD') || warnings.has('CONFLICTING_THRESHOLDS')) warnings.add('REVIEW_REQUIRED');
  const pta = (frequencies: number[]) => {
    const values = frequencies.map(acAt);
    return values.every(v => v !== null) ? mean(values as number[]) : null;
  };
  return { ear, status, type, points, degreeFrom, degreeTo, frequencyRegion, isolatedFrequencies,
    exactAffectedFrequencies: fs, airBoneGapFrequencies: gaps.map(p => p.frequency), residualAirBoneGap,
    configuration, notchFrequency, pta3: pta([500, 1000, 2000]), pta4: pta([500, 1000, 2000, 4000]), regionalAverages,
    confidence: warnings.has('REVIEW_REQUIRED') ? 'LOW' : warnings.size ? 'MEDIUM' : 'HIGH', warnings: [...warnings] };
}

export function analyzeAudiometry(right?: AudiometryInput, left?: AudiometryInput, config = audiometryConfig): AudiometryReportProfile {
  const rightEar = analyzeEar('right', right, config);
  const leftEar = analyzeEar('left', left, config);
  const signed = rightEar.points.flatMap((p, i) => p.ac !== null && leftEar.points[i].ac !== null ? [{ frequency: p.frequency, differenceDb: p.ac - leftEar.points[i].ac! }] : []);
  const worseRight = signed.filter(p => p.differenceDb > config.symmetryDifferenceDb).length;
  const worseLeft = signed.filter(p => p.differenceDb < -config.symmetryDifferenceDb).length;
  let symmetry: SymmetryClassification = 'UNKNOWN';
  if (signed.length >= config.minimumSymmetryPoints) {
    if ((signed.length - worseRight - worseLeft) / signed.length >= config.symmetryProportion) symmetry = 'SYMMETRICAL';
    else if (worseRight + worseLeft >= config.minimumAsymmetryPoints) symmetry = worseLeft === 0 ? 'RIGHT_WORSE' : worseRight === 0 ? 'LEFT_WORSE' : 'ASYMMETRICAL';
  }
  const key = (p: EarProfile) => JSON.stringify([p.status, p.type, p.degreeFrom, p.degreeTo, p.configuration, p.frequencyRegion, p.isolatedFrequencies, p.notchFrequency, p.airBoneGapFrequencies, p.residualAirBoneGap, p.warnings]);
  return { rightEar, leftEar, symmetry, bilateralEligible: symmetry === 'SYMMETRICAL' && rightEar.status !== 'UNKNOWN' && key(rightEar) === key(leftEar),
    interauralDifferences: signed.map(p => ({ ...p, differenceDb: Math.abs(p.differenceDb) })), warnings: [...new Set([...rightEar.warnings, ...leftEar.warnings])] };
}
