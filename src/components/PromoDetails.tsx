import React from 'react';
import type { RankedPromoCandidate, ScreenplayElement } from '../types.ts';

interface PromoDetailsProps {
  candidate: RankedPromoCandidate | null;
  onBackMobile?: () => void;
}

export const PromoDetails: React.FC<PromoDetailsProps> = ({ candidate, onBackMobile }) => {
  if (!candidate) {
    return (
      <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-slate-800/30 rounded-2xl border border-slate-800">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-3xl mb-4 text-slate-500">
          🎬
        </div>
        <h3 className="text-lg font-semibold text-slate-300 mb-1">No Candidate Selected</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Select any promotional candidate from the list on the left to inspect its scores,
          AI evaluation rationales, and full screenplay beats.
        </p>
      </div>
    );
  }

  const {
    candidateId,
    rank,
    episodeNumber,
    startTime,
    endTime,
    durationSeconds,
    finalScore,
    evaluation,
    content,
  } = candidate;

  // Visual helper for screenplay element types
  const renderElement = (el: ScreenplayElement, idx: number) => {
    switch (el.type) {
      case 'dialogue':
        return (
          <div
            key={el.id || idx}
            className="p-3.5 rounded-lg bg-slate-800/80 border border-slate-700/80 hover:border-slate-600 transition-colors"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wider text-indigo-300">
                  {el.character ?? 'CHARACTER'}
                </span>
                {el.delivery && (
                  <span className="text-xs italic text-slate-400">
                    ({el.delivery})
                  </span>
                )}
                {el.isOffScreen && (
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                    O.S.
                  </span>
                )}
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                {el.startTime} – {el.endTime} ({el.durationSeconds.toFixed(1)}s)
              </span>
            </div>
            <p className="text-slate-100 text-sm font-serif leading-relaxed pl-2 border-l-2 border-indigo-500/60">
              "{el.text}"
            </p>
          </div>
        );

      case 'action':
        return (
          <div
            key={el.id || idx}
            className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 hover:border-emerald-700/60 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
                ACTION
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {el.startTime} – {el.endTime} ({el.durationSeconds.toFixed(1)}s)
              </span>
            </div>
            <p className="text-emerald-100/90 text-sm leading-relaxed italic">
              {el.text}
            </p>
          </div>
        );

      case 'camera':
        return (
          <div
            key={el.id || idx}
            className="p-3 rounded-lg bg-sky-950/20 border border-sky-800/40 hover:border-sky-700/60 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-900/60 text-sky-300 border border-sky-700/50">
                CAMERA
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {el.startTime} – {el.endTime} ({el.durationSeconds.toFixed(1)}s)
              </span>
            </div>
            <p className="text-sky-100/90 text-sm leading-relaxed">
              {el.text}
            </p>
          </div>
        );

      case 'sound_fx':
        return (
          <div
            key={el.id || idx}
            className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 hover:border-amber-700/60 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700/50">
                SOUND FX
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {el.startTime} – {el.endTime} ({el.durationSeconds.toFixed(1)}s)
              </span>
            </div>
            <p className="text-amber-100/90 text-sm leading-relaxed font-mono">
              {el.text}
            </p>
          </div>
        );

      default:
        return (
          <div key={el.id || idx} className="p-3 rounded-lg bg-slate-800 border border-slate-700 text-sm">
            {el.text}
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Mobile back button */}
      {onBackMobile && (
        <button
          onClick={onBackMobile}
          className="md:hidden flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 mb-2 py-1 px-2 rounded bg-slate-800 border border-slate-700"
        >
          ← Back to Candidate List
        </button>
      )}

      {/* Main Candidate Header Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-800/90 via-slate-800/70 to-slate-900/90 border border-slate-700 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-700/70">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="inline-flex items-center font-bold text-sm px-3 py-1 rounded-full bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
                Rank #{rank ?? '—'}
              </span>
              <h2 className="text-xl font-bold text-white">
                Episode {episodeNumber} Promo Clip
              </h2>
            </div>
            <p className="text-xs font-mono text-slate-400">
              Candidate ID: <span className="text-slate-300">{candidateId}</span>
            </p>
          </div>

          {/* Final Score Hero Badge */}
          <div className="text-right bg-slate-900/80 px-4 py-2.5 rounded-xl border border-indigo-500/40 shadow-inner">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
              Final Promo Score
            </div>
            <div className="text-2xl font-black font-mono text-indigo-300">
              {finalScore !== null ? finalScore.toFixed(2) : 'N/A'}
              <span className="text-xs text-slate-500 font-normal ml-1">/ 100</span>
            </div>
          </div>
        </div>

        {/* Timing Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs">
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-0.5">
              Start Timestamp
            </span>
            <span className="font-mono font-semibold text-slate-200 text-sm">
              {startTime}
            </span>
          </div>
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-0.5">
              End Timestamp
            </span>
            <span className="font-mono font-semibold text-slate-200 text-sm">
              {endTime}
            </span>
          </div>
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-0.5">
              Clip Duration
            </span>
            <span className="font-mono font-semibold text-indigo-400 text-sm">
              {durationSeconds.toFixed(2)} sec
            </span>
          </div>
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-0.5">
              Screenplay Beats
            </span>
            <span className="font-mono font-semibold text-slate-200 text-sm">
              {content.length} elements
            </span>
          </div>
        </div>
      </div>

      {/* AI Evaluation Criteria Breakdown */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Evaluation Breakdown & Rationales
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            Weighted: 40% Hook + 40% Cliffhanger + 20% Context
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {/* Hook card */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                <span className="font-bold text-sm text-slate-200">1. Hook (First ~3 Seconds)</span>
                <span className="text-[11px] text-slate-400 font-mono">(Weight: 40%)</span>
              </div>
              <div className="font-mono font-bold text-sm px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-rose-300">
                {evaluation?.hookScore ?? '—'} / 5
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-3 rounded-lg border border-slate-800">
              {evaluation?.hookExplanation || 'No hook explanation provided.'}
            </p>
          </div>

          {/* Cliffhanger card */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="font-bold text-sm text-slate-200">2. Cliffhanger (Ending Beat)</span>
                <span className="text-[11px] text-slate-400 font-mono">(Weight: 40%)</span>
              </div>
              <div className="font-mono font-bold text-sm px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300">
                {evaluation?.cliffhangerScore ?? '—'} / 5
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-3 rounded-lg border border-slate-800">
              {evaluation?.cliffhangerExplanation || 'No cliffhanger explanation provided.'}
            </p>
          </div>

          {/* Standalone Context card */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="font-bold text-sm text-slate-200">3. Standalone Context (New Viewer Clarity)</span>
                <span className="text-[11px] text-slate-400 font-mono">(Weight: 20%)</span>
              </div>
              <div className="font-mono font-bold text-sm px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-300">
                {evaluation?.contextScore ?? '—'} / 5
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-3 rounded-lg border border-slate-800">
              {evaluation?.contextExplanation || 'No context explanation provided.'}
            </p>
          </div>
        </div>
      </div>

      {/* Screenplay Content Stream */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-700">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Screenplay Content Inside Candidate Window
            </h3>
            <p className="text-xs text-slate-500">
              Screenplay timestamps (MM:SS.ss) — Text-only microdrama script beats verbatim
            </p>
          </div>
          <span className="text-xs font-mono px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700">
            {content.length} continuous beats
          </span>
        </div>

        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-2">
          {content.map((element, idx) => renderElement(element, idx))}
        </div>
      </div>
    </div>
  );
};

