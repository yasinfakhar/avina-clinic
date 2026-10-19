'use client';
import { useMemo } from 'react';
import { analyzeAudiometry } from '../audiometry-analysis';
import type { AudiometryInput } from '../audiometry-analysis';
import { composeAudiometryReport, composeSdsReport } from '../audiometry-report';
type SpeechScores = { srt?: string; mcl?: string; ucl?: string; srtNoise?: string; mclNoise?: string; uclNoise?: string };
export function AudiometrySuggestion({ right, left, rightSpeech, leftSpeech, onApply }: { right?: AudiometryInput; left?: AudiometryInput; rightSpeech?: SpeechScores; leftSpeech?: SpeechScores; onApply: (text: string) => void }) {
  const profile = useMemo(() => analyzeAudiometry(right, left), [right, left]);
  const hasData = [...profile.rightEar.points, ...profile.leftEar.points].some(p => p.ac !== null || p.acModifier === 'NR');
  const bothEarsCnt = [rightSpeech?.ucl, leftSpeech?.ucl].every(value => value?.trim().toUpperCase() === 'CNT');
  const normalizeScore = (value?: string) => {
    const trimmed = value?.trim().toUpperCase() || '';
    return trimmed && Number.isFinite(Number(trimmed)) ? String(Number(trimmed)) : trimmed;
  };
  const sameSdsValues = !bothEarsCnt && [rightSpeech, leftSpeech].every(speech =>
    normalizeScore(speech?.ucl) === normalizeScore(speech?.uclNoise));
  const sds = composeSdsReport(rightSpeech?.ucl, leftSpeech?.ucl, sameSdsValues ? 'SDS (In Noise & In Quiet)' : 'SDS');
  const noiseSds = bothEarsCnt || sameSdsValues ? '' : composeSdsReport(rightSpeech?.uclNoise, leftSpeech?.uclNoise, 'SDS (In Noise)');
  const suggestion = [hasData ? composeAudiometryReport(profile) : '', sds, noiseSds].filter(Boolean).join('\n');
  return <div className="audiometry-suggestion">
    <button type="button" className="btn primary" disabled={!suggestion} onClick={() => onApply(suggestion.split('\n').map(line => `<p>${line}</p>`).join(''))}>کامنت خودکار</button>
  </div>;
}

