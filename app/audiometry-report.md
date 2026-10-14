# Audiometry suggested comments

The existing analyzer, injectable configuration, composer, and suggestion UI remain
in place. Analysis is offline, deterministic, rule based, and has no AI/API dependency.
The Auto comment button applies the suggestion explicitly; changing thresholds never
overwrites manually edited comments. UI warnings remain separate from clinical text.

## Clinic rules

- AC normal <=20; slight <=25; mild <=40; moderate <=55; moderately severe <=70;
  severe <=90; profound >90. BC normal <=25, independently of AC degree.
- `isAirConductionNormal` and `isBoneConductionNormal` use separate configurable limits.
- Significant ABG defaults to 10 dB to recognize AC35/BC25 evidence. Broad conduction
  requires at least two abnormal AC pairs and more than half of abnormal AC points.
  Normal BC supports CHL; elevated BC plus broad gaps supports mixed loss.
- Localized gap wording defaults to >=15 dB, avoiding extra gap wording for the
  10 dB gap in the supplied single-8k example. Its low-frequency boundary is 1 kHz.
  These limits and the broad-pattern proportion are configurable.
- SNHL inference at 6/8 kHz needs at least two valid lower AC/BC pairs, no conflicting
  thresholds, no broad conduction, and no significant gap in the main loss region.
  No BC anywhere remains UNKNOWN. Missing supported BC remains UNKNOWN unless an
  explicitly equipment-limited NR follows an established non-conductive SNHL pattern.
- NR is never a numeric threshold or ABG input. Equipment-limited BC input uses
  `{ value: '75', modifier: 'NR', limitReason: 'EQUIPMENT_MAX_OUTPUT' }`.
  The point exposes `bcIsThreshold: false`, null BC/ABG, and its limit reason.
  Legacy NR without a reason is not automatically assumed to be equipment limited.
- Pattern priority: normal, isolated frequency, isolated adjacent measured range,
  notch, frequency region, general configuration. End frequencies can be isolated.
- A notch requires >=20 dB on both sides at immediately adjacent tested frequencies.
  An explicit missing/NR neighbour blocks confirmation. Omitted untested frequencies
  are skipped; available 3/6 kHz points are never bypassed when evaluating 4 kHz.
- Measured recovery splits abnormal clusters; missing measurements do not. Multiple
  clusters omit regional wording. Shape analysis remains available separately.
- Type, degree, shape, and location confidence are separate. Shape uncertainty alone
  never appends review wording. Unknown type and AC NR degree uncertainty stay visible.
- Bilateral merging retains the existing symmetry check and matches core type/degree
  plus strong location and localized gap findings. Weak shapes and warnings do not
  prevent merging. Unknown types are not merged into a definitive diagnosis.

## Assumptions needed to reconcile the examples

AC25 remains SLIGHT in `exactAffectedFrequencies` and standalone slight losses are
reported. When mild-or-worse loss coexists with slight thresholds, the primary degree
and location use mild-or-worse points, matching the supplied localized-gap and scattered
examples. Disable `preferMildOrWorseForPrimaryComment` to include all slight points in
that primary description. This reporting choice does not change AC normality or ABG
calculations. A slight threshold between dominant clusters does not prove their
continuity. The localized-gap regression uses precise 8 kHz wording, as permitted by
its requested high-frequency/8k alternative.

Existing 125 Hz support, 3 kHz high-region boundary, BC support through 4 kHz, input
limits, PTA completeness rules, RE/LE labels, and configurable terminology are retained.
Ear fragments remain lowercase; complete reports capitalize them.

## Representative before/after

| Case | Previous behavior | Updated ear comment |
| --- | --- | --- |
| Single 8k loss | High-frequency loss, type undetermined | Mild SNHL at 8 kHz. |
| Adjacent 3/4k | Localized wording already supported | Mild to moderate SNHL at 3-4 kHz. (en dash in output) |
| False 15 dB dip | Could become a notch | No notch; isolated location retained. |
| Established SNHL + equipment BC NR | Type undetermined with NR review text | Mild to profound SNHL at mid to high frequencies. |
| Localized low gap + 8k loss | Type undetermined | Mild SNHL at 8 kHz with gap at low frequency. |
| Scattered abnormalities | Forced mid-to-high region | Mild to moderate CHL. |
| Bilateral core match, weak shape differs | Separate ears | Bilateral mild to moderate SNHL. |

## Verification

`node --experimental-strip-types --test tests/audiometry-report.test.mjs`

`node --experimental-strip-types --test tests/*.test.mjs`

`node node_modules/typescript/bin/tsc --noEmit --incremental false`
