/**
 * Pure Candidate Generator Core (Browser & Node.js compatible).
 * Zero filesystem dependencies.
 */

import type {
  Episode,
  PromoCandidate,
  CandidateContentItem
} from './types.ts';

export interface CandidateGenerationOptions {
  minDurationSeconds?: number;     // Minimum candidate duration (default: 20.0s)
  maxDurationSeconds?: number;     // Maximum candidate duration (default: 60.0s)
  minStartStepSeconds?: number;    // Min spacing between consecutive start points (default: 12.0s)
  minDurationGapSeconds?: number;  // Min duration difference between short & long window (default: 15.0s)
}

/**
 * Generates promo candidates for a single episode using a deterministic sliding-window.
 */
export function generateCandidatesForEpisode(
  episode: Episode,
  options: CandidateGenerationOptions = {}
): PromoCandidate[] {
  const {
    minDurationSeconds = 20.0,
    maxDurationSeconds = 60.0,
    minStartStepSeconds = 12.0,
    minDurationGapSeconds = 15.0
  } = options;

  // 1. Flatten all screenplay elements across scenes in chronological order
  const allElements = episode.scenes.flatMap(sc =>
    sc.elements.map(el => ({
      ...el,
      sceneNumber: sc.sceneNumber
    }))
  );

  allElements.sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds);

  const candidates: PromoCandidate[] = [];
  let lastStartSec = -999;

  // 2. Iterate through element starting boundaries
  for (let i = 0; i < allElements.length; i++) {
    const startEl = allElements[i];
    const candStart = startEl.startSeconds;

    // Rule: Avoid generating starting points that are too close to each other
    if (candStart - lastStartSec < minStartStepSeconds) {
      continue;
    }

    // Stop if remaining episode runtime cannot satisfy the minimum 20s duration
    if (episode.endSeconds - candStart < minDurationSeconds) {
      break;
    }

    // 3. Find valid element-aligned ending boundaries within [20s, 60s]
    let shortBoundary: { endEl: typeof allElements[0]; candEnd: number; duration: number } | null = null;
    let longBoundary: { endEl: typeof allElements[0]; candEnd: number; duration: number } | null = null;

    for (let j = i; j < allElements.length; j++) {
      const endEl = allElements[j];
      const candEnd = endEl.endSeconds;
      const duration = Number((candEnd - candStart).toFixed(3));

      if (duration < minDurationSeconds) {
        continue;
      }
      if (duration > maxDurationSeconds) {
        break;
      }

      // First valid boundary reaching >= 20s forms our concise window
      if (!shortBoundary) {
        shortBoundary = { endEl, candEnd, duration };
      }

      // Furthest boundary <= 60s (expanding by at least minDurationGapSeconds)
      if (shortBoundary && duration >= shortBoundary.duration + minDurationGapSeconds) {
        longBoundary = { endEl, candEnd, duration };
      }
    }

    // 4. Create promo candidates for chosen boundaries
    const boundaries = [shortBoundary, longBoundary].filter(
      (b): b is NonNullable<typeof shortBoundary> => b !== null
    );

    for (const boundary of boundaries) {
      const candEnd = boundary.candEnd;
      const duration = Number((candEnd - candStart).toFixed(3));

      // Collect all screenplay elements that overlap with this window:
      // (el.startSeconds < candEnd && el.endSeconds > candStart)
      const overlappingElements = allElements.filter(el =>
        el.startSeconds < candEnd && el.endSeconds > candStart
      );

      if (overlappingElements.length === 0) {
        continue;
      }

      const sceneNumbers = Array.from(new Set(overlappingElements.map(el => el.sceneNumber))).sort((a, b) => a - b);
      const elementIds = overlappingElements.map(el => el.id);

      const content: CandidateContentItem[] = overlappingElements.map(el => ({
        id: el.id,
        type: el.type,
        startTime: el.startTime,
        endTime: el.endTime,
        startSeconds: el.startSeconds,
        endSeconds: el.endSeconds,
        durationSeconds: el.durationSeconds,
        text: el.text,
        character: el.character,
        delivery: el.delivery,
        isOffScreen: el.isOffScreen
      }));

      const epNumStr = String(episode.episodeNumber || 1).padStart(3, '0');
      const candNumStr = String(candidates.length + 1).padStart(3, '0');
      const candidateId = `ep${epNumStr}-cand-${candNumStr}`;

      candidates.push({
        candidateId,
        episodeNumber: episode.episodeNumber,
        startTime: startEl.startTime,
        endTime: boundary.endEl.endTime,
        startSeconds: candStart,
        endSeconds: candEnd,
        durationSeconds: duration,
        sceneNumbers,
        elementIds,
        content
      });
    }

    lastStartSec = candStart;
  }

  return candidates;
}

