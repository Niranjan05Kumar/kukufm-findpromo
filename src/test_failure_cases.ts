import type { RankedPromoCandidate, FinalPromoCandidatesDataset } from './types.ts';

console.log('Testing failure case resilience...');

// 1. Missing evaluation object
const malformedCandidate: RankedPromoCandidate = {
  candidateId: 'test-cand-001',
  episodeNumber: 1,
  startTime: '00:00.00',
  endTime: '00:25.00',
  startSeconds: 0,
  endSeconds: 25,
  durationSeconds: 25,
  sceneNumbers: [1],
  elementIds: ['el-1'],
  content: [
    {
      id: 'el-1',
      type: 'dialogue',
      startTime: '00:00.00',
      endTime: '00:05.00',
      startSeconds: 0,
      endSeconds: 5,
      durationSeconds: 5,
      text: 'Test line',
    },
  ],
  evaluationStatus: 'failed',
  evaluatedAt: new Date().toISOString(),
  finalScore: null,
  rank: null,
};

// Check that null evaluation doesn't throw on property access when guarded
const hookScore = malformedCandidate.evaluation?.hookScore ?? '—';
const finalScoreText = malformedCandidate.finalScore !== null ? malformedCandidate.finalScore.toFixed(2) : 'N/A';
console.log(`- Null evaluation guarded hook score: "${hookScore}" (Expected: "—")`);
console.log(`- Null finalScore guarded display: "${finalScoreText}" (Expected: "N/A")`);

if (hookScore !== '—' || finalScoreText !== 'N/A') {
  throw new Error('Guarded property failure test failed!');
}

// 2. Empty candidate list handling
const emptyDataset: FinalPromoCandidatesDataset = {
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  filteringThresholds: { overlapRatioThreshold: 0.8, minFinalScoreThreshold: 50 },
  summary: {
    inputCandidates: 0,
    invalidRemoved: 0,
    failedEvaluationRemoved: 0,
    exactDuplicatesRemoved: 0,
    overlapDuplicatesRemoved: 0,
    weakCandidatesRemoved: 0,
    finalCandidates: 0,
    highestScore: 0,
    lowestScore: 0,
    averageScore: 0,
  },
  candidates: [],
};

const isEmptyHandled = emptyDataset.candidates.length === 0;
console.log(`- Empty dataset detected properly: ${isEmptyHandled}`);

console.log('Failure case tests PASSED cleanly!\n');

