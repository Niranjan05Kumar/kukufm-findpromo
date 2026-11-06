import React, { useState, useEffect, useMemo } from 'react';
import type { FinalPromoCandidatesDataset, RankedPromoCandidate } from './types.ts';
import type { SingleEpisodeAnalyzeResult } from './single_episode_analyzer.ts';
import { PromoCard } from './components/PromoCard.tsx';
import { PromoDetails } from './components/PromoDetails.tsx';
import { EpisodeUpload } from './components/EpisodeUpload.tsx';

export const App: React.FC = () => {
  const [dataset, setDataset] = useState<FinalPromoCandidatesDataset | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<number | 'all'>('all');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // Phase 9: Single Episode Upload & Test State
  const [isAnalyzingUpload, setIsAnalyzingUpload] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<SingleEpisodeAnalyzeResult | null>(null);
  const [activeMode, setActiveMode] = useState<'series' | 'test'>('series');
  const [selectedTestCandidateId, setSelectedTestCandidateId] = useState<string | null>(null);

  // Load the final candidates JSON dataset asynchronously
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    import('../data/final_promo_candidates.json')
      .then((module) => {
        if (!isMounted) return;
        const data = module.default as FinalPromoCandidatesDataset;
        if (!data || !Array.isArray(data.candidates)) {
          setLoadError('Unable to load promo candidates.');
          setIsLoading(false);
          return;
        }
        setDataset(data);
        if (data.candidates.length > 0) {
          setSelectedCandidateId(data.candidates[0].candidateId);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load dataset:', err);
        if (isMounted) {
          setLoadError('Unable to load promo candidates.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Summary statistics for 50-episode series dataset
  const stats = useMemo(() => {
    if (!dataset || dataset.candidates.length === 0) {
      return {
        totalCandidates: 0,
        episodeCount: 0,
        topScore: 0,
        averageScore: 0,
      };
    }
    const candidates = dataset.candidates;
    const totalCandidates = candidates.length;
    const uniqueEpisodes = new Set(candidates.map((c) => c.episodeNumber)).size;
    const scores = candidates
      .map((c) => c.finalScore)
      .filter((s): s is number => s !== null);
    const topScore = scores.length > 0 ? Math.max(...scores) : 0;
    const avgScore =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : 0;

    return {
      totalCandidates,
      episodeCount: uniqueEpisodes,
      topScore,
      averageScore: avgScore,
    };
  }, [dataset]);

  // Unique episode list for 50-episode filter
  const episodeOptions = useMemo(() => {
    if (!dataset) return [];
    const counts = new Map<number, number>();
    for (const c of dataset.candidates) {
      counts.set(c.episodeNumber, (counts.get(c.episodeNumber) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([epNum, count]) => ({ epNum, count }))
      .sort((a, b) => a.epNum - b.epNum);
  }, [dataset]);

  // Filter candidates based on selected episode
  const filteredCandidates = useMemo(() => {
    if (!dataset) return [];
    if (selectedEpisode === 'all') return dataset.candidates;
    return dataset.candidates.filter((c) => c.episodeNumber === selectedEpisode);
  }, [dataset, selectedEpisode]);

  const handleEpisodeChange = (newEpisode: number | 'all') => {
    setSelectedEpisode(newEpisode);
    if (!dataset) return;
    const matching =
      newEpisode === 'all'
        ? dataset.candidates
        : dataset.candidates.filter((c) => c.episodeNumber === newEpisode);
    if (matching.length > 0) {
      const stillSelected = matching.some((c) => c.candidateId === selectedCandidateId);
      if (!stillSelected) {
        setSelectedCandidateId(matching[0].candidateId);
      }
    } else {
      setSelectedCandidateId(null);
    }
  };

  // Currently displayed candidate list (Series or Test)
  const currentCandidateList: RankedPromoCandidate[] = useMemo(() => {
    if (activeMode === 'test' && testResult) {
      return testResult.candidates;
    }
    return filteredCandidates;
  }, [activeMode, testResult, filteredCandidates]);

  // Currently selected candidate object
  const currentSelectedCandidate: RankedPromoCandidate | null = useMemo(() => {
    if (activeMode === 'test' && testResult) {
      if (!selectedTestCandidateId) return testResult.candidates[0] ?? null;
      return testResult.candidates.find((c) => c.candidateId === selectedTestCandidateId) ?? null;
    }
    if (!dataset || !selectedCandidateId) return null;
    return dataset.candidates.find((c) => c.candidateId === selectedCandidateId) ?? null;
  }, [activeMode, testResult, selectedTestCandidateId, dataset, selectedCandidateId]);

  const handleSelectCandidate = (candidateId: string) => {
    if (activeMode === 'test') {
      setSelectedTestCandidateId(candidateId);
    } else {
      setSelectedCandidateId(candidateId);
    }
    setMobileView('detail');
  };

  // Callback when single episode analysis finishes
  const handleAnalyzeComplete = (result: SingleEpisodeAnalyzeResult) => {
    setTestResult(result);
    setActiveMode('test');
    if (result.candidates.length > 0) {
      setSelectedTestCandidateId(result.candidates[0].candidateId);
    }
  };

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <h2 className="text-lg font-semibold text-slate-200">
            Loading KukuFM Promo Candidates...
          </h2>
          <p className="text-xs text-slate-500">
            Ingesting dataset from data/final_promo_candidates.json
          </p>
        </div>
      </div>
    );
  }

  // 2. Error State
  if (loadError || !dataset) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md p-6 bg-slate-900 border border-rose-800/80 rounded-2xl text-center space-y-3 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-700 text-rose-300 flex items-center justify-center text-xl mx-auto font-bold">
            !
          </div>
          <h2 className="text-lg font-bold text-rose-200">
            Unable to load promo candidates.
          </h2>
          <p className="text-xs text-slate-400">
            Please ensure that Phase 5 has been executed and{' '}
            <code className="text-rose-300">data/final_promo_candidates.json</code> exists.
          </p>
        </div>
      </div>
    );
  }

  // 3. Empty State
  if (dataset.candidates.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-3">
          <div className="text-3xl">📭</div>
          <h2 className="text-lg font-bold text-slate-200">
            No promo candidates available.
          </h2>
          <p className="text-xs text-slate-500">
            The dataset was loaded successfully, but contains 0 surviving promo candidates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation / App Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl" role="img" aria-label="movie camera">
                  🎬
                </span>
                <h1 className="text-2xl font-black tracking-tight text-white">
                  Find Promos
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-semibold">
                  {activeMode === 'test' ? 'Test Episode Mode' : '50-Episode Series'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                AI-assisted promotional clip discovery for KukuFM microdrama
              </p>
            </div>

            {/* Metrics Bar */}
            <div className="flex items-center gap-3 sm:gap-6 text-xs">
              {activeMode === 'test' && testResult ? (
                <>
                  <div className="bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-indigo-500/50">
                    <span className="text-indigo-400 block text-[10px] uppercase tracking-wider">
                      Test Episode
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-100">
                      {testResult.episodeTitle}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-700/80">
                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider">
                      Promos Found
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-100">
                      {testResult.candidates.length}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-emerald-500/40">
                    <span className="text-emerald-400 block text-[10px] uppercase tracking-wider">
                      Top Score
                    </span>
                    <span className="font-mono font-bold text-sm text-emerald-300">
                      {testResult.summary?.highestScore.toFixed(2) ?? '—'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-700/80">
                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider">
                      Final Candidates
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-100">
                      {stats.totalCandidates}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-700/80">
                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider">
                      Episodes Analyzed
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-100">
                      {stats.episodeCount}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-indigo-500/40">
                    <span className="text-indigo-400 block text-[10px] uppercase tracking-wider">
                      Top Score
                    </span>
                    <span className="font-mono font-bold text-sm text-indigo-300">
                      {stats.topScore.toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mode Indicator Banner (when viewing uploaded test episode) */}
      {activeMode === 'test' && testResult && (
        <div className="bg-indigo-950/80 border-b border-indigo-800/60 px-4 sm:px-6 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-indigo-200">
              <span className="font-bold text-sm">🧪 Test Results — {testResult.episodeTitle}</span>
              <span className="text-slate-400">
                (Generated dynamically from uploaded screenplay. The original 50-episode dataset remains intact.)
              </span>
            </div>
            <button
              onClick={() => setActiveMode('series')}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition-colors"
            >
              ← Back to 50-Episode Series Promos
            </button>
          </div>
        </div>
      )}

      {/* Mobile view switcher tab bar */}
      <div className="md:hidden flex border-b border-slate-800 bg-slate-900 text-xs font-semibold">
        <button
          onClick={() => setMobileView('list')}
          className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
            mobileView === 'list'
              ? 'border-indigo-500 text-indigo-300 bg-slate-800/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Candidate List ({currentCandidateList.length})
        </button>
        <button
          onClick={() => setMobileView('detail')}
          className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
            mobileView === 'detail'
              ? 'border-indigo-500 text-indigo-300 bg-slate-800/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Candidate Details
        </button>
      </div>

      {/* Main Content Area: Master-Detail Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column: Upload box, Filter & Candidate List */}
        <section
          className={`md:col-span-5 lg:col-span-5 flex flex-col space-y-4 ${
            mobileView === 'detail' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Phase 9: Single Episode Upload Component */}
          <EpisodeUpload
            onAnalyzeComplete={handleAnalyzeComplete}
            isAnalyzing={isAnalyzingUpload}
            setIsAnalyzing={setIsAnalyzingUpload}
          />

          {/* Filter Bar (Series mode only) */}
          {activeMode === 'series' && (
            <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <label htmlFor="episode-filter" className="flex items-center gap-1.5">
                  <span>Filter by Episode:</span>
                </label>
                <span className="text-[11px] font-mono text-slate-500">
                  Showing {filteredCandidates.length} of {stats.totalCandidates}
                </span>
              </div>

              <select
                id="episode-filter"
                value={selectedEpisode}
                onChange={(e) => {
                  const val = e.target.value;
                  handleEpisodeChange(val === 'all' ? 'all' : Number(val));
                }}
                className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="all">
                  All Episodes ({stats.totalCandidates} candidates across {stats.episodeCount} episodes)
                </option>
                {episodeOptions.map(({ epNum, count }) => (
                  <option key={epNum} value={epNum}>
                    Episode {epNum} ({count} candidate{count === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Test results banner in list column */}
          {activeMode === 'test' && testResult && (
            <div className="bg-slate-900/80 p-3 rounded-xl border border-indigo-800/50 flex items-center justify-between text-xs">
              <span className="font-semibold text-indigo-300">
                Test Promos: {testResult.candidates.length} generated
              </span>
              <button
                onClick={() => setActiveMode('series')}
                className="text-[11px] text-slate-400 hover:text-indigo-300 underline"
              >
                Switch to 50-Episode Series
              </button>
            </div>
          )}

          {/* Promo Candidate Cards List */}
          <div className="flex-1 overflow-y-auto max-h-[calc(100vh-320px)] space-y-2.5 pr-1">
            {currentCandidateList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800">
                No promo candidates to display.
              </div>
            ) : (
              currentCandidateList.map((candidate) => (
                <PromoCard
                  key={candidate.candidateId}
                  candidate={candidate}
                  isSelected={
                    activeMode === 'test'
                      ? candidate.candidateId === (selectedTestCandidateId ?? currentCandidateList[0]?.candidateId)
                      : candidate.candidateId === selectedCandidateId
                  }
                  onSelect={() => handleSelectCandidate(candidate.candidateId)}
                />
              ))
            )}
          </div>
        </section>

        {/* Right Column: Candidate Details View */}
        <section
          className={`md:col-span-7 lg:col-span-7 flex flex-col ${
            mobileView === 'list' ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="bg-slate-900/60 p-4 sm:p-6 rounded-2xl border border-slate-800 min-h-[500px]">
            <PromoDetails
              candidate={currentSelectedCandidate}
              onBackMobile={() => setMobileView('list')}
            />
          </div>
        </section>
      </main>

      {/* Platform Footer */}
      <footer className="border-t border-slate-900 py-4 px-6 text-center text-xs text-slate-600 bg-slate-950">
        <p>
          KukuFM Microdrama Promo Finder — Platform Prototype. Includes 50-Episode Series dataset & single episode screenplay test sandbox.
        </p>
      </footer>
    </div>
  );
};

export default App;
