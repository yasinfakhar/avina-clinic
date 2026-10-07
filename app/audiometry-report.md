# Audiometry suggested comments

The feature is fully local and deterministic, without a model, network request,
new dependency, or database migration. Existing patient JSON stores thresholds
and editable HTML comments.

## Files and architecture

- `audiometry-config.mjs`: injectable clinic rule defaults and degree bands.
- `audiometry-analysis.ts`: input validation and structured ear/bilateral results.
- `audiometry-report.ts`: compositional English wording; configurable terminology.
- `components/AudiometrySuggestion.tsx`: live suggestion and review warnings.
- `../tests/audiometry-report.test.mjs`: structured-result and wording tests.

The suggestion recalculates when thresholds change. Applying it requires the
existing Auto comment button; threshold changes never replace an existing or
manually edited comment. The same button reapplies the latest suggestion.

## Rules

Normal is <=20 dB; slight <=25, mild <=40, moderate <=55, moderately severe <=70,
severe <=90, profound >90. Degree range uses abnormal AC values, not PTA.
PTA3 requires all of 500/1000/2000; PTA4 additionally requires 4000 Hz. NR is
stored as an explicit modifier and never contributes a numeric threshold.

Significant ABG is >=15 dB. At least two supported AC/BC pairs, including an
abnormal AC pair, are needed for an overall loss type. Missing BC at an abnormal
frequency where BC is supported produces UNKNOWN. Repeated abnormal AC gaps
(two by default) establish CHL with normal BC or MIXED with abnormal BC.
Low-only gaps may remain a secondary finding when separately supported mid/high
SNHL exists and those gaps affect no more than half of abnormal AC frequencies.
Contradictory AC/BC values force UNKNOWN. Unmasked gaps request review.

Normal hearing has no loss shape. Bounded single/adjacent-pair abnormalities use
exact frequencies in comments, taking precedence over generic regional wording.
Notches precede cookie-bite/reverse-cookie-bite, flat, slopes and rising shapes.
Notches at 3/4/6 kHz require a 15 dB drop and 10 dB recovery with explicit numeric
anchors (2/4, 2/8 and 4/8 kHz respectively). The deepest candidate wins.
Flat uses <=20 dB total range; slope/rise uses >=20 dB low/high average difference;
steep slope uses >=40 dB; cookie-bite patterns use >=20 dB regional differences.
Irregular, invalid, sparse, NR or unknown-type results lower confidence.

Symmetry needs at least three matching numeric AC frequencies. At least 75%
within 10 dB counts as symmetrical (10 dB is inclusive). Otherwise at least two
larger differences establish asymmetry, with direction if consistent. Combined
reporting additionally requires matching type, degrees, shape, region, isolated
frequencies, notch, gap findings and warnings. Differing ears retain RE/LE lines.

## Codebase assumptions and specification conflicts

- Preserve the existing 125 Hz input as a low frequency. Treat 3 kHz as the high
  transition region. BC is supported through 4 kHz, matching the editor; 6/8 kHz
  BC values are ignored. Supported abnormal AC/BC pairs establish overall type,
  but loss confined to 6/8 kHz without abnormal supported pairs remains UNKNOWN.
- Preserve the existing -10..120 dB input limits. The analyzer accepts numeric
  values between those limits without enforcing the editor's 5 dB increments,
  so all requested degree boundaries are representable.
- Standard frequencies 250/500/1000/2000/4000/8000 determine completeness; optional
  125/3000/6000 entries are not required to call a result complete. Partial normal
  reports explicitly say they apply to available tested frequencies only.
- Preserve the app's SNHL/CHL abbreviations and RE/LE labels. Pass a terminology
  map to either composer to use expanded loss names.
- The explicit numeric rules take precedence over contradictory examples.
  Example A contains slight loss at 25 dB and a 45 dB low/high mean difference,
  therefore it is slight-to-severe, steeply sloping. The low-frequency example
  with abnormal 1 kHz is LOW_TO_MID, not LOW_FREQUENCY.
- No settings UI is added; each analyzer accepts an overridden config object.

## Representative comments

- Bilateral normal hearing.
- Bilateral symmetrical mild flat SNHL.
- mild to severe sloping SNHL.
- mild to moderate SNHL at high frequencies.
- mild to moderate SNHL at 3–4 kHz.
- moderate flat mixed hearing loss.

Ear fragments start lowercase; the bilateral/RE/LE composer capitalizes complete
reports. Missing-type wording and review warnings stay visible and editable.

## Verification

Run `node --experimental-strip-types --test tests/audiometry-report.test.mjs`,
`npm test`, and `npx tsc --noEmit --incremental false`.
