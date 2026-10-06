# Audiometry suggested comments

The existing patient record owns thresholds (`right/left.audiometry.ac/bc`) and
editable HTML comments (`audiometricTests.comments`). SQLite persists the record
as JSON; this feature introduces no additional storage or network dependency.

- `audiometry-config.mjs`: clinic thresholds, degree bands, supported frequencies.
- `audiometry-analysis.ts`: adapter/validation, frequency status, region-local
  repeated ABG classification, degree ranges, exact frequency patterns, shape and
  notch detection, confidence, independent ear profiles and bilateral comparison.
- `audiometry-report.ts`: English clinic wording from structured profiles only.
- `components/AudiometrySuggestion.tsx`: analyzes current saved thresholds when
  they change, displays review flags, and applies HTML text only on button click.
  The existing rich editor permits further manual edits and existing print/save
  flows receive the same comment. The button explicitly replaces the old comment.

Default normal is <=25 dB; mild 26–40, moderate 41–55, moderately severe 56–70,
severe 71–90, profound >90, matching the displayed audiogram bands. Inputs use
existing -10..120 dB limits and 5 dB steps. Significant ABG is >=15 dB, with
10..<15 flagged borderline. A conductive component requires at least two
abnormal AC frequencies with gaps within the same region; isolated gaps are
never sufficient. Unmasked gaps are flagged for review.

Low region includes 125/250/500 Hz; mid includes 1/2 kHz; 3 kHz is assigned to
the high transition region (thus combined mid/high descriptions when applicable).
One/two-frequency findings retain exact frequencies. Normal intermediate tested
frequencies prevent fictitious continuous ranges. Notches require valid immediate
neighbors and >=15 dB deterioration/recovery, and are checked before composing.
The shapes are descriptive deterministic heuristics, not diagnostic criteria.

Missing BC is never inferred, including the UI's unavailable 6/8 kHz BC cells.
Reports may therefore contain known SNHL and separate undetermined-frequency
loss. NR is not a numeric threshold. Invalid/contradictory data, sparse data and
undetermined types request review. Partial normal AC results are qualified as
available tested frequencies only. Degree uses affected thresholds, never PTA.
Asymmetry differences are returned as data without a diagnostic cutoff.

Run `npm test`, `npx tsc --noEmit`, and `npm run build` for verification.
