import { isDynamicSample } from '../services/dtwClassifier.js';

/**
 * Helper to inspect sample modality & hand count consistently across legacy and DTW rows
 */
export function getSampleDescriptor(sample) {
  if (isDynamicSample(sample)) {
    const featDim = sample.vector[0]?.length || 70;
    const seqLen = sample.vector.length;
    const hasFace = featDim === 76 || featDim === 152 || sample.metadata?.feature_version === 2;
    const isTwoHand = featDim >= 130 || sample.type === 'dynamic_two_hands';
    return {
      isDynamic: true,
      isTwoHand,
      hasFace,
      featureVersion: hasFace ? 2 : 1,
      badgeText: isTwoHand
        ? `Dynamic 2H • ${seqLen}×${featDim}D${hasFace ? ' (Face)' : ''}`
        : `Dynamic 1H • ${seqLen}×${featDim}D${hasFace ? ' (Face)' : ''}`,
      badgeClass: hasFace
        ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
        : isTwoHand
        ? 'bg-sky-950/80 text-[#5CA0F2] border-[#5CA0F2]/40'
        : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/35',
    };
  }

  const dim = Array.isArray(sample?.vector) ? sample.vector.length : 0;
  const isTwoHand = dim >= 126 || sample?.type === 'two_hands';
  return {
    isDynamic: false,
    isTwoHand,
    badgeText: isTwoHand ? 'Unified 2-Hand 126D' : 'Single-Hand 63D',
    badgeClass: isTwoHand
      ? 'bg-purple-950/80 text-purple-300 border-purple-500/30'
      : 'bg-slate-800 text-slate-300 border-slate-700',
  };
}

