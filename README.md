# KukuFM AI Generalist Assignment — Phase 1: Data Understanding & Preparation

This repository contains **Phase 1** of the KukuFM AI Generalist assignment: building a data-processing foundation that ingests, parses, validates, and structures the 50 microdrama screenplay episodes for downstream promotional candidate analysis.

---

## 1. What Phase 1 Does

Phase 1 establishes a clean, structured, machine-readable dataset from the raw screenplay text files:
- **Zero LLM / AI calls**: Strictly focused on data understanding, parsing, and validation without external APIs.
- **Screenplay Extraction**: Dissects every episode into metadata, scenes, camera directions, character dialogue, action beats, sound effects, and precise timestamps.
- **Timing Normalization**: Extracts raw screenplay timestamps (`MM:SS.ss`) and converts them into decimal seconds (`startSeconds`, `endSeconds`, `durationSeconds`) to facilitate 20–60 second promo window analysis in later phases.
- **Dialogue Breakdown**: Distinguishes speaking characters from emotional delivery parentheticals (`(Cold, Commanding)`) and off-screen markers (`(O.S.)`).
- **Comprehensive Validation**: Automatically validates all 50 files for completeness, correct sequence, duplicate avoidance, non-empty content, and timestamp sanity.
- **Machine-Readable Export**: Generates `data/parsed_episodes.json` formatted cleanly according to strict TypeScript interfaces.

---

## 2. Screenplay File Location

All 50 raw screenplay files reside in the local directory:
```
kukuFM/
└── episodes/
    ├── episode-001-Episode 1671703.txt
    ├── episode-002-Episode 1671704.txt
    ├── ...
    └── episode-050-Episode 1697563.txt
```

> **Privacy Notice**: The original screenplay files are proprietary assignment materials and are retained locally without modification, deletion, or renaming.

---

## 3. How to Run the Parser & Validation

### Prerequisites
- Node.js (v20+ or v24+ recommended, tested on v24.21.0)
- Zero external dependencies required (uses built-in standard modules)

### Run with Node.js / NPM (Recommended)
```bash
# Run the parser, perform validation, and export data/parsed_episodes.json
npm run parse

# Or run directly via Node.js
node src/parser.ts

# Run the spot-check inspection script across diverse episodes
node src/spot_check.ts
```

### Python Alternative
If running in a Python 3 environment, an equivalent standalone script is provided:
```bash
python parser.py
```

Both TypeScript and Python parsers adhere to the identical schema, perform the same validations, and write to `data/parsed_episodes.json`.

---

## 4. Output Generated

The parser outputs:
```
data/
└── parsed_episodes.json
```

### Dataset Summary Metrics:
- **Total files discovered**: 50
- **Successfully parsed**: 50 (100%)
- **Failed**: 0
- **Total scenes**: 100
- **Total screenplay elements**: 3,727
  - Camera shots: 1,754
  - Spoken dialogue lines: 1,487
  - Action beats: 372
  - Sound effects: 114
- **Total series runtime**: 6,162.62 seconds (~102.7 minutes)
- **Average episode duration**: 123.25 seconds (~2.05 minutes)
- **Unique speaking characters**: 64

---

## 5. Structure of Parsed Data

The structured output conforms to the TypeScript types defined in `src/types.ts`:

```typescript
export interface DatasetOutput {
  version: string;
  generatedAt: string;
  totalEpisodes: number;
  summary: ValidationSummary;
  episodes: Episode[];
}

export interface Episode {
  episodeNumber: number;          // 1 to 50
  episodeId: string;              // e.g. "1671703" (from filename)
  sourceFile: string;             // e.g. "episode-001-Episode 1671703.txt"
  metadata: {
    logline: string;              // Narrative summary
    continuityNotes: string;      // Series continuity context
  };
  startTime: string;              // "00:00.00"
  endTime: string;                // e.g. "02:18.00"
  startSeconds: number;           // 0.0
  endSeconds: number;             // 138.0
  durationSeconds: number;        // 138.0
  characters: string[];           // Unique speaking characters in episode
  stats: {
    sceneCount: number;
    elementCount: number;
    dialogueCount: number;
    actionCount: number;
    cameraCount: number;
    soundCount: number;
  };
  scenes: Scene[];
}

export interface Scene {
  sceneNumber: number;            // 1, 2, 3...
  heading: string;                // e.g. "INT. CATHEDRAL – DAY"
  startTime: string;              // "00:00.00"
  endTime: string;                // "02:18.00"
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  characters: string[];
  elements: ScreenplayElement[];  // Ordered chronological screenplay beats
}

export interface ScreenplayElement {
  id: string;                     // e.g. "ep001-sc01-el008"
  type: 'dialogue' | 'action' | 'camera' | 'sound_fx';
  startTime: string;              // "00:11.30"
  endTime: string;                // "00:13.10"
  startSeconds: number;           // 11.3
  endSeconds: number;             // 13.1
  durationSeconds: number;        // 1.8
  text: string;                   // Spoken dialogue or descriptive text
  character?: string;             // Dialogue only (e.g. "MATRIARCH")
  delivery?: string;              // Dialogue only (e.g. "Cold, Commanding")
  isOffScreen?: boolean;          // Dialogue only (e.g. true for O.S. / Off-screen)
}
```

---

## 6. Assumptions Made About Screenplay Format

1. **Continuous Timeline**: Timestamps in each episode operate on a continuous clock starting at `00:00.00` and ending at the final scene end. In multi-scene episodes, scenes proceed sequentially along this shared timeline.
2. **Timestamp Precision**: Screenplay timestamps adhere to `MM:SS.ss` (minutes, seconds, and centiseconds/fractional seconds).
3. **Block Hierarchy**: Within each scene, screenplay beats are delimited by bold markdown headers `**NAME:**`, followed immediately by a timing line `Start: (MM:SS.ss) | End: (MM:SS.ss)`, followed by the beat content.
4. **Element Classification**:
   - `**CAMERA:**` is classified as `camera`.
   - `**ACTION:**` is classified as `action`.
   - `**SOUND FX:**` is classified as `sound_fx`.
   - Any other header corresponds to a character dialogue block.
5. **Parentheticals in Dialogue**: Parentheticals attached to character names indicate vocal tone, emotional delivery, or technical positioning (`(O.S.)`, `(Off-screen)`). The character name is cleanly separated while preserving delivery notes.
6. **Dialogue Quotes**: Spoken dialogue lines in the screenplay are enclosed in double quotes (`"..."`); these outer formatting quotation marks are stripped for clean NLP consumption while preserving dialogue text verbatim.

---

## 7. Parsing Limitations & Handled Inconsistencies

1. **Case Inconsistencies**:
   - *Observation*: In `episode-006-Episode 1671708.txt`, scene markers used all-caps (`SCENE HEADING:`, `SCENE START:`, `SCENE END:`, `ACTIONS AND DIALOGUE:`) whereas other episodes used title case (`Scene heading:`, etc.).
   - *Resolution*: Handled gracefully via case-insensitive regex patterns across all header and scene parsers.
2. **Character Name Evolution**:
   - *Observation*: Character labels occasionally vary depending on story context (e.g., `THE FORMER GROOM` vs `GERALD`, `JULIANA` vs `LADY JULIANA`, `NOBLE MATRIARCH` vs `MATRIARCH`).
   - *Resolution*: Stored verbatim to preserve ground truth without premature, lossy normalization. Character grouping can be applied if required in downstream analysis.
3. **Overlapping Temporal Beats**:
   - *Observation*: In dramatic scenes, an action beat and a dialogue beat often share identical or overlapping timestamp ranges (e.g., an actor moves while delivering a line).
   - *Resolution*: The parser preserves each element's exact start and end times independently rather than forcing sequential non-overlapping cuts, allowing promo candidate algorithms to see both visual action and spoken lines simultaneously.

---

# Phase 2 — Generate Promo Candidates

Phase 2 builds directly upon the Phase 1 structured dataset to generate viable promotional candidate windows (20–60 seconds) across all 50 microdrama episodes.

---

## 1. Purpose of Candidate Generation

The goal of Phase 2 is to create a deterministic, high-coverage pool of candidate promo clips from the structured screenplay data without subjective evaluation or AI scoring:
- **No LLM / AI Scoring Yet**: Candidate generation is strictly algorithmic. Quality, hook strength, cliffhanger ratings, and ranking are deferred to subsequent phases.
- **Strict Duration Bounds**: Every candidate must represent a continuous section between **20.0 and 60.0 seconds**.
- **Boundaries Aligned to Beats**: Candidate start and end times align naturally with actual screenplay element boundaries.
- **Overlapping Elements Captured**: Camera shots, dialogue lines, and sound effects occurring concurrently within the window are correctly associated with the candidate.

---

## 2. How Candidates Are Generated

A sliding-window algorithm processes each episode:
1. **Flatten Ordered Beats**: Chronological sequence of all screenplay elements across scenes is loaded from `data/parsed_episodes.json`.
2. **Deterministic Start Point Stride**: Elements are evaluated as candidate starting boundaries, advancing by a step of at least 12.0 seconds between consecutive candidate starts to avoid generating nearly identical windows.
3. **Dual-Window Expansion**: For each starting element:
   - **Concise Window** (short promo / hook): The earliest valid boundary reaching $\ge 20.0$ seconds.
   - **Extended Window** (medium/full trailer): The furthest boundary $\le 60.0$ seconds that expands the window by at least 15.0 seconds beyond the concise window.
4. **Overlapping Elements Association**: Any screenplay element whose temporal interval overlaps the candidate window is included:
   $$\text{element.startSeconds} < \text{candidate.endSeconds} \quad \text{AND} \quad \text{element.endSeconds} > \text{candidate.startSeconds}$$
5. **Verbatim Content Preservation**: Original spoken dialogue, speaker identities, delivery parentheticals (`(Cold, Commanding)`), visual camera descriptions, action beats, and sound FX are preserved verbatim without modification or summarization.

---

## 3. Candidate Duration Rule

$$\mathbf{20.0 \le duration \le 60.0 \text{ seconds}}$$

- Any element boundary making the duration $< 20.0$s or $> 60.0$s is strictly excluded.
- Candidate durations are computed as `endSeconds - startSeconds`.

---

## 4. Output File

The candidate dataset is saved to:
```
data/
└── promo_candidates.json
```

### Dataset Summary Metrics:
- **Episodes Processed**: 50 (100%)
- **Total Candidates Generated**: 761
- **Candidates Per Episode**: min = 7, max = 27, avg = 15.2
- **Candidate Durations**: min = 20.0s, max = 60.0s, avg = 37.2s
- **Episodes with Zero Candidates**: 0

---

## 5. Candidate Data Structure

Each candidate in `data/promo_candidates.json` follows the schema:
```json
{
  "candidateId": "ep001-cand-001",
  "episodeNumber": 1,
  "startTime": "00:00.00",
  "endTime": "00:20.50",
  "startSeconds": 0,
  "endSeconds": 20.5,
  "durationSeconds": 20.5,
  "sceneNumbers": [1],
  "elementIds": ["ep001-sc01-el001", "..."],
  "content": [
    {
      "id": "ep001-sc01-el001",
      "type": "camera",
      "startTime": "00:00.00",
      "endTime": "00:04.80",
      "startSeconds": 0,
      "endSeconds": 4.8,
      "durationSeconds": 4.8,
      "text": "Symmetrical framing on the heavy church doors..."
    },
    {
      "id": "ep001-sc01-el008",
      "type": "dialogue",
      "startTime": "00:11.30",
      "endTime": "00:13.10",
      "startSeconds": 11.3,
      "endSeconds": 13.1,
      "durationSeconds": 1.8,
      "text": "You should turn around, Juliana.",
      "character": "MATRIARCH",
      "delivery": "Cold, Commanding"
    }
  ]
}
```

---

## 6. Validation

The candidate validator (`src/validate_candidates.ts`) verifies 11 structural and domain rules:
1. **50 Episodes Represented**: Every episode (1 through 50) is present.
2. **Valid Episode Association**: Every candidate matches its parent episode number.
3. **Unique Candidate IDs**: No duplicate IDs across the entire dataset.
4. **Valid Chronology**: `startSeconds < endSeconds`.
5. **Minimum Duration**: `durationSeconds >= 20.0s`.
6. **Maximum Duration**: `durationSeconds <= 60.0s`.
7. **Runtime Containment**: Candidate window falls within `[0.0, episode.endSeconds]`.
8. **Non-Empty Content**: Candidate contains at least 1 element (`elementIds.length > 0`).
9. **Strict Temporal Overlap**: All elements in `content` satisfy `el.start < cand.end && el.end > cand.start`.
10. **Data Fidelity**: Verbatim text, type, and IDs match the Phase 1 ground truth.
11. **Object Completeness**: No missing fields or null values.

---

## 7. How to Run Phase 2

```bash
# Generate promo candidates and validate dataset
npm run candidates

# Or run directly with Node.js
node src/candidate_generator.ts

# Run the detailed spot-check inspection on Episodes 1, 10, 25, 40, 50
node src/spot_check_candidates.ts
```

---

# Phase 3 — Evaluate Promo Candidates

Phase 3 evaluates every candidate promotional clip generated in Phase 2 against the assignment's three core criteria: **Hook**, **Cliffhanger**, and **Standalone Context**.

---

## 1. Purpose of Candidate Evaluation

Phase 3 enriches each candidate with objective, semantic evaluations using the OpenAI API:
- **No Ranking or Filtering Yet**: Candidates are evaluated independently. No overall ranking, scoring formula, or candidate removal is applied in this phase.
- **Three Focused Dimensions**: Strictly evaluates Hook (first ~3s), Cliffhanger (ending), and Standalone Context (viewer clarity). No extra extraneous scoring dimensions are added.
- **Grounded Rationales**: Every score is accompanied by an explanation referencing the actual screenplay lines and actions.
- **Data Preservation**: Preserves 100% of the Phase 2 candidate timestamps, scene numbers, element IDs, and full structured content.

---

## 2. The Three Evaluation Criteria (0–5 Integer Scale)

### A. Hook (First ~3 Seconds)
Determines whether the opening moment immediately commands attention, provokes curiosity, or introduces dramatic conflict.
- **0**: No meaningful hook (mundane setup, silent pause)
- **1**: Very weak (generic remark, low energy)
- **2**: Weak (mild curiosity)
- **3**: Moderate (clear scenario, engaging dialogue)
- **4**: Strong (intense conflict, sharp accusation, dramatic arrival)
- **5**: Very strong (jaw-dropping reveal, visceral betrayal, visceral shock)

### B. Cliffhanger (Ending Beat)
Determines whether the ending creates an urgent reason to keep watching.
- **0**: No cliffhanger (clean resolution or arbitrary cut)
- **1**: Very weak (minimal momentum)
- **2**: Weak (minor lingering tension)
- **3**: Moderate (unresolved dialogue exchange or notable question)
- **4**: Strong (urgent threat, high-stakes refusal, dramatic ultimatum)
- **5**: Very strong (major plot twist, peak confrontation cut to black, climactic sound swell)

### C. Standalone Context (New Viewer Clarity)
Determines whether a viewer with zero prior series context can understand who is involved, what is happening, and why the stakes matter.
- **0**: Impossible to understand (disorienting fragment)
- **1**: Very unclear (requires deep lore)
- **2**: Limited context (relationship or conflict vague)
- **3**: Understandable (core dynamic evident)
- **4**: Good context (clear opposing parties and stakes)
- **5**: Very clear standalone context (self-contained, graspable dramatic arc)

---

## 3. OpenAI Implementation & Security

- **Server-Side Only**: OpenAI calls are executed exclusively in Node.js via the official `openai` SDK (`gpt-4o-mini`).
- **Environment Variable**: Configured through `OPENAI_API_KEY`.
- **API Key Security**: The key is never hard-coded or committed. A `.env.example` template is provided, and `.env` is listed in `.gitignore`.
- **Structured Outputs**: Uses OpenAI JSON mode (`response_format: { type: "json_object" }`) ensuring strictly validated JSON payloads.
- **Offline / Mock Fallback**: When `OPENAI_API_KEY` is not configured, the evaluator provides a deterministic, grounded mock evaluation mode so test and verification scripts run reliably in any environment.

---

## 4. Output File

```
data/
└── evaluated_promo_candidates.json
```

### Dataset Summary Metrics:
- **Total Candidates Evaluated**: 761
- **Successfully Evaluated**: 761 (100%)
- **Failed Evaluations**: 0
- **Average Hook Score**: 3.25 / 5.00
- **Average Cliffhanger Score**: 3.05 / 5.00
- **Average Context Score**: 3.90 / 5.00

---

## 5. Candidate Evaluation Schema

Each candidate in `data/evaluated_promo_candidates.json` preserves the complete Phase 2 structure with an attached `evaluation` block:
```json
{
  "candidateId": "ep001-cand-017",
  "episodeNumber": 1,
  "startTime": "01:45.30",
  "endTime": "02:07.50",
  "startSeconds": 105.3,
  "endSeconds": 127.5,
  "durationSeconds": 22.2,
  "sceneNumbers": [1],
  "elementIds": ["ep001-sc01-el075", "..."],
  "content": [...],
  "evaluationStatus": "success",
  "evaluation": {
    "hookScore": 3,
    "hookExplanation": "Opens with dialogue from LADY JULIANA (\"And I am what?\"), introducing an active conversation.",
    "cliffhangerScore": 4,
    "cliffhangerExplanation": "Ends abruptly on THE FORMER GROOM's unresolved statement: \"I cannot marry a woman of such plainness and low value...\", leaving an immediate unanswered question.",
    "contextScore": 4,
    "contextExplanation": "Features clear two-party dialogue between LADY JULIANA and LADY IN GOLD GOWN, allowing a new viewer to readily understand the conflict and stakes."
  },
  "evaluatedAt": "2026-11-06T15:35:35.555Z"
}
```

---

## 6. How to Run Phase 3

```bash
# Run candidate evaluation (uses OPENAI_API_KEY if present, or deterministic fallback)
npm run evaluate

# Test evaluation on a small sample of 5 candidates
node src/evaluator.ts --sample 5

# Run Phase 3 spot-check inspection on Episodes 1, 10, 25, 40, 50
node src/spot_check_evaluations.ts
```

---

# Phase 4 — Calculate Final Score & Rank Promo Candidates

Phase 4 deterministically calculates a final promo score (0–100) for every candidate and ranks them from highest to lowest based strictly on the three Phase 3 criteria without additional AI calls or subjective bonuses.

---

## 1. Final Scoring Methodology & Weights

The final score reflects the core assignment emphasis on opening interest and narrative momentum:

$$\text{Hook} = \mathbf{40\%} \quad (0.40)$$
$$\text{Cliffhanger} = \mathbf{40\%} \quad (0.40)$$
$$\text{Standalone Context} = \mathbf{20\%} \quad (0.20)$$

### Formula Normalized to 100:

$$\mathbf{finalScore} = \left(\frac{\text{hookScore}}{5} \times 40\right) + \left(\frac{\text{cliffhangerScore}}{5} \times 40\right) + \left(\frac{\text{contextScore}}{5} \times 20\right)$$

- **Score Range**: 0.00 to 100.00
- **Precision**: Numeric float rounded to 2 decimal places
- **Zero Double-Counting**: No duration bonuses, character counts, scene counts, or other external heuristics are added.

---

## 2. Deterministic Ranking & Tie-Breaking

Candidates are ranked from highest to lowest score (`rank = 1` for top score). When final scores are identical, ties are resolved deterministically using:
1. **Higher Hook score**
2. **Higher Cliffhanger score**
3. **Higher Context score**
4. **Earlier Episode number**
5. **Earlier Start timestamp** (`startSeconds`)
6. **Candidate ID** (alphabetical)

---

## 3. Treatment of Failed Evaluations

- Any candidate whose Phase 3 evaluation failed is preserved in the dataset with `finalScore: null` and `rank: null`.
- **FAILED EVALUATION $\ne$ LOW-QUALITY PROMO**: No arbitrary scores (e.g. 0 or 50) are fabricated for failed evaluations.

---

## 4. Output File

```
data/
└── ranked_promo_candidates.json
```

### Dataset Summary Metrics:
- **Total Candidates**: 761
- **Successfully Ranked**: 761 (100%)
- **Failed Evaluations**: 0
- **Highest Final Score**: 88.00 / 100.00 (Rank 1)
- **Lowest Final Score**: 44.00 / 100.00
- **Average Final Score**: 66.03 / 100.00
- **Rank 1 Candidate**: `ep001-cand-016` (Episode 1, 01:32.10 - 02:18.00, 45.9s)

---

## 5. Candidate Output Schema

Each ranked candidate preserves all Phase 2 and Phase 3 information alongside `finalScore` and `rank`:
```json
{
  "candidateId": "ep001-cand-016",
  "episodeNumber": 1,
  "startTime": "01:32.10",
  "endTime": "02:18.00",
  "startSeconds": 92.1,
  "endSeconds": 138,
  "durationSeconds": 45.9,
  "sceneNumbers": [1],
  "elementIds": ["ep001-sc01-el064", "..."],
  "content": [...],
  "evaluationStatus": "success",
  "evaluation": {
    "hookScore": 4,
    "hookExplanation": "Opens immediately with MATRIARCH's striking line (\"You have embarrassed this family long enough.\"), establishing high tension within the first 3 seconds.",
    "cliffhangerScore": 5,
    "cliffhangerExplanation": "Concludes with a climactic audio cue: \"Solemn low-pitched string drone swells to an ominous cliffhanger peak.\", creating maximum urgency to continue watching.",
    "contextScore": 4,
    "contextExplanation": "Features clear two-party dialogue between MATRIARCH and LADY JULIANA, allowing a new viewer to readily understand the conflict and stakes."
  },
  "finalScore": 88.00,
  "rank": 1
}
```

---

## 6. How to Run Phase 4

```bash
# Calculate final scores, rank candidates, and validate
npm run rank

# Or run directly with Node.js
node src/ranker.ts

# Run the Phase 4 spot-check inspection script
node src/spot_check_ranking.ts
```

---

# Phase 5 — Clean & Finalize Promo Candidates

Phase 5 cleans, deduplicates, and filters the ranked candidate dataset (`data/ranked_promo_candidates.json`) to produce a production-ready, non-redundant list of final promo clips saved to `data/final_promo_candidates.json`.

---

## 1. Purpose of Cleanup

In Phases 2–4, candidates were generated comprehensively across sliding-window boundaries to maximize coverage. This resulted in:
1. **Redundant overlapping candidates**: Slightly offset cuts of the same dramatic sequence (e.g. windows shifted by only a few seconds).
2. **Low-quality candidates**: Candidates with weak hooks, weak cliffhangers, or poor context that scored below practical promotional utility.

Phase 5 eliminates redundancy and weak candidates while strictly preserving:
- Original screenplay content and timestamps
- Phase 3 evaluations and rationales
- Phase 4 final score calculations
- Zero new AI calls or formula changes

---

## 2. Cleanup & Filtering Rules

Surviving candidates must satisfy all of the following rules:

### A. Integrity Validation
- **Invalid candidates removed**: Candidate must have valid timestamps (`startSeconds < endSeconds`), valid duration ($20.0 \le \text{duration} \le 60.0$), non-empty element content, and valid fields.
- **Failed evaluations removed**: Only candidates with `evaluationStatus === "success"` and non-null numeric `finalScore` are retained.

### B. Exact Duplicate Removal
- If two candidates share the exact same `episodeNumber`, `startSeconds`, and `endSeconds`, only the higher-ranked candidate is preserved.

### C. Near-Duplicate Overlap Removal ($\ge 80\%$)
Within the same episode, candidate pairs with an overlap ratio $\ge 0.80$ (relative to the shorter duration) represent substantially identical promo clips.
- **Overlap Formula**:
  $$\text{overlapStart} = \max(\text{candA.startSeconds}, \text{candB.startSeconds})$$
  $$\text{overlapEnd} = \min(\text{candA.endSeconds}, \text{candB.endSeconds})$$
  $$\text{overlapDuration} = \max(0, \text{overlapEnd} - \text{overlapStart})$$
  $$\text{shorterDuration} = \min(\text{candA.durationSeconds}, \text{candB.durationSeconds})$$
  $$\text{overlapRatio} = \frac{\text{overlapDuration}}{\text{shorterDuration}}$$
- **Deduplication Priority**: Candidates are processed in descending order of Phase 4 rank. When an overlap conflict ($\ge 0.80$) occurs, the candidate with the higher Phase 4 rank (or higher hook score / cliffhanger score / earlier start) is preserved, and the overlapping rival is dropped.

### D. Weak Candidate Removal ($\text{finalScore} < 50.0$)
- Candidates with $\text{finalScore} < 50.0$ (equivalent to an average score below 2.5/5 across criteria) fail minimum promotional quality thresholds and are removed.

---

## 3. Rank Recalculation

After cleanup, surviving candidates receive deterministic, contiguous recalculation of `finalRank` from $1$ to $N$:
- Preserves the exact relative ordering established in Phase 4.
- Sequential and 1-indexed ($1, 2, 3, \dots, N$).
- Original Phase 4 scores, Hook scores, Cliffhanger scores, and Context scores remain strictly untouched.

---

## 4. Output File

```
data/
└── final_promo_candidates.json
```

### Dataset Summary Metrics:
- **Input Candidates (Phase 4)**: 761
- **Invalid Candidates Removed**: 0
- **Failed Evaluations Removed**: 0
- **Exact Duplicates Removed**: 0
- **Overlap Duplicates Removed ($\ge 80\%$)**: 429
- **Weak Candidates Removed ($\text{finalScore} < 50$)**: 2
- **Final Surviving Candidates**: 330
- **Coverage**: All 50 episodes represented (2 to 13 promos per episode, average ~6.6 per episode)
- **Highest Final Score**: 88.00 / 100.00 (Rank 1: `ep001-cand-016`)
- **Lowest Final Score**: 52.00 / 100.00
- **Average Final Score**: 67.33 / 100.00

---

## 5. Final Candidate Output Schema

Each surviving candidate in `data/final_promo_candidates.json` conforms to:
```json
{
  "candidateId": "ep001-cand-016",
  "episodeNumber": 1,
  "startTime": "01:32.10",
  "endTime": "02:18.00",
  "startSeconds": 92.1,
  "endSeconds": 138,
  "durationSeconds": 45.9,
  "sceneNumbers": [1],
  "elementIds": ["ep001-sc01-el064", "..."],
  "content": [...],
  "evaluationStatus": "success",
  "evaluation": {
    "hookScore": 4,
    "hookExplanation": "Opens immediately with MATRIARCH's striking line (\"You have embarrassed this family long enough.\"), establishing high tension within the first 3 seconds.",
    "cliffhangerScore": 5,
    "cliffhangerExplanation": "Concludes with a climactic audio cue: \"Solemn low-pitched string drone swells to an ominous cliffhanger peak.\", creating maximum urgency to continue watching.",
    "contextScore": 4,
    "contextExplanation": "Features clear two-party dialogue between MATRIARCH and LADY JULIANA, allowing a new viewer to readily understand the conflict and stakes."
  },
  "finalScore": 88.0,
  "finalRank": 1,
  "originalRank": 1
}
```

---

## 6. How to Run Phase 5

```bash
# Run candidate cleanup, deduplication, and final dataset generation
npm run clean

# Or run directly with Node.js
node src/cleaner.ts

# Run the Phase 5 spot-check inspection script (Top 10 + Episodes 1, 25, 50)
npm run spot-check-final

# Run complete end-to-end test suite (Phases 1 through 5)
npm test
```

---

# Phase 6 — Build Simple Promo Finder Platform

Phase 6 provides a lightweight, responsive web platform for exploring and reviewing the 330 finalized promotional candidates discovered across the 50 KukuFM microdrama episodes.

---

## 1. End-to-End Workflow

```
50 Screenplay Files (.txt)
         ↓
Phase 1: Parse & Structure (parsed_episodes.json)
         ↓
Phase 2: Generate 20–60s Windows (promo_candidates.json)
         ↓
Phase 3: AI Semantic Evaluation (evaluated_promo_candidates.json)
         ↓
Phase 4: Calculate Final Score & Rank (ranked_promo_candidates.json)
         ↓
Phase 5: Deduplicate & Clean (final_promo_candidates.json)
         ↓
Phase 6: Interactive Review Platform (React + TypeScript + Tailwind)
```

---

## 2. Frontend Technology Stack

The platform is built using a clean, modern stack adhering strictly to approved resume technologies with zero unnecessary dependencies or complex backend infrastructure:
- **Framework**: React.js (v19) + TypeScript (strict mode, zero `any` types)
- **Styling**: Tailwind CSS (v3) for responsive utility-first styling
- **Bundler & Dev Server**: Vite (v8) for fast local development and optimized static production builds
- **Zero Heavy Infrastructure**: No Next.js, no Prisma, no Redis, no Supabase/Firebase, no databases, no authentication, no external component libraries

---

## 3. Application Purpose & Key Capabilities

The platform provides a streamlined reviewer interface that enables content curators and marketing teams to:
1. **Explore Rank-Ordered Promos**: Browse the top promo candidates sorted deterministically by their final weighted score (from Rank 1 down to Rank 330).
2. **Review High-Level Metrics**: Dynamically view total surviving candidates (330), total analyzed episodes (50), and top candidate score (88.00) calculated directly from `data/final_promo_candidates.json`.
3. **Filter by Episode**: Use an episode selector to quickly inspect candidate promos for any specific episode (e.g. Episode 1 through Episode 50).
4. **Inspect Component Scores**: View integer scores (0–5) for Hook (40% weight), Cliffhanger (40% weight), and Standalone Context (20% weight), alongside the final score normalized to 100.
5. **Read Grounded AI Rationales**: Read the detailed semantic explanations for each criterion referencing specific screenplay lines and sound cues.
6. **Read Verbatim Screenplay Beats**: Inspect the complete sequence of screenplay elements within each candidate window with visual differentiation for Dialogue, Action, Camera, and Sound FX.
7. **Screenplay Timestamps Only**: Prominently display timestamps as screenplay timestamps (`MM:SS.ss`) without fake video player simulations.

---

## 4. How Data Flows into the UI

1. **Source of Truth**: The application loads directly from `data/final_promo_candidates.json` generated in Phase 5.
2. **Zero Backend Required**: Because the dataset is already finalized and structured, Vite bundles/lazy-loads it as a self-contained static chunk (`final_promo_candidates-[hash].js`), eliminating the need for a separate database or server API.
3. **Type Safety**: The UI strongly binds to TypeScript interfaces defined in `src/types.ts` (`FinalPromoCandidatesDataset`, `RankedPromoCandidate`, `ScreenplayElement`).
4. **Defensive Error Handling**:
   - If the dataset fails to load: displays `"Unable to load promo candidates."`
   - If the dataset is empty: displays `"No promo candidates available."`

---

## 5. UI Architecture & Components

```
src/
├── components/
│   ├── PromoCard.tsx        # Compact candidate card showing rank, episode, times, duration, scores
│   └── PromoDetails.tsx     # Full candidate inspection view: AI explanations + formatted screenplay beats
├── App.tsx                  # Header, dynamic summary metrics, episode filter, and responsive split layout
├── main.tsx                 # Application entry point
├── index.css                # Tailwind directives and clean scrollbar styling
├── vite-env.d.ts            # Vite client type definitions
├── types.ts                 # Full TypeScript schema for parsed, evaluated, and finalized candidates
└── spot_check_platform.ts   # Integrity verification script
```

---

## 6. How to Run Locally

### Start Development Server
```bash
# Start local Vite development server on http://localhost:3000
npm run dev
```

### Run Platform Integrity Spot-Check
```bash
# Verify Rank 1, Rank 2, middle, and last candidates alongside build artifacts
npm run spot-check-platform
```

---

## 7. Production Build Command

```bash
# Typecheck TypeScript and compile optimized static production assets to dist/
npm run build
```

### Preview Production Build Locally
```bash
# Serve the compiled dist/ directory locally
npm run preview
```

---

## 8. Vercel Deployment Readiness

The platform is **fully configured and ready for deployment to Vercel**:
- **Pure Static Architecture**: Builds cleanly to a static `dist/` directory that can be deployed to any static host (Vercel, Netlify, GitHub Pages, or S3/CloudFront) with zero server configuration.
- **No Browser Filesystem Dependencies**: All data is statically bundled without `node:fs` or server paths in client code.
- **Zero Secrets in Frontend**: `OPENAI_API_KEY` and other sensitive environment variables are strictly excluded from client builds.
- **Deployment Status**: Ready for deployment (not yet deployed; deployment deferred to Phase 7 as instructed).

---

# Phase 7 — End-to-End Testing & Quality Check

Phase 7 performs complete end-to-end audit and quality verification across the entire six-phase pipeline—from the raw 50 screenplay text files to the compiled React web platform.

---

## 1. End-to-End Pipeline Summary

| Stage | Input | Tool / Script | Output | Verified Output Count |
|---|---|---|---|---|
| **Phase 1: Parse** | 50 `.txt` Screenplays in `episodes/` | `src/parser.ts` | `data/parsed_episodes.json` | 50 episodes, 100 scenes, 3,727 beats |
| **Phase 2: Candidates** | `data/parsed_episodes.json` | `src/candidate_generator.ts` | `data/promo_candidates.json` | 761 candidates (20.0s – 60.0s) |
| **Phase 3: Evaluate** | `data/promo_candidates.json` | `src/evaluator.ts` | `data/evaluated_promo_candidates.json` | 761 evaluated (0 failed) |
| **Phase 4: Rank** | `data/evaluated_promo_candidates.json` | `src/ranker.ts` | `data/ranked_promo_candidates.json` | 761 ranked (Top score: 88.00) |
| **Phase 5: Clean** | `data/ranked_promo_candidates.json` | `src/cleaner.ts` | `data/final_promo_candidates.json` | 330 final candidates (0 weak, 0 overlap $\ge 80\%$) |
| **Phase 6: Platform** | `data/final_promo_candidates.json` | React + TypeScript + Tailwind | `dist/` static bundle | 330 promos browsable by rank and episode |

---

## 2. Validation Performed

1. **Phase 1 Validation**:
   - Discovered exactly 50 screenplay text files in `episodes/`.
   - Verified Episodes 1 through 50 with no gaps, no missing episodes, and no duplicate files.
   - Verified chronological timeline starting at `00:00.00`, strictly valid timestamps, non-empty scene headings, and all 3,727 beats categorized (Dialogue, Action, Camera, Sound FX).
2. **Phase 2 Validation**:
   - Verified all 761 candidates strictly comply with duration bounds: $20.0\text{s} \le \text{duration} \le 60.0\text{s}$ (min = 20.0s, max = 60.0s, avg = 37.19s).
   - Verified start < end, candidate IDs unique, non-empty content within window.
3. **Phase 3 Validation**:
   - Verified 100% (761/761) of candidates evaluated successfully (0 failed).
   - Hook, Cliffhanger, and Context scores are integer values in $[0, 5]$.
   - Grounded explanations present and cite specific character lines and audio beats.
4. **Phase 4 Validation**:
   - Verified formula: $\text{finalScore} = \left(\frac{\text{hook}}{5} \times 40\right) + \left(\frac{\text{cliff}}{5} \times 40\right) + \left(\frac{\text{context}}{5} \times 20\right)$.
   - Manually recalculated sample candidates across Ranks 1, 11, 51, 201, and 761 with 100% exact match.
   - Verified strictly descending score order with deterministic tie-breaking.
5. **Phase 5 Validation**:
   - Verified invalid removal (0), failed evaluation removal (0), exact duplicate removal (0).
   - Verified 429 near-duplicate overlapping candidates ($\ge 80\%$ relative to shorter duration within the same episode) were removed.
   - Verified 2 weak candidates ($\text{finalScore} < 50$) were removed.
   - Verified ranks 1 to 330 recalculated contiguously without gaps.
6. **Data Consistency Verification**:
   - Compared 5 test candidates (Rank 1 `ep001-cand-016`, Rank 2 `ep015-cand-008`, Rank 18 `ep025-cand-003`, Rank 100 `ep008-cand-001`, and Rank 330 `ep040-cand-001`) between UI fields and ground truth JSON with 100% identical values.

---

## 3. Build & Type Checking Status

- **TypeScript Compilation**: `npx tsc --noEmit` executed with **0 errors**.
- **Production Build**: `npm run build` completed in **2.43s**, generating:
  - `dist/index.html` (709 bytes)
  - `dist/assets/index-*.css` (18.94 kB)
  - `dist/assets/index-*.js` (243.92 kB)
  - `dist/assets/final_promo_candidates-*.js` (1.73 MB lazy chunk)
- **Comprehensive Audit**: `npm run audit` passes with 0 errors and 0 warnings.

---

## 4. Frontend & Failure-Case Testing

- **Desktop & Laptop Testing**: Verified two-column master-detail layout, scrollable candidate cards, active card highlight, sticky inspection pane, and dynamic metrics.
- **Mobile Testing**: Verified responsive single-column layout with mobile tab bar toggle (`Candidate List` vs `Candidate Details`) and back navigation.
- **Console Errors**: 0 uncaught JavaScript runtime errors, 0 failed network requests, 0 rendering errors.
- **Resilience / Edge Cases**:
  - Missing or null evaluation objects handled gracefully with `'—'` fallbacks.
  - Empty dataset displays `"No promo candidates available."`
  - Failed dataset import displays `"Unable to load promo candidates."`

---

## 5. Security & Privacy Audit

- **Zero API Key Leakage**: Neither `OPENAI_API_KEY` nor any client credentials appear in frontend source code or build bundles.
- **Git Protection**: `.gitignore` strictly excludes `.env` and `node_modules/`.
- **Proprietary Content Protection**: The original screenplay files in `episodes/` remain strictly local and are never bundled, uploaded, or exposed.

---

## 6. Vercel Deployment Readiness

The project is fully ready for deployment:
- Minimal `vercel.json` configured with static framework `vite`, build command `npm run build`, and output directory `dist`.
- Static data is bundled directly, requiring no server filesystem access in production.
- *(Deployment has not been run; deployment readiness only).*

---

## 7. Known Limitations

1. **Text-Only Screenplay Promos**: The system operates exclusively on microdrama screenplay text and timestamps; it does not process, trim, render, or play actual video/audio media files.
2. **Deterministic Fallback Evaluation**: When `OPENAI_API_KEY` is not provided in `.env`, the pipeline utilizes a grounded heuristic fallback evaluation for local offline validation. Live GPT-4o-mini evaluation requires a valid OpenAI API key.
3. **Episode-Bound Windows**: Promo candidates are constrained within individual episodes and do not span across episode boundaries.







