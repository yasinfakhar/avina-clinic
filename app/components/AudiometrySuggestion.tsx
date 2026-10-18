'use client';
import { useMemo } from 'react';
import { analyzeAudiometry } from '../audiometry-analysis';
import type { AudiometryInput } from '../audiometry-analysis';
import { composeAudiometryReport, composeSdsReport } from '../audiometry-report';
type SpeechScores = { srt?: string; mcl?: string; ucl?: string; srtNoise?: string; mclNoise?: string; uclNoise?: string };
export function AudiometrySuggestion({ right, left, rightSpeech, leftSpeech, onApply }: { right?: AudiometryInput; left?: AudiometryInput; rightSpeech?: SpeechScores; leftSpeech?: SpeechScores; onApply: (text: string) => void }) {
  const profile = useMemo(() => analyzeAudiometry(right, left), [right, left]);
  const hasData = [...profile.rightEar.points, ...profile.leftEar.points].some(p => p.ac !== null || p.acModifier === 'NR');
  const sds = composeSdsReport(rightSpeech?.ucl, leftSpeech?.ucl);
  const noiseSds = composeSdsReport(rightSpeech?.uclNoise, leftSpeech?.uclNoise, 'SDS (In Noise)');
  const speechCouldNotBeTested = [rightSpeech, leftSpeech].every(speech =>
    speech && (['srt', 'mcl', 'ucl', 'srtNoise', 'mclNoise', 'uclNoise'] as const)
      .every(field => speech[field]?.trim().toUpperCase() === 'CNT'));
  const suggestion = [hasData ? composeAudiometryReport(profile) : '', sds, noiseSds,
    speechCouldNotBeTested ? 'Speech audiometry could not be tested.' : '',
  ].filter(Boolean).join('\n');
  return <div className="audiometry-suggestion">
    <button type="button" className="btn secondary" disabled={!suggestion} onClick={() => onApply(suggestion.split('\n').map(line => `<p>${line}</p>`).join(''))}>کامنت خودکار</button>
  </div>;
}

