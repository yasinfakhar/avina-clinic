import type { AudiometryReportProfile, EarProfile } from './audiometry-analysis.js';

export const audiometryTerminology = {
  SNHL: 'SNHL',
  CHL: 'CHL',
  MIXED: 'MHL',
  UNKNOWN: 'hearing loss',
  NORMAL: 'normal hearing',
};

export function composeSdsReport(right?: string, left?: string, label = 'SDS'): string {
  const score = (value?: string) => value?.trim() && Number.isFinite(Number(value))
    ? Number(value) >= 70 ? 'high' : 'poor'
    : null;

  const re = score(right);
  const le = score(left);
  if (!re && !le) return '';
  if (re && le && re !== le) return `${label}: Show ${re} score in right ear and ${le} score in left ear.`;
  return `${label}: Show ${re || le} score in ${re && le ? 'both ears' : re ? 'right ear' : 'left ear'}.`;
}

const degree = (s: string) => s.toLowerCase().replaceAll('_', ' ');
const frequencyText = (fs: number[]) => {
  if (fs.every(f => f >= 1000)) {
    const labels = fs.map(f => f / 1000);
    return `${labels.join(fs.length === 2 && Math.abs(fs[1] - fs[0]) <= 2000 ? '–' : ' and ')} kHz`;
  }
  return fs.map(f => f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`).join(' and ');
};

const regions: Record<string, string> = {
  BROAD: '',
  LOW_FREQUENCY: 'at low frequencies',
  MID_FREQUENCY: 'at mid frequencies',
  HIGH_FREQUENCY: 'at high frequencies',
  MID_TO_HIGH: 'at mid to high frequencies',
  LOW_TO_MID: 'at low to mid frequencies',
  ISOLATED_FREQUENCY: '',
  UNKNOWN: '',
};

export function composeEar(p: EarProfile, terminology = audiometryTerminology): string {
  if (p.deafness) return 'deafness.';
  if (p.status === 'UNKNOWN') return 'Insufficient thresholds for interpretation; review required.';
  if (p.status === 'NORMAL') return `normal hearing${p.warnings.includes('PARTIAL_AC') ? '; available tested frequencies only' : ''}.`;

  const range = p.degreeFrom === p.degreeTo
    ? degree(p.degreeFrom)
    : `${degree(p.degreeFrom)} to ${degree(p.degreeTo)}`;

  // Frequency-dependent transition has its own clinic wording.
  if (p.typeTransition === 'CHL_TO_SNHL') return `${range} CHL to SNHL.`;

  // Shape is intentionally conservative in the final comment.
  // FLAT and STEEPLY_SLOPING stay internal; only ordinary SLOPING is printed,
  // and only for broad SNHL where the clinic examples explicitly use it.
  const shape = p.type === 'SNHL'
    && p.frequencyRegion === 'BROAD'
    && p.configuration === 'SLOPING'
    ? 'sloping '
    : '';

  // CHL/MHL comments stay concise in this clinic; location is mainly used for SNHL.
  const suppressLocation = p.type === 'CHL' || p.type === 'MIXED';
  const isolatedHighWithLowGap = p.type === 'SNHL'
    && p.isolatedFrequencies.length === 1
    && p.isolatedFrequencies[0] >= 6000
    && p.residualAirBoneGap
    && p.airBoneGapFrequencies.length > 0
    && p.airBoneGapFrequencies.every(f => f <= 500);

  let location = '';
  if (!suppressLocation) {
    if (isolatedHighWithLowGap) location = 'at high frequency';
    else if (p.isolatedFrequencies.length) location = `at ${frequencyText(p.isolatedFrequencies)}`;
    else location = regions[p.frequencyRegion] || '';
  }

  let text = `${range} ${shape}${terminology[p.type]}${location ? ` ${location}` : ''}`;

  if (p.configuration === 'RISING'
      && ['LOW_FREQUENCY', 'LOW_TO_MID'].includes(p.frequencyRegion)
      && p.points.filter(point => point.frequency >= 4000 && point.ac !== null)
        .every(point => !p.exactAffectedFrequencies.includes(point.frequency))) {
    text += ' rising to normal hearing';
  }

  const modifiers: string[] = [];

  if (p.residualAirBoneGap && p.airBoneGapFrequencies.length) {
    modifiers.push(`gap at ${p.airBoneGapFrequencies.every(f => f <= 500) ? 'low frequency' : frequencyText(p.airBoneGapFrequencies)}`);
  }

  if (p.notchFrequency !== null && !p.isolatedFrequencies.length) {
    modifiers.push(`a notch at ${p.notchFrequency / 1000} kHz`);
  }

  if (modifiers.length) text += ` with ${modifiers.join(' and ')}`;

  if (p.type === 'UNKNOWN') text += '; type cannot be determined from available thresholds';
  if (p.warnings.includes('REVIEW_REQUIRED') && p.type === 'UNKNOWN') text += '; review required';

  return `${text}.`;
}

export function composeAudiometryReport(p: AudiometryReportProfile, terminology = audiometryTerminology): string {
  const capitalize = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;
  if (p.bilateralEligible) return `Bilateral ${composeEar(p.rightEar, terminology)}`;
  return `RE: ${capitalize(composeEar(p.rightEar, terminology))}\nLE: ${capitalize(composeEar(p.leftEar, terminology))}`;
}
