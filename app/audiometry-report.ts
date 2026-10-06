import type { AudiometryReportProfile, EarProfile, FrequencyPattern } from './audiometry-analysis.ts';
const degree = (s: string) => s.toLowerCase().replaceAll('_', ' ');
function frequencies(p: FrequencyPattern): string {
  const fs = p.frequencies;
  if (!fs.length || p.kind === 'BROAD_BAND') return '';
  if (p.kind === 'REGIONAL_PATTERN') return `at ${p.regions.map(r => r.toLowerCase()).join(' to ')} frequencies`;
  if (fs.every(f => f >= 1000)) return `at ${fs.map(f => f / 1000).join(p.kind === 'TWO_ADJACENT_FREQUENCIES' || p.kind === 'CONTIGUOUS_RANGE' ? '–' : ' and ')} kHz`;
  return `at ${fs.map(f => f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`).join(' and ')}`;
}
export function composeEar(p: EarProfile): string {
  if (!p.findings.length && p.type !== 'NORMAL') return 'Insufficient thresholds for interpretation; review required.';
  const base = p.type === 'NORMAL' ? 'normal hearing' : p.findings.map(f => {
    const range = f.degreeMin === f.degreeMax ? degree(f.degreeMin) : `${degree(f.degreeMin)} to ${degree(f.degreeMax)}`;
    const type = f.type === 'UNDETERMINED' ? 'hearing loss' : f.type === 'MIXED' ? 'mixed hearing loss' : f.type;
    return `${range} ${type} ${frequencies(f.pattern)}${f.type === 'UNDETERMINED' ? '; type cannot be determined from available thresholds' : ''}`.trim();
  }).join('; ');
  const modifiers: string[] = [];
  if (p.abg.frequencies.length && !p.abg.conductiveComponentConfirmed) modifiers.push(`an air-bone gap ${p.abg.pattern.frequencies.length >= 2 && p.abg.pattern.regions.length === 1 ? `at ${p.abg.pattern.regions[0].toLowerCase()} frequencies` : frequencies(p.abg.pattern)}`.trim());
  p.notch.forEach(f => modifiers.push(`a notch at ${f / 1000} kHz`));
  const review = p.warnings.includes('NO_RESPONSE_PRESENT') ? '; no-response measurements require review' : p.warnings.includes('PARTIAL_AC') && p.type === 'NORMAL' ? '; available tested frequencies only' : '';
  return `${base}${modifiers.length ? ' with ' + modifiers.join(' and ') : ''}${review}.`;
}
export function composeAudiometryReport(p: AudiometryReportProfile): string {
  const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
  if (p.bilateralEligible) return `Bilateral ${composeEar(p.rightEar)}`;
  return `RE: ${capitalize(composeEar(p.rightEar))}\nLE: ${capitalize(composeEar(p.leftEar))}`;
}


