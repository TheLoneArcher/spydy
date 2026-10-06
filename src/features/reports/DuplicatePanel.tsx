'use client';

import React from 'react';
import { Copy, ThumbsUp, ArrowRight, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { DuplicateCandidate } from './useSubmitReport';

interface DuplicatePanelProps {
  candidates: DuplicateCandidate[];
  onAttest: (id: string) => void;
  onDismiss: () => void;
  loading: boolean;
}

export function DuplicatePanel({
  candidates,
  onAttest,
  onDismiss,
  loading,
}: DuplicatePanelProps) {
  if (candidates.length === 0) return null;

  return (
    <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg p-5 space-y-4 my-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-400">
          <Copy className="w-5 h-5 shrink-0" />
          <h3 className="text-sm font-semibold text-[var(--fg)]">
            Possible Duplicates Detected Near You
          </h3>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] underline"
        >
          Dismiss
        </button>
      </div>

      <p className="text-xs text-amber-300/80 leading-relaxed">
        We found {candidates.length} open issue{candidates.length > 1 ? 's' : ''} with similar photos or descriptions
        within 75 meters. Rather than creating a duplicate report, confirm an existing issue to boost its response priority!
      </p>

      <div className="space-y-3">
        {candidates.map(candidate => (
          <div
            key={candidate.id}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-md p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
          >
            <div className="flex items-center gap-3 min-w-0">
              {candidate.media_url ? (
                <img
                  src={candidate.media_url}
                  alt={candidate.title}
                  className="w-14 h-14 rounded object-cover border border-[var(--border)] shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center shrink-0 text-xs text-[var(--fg-muted)]">
                  No Pic
                </div>
              )}

              <div className="min-w-0">
                <span className="text-[10px] uppercase font-mono font-semibold text-[var(--brand)] bg-[var(--brand-soft)] px-1.5 py-0.5 rounded border border-[var(--brand)]/30">
                  {candidate.category}
                </span>
                <h4 className="text-xs font-semibold text-[var(--fg)] truncate mt-1">
                  {candidate.title}
                </h4>
                <div className="flex items-center gap-3 text-[11px] text-[var(--fg-muted)] mt-0.5">
                  <span className="flex items-center gap-1 font-mono text-emerald-400">
                    <MapPin className="w-3 h-3" />
                    {candidate.distance_m}m away
                  </span>
                  <span>Match score: {Math.round(candidate.score * 100)}%</span>
                  <span className="capitalize">Status: {candidate.status.replace('_', ' ')}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
              <button
                type="button"
                disabled={loading}
                onClick={() => onAttest(candidate.id)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded text-xs font-semibold shadow transition-colors"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                I see this too (+1 Attestation)
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] flex items-center gap-1"
        >
          Different issue, continue with submission &rarr;
        </button>
      </div>
    </div>
  );
}
