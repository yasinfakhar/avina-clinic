/** Deterministic clinic defaults; override this profile to change interpretation rules. */
export const audiometryConfig = {
  frequencies: [125, 250, 500, 1000, 2000, 3000, 4000, 6000, 8000],
  boneFrequencies: [125, 250, 500, 1000, 2000, 3000, 4000],
  requiredNormalFrequencies: [250, 500, 1000, 2000, 4000, 8000],
  airConductionNormalMaxDb: 20, airConductionSlightMaxDb: 25, boneConductionNormalMaxDb: 25,
  preferMildOrWorseForPrimaryComment: true, significantAbgDb: 10, borderlineAbgDb: 5, localizedAbgMinDb: 15, lowFrequencyGapMaxHz: 1000,
  flatRangeDb: 20, shapeDifferenceDb: 20, steepSlopeDifferenceDb: 40,
  notchDifferenceDb: 20, notchFrequencies: [3000, 4000, 6000],
  minimumConductivePoints: 2, minimumBonePoints: 2, minimumEstablishedSnhlPoints: 2,
  maximumResidualGapProportion: 0.5,
  symmetryDifferenceDb: 10, symmetryProportion: 0.75,
  minimumSymmetryPoints: 3, minimumAsymmetryPoints: 2,
  minimumNormalPoints: 3, minimumDb: -10, maximumDb: 120,
  degrees: [
    { name: 'SLIGHT', maximum: 25 }, { name: 'MILD', maximum: 40 },
    { name: 'MODERATE', maximum: 55 }, { name: 'MODERATELY_SEVERE', maximum: 70 },
    { name: 'SEVERE', maximum: 90 }, { name: 'PROFOUND', maximum: Infinity },
  ],
};
