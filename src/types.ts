/**
 * Types and interfaces for KukuFM Microdrama Screenplay Parsing (Phase 1).
 *
 * Conforms strictly to the ground-truth format of the 50 microdrama
 * screenplay files provided in the episodes/ directory.
 */

export type ElementType = 'dialogue' | 'action' | 'camera' | 'sound_fx';

/**
 * A single atomic block inside a scene (camera shot, action beat,
 * spoken dialogue, or sound/musical effect).
 */
export interface ScreenplayElement {
  id: string;                      // Unique element identifier, e.g. "ep001-sc01-el001"
  type: ElementType;               // 'dialogue' | 'action' | 'camera' | 'sound_fx'
  startTime: string;               // Original timestamp string "MM:SS.ss"
  endTime: string;                 // Original timestamp string "MM:SS.ss"
  startSeconds: number;            // Start timestamp in seconds
  endSeconds: number;              // End timestamp in seconds
  durationSeconds: number;         // Duration in seconds
  text: string;                    // Spoken dialogue or descriptive text
  character?: string;              // Character speaking (for dialogue only)
  delivery?: string;               // Emotion / delivery modifier (for dialogue only)
  isOffScreen?: boolean;           // True if marked O.S. or off-screen (for dialogue only)
}

/**
 * A screenplay scene containing a heading, timing bounds, and
 * the ordered list of screenplay elements.
 */
export interface Scene {
  sceneNumber: number;             // Scene sequence number (1, 2, 3...)
  heading: string;                 // e.g. "INT. CATHEDRAL – DAY"
  startTime: string;               // Scene start timestamp "MM:SS.ss"
  endTime: string;                 // Scene end timestamp "MM:SS.ss"
  startSeconds: number;            // Scene start in seconds
  endSeconds: number;              // Scene end in seconds
  durationSeconds: number;         // Total scene duration in seconds
  characters: string[];            // Unique characters with dialogue in this scene
  elements: ScreenplayElement[];   // Chronological sequence of screenplay blocks
}

/**
 * Metadata found in the screenplay header before --- SCRIPT START ---.
 */
export interface EpisodeMetadata {
  logline: string;                 // Episode narrative logline
  continuityNotes: string;         // Series continuity context
}

/**
 * High-level counts for an episode, useful for promo analysis and verification.
 */
export interface EpisodeStats {
  sceneCount: number;
  elementCount: number;
  dialogueCount: number;
  actionCount: number;
  cameraCount: number;
  soundCount: number;
}

/**
 * Complete structured representation of a single microdrama episode.
 */
export interface Episode {
  episodeNumber: number;           // 1 to 50
  episodeId: string;               // Production/assignment ID (e.g. "1671703")
  sourceFile: string;              // Reference filename in episodes/
  metadata: EpisodeMetadata;
  startTime: string;               // First scene start time (typically "00:00.00")
  endTime: string;                 // Final scene end time
  startSeconds: number;            // Episode start in seconds
  endSeconds: number;              // Episode end in seconds
  durationSeconds: number;         // Total episode duration in seconds
  characters: string[];            // All speaking characters in this episode
  stats: EpisodeStats;
  scenes: Scene[];
}

/**
 * Validation issue reported during dataset verification.
 */
export interface ValidationIssue {
  severity: 'error' | 'warning';
  episodeNumber?: number;
  file?: string;
  message: string;
}

/**
 * Comprehensive result of validating the parsed dataset.
 */
export interface ValidationResult {
  isValid: boolean;
  totalFilesFound: number;
  expectedEpisodes: number;
  successfullyParsed: number;
  failedCount: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: {
    totalScenes: number;
    totalElements: number;
    totalDialogueBlocks: number;
    totalActionBlocks: number;
    totalCameraBlocks: number;
    totalSoundBlocks: number;
    totalDurationSeconds: number;
    uniqueCharactersCount: number;
  };
}

/**
 * Root schema for data/parsed_episodes.json.
 */
export interface DatasetOutput {
  version: string;
  generatedAt: string;
  totalEpisodes: number;
  summary: ValidationResult['summary'];
  episodes: Episode[];
}

/* ==================================================
 * PHASE 2 TYPES: PROMO CANDIDATES
 * ================================================== */

/**
 * A single screenplay beat included within a promo candidate window.
 */
export interface CandidateContentItem {
  id: string;                      // Reference to original ScreenplayElement ID
  type: ElementType;               // 'dialogue' | 'action' | 'camera' | 'sound_fx'
  startTime: string;               // Original timestamp "MM:SS.ss"
  endTime: string;                 // Original timestamp "MM:SS.ss"
  startSeconds: number;            // Timestamp in seconds
  endSeconds: number;              // Timestamp in seconds
  durationSeconds: number;         // Element duration in seconds
  text: string;                    // Verbatim screenplay text
  character?: string;              // Speaking character (dialogue only)
  delivery?: string;               // Emotional/delivery note (dialogue only)
  isOffScreen?: boolean;           // True if O.S. (dialogue only)
}

/**
 * A candidate promotional window (20–60 seconds).
 */
export interface PromoCandidate {
  candidateId: string;             // e.g. "ep001-cand-001"
  episodeNumber: number;           // 1 to 50
  startTime: string;               // Window start timestamp "MM:SS.ss"
  endTime: string;                 // Window end timestamp "MM:SS.ss"
  startSeconds: number;            // Window start in seconds
  endSeconds: number;              // Window end in seconds
  durationSeconds: number;         // Window duration in seconds (20 <= duration <= 60)
  sceneNumbers: number[];          // Scenes spanned by this candidate window
  elementIds: string[];            // IDs of all overlapping screenplay elements
  content: CandidateContentItem[]; // Chronological screenplay elements inside window
}

/**
 * All candidates generated for an episode.
 */
export interface EpisodeCandidates {
  episodeNumber: number;
  episodeId: string;
  sourceFile: string;
  candidateCount: number;
  candidates: PromoCandidate[];
}

/**
 * Summary metrics for the promo candidate dataset.
 */
export interface CandidateDatasetSummary {
  totalEpisodes: number;
  totalCandidates: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  avgDurationSeconds: number;
  minCandidatesPerEpisode: number;
  maxCandidatesPerEpisode: number;
  avgCandidatesPerEpisode: number;
}

/**
 * Root schema for data/promo_candidates.json.
 */
export interface PromoCandidatesDataset {
  version: string;
  generatedAt: string;
  totalEpisodes: number;
  totalCandidates: number;
  summary: CandidateDatasetSummary;
  episodes: EpisodeCandidates[];
}

/**
 * Result of validating the candidate dataset.
 */
export interface CandidateValidationResult {
  isValid: boolean;
  totalEpisodes: number;
  totalCandidates: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: CandidateDatasetSummary;
}

/* ==================================================
 * PHASE 3 TYPES: CANDIDATE EVALUATION
 * ================================================== */

/**
 * Detailed 3-criteria evaluation results for a promo candidate.
 */
export interface CandidateEvaluation {
  hookScore: number;               // Integer 0 to 5
  hookExplanation: string;         // Explanation grounded in opening ~3 seconds
  cliffhangerScore: number;        // Integer 0 to 5
  cliffhangerExplanation: string;  // Explanation grounded in ending beat
  contextScore: number;            // Integer 0 to 5
  contextExplanation: string;      // Explanation grounded in standalone clarity
}

export type EvaluationStatus = 'success' | 'failed';

/**
 * A promo candidate enriched with its Phase 3 evaluation result.
 */
export interface EvaluatedPromoCandidate extends PromoCandidate {
  evaluationStatus: EvaluationStatus;
  evaluation?: CandidateEvaluation;
  errorMessage?: string;
  evaluatedAt?: string;
}

/**
 * Episode container for evaluated candidates.
 */
export interface EvaluatedEpisodeCandidates {
  episodeNumber: number;
  episodeId: string;
  sourceFile: string;
  candidateCount: number;
  candidates: EvaluatedPromoCandidate[];
}

/**
 * Aggregated metrics for Phase 3 evaluation dataset.
 */
export interface EvaluatedDatasetSummary {
  totalEpisodes: number;
  totalCandidates: number;
  successfullyEvaluated: number;
  failedEvaluations: number;
  averageHookScore: number;
  averageCliffhangerScore: number;
  averageContextScore: number;
}

/**
 * Root schema for data/evaluated_promo_candidates.json.
 */
export interface EvaluatedPromoCandidatesDataset {
  version: string;
  generatedAt: string;
  model: string;
  totalEpisodes: number;
  totalCandidates: number;
  summary: EvaluatedDatasetSummary;
  episodes: EvaluatedEpisodeCandidates[];
}

/**
 * Validation result for Phase 3 evaluation output.
 */
export interface EvaluatedValidationResult {
  isValid: boolean;
  totalCandidates: number;
  successfullyEvaluated: number;
  failedEvaluations: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: EvaluatedDatasetSummary;
}

/* ==================================================
 * PHASE 4 TYPES: RANKED PROMO CANDIDATES
 * ================================================== */

/**
 * An evaluated promo candidate enriched with its deterministic final weighted score and rank.
 */
export interface RankedPromoCandidate extends EvaluatedPromoCandidate {
  finalScore: number | null;       // 0.00 to 100.00, or null if evaluation failed
  rank: number | null;             // 1, 2, 3... or null if evaluation failed
}

export interface ScoringWeights {
  hookWeight: number;              // 0.40 (40%)
  cliffhangerWeight: number;       // 0.40 (40%)
  contextWeight: number;           // 0.20 (20%)
}

export interface RankedDatasetSummary {
  totalCandidates: number;
  successfullyRanked: number;
  failedEvaluations: number;
  highestScore: number;
  lowestScore: number;
  averageScore: number;
}

/**
 * Root schema for data/ranked_promo_candidates.json.
 */
export interface RankedPromoCandidatesDataset {
  version: string;
  generatedAt: string;
  scoringWeights: ScoringWeights;
  summary: RankedDatasetSummary;
  candidates: RankedPromoCandidate[];
}

/**
 * Validation result for Phase 4 ranking output.
 */
export interface RankingValidationResult {
  isValid: boolean;
  totalCandidates: number;
  successfullyRanked: number;
  failedEvaluations: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: RankedDatasetSummary;
}

/* ==================================================
 * PHASE 5 TYPES: FINAL CLEANED PROMO CANDIDATES
 * ================================================== */

export interface CleanupSummary {
  inputCandidates: number;
  invalidRemoved: number;
  failedEvaluationRemoved: number;
  exactDuplicatesRemoved: number;
  overlapDuplicatesRemoved: number;
  weakCandidatesRemoved: number;
  finalCandidates: number;
  highestScore: number;
  lowestScore: number;
  averageScore: number;
}

export interface FinalPromoCandidatesDataset {
  version: string;
  generatedAt: string;
  filteringThresholds: {
    overlapRatioThreshold: number; // 0.80 (80%)
    minFinalScoreThreshold: number; // 50.00
  };
  summary: CleanupSummary;
  candidates: RankedPromoCandidate[];
}

export interface FinalValidationResult {
  isValid: boolean;
  totalFinalCandidates: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: CleanupSummary;
}





