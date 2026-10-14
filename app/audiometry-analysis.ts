import { audiometryConfig } from './audiometry-config.mjs';

export type AudiometryConfig = typeof audiometryConfig;
export type AudiogramThreshold = number | string | null | { value: string; modifier: string; limitReason?: 'EQUIPMENT_MAX_OUTPUT' };
export type AudiometryInput = { ac: Record<string, AudiogramThreshold>; bc?: Record<string, AudiogramThreshold> };
export type HearingDegree = 'NORMAL' | 'SLIGHT' | 'MILD' | 'MODERATE' | 'MODERATELY_SEVERE' | 'SEVERE' | 'PROFOUND' | 'UNKNOWN';
export type LossType = 'NORMAL' | 'SNHL' | 'CHL' | 'MIXED' | 'UNKNOWN';
export type Region = 'LOW' | 'MID' | 'HIGH';
export type FrequencyRegion = 'BROAD' | 'LOW_FREQUENCY' | 'MID_FREQUENCY' | 'HIGH_FREQUENCY' | 'MID_TO_HIGH' | 'LOW_TO_MID' | 'ISOLATED_FREQUENCY' | 'ISOLATED_FREQUENCY_RANGE' | 'NONE' | 'UNKNOWN';
export type Warning = 'MISSING_BC' | 'INSUFFICIENT_DATA' | 'NO_RESPONSE_PRESENT' | 'ISOLATED_ABG' | 'BORDERLINE_ABG' | 'REVIEW_REQUIRED' | 'INVALID_THRESHOLD' | 'CONFLICTING_THRESHOLDS' | 'PARTIAL_AC' | 'UNMASKED_ABG' | 'ISOLATED_THRESHOLD';
export type FrequencyPoint = { frequency: number; ac: number | null; bc: number | null; acModifier: string; bcModifier: string; abg: number | null; bcIsThreshold: boolean; bcLimitReason: 'EQUIPMENT_MAX_OUTPUT' | null };
export type EarProfile = {
  ear: 'right' | 'left'; status: 'NORMAL' | 'HEARING_LOSS' | 'UNKNOWN'; type: LossType;
  pattern: 'NORMAL' | 'ISOLATED_FREQUENCY' | 'ISOLATED_FREQUENCY_RANGE' | 'NOTCH' | 'FREQUENCY_REGION' | 'GENERAL_CONFIGURATION';
  typeDetermination: 'DIRECT' | 'INFERRED_HIGH_FREQUENCY' | 'INFERRED_FROM_ESTABLISHED_PATTERN' | 'UNDETERMINED';
  typeConfidence: 'HIGH' | 'LOW'; degreeConfidence: 'HIGH' | 'LOW'; configurationConfidence: 'HIGH' | 'LOW'; frequencyRegionConfidence: 'HIGH' | 'LOW';
  airBoneGapPattern: 'NONE' | 'LOCALIZED' | 'BROAD_CONDUCTIVE_PATTERN'; airBoneGapRegion: FrequencyRegion;
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

export const isAirConductionNormal = (db: number, config = audiometryConfig) => db <= config.airConductionNormalMaxDb;
export const isBoneConductionNormal = (db: number, config = audiometryConfig) => db <= config.boneConductionNormalMaxDb;
export const classifyBoneConduction = (db: number, config = audiometryConfig) => isBoneConductionNormal(db, config) ? 'NORMAL' : 'ABNORMAL';
export function classifyDegree(value: number | null, config = audiometryConfig): HearingDegree {
  if (value === null || !Number.isFinite(value)) return 'UNKNOWN';
  if (isAirConductionNormal(value, config)) return 'NORMAL';
  if (value <= config.airConductionSlightMaxDb) return 'SLIGHT';
  return (config.degrees.filter(d => d.name !== 'SLIGHT').find(d => value <= d.maximum)?.name ?? 'UNKNOWN') as HearingDegree;
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
    const cell = input?.bc?.[frequency];
    const bcLimitReason = typeof cell === 'object' && cell !== null ? cell.limitReason ?? null : null;
    return { frequency, ac, bc, acModifier, bcModifier, abg, bcIsThreshold: bc !== null, bcLimitReason };
  });
  const valid = points.filter(p => p.ac !== null);
  const affected = valid.filter(p => p.ac! > config.airConductionNormalMaxDb);
  // Slight findings remain explicit, but do not widen a dominant mild-or-worse diagnosis.
  const dominant = config.preferMildOrWorseForPrimaryComment && affected.some(p => p.ac! > config.airConductionSlightMaxDb)
    ? affected.filter(p => p.ac! > config.airConductionSlightMaxDb) : affected;
  const fs = dominant.map(p => p.frequency);
  const gaps = points.filter(p => p.abg !== null && p.abg >= config.significantAbgDb);
  const pairs = valid.filter(p => p.bc !== null && p.bc <= p.ac!);
  const abnormalPairs = pairs.filter(p => !isAirConductionNormal(p.ac!, config));
  const sensorineuralPairs = abnormalPairs.filter(p => !isBoneConductionNormal(p.bc!, config) && p.abg! < config.significantAbgDb);
  const meaningfulGaps = abnormalPairs.filter(p => p.abg! >= config.significantAbgDb);
  const broad = meaningfulGaps.length >= config.minimumConductivePoints && meaningfulGaps.length / affected.length > config.maximumResidualGapProportion;
  const modifierGaps = gaps.filter(p => p.abg! >= config.localizedAbgMinDb);
  const residualAirBoneGap = modifierGaps.length > 0 && !broad;
  let type: LossType = 'UNKNOWN';
  let typeDetermination: EarProfile['typeDetermination'] = 'UNDETERMINED';
  const unresolved = affected.filter(p => p.bc === null);
  const highOnlyMissing = unresolved.length > 0 && unresolved.every(p => p.frequency >= 6000);
  const equipmentMissing = unresolved.length > 0 && unresolved.every(p => p.frequency >= 6000 || (p.bcModifier === 'NR' && p.bcLimitReason === 'EQUIPMENT_MAX_OUTPUT'));
  const hasEquipmentLimit = unresolved.some(p => p.bcLimitReason === 'EQUIPMENT_MAX_OUTPUT');
  const established = sensorineuralPairs.length >= config.minimumEstablishedSnhlPoints;
  const nonConductive = meaningfulGaps.length === 0 || (!broad && meaningfulGaps.every(p => !fs.includes(p.frequency) || (region(p.frequency) === 'LOW' && sensorineuralPairs.some(q => region(q.frequency) !== 'LOW'))));
  if (affected.length && !warnings.has('CONFLICTING_THRESHOLDS') && pairs.length >= config.minimumBonePoints) {
    if (broad && unresolved.every(p => p.frequency >= 6000)) type = abnormalPairs.some(p => !isBoneConductionNormal(p.bc!, config)) ? 'MIXED' : 'CHL';
    else if (nonConductive && sensorineuralPairs.length && (!unresolved.length || (equipmentMissing && (!hasEquipmentLimit || established)))) {
      type = 'SNHL';
      typeDetermination = equipmentMissing && hasEquipmentLimit ? 'INFERRED_FROM_ESTABLISHED_PATTERN' : highOnlyMissing ? 'INFERRED_HIGH_FREQUENCY' : 'DIRECT';
    } else if (highOnlyMissing && nonConductive && pairs.every(p => p.abg! < config.significantAbgDb || !fs.includes(p.frequency)) && !meaningfulGaps.some(p => region(p.frequency) === 'HIGH')) {
      type = 'SNHL'; typeDetermination = 'INFERRED_HIGH_FREQUENCY';
    }
    if (type !== 'UNKNOWN' && typeDetermination === 'UNDETERMINED') typeDetermination = 'DIRECT';
  }
  if (affected.length && type === 'UNKNOWN') warnings.add('MISSING_BC');
  if (residualAirBoneGap) warnings.add('ISOLATED_ABG');
  if (gaps.some(p => p.bcModifier !== 'M' && p.bcModifier !== 'MD')) warnings.add('UNMASKED_ABG');
  if (valid.length < config.minimumNormalPoints) warnings.add('INSUFFICIENT_DATA');
  if (config.requiredNormalFrequencies.some(f => !valid.some(p => p.frequency === f))) warnings.add('PARTIAL_AC');
  if (!affected.length && valid.length >= config.minimumNormalPoints && !warnings.has('NO_RESPONSE_PRESENT') && !warnings.has('INVALID_THRESHOLD') && !warnings.has('CONFLICTING_THRESHOLDS')) type = 'NORMAL';
  const status = affected.length ? 'HEARING_LOSS' : type === 'NORMAL' ? 'NORMAL' : 'UNKNOWN';
  const degreeFrom = affected.length ? classifyDegree(Math.min(...dominant.map(p => p.ac!)), config) : type === 'NORMAL' ? 'NORMAL' : 'UNKNOWN';
  const degreeTo = affected.length ? classifyDegree(Math.max(...dominant.map(p => p.ac!)), config) : degreeFrom;
  const regionalAverages = Object.fromEntries((['LOW', 'MID', 'HIGH'] as Region[]).map(r => [r, mean(valid.filter(p => region(p.frequency) === r).map(p => p.ac!))])) as Record<Region, number | null>;
  // Measured recovery splits clusters; absent tests do not prove recovery.
  const clusters: number[][] = [];
  let current: number[] = [];
  for (const point of points) {
    if (fs.includes(point.frequency)) current.push(point.frequency);
    else if (point.ac !== null && current.length) { clusters.push(current); current = []; }
  }
  if (current.length) clusters.push(current);
  const isolatedFrequencies = fs.length === 1 || (fs.length === 2 && clusters.length === 1) ? fs : [];
  if (isolatedFrequencies.length === 1) warnings.add('ISOLATED_THRESHOLD');
  const regions = new Set(dominant.map(p => region(p.frequency)));
  let frequencyRegion: FrequencyRegion = 'NONE';
  if (isolatedFrequencies.length) frequencyRegion = fs.length === 1 ? 'ISOLATED_FREQUENCY' : 'ISOLATED_FREQUENCY_RANGE';
  else if (clusters.length === 1 && regions.size) {
    frequencyRegion = regions.size === 3 || (regions.has('LOW') && regions.has('HIGH')) ? 'BROAD' : regions.size === 2 ? (regions.has('LOW') ? 'LOW_TO_MID' : 'MID_TO_HIGH') : regions.has('LOW') ? 'LOW_FREQUENCY' : regions.has('MID') ? 'MID_FREQUENCY' : 'HIGH_FREQUENCY';
  }
  const acAt = (f: number) => points.find(p => p.frequency === f)?.ac ?? null;
  // Omitted tests are skipped; explicit missing/NR neighbours block confirmation.
  const tested = points.filter(p => input?.ac[p.frequency] !== undefined);
  const notches = tested.filter((p, i) => {
    const before = tested[i - 1]?.ac, after = tested[i + 1]?.ac;
    return config.notchFrequencies.includes(p.frequency) && p.ac !== null && !isAirConductionNormal(p.ac, config)
      && before != null && after != null && p.ac - before >= config.notchDifferenceDb && p.ac - after >= config.notchDifferenceDb;
  }).sort((a, b) => b.ac! - a.ac!);
  const notchFrequency = notches[0]?.frequency ?? null;
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
  if (type === 'UNKNOWN' || degreeFrom === 'UNKNOWN' || points.some(p => p.acModifier === 'NR')) warnings.add('REVIEW_REQUIRED');
  const pta = (frequencies: number[]) => {
    const values = frequencies.map(acAt);
    return values.every(v => v !== null) ? mean(values as number[]) : null;
  };
  return { ear, status, type, typeDetermination,
    pattern: status === 'NORMAL' ? 'NORMAL' : isolatedFrequencies.length === 1 ? 'ISOLATED_FREQUENCY' : isolatedFrequencies.length === 2 ? 'ISOLATED_FREQUENCY_RANGE' : notchFrequency !== null ? 'NOTCH' : !['NONE', 'BROAD'].includes(frequencyRegion) ? 'FREQUENCY_REGION' : 'GENERAL_CONFIGURATION',
    typeConfidence: type === 'UNKNOWN' ? 'LOW' : 'HIGH', degreeConfidence: degreeFrom === 'UNKNOWN' || points.some(p => p.acModifier === 'NR') ? 'LOW' : 'HIGH',
    configurationConfidence: ['UNKNOWN', 'IRREGULAR'].includes(configuration) ? 'LOW' : 'HIGH', frequencyRegionConfidence: frequencyRegion === 'NONE' ? 'LOW' : 'HIGH',
    airBoneGapPattern: broad ? 'BROAD_CONDUCTIVE_PATTERN' : residualAirBoneGap ? 'LOCALIZED' : 'NONE', airBoneGapRegion: modifierGaps.length && modifierGaps.every(p => p.frequency <= config.lowFrequencyGapMaxHz) ? 'LOW_FREQUENCY' : 'NONE', points, degreeFrom, degreeTo, frequencyRegion, isolatedFrequencies,
    exactAffectedFrequencies: affected.map(p => p.frequency), airBoneGapFrequencies: (broad ? gaps : modifierGaps).map(p => p.frequency), residualAirBoneGap,
    configuration, notchFrequency, pta3: pta([500, 1000, 2000]), pta4: pta([500, 1000, 2000, 4000]), regionalAverages,
    confidence: warnings.has('REVIEW_REQUIRED') ? 'LOW' : warnings.size ? 'MEDIUM' : 'HIGH', warnings: [...warnings] };
}

const diagnosisKey = (p: EarProfile) => JSON.stringify([p.status, p.type, p.degreeFrom, p.degreeTo, ['BROAD', 'NONE', 'UNKNOWN'].includes(p.frequencyRegion) ? 'NONE' : p.frequencyRegion, p.isolatedFrequencies, p.pattern === 'NOTCH' ? p.notchFrequency : null, p.airBoneGapPattern === 'LOCALIZED' ? p.airBoneGapFrequencies : []]);

/** Core diagnosis plus strong location modifiers; weak shapes and warnings are excluded. */
export function canMergeEarDiagnoses(right: EarProfile, left: EarProfile): boolean {
  return right.status !== 'UNKNOWN' && right.type !== 'UNKNOWN' && diagnosisKey(right) === diagnosisKey(left);
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
  return { rightEar, leftEar, symmetry, bilateralEligible: symmetry === 'SYMMETRICAL' && rightEar.status !== 'UNKNOWN' && canMergeEarDiagnoses(rightEar, leftEar),
    interauralDifferences: signed.map(p => ({ ...p, differenceDb: Math.abs(p.differenceDb) })), warnings: [...new Set([...rightEar.warnings, ...leftEar.warnings])] };
}
