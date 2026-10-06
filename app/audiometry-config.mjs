/** Clinic profile matching the existing audiogram bands. Edit rules here. */
export const audiometryConfig = {
  frequencies: [125, 250, 500, 1000, 2000, 3000, 4000, 6000, 8000],
  normalThresholdDb: 25, significantAbgDb: 15, borderlineAbgDb: 10,
  notchDifferenceDb: 15, minimumConductivePoints: 2,
  minimumNormalPoints: 3, minimumDb: -10, maximumDb: 120, stepDb: 5,
  shapeDifferenceDb: 15,
  degrees: [
    { name: 'MILD', maximum: 40 }, { name: 'MODERATE', maximum: 55 },
    { name: 'MODERATELY_SEVERE', maximum: 70 }, { name: 'SEVERE', maximum: 90 },
    { name: 'PROFOUND', maximum: Infinity },
  ],
};


