import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FinalPromoCandidatesDataset, RankedPromoCandidate } from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const finalJsonPath = path.join(projectRoot, 'data', 'final_promo_candidates.json');
const distIndexPath = path.join(projectRoot, 'dist', 'index.html');

console.log('==================================================');
console.log('PHASE 6 — PLATFORM INTEGRITY & SPOT CHECK');
console.log('==================================================');

if (!fs.existsSync(finalJsonPath)) {
  console.error(`ERROR: ${finalJsonPath} not found!`);
  process.exit(1);
}

const raw = fs.readFileSync(finalJsonPath, 'utf-8');
const dataset: FinalPromoCandidatesDataset = JSON.parse(raw);
const candidates = dataset.candidates;

console.log(`Loaded dataset: ${candidates.length} candidates.`);
console.log(`Dataset summary:`, dataset.summary);

// 1. Invariant: Rank 1 candidate
const rank1 = candidates[0];
console.log('\n--- VERIFYING RANK 1 CANDIDATE ---');
console.log(`Candidate ID:     ${rank1.candidateId}`);
console.log(`Rank:             ${rank1.rank} (Expected: 1)`);
console.log(`Episode:          ${rank1.episodeNumber}`);
console.log(`Timestamps:       ${rank1.startTime} -> ${rank1.endTime} (${rank1.durationSeconds}s)`);
console.log(`Final Score:      ${rank1.finalScore} / 100`);
console.log(`Hook Score:       ${rank1.evaluation?.hookScore} / 5`);
console.log(`Cliffhanger:      ${rank1.evaluation?.cliffhangerScore} / 5`);
console.log(`Context Score:    ${rank1.evaluation?.contextScore} / 5`);
console.log(`Hook Expl.:       ${rank1.evaluation?.hookExplanation.slice(0, 70)}...`);
console.log(`Cliffhanger Expl: ${rank1.evaluation?.cliffhangerExplanation.slice(0, 70)}...`);
console.log(`Content elements: ${rank1.content.length}`);

if (rank1.rank !== 1 || rank1.finalScore !== 88) {
  throw new Error(`Rank 1 candidate assertion failed: rank=${rank1.rank}, score=${rank1.finalScore}`);
}

// 2. Invariant: Rank 2 candidate
const rank2 = candidates[1];
console.log('\n--- VERIFYING RANK 2 CANDIDATE ---');
console.log(`Candidate ID:     ${rank2.candidateId}`);
console.log(`Rank:             ${rank2.rank} (Expected: 2)`);
console.log(`Episode:          ${rank2.episodeNumber}`);
console.log(`Timestamps:       ${rank2.startTime} -> ${rank2.endTime} (${rank2.durationSeconds}s)`);
console.log(`Final Score:      ${rank2.finalScore} / 100`);
console.log(`Content elements: ${rank2.content.length}`);

if (rank2.rank !== 2 || (rank2.finalScore ?? 0) > (rank1.finalScore ?? 0)) {
  throw new Error(`Rank 2 candidate assertion failed: rank=${rank2.rank}, score=${rank2.finalScore}`);
}

// 3. Invariant: Middle episode candidate (Episode 25)
const midCandidate = candidates.find((c) => c.episodeNumber === 25);
console.log('\n--- VERIFYING MIDDLE EPISODE CANDIDATE (EPISODE 25) ---');
if (!midCandidate) {
  throw new Error('No candidate found for Episode 25!');
}
console.log(`Candidate ID:     ${midCandidate.candidateId}`);
console.log(`Rank:             ${midCandidate.rank}`);
console.log(`Episode:          ${midCandidate.episodeNumber}`);
console.log(`Timestamps:       ${midCandidate.startTime} -> ${midCandidate.endTime} (${midCandidate.durationSeconds}s)`);
console.log(`Final Score:      ${midCandidate.finalScore} / 100`);
console.log(`Content elements: ${midCandidate.content.length}`);

// 4. Invariant: Last candidate (Rank 330)
const lastCandidate = candidates[candidates.length - 1];
console.log('\n--- VERIFYING LAST CANDIDATE IN DATASET ---');
console.log(`Candidate ID:     ${lastCandidate.candidateId}`);
console.log(`Rank:             ${lastCandidate.rank} (Expected: ${candidates.length})`);
console.log(`Episode:          ${lastCandidate.episodeNumber}`);
console.log(`Timestamps:       ${lastCandidate.startTime} -> ${lastCandidate.endTime} (${lastCandidate.durationSeconds}s)`);
console.log(`Final Score:      ${lastCandidate.finalScore} / 100`);
console.log(`Content elements: ${lastCandidate.content.length}`);

if (lastCandidate.rank !== candidates.length || (lastCandidate.finalScore ?? 0) < 50) {
  throw new Error(`Last candidate assertion failed: rank=${lastCandidate.rank}, score=${lastCandidate.finalScore}`);
}

// 5. Invariant: Production build verification
console.log('\n--- VERIFYING PRODUCTION BUILD ARTIFACTS ---');
if (!fs.existsSync(distIndexPath)) {
  throw new Error(`dist/index.html does not exist! Run npm run build first.`);
}
const htmlContent = fs.readFileSync(distIndexPath, 'utf-8');
const assetsDir = path.join(projectRoot, 'dist', 'assets');
const assetFiles = fs.readdirSync(assetsDir);
console.log(`dist/index.html verified (${htmlContent.length} bytes)`);
console.log(`dist/assets/ verified (${assetFiles.length} files: ${assetFiles.join(', ')})`);

console.log('\n==================================================');
console.log('STATUS: PASSED (Platform spot-checks and build verified)');
console.log('==================================================');

