import type { AudiometryReportProfile, EarProfile } from './audiometry-analysis.ts';

export const audiometryTerminology = { SNHL: 'SNHL', CHL: 'CHL', MIXED: 'mixed hearing loss', UNKNOWN: 'hearing loss', NORMAL: 'normal hearing' };
const degree = (s: string) => s.toLowerCase().replaceAll('_', ' ');
const frequencyText = (fs: number[]) => fs.every(f => f >= 1000) ? `${fs.map(f => f / 1000).join(fs.length === 2 && fs[0] === 3000 && fs[1] === 4000 ? '–' : ' and ')} kHz` : fs.map(f => f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`).join(' and ');
const regions = { BROAD: '', LOW_FREQUENCY: 'at low frequencies', MID_FREQUENCY: 'at mid frequencies', HIGH_FREQUENCY: 'at high frequencies', MID_TO_HIGH: 'at mid to high frequencies', LOW_TO_MID: 'at low to mid frequencies', ISOLATED_FREQUENCY: '', UNKNOWN: '' };

export function composeEar(p: EarProfile, terminology = audiometryTerminology): string {
  if (p.status === 'UNKNOWN') return 'Insufficient thresholds for interpretation; review required.';
  if (p.status === 'NORMAL') return `normal hearing${p.warnings.includes('PARTIAL_AC') ? '; available tested frequencies only' : ''}.`;
  const range = p.degreeFrom === p.degreeTo ? degree(p.degreeFrom) : `${degree(p.degreeFrom)} to ${degree(p.degreeTo)}`;
  const shape = !p.isolatedFrequencies.length && p.frequencyRegion === 'BROAD' && !['NONE', 'UNKNOWN', 'NOTCHED', 'IRREGULAR'].includes(p.configuration) ? `${degree(p.configuration).replace('cookie bite', 'cookie-bite')} ` : '';
  const location = p.isolatedFrequencies.length ? `at ${frequencyText(p.isolatedFrequencies)}` : regions[p.frequencyRegion] || (p.frequencyRegion === 'UNKNOWN' ? `at ${frequencyText(p.exactAffectedFrequencies)}` : '');
  let text = `${range} ${shape}${terminology[p.type]}${location ? ` ${location}` : ''}`;
  if (p.configuration === 'RISING' && ['LOW_FREQUENCY', 'LOW_TO_MID'].includes(p.frequencyRegion) && p.points.filter(point => point.frequency >= 4000 && point.ac !== null).every(point => !p.exactAffectedFrequencies.includes(point.frequency))) text += ' rising to normal hearing';
  const modifiers: string[] = [];
  if (p.airBoneGapFrequencies.length && (p.residualAirBoneGap || !['CHL', 'MIXED'].includes(p.type))) {
    modifiers.push(`an air-bone gap at ${p.airBoneGapFrequencies.every(f => f <= 500) ? 'low frequencies' : frequencyText(p.airBoneGapFrequencies)}`);
  }
  if (p.notchFrequency !== null && !p.isolatedFrequencies.length) modifiers.push(`a notch at ${p.notchFrequency / 1000} kHz`);
  if (modifiers.length) text += ` with ${modifiers.join(' and ')}`;
  if (p.type === 'UNKNOWN') text += '; type cannot be determined from available thresholds';
  if (p.warnings.includes('NO_RESPONSE_PRESENT')) text += '; no-response measurements require review';
  else if (p.warnings.includes('REVIEW_REQUIRED') && p.type !== 'UNKNOWN') text += '; review required';
  return `${text}.`;
}

export function composeAudiometryReport(p: AudiometryReportProfile, terminology = audiometryTerminology): string {
  const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
  if (p.bilateralEligible) return `Bilateral ${p.rightEar.type === 'NORMAL' ? '' : 'symmetrical '}${composeEar(p.rightEar, terminology)}`;
  return `RE: ${capitalize(composeEar(p.rightEar, terminology))}\nLE: ${capitalize(composeEar(p.leftEar, terminology))}`;
}
