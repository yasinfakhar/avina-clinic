/** Deterministic clinic defaults; override this profile to change interpretation rules. */
export const audiometryConfig = {
  frequencies: [125, 250, 500, 1000, 2000, 3000, 4000, 6000, 8000],
  boneFrequencies: [125, 250, 500, 1000, 2000, 3000, 4000],
  requiredNormalFrequencies: [250, 500, 1000, 2000, 4000, 8000],
  normalThresholdDb: 20, significantAbgDb: 15, borderlineAbgDb: 10,
  flatRangeDb: 20, shapeDifferenceDb: 20, steepSlopeDifferenceDb: 40,
  notchDifferenceDb: 15, notchRecoveryDb: 10,
  minimumConductivePoints: 2, minimumBonePoints: 2,
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
