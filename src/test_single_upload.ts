import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeScreenplayText, validateScreenplayText } from './single_episode_analyzer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function runTests() {
  console.log('==================================================');
  console.log('PHASE 9 — SINGLE EPISODE UPLOAD & TEST AUDIT');
  console.log('==================================================\n');

  // Test 1: Empty file
  console.log('--- Test 1: Empty File Validation ---');
  const emptyRes = validateScreenplayText('');
  console.log(`Empty string validation result: isValid=${emptyRes.isValid}, error="${emptyRes.error}"`);
  if (emptyRes.isValid) throw new Error('Empty file validation failed to reject empty input!');
  console.log('Test 1 PASSED.\n');

  // Test 2: Invalid non-screenplay text
  console.log('--- Test 2: Invalid Non-Screenplay Text ---');
  const proseText = 'Once upon a time in a land far away, a princess lived in a castle. The end.';
  const proseRes = validateScreenplayText(proseText);
  console.log(`Prose text validation result: isValid=${proseRes.isValid}, error="${proseRes.error}"`);
  if (proseRes.isValid) throw new Error('Invalid format validation failed to reject prose text!');
  console.log('Test 2 PASSED.\n');

  // Test 3: Valid Screenplay Upload (Episode 1 content tested independently)
  console.log('--- Test 3: Analyze Valid Screenplay File (Episode 1 as test input) ---');
  const ep1Path = path.join(projectRoot, 'episodes', 'episode-001-Episode 1671703.txt');
  const ep1Content = fs.readFileSync(ep1Path, 'utf-8');

  // Ensure original JSON files timestamp/size before test
  const finalJsonPath = path.join(projectRoot, 'data', 'final_promo_candidates.json');
  const beforeStat = fs.statSync(finalJsonPath);

  const result = await analyzeScreenplayText(ep1Content, 'episode-001-test.txt');

  console.log(`Analysis success: ${result.success}`);
  console.log(`Episode Title:    ${result.episodeTitle}`);
  console.log(`Candidates count: ${result.candidates.length}`);
  console.log(`Summary:`, result.summary);

  if (!result.success || result.candidates.length === 0) {
    throw new Error(`Single episode analysis failed: ${result.error}`);
  }

  // Verify candidate properties
  const top = result.candidates[0];
  console.log(`Rank 1 Candidate: ID=${top.candidateId}, Score=${top.finalScore}, Duration=${top.durationSeconds}s, Elements=${top.content.length}`);
  if (top.rank !== 1 || (top.finalScore ?? 0) < 50 || top.durationSeconds < 20 || top.durationSeconds > 60) {
    throw new Error('Top candidate invalid properties!');
  }

  // Test 4: Verify original 50-episode dataset files were completely untouched
  console.log('\n--- Test 4: Verify Original Dataset Files Unmodified ---');
  const afterStat = fs.statSync(finalJsonPath);
  if (beforeStat.mtimeMs !== afterStat.mtimeMs || beforeStat.size !== afterStat.size) {
    throw new Error('CRITICAL ERROR: data/final_promo_candidates.json was modified during single episode test!');
  }
  console.log('Verified: data/final_promo_candidates.json was NOT modified or overwritten.');
  console.log('Test 4 PASSED.\n');

  // Test 5: Synthetic Episode (e.g. Episode 51)
  console.log('--- Test 5: Synthetic New Episode (Episode 51) ---');
  const syntheticScreenplay = `
EPISODE 51
LOGLINE: A sudden confrontation at midnight reveals an unspoken secret.
CONTINUITY NOTES: Follows the dramatic fallout.

Scene heading: INT. STUDY - NIGHT
Scene start: (00:00.00)
Scene end: (00:45.00)
ACTIONS AND DIALOGUE:

**CAMERA:**
Start: (00:00.00) | End: (00:04.00)
Close up on the antique grandfather clock ticking loudly in the dark.

**LADY ELEANOR (Tense, Whispering):**
Start: (00:03.50) | End: (00:08.00)
"You were never supposed to open that letter."

**LORD BARRINGTON (Cold, Stern):**
Start: (00:08.50) | End: (00:14.00)
"And you were never supposed to betray this family's trust, Eleanor."

**ACTION:**
Start: (00:14.00) | End: (00:19.00)
Eleanor steps back into the shadows, her hands trembling as she conceals the torn seal.

**LADY ELEANOR (Desperate):**
Start: (00:19.50) | End: (00:26.00)
"If the Duke finds out what is written inside, none of us will survive the night!"

**CAMERA:**
Start: (00:26.00) | End: (00:32.00)
Tight push-in on Lord Barrington's unyielding eyes as he raises the silver key.

**LORD BARRINGTON (Grim):**
Start: (00:32.00) | End: (00:39.00)
"Then let the Duke come... because I already sent the messenger."

**SOUND FX:**
Start: (00:39.00) | End: (00:44.00)
Ominous orchestral cliffhanger swell peaks abruptly into silence.

**CAMERA:**
Start: (00:44.00) | End: (00:45.00)
Cut to black.
`.trim();

  const synthResult = await analyzeScreenplayText(syntheticScreenplay, 'episode-051-Episode 1799999.txt');
  console.log(`Synthetic episode success: ${synthResult.success}`);
  console.log(`Detected title:           ${synthResult.episodeTitle}`);
  console.log(`Candidates generated:     ${synthResult.candidates.length}`);
  if (!synthResult.success || synthResult.candidates.length === 0) {
    throw new Error(`Synthetic episode analysis failed: ${synthResult.error}`);
  }
  const synthTop = synthResult.candidates[0];
  console.log(`Synthetic Top Candidate: Rank #${synthTop.rank}, Score=${synthTop.finalScore}, Timestamps=${synthTop.startTime} -> ${synthTop.endTime}`);
  console.log(`Hook: ${synthTop.evaluation?.hookScore}/5 (${synthTop.evaluation?.hookExplanation})`);
  console.log(`Cliffhanger: ${synthTop.evaluation?.cliffhangerScore}/5 (${synthTop.evaluation?.cliffhangerExplanation})`);
  console.log('Test 5 PASSED.\n');

  console.log('==================================================');
  console.log('ALL 5 SINGLE EPISODE UPLOAD TESTS PASSED SUCCESSFULLY!');
  console.log('==================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

