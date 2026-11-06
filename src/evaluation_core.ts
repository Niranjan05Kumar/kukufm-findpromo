/**
 * Pure Evaluation and Scoring Core (Browser & Node.js compatible).
 * Zero filesystem dependencies.
 */

import type {
  PromoCandidate,
  CandidateEvaluation,
  RankedPromoCandidate
} from './types.ts';

/**
 * Calculates final score for an evaluated promo candidate.
 * Formula: finalScore = (hookScore / 5 * 40) + (cliffhangerScore / 5 * 40) + (contextScore / 5 * 20)
 */
export function computeFinalScore(
  hookScore: number,
  cliffhangerScore: number,
  contextScore: number
): number {
  const hookComponent = (hookScore / 5) * 40;
  const cliffComponent = (cliffhangerScore / 5) * 40;
  const contextComponent = (contextScore / 5) * 20;
  const total = hookComponent + cliffComponent + contextComponent;
  return Number(total.toFixed(2));
}

/**
 * Deterministic mock evaluator used when OPENAI_API_KEY is not configured
 * or for offline testing/verification. Grounded strictly in candidate elements.
 */
export function evaluateCandidateMock(candidate: PromoCandidate): CandidateEvaluation {
  const openingBeats = candidate.content.filter(
    el => el.startSeconds <= candidate.startSeconds + 3.8
  );
  const endingBeats = candidate.content.filter(
    el => el.endSeconds >= candidate.endSeconds - 3.8
  );
  const dialogues = candidate.content.filter(el => el.type === 'dialogue');
  const characters = Array.from(new Set(dialogues.map(d => d.character).filter(Boolean)));

  // 1. Hook evaluation (opening ~3s)
  let hookScore = 2;
  let hookExplanation = 'The opening introduces the scene with moderate visual or narrative setup.';

  const openingDialogue = openingBeats.find(el => el.type === 'dialogue');
  const openingAction = openingBeats.find(el => el.type === 'action');

  if (openingDialogue) {
    const text = openingDialogue.text.toLowerCase();
    const delivery = (openingDialogue.delivery || '').toLowerCase();
    const dramaticWords = ['turn around', 'why', 'gerald', 'stop', 'fire', 'alexander', 'betray', 'marry', 'kill', 'never', 'no'];
    const hasDrama = dramaticWords.some(w => text.includes(w)) || delivery.includes('cold') || delivery.includes('shaken') || delivery.includes('alarmed');

    if (hasDrama) {
      hookScore = 4;
      hookExplanation = `Opens immediately with ${openingDialogue.character}'s striking line ("${openingDialogue.text}"), establishing high tension within the first 3 seconds.`;
    } else {
      hookScore = 3;
      hookExplanation = `Opens with dialogue from ${openingDialogue.character} ("${openingDialogue.text}"), introducing an active conversation.`;
    }
  } else if (openingAction) {
    hookScore = 3;
    hookExplanation = `Opens on a character action beat: ${openingAction.text.slice(0, 75)}...`;
  } else if (openingBeats.some(el => el.type === 'camera')) {
    hookScore = 2;
    hookExplanation = 'Opens on atmospheric camera framing before dialogue begins.';
  }

  // 2. Cliffhanger evaluation (ending beat)
  let cliffhangerScore = 2;
  let cliffhangerExplanation = 'The candidate ends on an ordinary scene transition with mild forward momentum.';

  const endingSound = endingBeats.find(el => el.type === 'sound_fx');
  const endingDialogue = endingBeats.find(el => el.type === 'dialogue');
  const endingCamera = endingBeats.find(el => el.type === 'camera');

  if (endingSound && endingSound.text.toLowerCase().includes('cliffhanger')) {
    cliffhangerScore = 5;
    cliffhangerExplanation = `Concludes with a climactic audio cue: "${endingSound.text}", creating maximum urgency to continue watching.`;
  } else if (endingDialogue) {
    const text = endingDialogue.text.trim();
    if (text.endsWith('?') || text.endsWith('...') || text.includes('never') || text.includes('cannot') || text.includes('die')) {
      cliffhangerScore = 4;
      cliffhangerExplanation = `Ends abruptly on ${endingDialogue.character}'s unresolved statement: "${endingDialogue.text}", leaving an immediate unanswered question.`;
    } else {
      cliffhangerScore = 3;
      cliffhangerExplanation = `Ends on dialogue by ${endingDialogue.character} without complete narrative resolution.`;
    }
  } else if (endingCamera && endingCamera.text.toLowerCase().includes('cut to black')) {
    cliffhangerScore = 4;
    cliffhangerExplanation = 'Ends sharply with a dramatic cut to black following the preceding confrontation.';
  }

  // 3. Standalone Context evaluation
  let contextScore = 3;
  let contextExplanation = 'The core interpersonal dynamic is understandable from the dialogue exchanges.';

  if (characters.length >= 2 && dialogues.length >= 4) {
    contextScore = 4;
    contextExplanation = `Features clear two-party dialogue between ${characters.slice(0, 2).join(' and ')}, allowing a new viewer to readily understand the conflict and stakes.`;
  } else if (dialogues.length <= 1) {
    contextScore = 2;
    contextExplanation = 'Contains sparse dialogue, making the underlying backstory and stakes somewhat limited for a first-time viewer.';
  }

  return {
    hookScore,
    hookExplanation,
    cliffhangerScore,
    cliffhangerExplanation,
    contextScore,
    contextExplanation
  };
}

/**
 * Deterministic tie-breaking comparator for ranked promo candidates.
 */
export function compareRankedCandidates(
  a: RankedPromoCandidate,
  b: RankedPromoCandidate
): number {
  // 1. Higher final score
  if (b.finalScore !== null && a.finalScore !== null && b.finalScore !== a.finalScore) {
    return b.finalScore - a.finalScore;
  }

  if (a.finalScore === null && b.finalScore !== null) return 1;
  if (b.finalScore === null && a.finalScore !== null) return -1;

  if (a.evaluation && b.evaluation) {
    // 2. Higher hook score
    if (b.evaluation.hookScore !== a.evaluation.hookScore) {
      return b.evaluation.hookScore - a.evaluation.hookScore;
    }
    // 3. Higher cliffhanger score
    if (b.evaluation.cliffhangerScore !== a.evaluation.cliffhangerScore) {
      return b.evaluation.cliffhangerScore - a.evaluation.cliffhangerScore;
    }
    // 4. Higher context score
    if (b.evaluation.contextScore !== a.evaluation.contextScore) {
      return b.evaluation.contextScore - a.evaluation.contextScore;
    }
  }

  // 5. Earlier episode number
  if (a.episodeNumber !== b.episodeNumber) {
    return a.episodeNumber - b.episodeNumber;
  }

  // 6. Earlier start timestamp
  if (a.startSeconds !== b.startSeconds) {
    return a.startSeconds - b.startSeconds;
  }

  // 7. Candidate ID
  return a.candidateId.localeCompare(b.candidateId);
}

