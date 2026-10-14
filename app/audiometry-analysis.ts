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
  deafness: boolean;
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

  // Clinic rule: classify an ear as Deafness when AC shows widespread no-response
  // across the speech-frequency range and every remaining measurable AC threshold
  // is already in the profound range. This is intentionally conservative so that
  // a few isolated NR points do not turn an otherwise classifiable audiogram into
  // "Deafness".
  const speechRangeFrequencies = new Set([250, 500, 1000, 2000, 4000]);
  const acNrSpeechPoints = points.filter(p => speechRangeFrequencies.has(p.frequency) && p.acModifier === 'NR');
  const measuredSpeechAc = points.filter(p => speechRangeFrequencies.has(p.frequency) && p.ac !== null);
  const measuredAllAc = points.filter(p => p.ac !== null);
  const nrIncludesCoreSpeech = [500, 1000, 2000].filter(f => points.some(p => p.frequency === f && p.acModifier === 'NR')).length >= 2;
  const allMeasuredAcProfound = measuredAllAc.length > 0 && measuredAllAc.every(p => p.ac! > 90);
  const deafness = acNrSpeechPoints.length >= 3 && nrIncludesCoreSpeech && allMeasuredAcProfound;

  const affected = valid.filter(p => p.ac! > config.normalThresholdDb);

  // Clinic reporting rule:
  // AC=25 dB is SLIGHT and must remain meaningful, especially at low frequencies.
  // However, when a clear MILD-or-worse loss exists, an isolated/non-low SLIGHT point
  // inside the mid/high-frequency pattern must not pull the reported degree down to SLIGHT.
  // Example: 2k=30, 4k=25, 6k=45, 8k=45 -> report MILD to MODERATE,
  // not SLIGHT to MODERATE. Low-frequency SLIGHT points (250/500 Hz) are preserved.
  const hasMildOrWorse = affected.some(p => {
    const d = classifyDegree(p.ac, config);
    return !['NORMAL', 'SLIGHT', 'UNKNOWN'].includes(d);
  });
  const reportAffected = hasMildOrWorse
    ? affected.filter(p => classifyDegree(p.ac, config) !== 'SLIGHT' || region(p.frequency) === 'LOW')
    : affected;
  const fs = reportAffected.map(p => p.frequency);
  const gaps = points.filter(p => p.abg !== null && p.abg >= config.significantAbgDb);
  const pairs = valid.filter(p => p.bc !== null && p.bc <= p.ac!);
  const abnormalPairs = pairs.filter(p => p.ac! > config.normalThresholdDb);
  const missingRequiredBone = affected.some(p => config.boneFrequencies.includes(p.frequency) && p.bc === null);
  const sensorineuralPairs = abnormalPairs.filter(p => p.bc! > config.normalThresholdDb && p.abg! < config.significantAbgDb);
  const availableBone = points.filter(p => p.bc !== null);
  const hasBroadConductiveEvidence = abnormalPairs.filter(p => p.abg! >= config.significantAbgDb).length >= config.minimumConductivePoints;
  const highFrequencyOnlyWithoutDirectBone = reportAffected.length > 0
    && reportAffected.every(p => p.frequency >= 6000)
    && reportAffected.some(p => !config.boneFrequencies.includes(p.frequency) || p.bc === null);
  const availableBoneSupportsNonConductivePattern = availableBone.length >= config.minimumBonePoints
    && availableBone.every(p => p.bc! <= 25 || (p.ac !== null && p.ac > config.normalThresholdDb && p.abg !== null && p.abg < config.significantAbgDb));
  // Low-frequency gaps must not redefine separately supported mid/high-frequency SNHL.
  const meaningfulGaps = abnormalPairs.filter(p => p.abg! >= config.significantAbgDb);

  // A localized low-frequency ABG is a modifier, not a reason to destroy an
  // otherwise supported high-frequency SNHL pattern. Keep this separate from
  // broad conductive evidence. In this clinic, 250/500 Hz are the low-frequency
  // ABG region used for wording such as "with gap at low frequency".
  const lowFrequencyGaps = gaps.filter(p => p.frequency <= 500);
  const nonLowGaps = gaps.filter(p => p.frequency > 500);
  const localizedLowFrequencyGap = lowFrequencyGaps.length > 0
    && nonLowGaps.length === 0
    && highFrequencyOnlyWithoutDirectBone;

  let residualAirBoneGap = gaps.length > 0
    && gaps.every(p => region(p.frequency) === 'LOW')
    && sensorineuralPairs.some(p => region(p.frequency) !== 'LOW')
    && meaningfulGaps.length / Math.max(affected.length, 1) <= config.maximumResidualGapProportion;

  // Determine ear-level type from VALID measured AC/BC pairs only. Missing or NR
  // BC at later/severe frequencies must not erase a type that is already clearly
  // established by the remaining measured frequencies. BC <=25 dB is considered
  // normal by the clinic; BC >25 dB is abnormal.
  const snhlEvidence = abnormalPairs.filter(p => p.bc! > 25 && p.abg! < config.significantAbgDb);
  const chlEvidence = abnormalPairs.filter(p => p.bc! <= 25 && p.abg! >= config.significantAbgDb);
  const mixedEvidence = abnormalPairs.filter(p => p.bc! > 25 && p.abg! >= config.significantAbgDb);
  const typeEvidenceCount = snhlEvidence.length + chlEvidence.length + mixedEvidence.length;
  const minimumTypeEvidence = Math.max(2, Math.min(config.minimumBonePoints, abnormalPairs.length));

  let type: LossType = 'UNKNOWN';
  if (affected.length && !warnings.has('CONFLICTING_THRESHOLDS') && typeEvidenceCount >= minimumTypeEvidence) {
    // Prefer a clear dominant pattern. This specifically handles severe/profound
    // SNHL where BC becomes NR at the audiometer output ceiling.
    const evidence = [
      ['SNHL', snhlEvidence.length],
      ['CHL', chlEvidence.length],
      ['MIXED', mixedEvidence.length],
    ] as const;
    const sortedEvidence = [...evidence].sort((a, b) => b[1] - a[1]);
    const [dominantType, dominantCount] = sortedEvidence[0];
    const secondCount = sortedEvidence[1][1];

    if (dominantCount >= minimumTypeEvidence && dominantCount > secondCount) {
      type = dominantType;
    } else if (meaningfulGaps.length >= config.minimumConductivePoints && !residualAirBoneGap) {
      type = abnormalPairs.some(p => p.bc! > 25) ? 'MIXED' : 'CHL';
    } else if (snhlEvidence.length >= minimumTypeEvidence && (meaningfulGaps.length === 0 || residualAirBoneGap)) {
      type = 'SNHL';
    }
  }

  // Clinic rule: BC up to and including 25 dB HL is NORMAL. If all usable
  // abnormal AC/BC pairs that carry type evidence are conductive (normal BC +
  // significant ABG), classify the ear as CHL. Missing BC at later/high
  // frequencies must not convert this pattern to MIXED or UNKNOWN.
  if (type === 'UNKNOWN'
      && chlEvidence.length >= config.minimumConductivePoints
      && mixedEvidence.length === 0
      && snhlEvidence.length === 0
      && !warnings.has('CONFLICTING_THRESHOLDS')) {
    type = 'CHL';
  }

  // Clinic rule for 6/8 kHz loss: BC is commonly unavailable at these exact
  // frequencies. If the reportable loss is confined to 6/8 kHz and the
  // available BC data show no broad conductive pattern, infer SNHL instead of
  // returning UNKNOWN merely because direct BC is unavailable at the affected
  // high frequency.
  if (type === 'UNKNOWN'
      && highFrequencyOnlyWithoutDirectBone
      && availableBoneSupportsNonConductivePattern
      && !hasBroadConductiveEvidence
      && !warnings.has('CONFLICTING_THRESHOLDS')) {
    type = 'SNHL';
  }

  // If the primary loss is an inferred/established high-frequency SNHL and the
  // only significant conductive finding is a localized low-frequency ABG, keep
  // SNHL as the ear-level type and expose the low-frequency gap as a modifier.
  if (type === 'SNHL' && localizedLowFrequencyGap) {
    residualAirBoneGap = true;
  }
  // Keep a missing-BC warning only when it actually prevents a confident type
  // decision. A single NR/missing BC point should not downgrade a type that is
  // already supported by enough other comparable frequencies.
  if (affected.length && type === 'UNKNOWN'
      && (pairs.length < config.minimumBonePoints || !abnormalPairs.length || missingRequiredBone)) {
    warnings.add('MISSING_BC');
  }
  if (gaps.length && meaningfulGaps.length < config.minimumConductivePoints) warnings.add('ISOLATED_ABG');
  if (gaps.some(p => p.bcModifier !== 'M' && p.bcModifier !== 'MD')) warnings.add('UNMASKED_ABG');
  if (valid.length < config.minimumNormalPoints) warnings.add('INSUFFICIENT_DATA');
  if (config.requiredNormalFrequencies.some(f => !valid.some(p => p.frequency === f))) warnings.add('PARTIAL_AC');
  if (!affected.length && valid.length >= config.minimumNormalPoints && !warnings.has('NO_RESPONSE_PRESENT') && !warnings.has('INVALID_THRESHOLD') && !warnings.has('CONFLICTING_THRESHOLDS')) type = 'NORMAL';
  const status = affected.length ? 'HEARING_LOSS' : type === 'NORMAL' ? 'NORMAL' : 'UNKNOWN';

  // Clinic reporting rule for the DEGREE RANGE:
  // Do not let a single better/recovered threshold inside an otherwise clearly
  // poorer contiguous loss pull degreeFrom down by one or more categories.
  // Examples from clinic style:
  //   2k=50, 3k=50, 4k=60, 6k=40, 8k=60
  //     -> report MODERATE to MODERATELY_SEVERE (ignore the isolated 6k recovery)
  //   2k=65, 3k=70, 4k=75, 6k=65, 8k=50
  //     -> report MODERATELY_SEVERE to SEVERE (ignore the trailing 8k recovery)
  // This only changes the reported degree range; it does NOT change the stored
  // thresholds, type classification, frequency-region detection, or isolated-loss rules.
  const rawDegreeSource = reportAffected.length ? reportAffected : affected;
  const degreeRank: Record<HearingDegree, number> = {
    NORMAL: 0, SLIGHT: 1, MILD: 2, MODERATE: 3, MODERATELY_SEVERE: 4, SEVERE: 5, PROFOUND: 6, UNKNOWN: -1,
  };
  const sourceWithDegrees = rawDegreeSource.map(p => ({ ...p, degree: classifyDegree(p.ac, config) }));
  const filteredDegreeSource = sourceWithDegrees.filter((p, index, arr) => {
    if (arr.length < 3 || p.degree === 'UNKNOWN') return true;
    const rank = degreeRank[p.degree];
    const prev = arr[index - 1];
    const next = arr[index + 1];

    // Interior recovery: one point is better than BOTH adjacent loss points.
    if (prev && next) {
      const prevRank = degreeRank[prev.degree];
      const nextRank = degreeRank[next.degree];
      if (prevRank >= rank + 1 && nextRank >= rank + 1) return false;
    }

    // Trailing high-frequency recovery: the last point is better than the two
    // preceding points. Keep isolated/single-frequency losses untouched because
    // this rule requires at least three reportable points.
    if (index === arr.length - 1 && arr.length >= 3) {
      const prev1 = arr[index - 1];
      const prev2 = arr[index - 2];
      if (degreeRank[prev1.degree] >= rank + 1 && degreeRank[prev2.degree] >= rank + 1) return false;
    }

    return true;
  });
  const degreeSource = filteredDegreeSource.length ? filteredDegreeSource : sourceWithDegrees;
  const degreeFrom = degreeSource.length
    ? classifyDegree(Math.min(...degreeSource.map(p => p.ac!)), config)
    : type === 'NORMAL' ? 'NORMAL' : 'UNKNOWN';
  const degreeTo = degreeSource.length
    ? classifyDegree(Math.max(...degreeSource.map(p => p.ac!)), config)
    : degreeFrom;
  const regionalAverages = Object.fromEntries((['LOW', 'MID', 'HIGH'] as Region[]).map(r => [r, mean(valid.filter(p => region(p.frequency) === r).map(p => p.ac!))])) as Record<Region, number | null>;
  // Missing frequencies are never treated as measured normal surroundings.
  const first = config.frequencies.indexOf(fs[0]);
  const last = config.frequencies.indexOf(fs.at(-1)!);
  const hasNormalBefore = fs.length > 0 && valid.some(p => p.frequency < fs[0] && p.ac! <= config.normalThresholdDb);
  const hasNormalAfter = fs.length > 0 && valid.some(p => p.frequency > fs.at(-1)! && p.ac! <= config.normalThresholdDb);
  const firstMeasuredFrequency = valid[0]?.frequency ?? null;
  const lastMeasuredFrequency = valid.at(-1)?.frequency ?? null;

  // A single-frequency loss at the edge of the measured audiogram (especially
  // 8 kHz) cannot be bounded on both sides. Treat it as isolated when the
  // nearest measured frequency on the available side is normal.
  const bounded = fs.length > 0 && (
    (hasNormalBefore && hasNormalAfter)
    || (fs.length === 1 && fs[0] === lastMeasuredFrequency && hasNormalBefore)
    || (fs.length === 1 && fs[0] === firstMeasuredFrequency && hasNormalAfter)
  );
  const isolatedFrequencies = fs.length <= 2 && fs.length > 0 && (fs.length === 1 || last - first === 1) && bounded ? fs : [];
  if (isolatedFrequencies.length === 1) warnings.add('ISOLATED_THRESHOLD');

  // Frequency-region wording must describe one coherent reportable loss cluster.
  // A measured point that is not part of reportAffected breaks the cluster; a missing
  // frequency does not prove recovery and therefore does not split it by itself.
  const reportAffectedSet = new Set(reportAffected.map(p => p.frequency));
  const measuredSequence = config.frequencies.filter(f => valid.some(p => p.frequency === f));
  const clusters: number[][] = [];
  let currentCluster: number[] = [];
  for (const f of measuredSequence) {
    if (reportAffectedSet.has(f)) {
      currentCluster.push(f);
    } else if (currentCluster.length) {
      clusters.push(currentCluster);
      currentCluster = [];
    }
  }
  if (currentCluster.length) clusters.push(currentCluster);

  const regions = new Set(reportAffected.map(p => region(p.frequency)));
  const hasAllRegions = (['LOW', 'MID', 'HIGH'] as Region[]).every(r => regionalAverages[r] !== null);
  let frequencyRegion: FrequencyRegion = 'UNKNOWN';
  if (isolatedFrequencies.length) frequencyRegion = 'ISOLATED_FREQUENCY';
  else if (clusters.length > 1) {
    // Scattered/non-contiguous reportable loss: do not force a location phrase.
    frequencyRegion = 'BROAD';
  } else if (hasAllRegions && regions.size) {
    frequencyRegion = regions.size === 3 || (regions.has('LOW') && regions.has('HIGH')) ? 'BROAD' : regions.size === 2 ? (regions.has('LOW') ? 'LOW_TO_MID' : 'MID_TO_HIGH') : regions.has('LOW') ? 'LOW_FREQUENCY' : regions.has('MID') ? 'MID_FREQUENCY' : 'HIGH_FREQUENCY';
  }
  const acAt = (f: number) => points.find(p => p.frequency === f)?.ac ?? null;

  // A notch is a single measured frequency that is at least the configured
  // notch difference worse than BOTH nearest measured frequencies around it.
  // Do not use fixed 2k/8k anchors for 4 kHz; if 3k/6k are measured, they are
  // the true adjacent comparison points. Missing frequencies are skipped, but
  // a candidate is never accepted unless a measured point exists on both sides.
  const measuredAcFrequencies = points
    .filter(p => p.ac !== null)
    .map(p => p.frequency)
    .sort((a, b) => a - b);

  const notches = [3000, 4000, 6000].filter(f => {
    const at = acAt(f);
    if (at === null || at <= config.normalThresholdDb) return false;

    const candidateIndex = measuredAcFrequencies.indexOf(f);
    if (candidateIndex <= 0 || candidateIndex >= measuredAcFrequencies.length - 1) return false;

    const beforeFrequency = measuredAcFrequencies[candidateIndex - 1];
    const afterFrequency = measuredAcFrequencies[candidateIndex + 1];
    const before = acAt(beforeFrequency);
    const after = acAt(afterFrequency);

    if (before === null || after === null) return false;

    // Clinic/Katz rule used by this app: BOTH sides must differ by >= 20 dB
    // (or the configured notchDifferenceDb). A recovery-only 10 dB rule is not used.
    return at - before >= config.notchDifferenceDb
      && at - after >= config.notchDifferenceDb;
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
  if (type === 'UNKNOWN' || configuration === 'IRREGULAR' || warnings.has('INSUFFICIENT_DATA') || warnings.has('INVALID_THRESHOLD') || warnings.has('CONFLICTING_THRESHOLDS')) warnings.add('REVIEW_REQUIRED');
  const pta = (frequencies: number[]) => {
    const values = frequencies.map(acAt);
    return values.every(v => v !== null) ? mean(values as number[]) : null;
  };
  return { ear, status, type, points, degreeFrom, degreeTo, frequencyRegion, isolatedFrequencies,
    exactAffectedFrequencies: fs, airBoneGapFrequencies: gaps.map(p => p.frequency), residualAirBoneGap,
    configuration, notchFrequency, pta3: pta([500, 1000, 2000]), pta4: pta([500, 1000, 2000, 4000]), regionalAverages,
    confidence: deafness ? 'HIGH' : warnings.has('REVIEW_REQUIRED') ? 'LOW' : warnings.size ? 'MEDIUM' : 'HIGH', warnings: [...warnings], deafness };
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
  const key = (p: EarProfile) => JSON.stringify([p.deafness, p.status, p.type, p.degreeFrom, p.degreeTo, p.configuration, p.frequencyRegion, p.isolatedFrequencies, p.notchFrequency, p.airBoneGapFrequencies, p.residualAirBoneGap, p.warnings]);
  return { rightEar, leftEar, symmetry, bilateralEligible: symmetry === 'SYMMETRICAL' && rightEar.status !== 'UNKNOWN' && key(rightEar) === key(leftEar),
    interauralDifferences: signed.map(p => ({ ...p, differenceDb: Math.abs(p.differenceDb) })), warnings: [...new Set([...rightEar.warnings, ...leftEar.warnings])] };
}
