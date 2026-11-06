import React from 'react';
import type { RankedPromoCandidate } from '../types.ts';

interface PromoCardProps {
  candidate: RankedPromoCandidate;
  isSelected: boolean;
  onSelect: () => void;
}

export const PromoCard: React.FC<PromoCardProps> = ({ candidate, isSelected, onSelect }) => {
  const { rank, episodeNumber, startTime, endTime, durationSeconds, finalScore, evaluation } = candidate;

  // Determine score badge color
  const getScoreColor = (score: number | null) => {
    if (score === null) return 'bg-slate-700 text-slate-300 border-slate-600';
    if (score >= 80) return 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50';
    if (score >= 65) return 'bg-indigo-950/80 text-indigo-300 border-indigo-500/50';
    return 'bg-amber-950/80 text-amber-300 border-amber-500/50';
  };

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`text-left p-4 rounded-xl border transition-all duration-150 cursor-pointer ${
        isSelected
          ? 'bg-slate-800/95 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-950/50'
          : 'bg-slate-800/50 border-slate-700/70 hover:bg-slate-800 hover:border-slate-600'
      }`}
    >
      {/* Top row: Rank, Episode, Final Score */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center font-bold text-xs px-2.5 py-0.5 rounded-full bg-slate-700 text-slate-100 border border-slate-600">
            Rank #{rank ?? '—'}
          </span>
          <span className="font-semibold text-sm text-slate-200">
            Episode {episodeNumber}
          </span>
        </div>
        <div
          className={`px-2.5 py-0.5 rounded-md font-mono font-bold text-sm border ${getScoreColor(
            finalScore
          )}`}
        >
          {finalScore !== null ? finalScore.toFixed(2) : 'N/A'}
        </div>
      </div>

      {/* Second row: Timestamps & Duration */}
      <div className="flex items-center justify-between text-xs text-slate-400 mb-3 font-mono bg-slate-900/60 px-2.5 py-1.5 rounded-md border border-slate-800">
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="text-slate-500">Time:</span>
          <span>{startTime}</span>
          <span className="text-slate-600">→</span>
          <span>{endTime}</span>
        </span>
        <span className="text-indigo-400 font-semibold">
          {durationSeconds.toFixed(1)}s
        </span>
      </div>

      {/* Component scores row */}
      <div className="grid grid-cols-3 gap-1.5 text-xs">
        <div className="bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-center">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Hook</div>
          <div className="font-bold font-mono text-slate-200">
            {evaluation?.hookScore ?? '—'}
            <span className="text-[10px] text-slate-500">/5</span>
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-center">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Cliffhanger</div>
          <div className="font-bold font-mono text-slate-200">
            {evaluation?.cliffhangerScore ?? '—'}
            <span className="text-[10px] text-slate-500">/5</span>
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-center">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Context</div>
          <div className="font-bold font-mono text-slate-200">
            {evaluation?.contextScore ?? '—'}
            <span className="text-[10px] text-slate-500">/5</span>
          </div>
        </div>
      </div>
    </div>
  );
};

