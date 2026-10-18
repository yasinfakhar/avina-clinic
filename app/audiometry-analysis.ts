import { audiometryConfig } from './audiometry-config.mjs';

export type AudiometryConfig = typeof audiometryConfig;
export type AudiogramThreshold = number | string | null | { value: string; modifier: string };
export type AudiometryInput = { ac: Record<string, AudiogramThreshold>; bc?: Record<string, AudiogramThreshold> };
export type HearingDegree = 'NORMAL' | 'SLIGHT' | 'MILD' | 'MODERATE' | 'MODERATELY_SEVERE' | 'SEVERE' | 'PROFOUND' | 'UNKNOWN';
export type LossType = 'NORMAL' | 'SNHL' | 'CHL' | 'MIXED' | 'UNKNOWN';
export type Region = 'LOW' | 'MID' | 'HIGH';
export type FrequencyRegion = 'BROAD' | 'LOW_FREQUENCY' | 'MID_FREQUENCY' | 'HIGH_FREQUENCY' | 'MID_TO_HIGH' | 'LOW_TO_MID' | 'ISOLATED_FREQUENCY' | 'UNKNOWN';
export type Warning = 'MISSING_BC' | 'INSUFFICIENT_DATA' | 'NO_RESPONSE_PRESENT' | 'ISOLATED_ABG' | 'BORDERLINE_ABG' | 'REVIEW_REQUIRED' | 'INVALID_THRESHOLD' | 'CONFLICTING_THRESHOLDS' | 'PARTIAL_AC' | 'UNMASKED_ABG' | 'ISOLATED_THRESHOLD';
export type PairPattern = 'NONE' | 'SNHL' | 'CHL' | 'MIXED';

export type FrequencyPoint = {
  frequency: number;
  ac: number | null;
  bc: number | null;
  acModifier: string;
  bcModifier: string;
  abg: number | null;
  pairPattern: PairPattern;
};

export type EarProfile = {
  ear: 'right' | 'left';
  status: 'NORMAL' | 'HEARING_LOSS' | 'UNKNOWN';
  type: LossType;
  typeTransition: 'CHL_TO_SNHL' | null;
  points: FrequencyPoint[];
  degreeFrom: HearingDegree;
  degreeTo: HearingDegree;
  frequencyRegion: FrequencyRegion;
  isolatedFrequencies: number[];
  exactAffectedFrequencies: number[];
  airBoneGapFrequencies: number[];
  residualAirBoneGap: boolean;
  configuration: 'FLAT' | 'SLOPING' | 'STEEPLY_SLOPING' | 'RISING' | 'NOTCHED' | 'COOKIE_BITE' | 'REVERSE_COOKIE_BITE' | 'IRREGULAR' | 'NONE' | 'UNKNOWN';
  notchFrequency: number | null;
  pta3: number | null;
  pta4: number | null;
  regionalAverages: Record<Region, number | null>;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  warnings: Warning[];
  deafness: boolean;
};

export type SymmetryClassification = 'SYMMETRICAL' | 'ASYMMETRICAL' | 'RIGHT_WORSE' | 'LEFT_WORSE' | 'UNKNOWN';
export type AudiometryReportProfile = {
  rightEar: EarProfile;
  leftEar: EarProfile;
  symmetry: SymmetryClassification;
  bilateralEligible: boolean;
  interauralDifferences: { frequency: number; differenceDb: number }[];
  warnings: Warning[];
};

// Clinic-specific constants established from the user's reporting workflow.
// AC uses the degree table (20 normal, 21-25 slight). BC <=25 dB is considered normal.
const BC_NORMAL_MAX_DB = 25;
const LOW_GAP_MAX_HZ = 500;
const CORE_SPEECH_FREQUENCIES = [500, 1000, 2000];
const DEAFNESS_SPEECH_FREQUENCIES = [250, 500, 1000, 2000, 4000];

const region = (f: number): Region => f <= 500 ? 'LOW' : f < 3000 ? 'MID' : 'HIGH';
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function classifyDegree(value: number | null, config: AudiometryConfig = audiometryConfig): HearingDegree {
  if (value === null || !Number.isFinite(value)) return 'UNKNOWN';
  if (value <= config.normalThresholdDb) return 'NORMAL';
  return (config.degrees.find(d => value <= d.maximum)?.name ?? 'UNKNOWN') as HearingDegree;
}

const isBcNormal = (value: number | null): boolean => value !== null && value <= BC_NORMAL_MAX_DB;
const isAcAffected = (value: number | null, config: AudiometryConfig): boolean => value !== null && value > config.normalThresholdDb;

function parseThreshold(
  cell: AudiogramThreshold | undefined,
  config: AudiometryConfig,
  warnings: Set<Warning>,
): { threshold: number | null; modifier: string; nrLevel: number | null } {
  const rawValue = typeof cell === 'object' && cell !== null ? cell.value : cell;
  const modifier = typeof cell === 'object' && cell !== null ? String(cell.modifier ?? '').trim().toUpperCase() : '';
  const rawText = rawValue == null ? '' : String(rawValue).trim();
  const isNr = modifier === 'NR' || rawText.toUpperCase() === 'NR';

  if (isNr) {
    warnings.add('NO_RESPONSE_PRESENT');
    const n = Number(rawValue);
    return { threshold: null, modifier: 'NR', nrLevel: Number.isFinite(n) ? n : null };
  }

  if (rawValue == null || rawText === '') return { threshold: null, modifier, nrLevel: null };

  const n = Number(rawValue);
  if (!Number.isFinite(n) || n < config.minimumDb || n > config.maximumDb) {
    warnings.add('INVALID_THRESHOLD');
    return { threshold: null, modifier, nrLevel: null };
  }

  return { threshold: n, modifier, nrLevel: null };
}

function classifyPair(ac: number | null, bc: number | null, abg: number | null, config: AudiometryConfig): PairPattern {
  if (!isAcAffected(ac, config) || bc === null || abg === null) return 'NONE';
  const significantGap = abg >= config.significantAbgDb;
  if (isBcNormal(bc) && significantGap) return 'CHL';
  if (!isBcNormal(bc) && significantGap) return 'MIXED';
  if (!isBcNormal(bc) && !significantGap) return 'SNHL';
  return 'NONE';
}

function buildClusters(measuredFrequencies: number[], affectedFrequencies: Set<number>): number[][] {
  const clusters: number[][] = [];
  let current: number[] = [];
  for (const f of measuredFrequencies) {
    if (affectedFrequencies.has(f)) current.push(f);
    else if (current.length) {
      clusters.push(current);
      current = [];
    }
  }
  if (current.length) clusters.push(current);
  return clusters;
}

export function analyzeEar(ear: 'right' | 'left', input?: AudiometryInput, config: AudiometryConfig = audiometryConfig): EarProfile {
  const warnings = new Set<Warning>();
  const nrAcLevels = new Map<number, number>();

  const points: FrequencyPoint[] = config.frequencies.map(frequency => {
    const acParsed = parseThreshold(input?.ac?.[frequency], config, warnings);
    const bcParsed = config.boneFrequencies.includes(frequency)
      ? parseThreshold(input?.bc?.[frequency], config, warnings)
      : { threshold: null, modifier: '', nrLevel: null };

    if (acParsed.nrLevel !== null) nrAcLevels.set(frequency, acParsed.nrLevel);

    const ac = acParsed.threshold;
    const bc = bcParsed.threshold;
    const abg = ac !== null && bc !== null ? ac - bc : null;

    if (abg !== null && abg < 0) warnings.add('CONFLICTING_THRESHOLDS');
    if (abg !== null && abg >= config.borderlineAbgDb && abg < config.significantAbgDb) warnings.add('BORDERLINE_ABG');

    return {
      frequency,
      ac,
      bc,
      acModifier: acParsed.modifier,
      bcModifier: bcParsed.modifier,
      abg,
      pairPattern: classifyPair(ac, bc, abg, config),
    };
  });

  const validAc = points.filter(p => p.ac !== null);
  const affected = validAc.filter(p => isAcAffected(p.ac, config));

  // Deafness is a special report-level diagnosis in this clinic workflow.
  const speechPoints = points.filter(p => DEAFNESS_SPEECH_FREQUENCIES.includes(p.frequency));
  const nrSpeech = speechPoints.filter(p => p.acModifier === 'NR');
  const nrCore = CORE_SPEECH_FREQUENCIES.filter(f => points.some(p => p.frequency === f && p.acModifier === 'NR'));
  const measuredAc = points.filter(p => p.ac !== null);
  const allMeasuredProfound = measuredAc.length > 0 && measuredAc.every(p => p.ac! > 90);
  const deafness = nrSpeech.length >= 3 && nrCore.length >= 2 && allMeasuredProfound;

  // Degree source: AC=25 remains SLIGHT, especially in LOW frequencies. If a real
  // MILD-or-worse loss exists, isolated SLIGHT points outside LOW should not pull
  // the overall report down to SLIGHT.
  const hasMildOrWorse = affected.some(p => {
    const d = classifyDegree(p.ac, config);
    return !['NORMAL', 'SLIGHT', 'UNKNOWN'].includes(d);
  });
  const reportAffected = hasMildOrWorse
    ? affected.filter(p => classifyDegree(p.ac, config) !== 'SLIGHT' || region(p.frequency) === 'LOW')
    : affected;

  const exactAffectedFrequencies = reportAffected.map(p => p.frequency);

  const gaps = points.filter(p => p.abg !== null && p.abg >= config.significantAbgDb);
  const affectedPairs = points.filter(p => p.pairPattern !== 'NONE');
  const chlEvidence = affectedPairs.filter(p => p.pairPattern === 'CHL');
  const snhlEvidence = affectedPairs.filter(p => p.pairPattern === 'SNHL');
  const mixedEvidence = affectedPairs.filter(p => p.pairPattern === 'MIXED');

  // Localized low-frequency ABG is a modifier when it occurs outside the primary
  // SNHL loss region. It must not turn a high-frequency SNHL into UNKNOWN/MIXED.
  const lowGaps = gaps.filter(p => p.frequency <= LOW_GAP_MAX_HZ);
  const nonLowGaps = gaps.filter(p => p.frequency > LOW_GAP_MAX_HZ);

  // CHL -> SNHL transition: clean conductive evidence at lower frequencies and
  // clean sensorineural evidence at higher frequencies. Later BC NR/missing does
  // not invalidate the transition once established.
  const maxChlFrequency = chlEvidence.length ? Math.max(...chlEvidence.map(p => p.frequency)) : null;
  const minSnhlFrequency = snhlEvidence.length ? Math.min(...snhlEvidence.map(p => p.frequency)) : null;
  const chlToSnhlTransition = chlEvidence.length >= config.minimumConductivePoints
    && snhlEvidence.length >= 1
    && maxChlFrequency !== null
    && minSnhlFrequency !== null
    && maxChlFrequency < minSnhlFrequency;

  // Determine dominant type from measured AC/BC evidence. NR values are excluded.
  let type: LossType = 'UNKNOWN';
  let typeTransition: EarProfile['typeTransition'] = null;

  if (!warnings.has('CONFLICTING_THRESHOLDS') && chlToSnhlTransition) {
    type = 'MIXED';
    typeTransition = 'CHL_TO_SNHL';
  } else if (!warnings.has('CONFLICTING_THRESHOLDS')) {
    const broadGapCount = chlEvidence.length + mixedEvidence.length;

    if (mixedEvidence.length > 0 && broadGapCount >= config.minimumConductivePoints) {
      type = 'MIXED';
    } else if (chlEvidence.length >= config.minimumConductivePoints && snhlEvidence.length === 0 && mixedEvidence.length === 0) {
      type = 'CHL';
    } else if (snhlEvidence.length >= Math.min(2, Math.max(1, config.minimumBonePoints)) && mixedEvidence.length === 0) {
      type = 'SNHL';
    } else if (chlEvidence.length > 0 && snhlEvidence.length > 0) {
      // Mixed cochlear + conductive evidence without a clean low-to-high transition.
      type = 'MIXED';
    }
  }

  const availableBc = points.filter(p => p.bc !== null);
  const highFrequencyReportable = reportAffected.length > 0 && reportAffected.every(p => p.frequency >= 6000);
  const hasAcNr = points.some(p => p.acModifier === 'NR');

  // Clinic reporting rule: AC NR and loss confined to 6/8 kHz establish SNHL.
  // Direct BC at 6/8 kHz is not required or collected in this workflow.
  if (hasAcNr || highFrequencyReportable) {
    type = 'SNHL';
    typeTransition = null;
  }

  // Preserve an already-established SNHL when later BC becomes NR because of
  // equipment output limits.
  if (type === 'UNKNOWN' && snhlEvidence.length >= 2 && mixedEvidence.length === 0 && chlEvidence.length === 0) {
    type = 'SNHL';
  }

  // A single/small low-frequency gap outside a high-frequency SNHL is a modifier.
  const localizedLowGap = lowGaps.length > 0
    && nonLowGaps.length === 0
    && (type === 'SNHL' || highFrequencyReportable)
    && !chlToSnhlTransition;
  const residualAirBoneGap = localizedLowGap;

  if (type === 'UNKNOWN' && affected.length && availableBc.length < config.minimumBonePoints) warnings.add('MISSING_BC');
  if (gaps.length > 0 && gaps.length < config.minimumConductivePoints) warnings.add('ISOLATED_ABG');
  if (gaps.some(p => p.bcModifier !== 'M' && p.bcModifier !== 'MD' && p.bcModifier !== '')) warnings.add('UNMASKED_ABG');
  if (validAc.length < config.minimumNormalPoints) warnings.add('INSUFFICIENT_DATA');
  if (config.requiredNormalFrequencies.some(f => !validAc.some(p => p.frequency === f))) warnings.add('PARTIAL_AC');

  if (!hasAcNr && !affected.length && validAc.length >= config.minimumNormalPoints && !warnings.has('INVALID_THRESHOLD') && !warnings.has('CONFLICTING_THRESHOLDS')) {
    type = 'NORMAL';
  }

  const status: EarProfile['status'] = deafness
    ? 'HEARING_LOSS'
    : affected.length || hasAcNr ? 'HEARING_LOSS'
      : type === 'NORMAL' ? 'NORMAL' : 'UNKNOWN';

  // Degree range with recovery suppression. This affects wording only, not type.
  const rawDegreeSource = reportAffected.length ? reportAffected : affected;
  const degreeRank: Record<HearingDegree, number> = {
    NORMAL: 0, SLIGHT: 1, MILD: 2, MODERATE: 3, MODERATELY_SEVERE: 4, SEVERE: 5, PROFOUND: 6, UNKNOWN: -1,
  };
  const withDegrees = rawDegreeSource.map(p => ({ ...p, degree: classifyDegree(p.ac, config) }));
  const filteredDegrees = withDegrees.filter((p, i, arr) => {
    if (arr.length < 3 || p.degree === 'UNKNOWN') return true;
    const rank = degreeRank[p.degree];
    const prev = arr[i - 1];
    const next = arr[i + 1];

    if (prev && next && degreeRank[prev.degree] >= rank + 1 && degreeRank[next.degree] >= rank + 1) return false;

    if (i === arr.length - 1 && arr.length >= 3) {
      const p1 = arr[i - 1];
      const p2 = arr[i - 2];
      if (degreeRank[p1.degree] >= rank + 1 && degreeRank[p2.degree] >= rank + 1) return false;
    }
    return true;
  });
  const degreeSource = filteredDegrees.length ? filteredDegrees : withDegrees;

  const degreeFrom = degreeSource.length
    ? classifyDegree(Math.min(...degreeSource.map(p => p.ac!)), config)
    : type === 'NORMAL' ? 'NORMAL'
      : nrAcLevels.size ? classifyDegree(Math.min(...nrAcLevels.values()), config) : 'UNKNOWN';

  const measuredWorst = degreeSource.length ? Math.max(...degreeSource.map(p => p.ac!)) : null;
  const nrWorst = nrAcLevels.size ? Math.max(...nrAcLevels.values()) : null;
  const worstForReport = measuredWorst === null ? nrWorst : nrWorst === null ? measuredWorst : Math.max(measuredWorst, nrWorst);
  const degreeTo = worstForReport !== null ? classifyDegree(worstForReport, config) : degreeFrom;

  const regionalAverages = Object.fromEntries((['LOW', 'MID', 'HIGH'] as Region[]).map(r => [
    r,
    mean(validAc.filter(p => region(p.frequency) === r).map(p => p.ac!)),
  ])) as Record<Region, number | null>;

  // Isolated frequency / two-frequency range detection. Edge frequencies (8 kHz)
  // only need a normal measured neighbor on the available side.
  const fs = exactAffectedFrequencies;
  const firstIndex = fs.length ? config.frequencies.indexOf(fs[0]) : -1;
  const lastIndex = fs.length ? config.frequencies.indexOf(fs.at(-1)!) : -1;
  const hasNormalBefore = fs.length > 0 && validAc.some(p => p.frequency < fs[0] && !isAcAffected(p.ac, config));
  const hasNormalAfter = fs.length > 0 && validAc.some(p => p.frequency > fs.at(-1)! && !isAcAffected(p.ac, config));
  const firstMeasured = validAc[0]?.frequency ?? null;
  const lastMeasured = validAc.at(-1)?.frequency ?? null;
  const bounded = fs.length > 0 && (
    (hasNormalBefore && hasNormalAfter)
    || (fs.length === 1 && fs[0] === lastMeasured && hasNormalBefore)
    || (fs.length === 1 && fs[0] === firstMeasured && hasNormalAfter)
  );
  const isolatedFrequencies = fs.length <= 2
    && fs.length > 0
    && (fs.length === 1 || lastIndex - firstIndex === 1)
    && bounded
    ? fs
    : [];
  if (isolatedFrequencies.length === 1) warnings.add('ISOLATED_THRESHOLD');

  // Region detection uses contiguous measured reportable clusters. Measured normal
  // breaks a cluster; missing frequencies do not prove recovery and do not split it.
  const affectedSet = new Set(reportAffected.map(p => p.frequency));
  const measuredSequence = config.frequencies.filter(f => validAc.some(p => p.frequency === f));
  const clusters = buildClusters(measuredSequence, affectedSet);
  const affectedRegions = new Set(reportAffected.map(p => region(p.frequency)));
  const hasAllRegionsMeasured = (['LOW', 'MID', 'HIGH'] as Region[]).every(r => regionalAverages[r] !== null);

  let frequencyRegion: FrequencyRegion = 'UNKNOWN';
  if (isolatedFrequencies.length) frequencyRegion = 'ISOLATED_FREQUENCY';
  else if (clusters.length > 1) frequencyRegion = 'BROAD';
  else if (hasAllRegionsMeasured && affectedRegions.size) {
    if (affectedRegions.size === 3 || (affectedRegions.has('LOW') && affectedRegions.has('HIGH'))) frequencyRegion = 'BROAD';
    else if (affectedRegions.size === 2) frequencyRegion = affectedRegions.has('LOW') ? 'LOW_TO_MID' : 'MID_TO_HIGH';
    else if (affectedRegions.has('LOW')) frequencyRegion = 'LOW_FREQUENCY';
    else if (affectedRegions.has('MID')) frequencyRegion = 'MID_FREQUENCY';
    else frequencyRegion = 'HIGH_FREQUENCY';
  }

  // Strict notch rule: one candidate frequency must be >=20 dB worse than BOTH
  // nearest measured adjacent frequencies. No OR/recovery-only shortcut.
  const acAt = (f: number) => points.find(p => p.frequency === f)?.ac ?? null;
  const measuredAcFrequencies = points.filter(p => p.ac !== null).map(p => p.frequency).sort((a, b) => a - b);
  const notches = [3000, 4000, 6000].filter(f => {
    const at = acAt(f);
    if (at === null || at <= config.normalThresholdDb) return false;
    const idx = measuredAcFrequencies.indexOf(f);
    if (idx <= 0 || idx >= measuredAcFrequencies.length - 1) return false;
    const before = acAt(measuredAcFrequencies[idx - 1]);
    const after = acAt(measuredAcFrequencies[idx + 1]);
    return before !== null && after !== null
      && at - before >= config.notchDifferenceDb
      && at - after >= config.notchDifferenceDb;
  });
  const notchFrequency = notches.length ? notches.sort((a, b) => acAt(b)! - acAt(a)! || a - b)[0] : null;

  let configuration: EarProfile['configuration'] = status === 'NORMAL' ? 'NONE' : 'UNKNOWN';
  const { LOW: low, MID: mid, HIGH: high } = regionalAverages;
  if (affected.length && validAc.length >= config.minimumNormalPoints) {
    const values = validAc.map(p => p.ac!);
    configuration = notchFrequency !== null ? 'NOTCHED'
      : low !== null && mid !== null && high !== null && mid - low >= config.shapeDifferenceDb && mid - high >= config.shapeDifferenceDb ? 'COOKIE_BITE'
      : low !== null && mid !== null && high !== null && low - mid >= config.shapeDifferenceDb && high - mid >= config.shapeDifferenceDb ? 'REVERSE_COOKIE_BITE'
      : Math.max(...values) - Math.min(...values) <= config.flatRangeDb ? 'FLAT'
      : low !== null && high !== null && high - low >= config.steepSlopeDifferenceDb ? 'STEEPLY_SLOPING'
      : low !== null && high !== null && high - low >= config.shapeDifferenceDb ? 'SLOPING'
      : low !== null && high !== null && low - high >= config.shapeDifferenceDb ? 'RISING'
      : 'IRREGULAR';
  }

  // Review warning only when uncertainty affects type/data validity; shape alone is
  // not enough to contaminate an otherwise usable clinical comment.
  if (type === 'UNKNOWN' || warnings.has('INSUFFICIENT_DATA') || warnings.has('INVALID_THRESHOLD') || warnings.has('CONFLICTING_THRESHOLDS')) {
    warnings.add('REVIEW_REQUIRED');
  }

  const pta = (frequencies: number[]) => {
    const values = frequencies.map(acAt);
    return values.every(v => v !== null) ? mean(values as number[]) : null;
  };

  return {
    ear,
    status,
    type,
    typeTransition,
    points,
    degreeFrom,
    degreeTo,
    frequencyRegion,
    isolatedFrequencies,
    exactAffectedFrequencies,
    airBoneGapFrequencies: gaps.map(p => p.frequency),
    residualAirBoneGap,
    configuration,
    notchFrequency,
    pta3: pta([500, 1000, 2000]),
    pta4: pta([500, 1000, 2000, 4000]),
    regionalAverages,
    confidence: deafness ? 'HIGH' : warnings.has('REVIEW_REQUIRED') ? 'LOW' : warnings.size ? 'MEDIUM' : 'HIGH',
    warnings: [...warnings],
    deafness,
  };
}

function strongModifierKey(p: EarProfile): string {
  const localizedRegion = ['LOW_FREQUENCY', 'MID_FREQUENCY', 'HIGH_FREQUENCY', 'MID_TO_HIGH', 'LOW_TO_MID', 'ISOLATED_FREQUENCY'].includes(p.frequencyRegion)
    ? p.frequencyRegion
    : '';
  return JSON.stringify([
    p.deafness,
    p.typeTransition,
    localizedRegion,
    p.isolatedFrequencies,
    p.notchFrequency,
    p.residualAirBoneGap ? p.airBoneGapFrequencies.map(f => f <= LOW_GAP_MAX_HZ ? 'LOW' : f).sort() : [],
  ]);
}

export function analyzeAudiometry(right?: AudiometryInput, left?: AudiometryInput, config: AudiometryConfig = audiometryConfig): AudiometryReportProfile {
  const rightEar = analyzeEar('right', right, config);
  const leftEar = analyzeEar('left', left, config);

  const signed = rightEar.points.flatMap((p, i) => (
    p.ac !== null && leftEar.points[i].ac !== null
      ? [{ frequency: p.frequency, differenceDb: p.ac - leftEar.points[i].ac! }]
      : []
  ));

  const worseRight = signed.filter(p => p.differenceDb > config.symmetryDifferenceDb).length;
  const worseLeft = signed.filter(p => p.differenceDb < -config.symmetryDifferenceDb).length;
  let symmetry: SymmetryClassification = 'UNKNOWN';

  if (signed.length >= config.minimumSymmetryPoints) {
    if ((signed.length - worseRight - worseLeft) / signed.length >= config.symmetryProportion) symmetry = 'SYMMETRICAL';
    else if (worseRight + worseLeft >= config.minimumAsymmetryPoints) {
      symmetry = worseLeft === 0 ? 'RIGHT_WORSE' : worseRight === 0 ? 'LEFT_WORSE' : 'ASYMMETRICAL';
    }
  }

  // Bilateral merge uses the core diagnosis and strong/location-specific modifiers.
  // Weak shape differences (flat/sloping/irregular) do not block a bilateral report.
  const sameCore = rightEar.status === leftEar.status
    && rightEar.type === leftEar.type
    && rightEar.typeTransition === leftEar.typeTransition
    && rightEar.degreeFrom === leftEar.degreeFrom
    && rightEar.degreeTo === leftEar.degreeTo
    && rightEar.deafness === leftEar.deafness;

  const bilateralEligible = symmetry === 'SYMMETRICAL'
    && rightEar.status !== 'UNKNOWN'
    && sameCore
    && strongModifierKey(rightEar) === strongModifierKey(leftEar);

  return {
    rightEar,
    leftEar,
    symmetry,
    bilateralEligible,
    interauralDifferences: signed.map(p => ({ ...p, differenceDb: Math.abs(p.differenceDb) })),
    warnings: [...new Set([...rightEar.warnings, ...leftEar.warnings])],
  };
}
