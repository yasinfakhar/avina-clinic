import { audiometryConfig } from './audiometry-config.mjs';
export type AudiometryConfig = typeof audiometryConfig;
export type AudiometryInput = { ac: Record<string, { value: string; modifier: string }>; bc: Record<string, { value: string; modifier: string }> };
export type LossType = 'NORMAL' | 'SNHL' | 'CHL' | 'MIXED' | 'UNDETERMINED';
export type Region = 'LOW' | 'MID' | 'HIGH';
export type Warning = 'MISSING_BC' | 'INSUFFICIENT_DATA' | 'NO_RESPONSE_PRESENT' | 'ISOLATED_ABG' | 'BORDERLINE_ABG' | 'REVIEW_REQUIRED' | 'INVALID_THRESHOLD' | 'CONFLICTING_THRESHOLDS' | 'PARTIAL_AC' | 'UNMASKED_ABG' | 'ISOLATED_THRESHOLD';
export type FrequencyPoint = { frequency: number; ac: number | null; bc: number | null; acModifier: string; bcModifier: string; status: 'NORMAL' | 'ABNORMAL' | 'UNKNOWN'; type: LossType; abg: number | null };
export type FrequencyPattern = { kind: 'SINGLE_FREQUENCY' | 'TWO_ADJACENT_FREQUENCIES' | 'TWO_NON_ADJACENT_FREQUENCIES' | 'CONTIGUOUS_RANGE' | 'REGIONAL_PATTERN' | 'MULTIPLE_DISCRETE_FREQUENCIES' | 'BROAD_BAND'; frequencies: number[]; regions: Region[] };
export type Finding = { type: LossType; degreeMin: string; degreeMax: string; pattern: FrequencyPattern };
export type EarProfile = {
  ear: 'right' | 'left'; type: LossType; points: FrequencyPoint[]; findings: Finding[];
  exactAffectedFrequencies: number[]; frequencyPattern: FrequencyPattern;
  abg: { frequencies: number[]; isolated: boolean; conductiveComponentConfirmed: boolean; pattern: FrequencyPattern };
  regionalAnalysis: { region: Region; types: LossType[]; abg: boolean; degreeMin: string; degreeMax: string }[];
  configuration: 'FLAT' | 'SLOPING' | 'RISING' | 'NOTCH' | 'COOKIE_BITE' | 'REVERSE_COOKIE_BITE' | 'IRREGULAR' | 'NONE';
  notch: number[]; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; warnings: Warning[];
};
export type AudiometryReportProfile = { rightEar: EarProfile; leftEar: EarProfile; bilateralEligible: boolean; interauralDifferences: { frequency: number; differenceDb: number }[]; warnings: Warning[] };
const region = (f: number): Region => f <= 500 ? 'LOW' : f < 3000 ? 'MID' : 'HIGH';
export function frequencyPattern(fs: number[], tested: number[]): FrequencyPattern {
  const regions = [...new Set(fs.map(region))];
  const contiguous = fs.every((f, i) => i === 0 || tested.indexOf(f) === tested.indexOf(fs[i - 1]) + 1);
  const kind = fs.length === 1 ? 'SINGLE_FREQUENCY' : fs.length === 2 ? (contiguous ? 'TWO_ADJACENT_FREQUENCIES' : 'TWO_NON_ADJACENT_FREQUENCIES') : fs.length === tested.length && fs.length >= 3 ? 'BROAD_BAND' : contiguous ? (fs.length >= 3 ? 'REGIONAL_PATTERN' : 'CONTIGUOUS_RANGE') : 'MULTIPLE_DISCRETE_FREQUENCIES';
  return { kind, frequencies: fs, regions };
}
export function analyzeEar(ear: 'right' | 'left', input?: AudiometryInput, config: AudiometryConfig = audiometryConfig): EarProfile {
  const warnings = new Set<Warning>();
  const parse = (cell?: { value: string; modifier: string }) => {
    if (cell?.modifier === 'NR' || cell?.value.trim().toUpperCase() === 'NR') { warnings.add('NO_RESPONSE_PRESENT'); return null; }
    if (!cell?.value.trim()) return null;
    const n = Number(cell.value);
    if (!Number.isFinite(n) || n < config.minimumDb || n > config.maximumDb || n % config.stepDb !== 0) { warnings.add('INVALID_THRESHOLD'); return null; }
    return n;
  };
  const points: FrequencyPoint[] = config.frequencies.map(frequency => {
    const ac = parse(input?.ac[frequency]); const bc = parse(input?.bc[frequency]);
    if (ac !== null && bc !== null && bc > ac) warnings.add('CONFLICTING_THRESHOLDS');
    const abg = ac !== null && bc !== null ? ac - bc : null;
    if (abg !== null && abg >= config.borderlineAbgDb && abg < config.significantAbgDb) warnings.add('BORDERLINE_ABG');
    return { frequency, ac, bc, acModifier: input?.ac[frequency]?.modifier ?? '', bcModifier: input?.bc[frequency]?.modifier ?? '', abg, status: ac === null ? 'UNKNOWN' : ac <= config.normalThresholdDb ? 'NORMAL' : 'ABNORMAL', type: 'UNDETERMINED' };
  });
  const valid = points.filter(p => p.ac !== null);
  const affected = valid.filter(p => p.status === 'ABNORMAL');
  if (affected.length === 1) warnings.add('ISOLATED_THRESHOLD');
  const gaps = points.filter(p => p.abg !== null && p.abg >= config.significantAbgDb);
  if (gaps.length === 1) warnings.add('ISOLATED_ABG');
  if (gaps.some(p => p.bcModifier !== 'M' && p.bcModifier !== 'MD')) warnings.add('UNMASKED_ABG');
  // Confirm repeated gaps within a region, never propagate a low-frequency gap into high-frequency type.
  for (const p of points) {
    if (p.status === 'NORMAL') { p.type = 'NORMAL'; continue; }
    if (p.status !== 'ABNORMAL') continue;
    if (p.bc === null) { warnings.add('MISSING_BC'); continue; }
    if (p.bc > p.ac!) continue;
    const repeated = gaps.filter(g => region(g.frequency) === region(p.frequency) && g.status === 'ABNORMAL').length >= config.minimumConductivePoints;
    if (p.abg! >= config.significantAbgDb) {
      if (repeated) p.type = p.bc <= config.normalThresholdDb ? 'CHL' : 'MIXED';
    } else if (p.bc > config.normalThresholdDb) p.type = 'SNHL';
  }
  if (valid.length < config.minimumNormalPoints) warnings.add('INSUFFICIENT_DATA');
  if (valid.length < config.frequencies.length) warnings.add('PARTIAL_AC');
  const degreeRange = (ps: FrequencyPoint[]) => {
    const indices = ps.filter(p => p.status === 'ABNORMAL').map(p => config.degrees.findIndex(d => p.ac! <= d.maximum));
    return indices.length ? [config.degrees[Math.min(...indices)].name, config.degrees[Math.max(...indices)].name] : ['NORMAL', 'NORMAL'];
  };
  const findings: Finding[] = [...new Set(affected.map(p => p.type))].map(type => {
    const ps = affected.filter(p => p.type === type); const [degreeMin, degreeMax] = degreeRange(ps);
    return { type, degreeMin, degreeMax, pattern: frequencyPattern(ps.map(p => p.frequency), config.frequencies) };
  });
  const notch = [4000, 6000].filter(f => {
    const i = points.findIndex(p => p.frequency === f); const a = points[i - 1]?.ac; const b = points[i]?.ac; const c = points[i + 1]?.ac;
    return a != null && b != null && c != null && b > config.normalThresholdDb && b - a >= config.notchDifferenceDb && b - c >= config.notchDifferenceDb;
  });
  let configuration: EarProfile['configuration'] = 'NONE';
  if (valid.length >= 3) {
    const ns = valid.map(p => p.ac!); const first = ns[0]; const last = ns.at(-1)!; const middle = ns.slice(1, -1);
    const delta = config.shapeDifferenceDb;
    configuration = notch.length ? 'NOTCH' : Math.max(...ns) - Math.min(...ns) < delta ? 'FLAT' : Math.min(...middle) - Math.max(first, last) >= delta ? 'COOKIE_BITE' : Math.min(first, last) - Math.max(...middle) >= delta ? 'REVERSE_COOKIE_BITE' : ns.every((n,i) => i === 0 || n >= ns[i-1]) && last-first >= delta ? 'SLOPING' : ns.every((n,i) => i === 0 || n <= ns[i-1]) && first-last >= delta ? 'RISING' : 'IRREGULAR';
  }
  const type: LossType = affected.length ? findings.length === 1 ? findings[0].type : 'UNDETERMINED' : valid.length >= config.minimumNormalPoints && !warnings.has('NO_RESPONSE_PRESENT') && !warnings.has('INVALID_THRESHOLD') ? 'NORMAL' : 'UNDETERMINED';
  if (affected.some(p => p.type === 'UNDETERMINED') || type === 'UNDETERMINED' || warnings.has('NO_RESPONSE_PRESENT') || warnings.has('CONFLICTING_THRESHOLDS') || warnings.has('INVALID_THRESHOLD') || warnings.has('INSUFFICIENT_DATA')) warnings.add('REVIEW_REQUIRED');
  const confidence = warnings.has('REVIEW_REQUIRED') || warnings.has('ISOLATED_ABG') ? 'LOW' : warnings.size ? 'MEDIUM' : 'HIGH';
  return { ear, type, points, findings, exactAffectedFrequencies: affected.map(p => p.frequency), frequencyPattern: frequencyPattern(affected.map(p => p.frequency), config.frequencies),
    abg: { frequencies: gaps.map(p => p.frequency), isolated: gaps.length === 1, conductiveComponentConfirmed: points.some(p => p.type === 'CHL' || p.type === 'MIXED'), pattern: frequencyPattern(gaps.map(p => p.frequency), config.frequencies) },
    regionalAnalysis: (['LOW','MID','HIGH'] as Region[]).map(r => { const ps = valid.filter(p => region(p.frequency) === r); const [degreeMin, degreeMax] = degreeRange(ps); return { region: r, types: [...new Set(ps.map(p => p.type))], abg: gaps.some(p => region(p.frequency) === r), degreeMin, degreeMax }; }), configuration, notch, confidence, warnings: [...warnings] };
}
export function analyzeAudiometry(right?: AudiometryInput, left?: AudiometryInput, config = audiometryConfig): AudiometryReportProfile {
  const rightEar = analyzeEar('right', right, config); const leftEar = analyzeEar('left', left, config);
  const key = (p: EarProfile) => JSON.stringify([p.type, p.findings, p.abg, p.notch, p.warnings]);
  return { rightEar, leftEar, bilateralEligible: key(rightEar) === key(leftEar), warnings: [...new Set([...rightEar.warnings, ...leftEar.warnings])], interauralDifferences: rightEar.points.flatMap((p,i) => p.ac !== null && leftEar.points[i].ac !== null ? [{ frequency: p.frequency, differenceDb: Math.abs(p.ac - leftEar.points[i].ac!) }] : []) };
}


