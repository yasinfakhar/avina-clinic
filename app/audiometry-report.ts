import type { AudiometryReportProfile, EarProfile } from './audiometry-analysis.ts';

export const audiometryTerminology = { SNHL: 'SNHL', CHL: 'CHL', MIXED: 'mixed hearing loss', UNKNOWN: 'hearing loss', NORMAL: 'normal hearing' };
const degree = (s: string) => s.toLowerCase().replaceAll('_', ' ');
const frequencyText = (fs: number[]) => fs.every(f => f >= 1000) ? `${fs.map(f => f / 1000).join(fs.length === 2 ? '–' : ' and ')} kHz` : fs.map(f => f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`).join(' and ');
const regions = { BROAD: '', LOW_FREQUENCY: 'at low frequencies', MID_FREQUENCY: 'at mid frequencies', HIGH_FREQUENCY: 'at high frequencies', MID_TO_HIGH: 'at mid to high frequencies', LOW_TO_MID: 'at low to mid frequencies', ISOLATED_FREQUENCY: '', ISOLATED_FREQUENCY_RANGE: '', NONE: '', UNKNOWN: '' };

export function composeEar(p: EarProfile, terminology = audiometryTerminology): string {
  if (p.status === 'UNKNOWN') return 'Insufficient thresholds for interpretation; review required.';
  if (p.status === 'NORMAL') return `normal hearing${p.warnings.includes('PARTIAL_AC') ? '; available tested frequencies only' : ''}.`;
  const range = p.degreeFrom === p.degreeTo ? degree(p.degreeFrom) : `${degree(p.degreeFrom)} to ${degree(p.degreeTo)}`;
  const location = p.isolatedFrequencies.length ? `at ${frequencyText(p.isolatedFrequencies)}` : regions[p.frequencyRegion];
  let text = `${range} ${terminology[p.type]}${location ? ` ${location}` : ''}`;
  const modifiers: string[] = [];
  if (p.airBoneGapFrequencies.length && (p.residualAirBoneGap || !['CHL', 'MIXED'].includes(p.type))) {
    modifiers.push(`gap at ${p.airBoneGapRegion === 'LOW_FREQUENCY' ? 'low frequency' : frequencyText(p.airBoneGapFrequencies)}`);
  }
  if (p.pattern === 'NOTCH' && p.notchFrequency !== null) modifiers.push(`a notch at ${p.notchFrequency / 1000} kHz`);
  if (modifiers.length) text += ` with ${modifiers.join(' and ')}`;
  if (p.type === 'UNKNOWN') text += '; type cannot be determined from available thresholds';
  if (p.degreeConfidence === 'LOW' && p.type !== 'UNKNOWN') text += '; degree requires review';
  return `${text}.`;
}

export function composeAudiometryReport(p: AudiometryReportProfile, terminology = audiometryTerminology): string {
  const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
  if (p.bilateralEligible) return `Bilateral ${composeEar(p.rightEar, terminology)}`;
  return `RE: ${capitalize(composeEar(p.rightEar, terminology))}\nLE: ${capitalize(composeEar(p.leftEar, terminology))}`;
}
