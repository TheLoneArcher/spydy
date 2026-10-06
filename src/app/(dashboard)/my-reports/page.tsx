'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  FileText, ThumbsUp, ThumbsDown, CheckCircle2, AlertTriangle,
  Loader2, ArrowRight, Clock, ShieldCheck, MapPin
} from 'lucide-react';
import { REPORT_STATUS_LABELS, type ReportStatus } from '@/lib/domain/status';

export default function MyReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadReports = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('reports')
      .select(`
        id, title, description, category, severity, status, location_label, created_at,
        duplicate_count, duplicate_of
      `)
      .eq('reporter_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setMessage(error.message);
    } else {
      setReports(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleVote = async (reportId: string, val: 1 | -1) => {
    setSaving(reportId);
    try {
      const { error } = await supabase.rpc('vote_report', {
        p_report: reportId,
        p_value: val,
      });
      if (error) {
        alert(error.message);
      } else {
        await loadReports();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Vote error');
    } finally {
      setSaving(null);
    }
  };

  const handleConfirmResolution = async (reportId: string, agrees: boolean) => {
    setSaving(reportId);
    try {
      const { error } = await supabase.rpc('confirm_report_resolution', {
        p_report: reportId,
        p_agrees: agrees,
      });

      if (error) {
        alert(error.message);
      } else {
        await loadReports();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Confirmation error');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[var(--fg-muted)]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--fg)] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[var(--brand)]" />
            My Civic Reports
          </h1>
          <p className="text-xs text-[var(--fg-muted)] mt-1">
            Track remediation progress and confirm field repairs for issues you reported.
          </p>
        </div>
        <Link
          href="/submit-report"
          className="bg-[var(--brand)] text-[var(--brand-fg)] px-3.5 py-2 rounded text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          + Report New Issue
        </Link>
      </div>

      {message && (
        <div className="p-3 rounded bg-red-950/20 border border-red-900/40 text-red-400 text-xs">
          {message}
        </div>
      )}

      {reports.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-lg p-12 text-center text-xs text-[var(--fg-muted)] space-y-3">
          <p>You have not submitted any civic reports yet.</p>
          <Link
            href="/submit-report"
            className="inline-flex items-center gap-1.5 bg-[var(--surface-2)] text-[var(--fg)] border border-[var(--border)] px-4 py-2 rounded text-xs font-medium hover:border-[var(--brand)] transition-colors"
          >
            Launch Camera &amp; Report Issue &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map(report => {
            const statusLabel =
              REPORT_STATUS_LABELS[report.status as ReportStatus] || report.status.replace('_', ' ');

            const isAwaitingCitizen = report.status === 'resolved_pending_confirmation';

            return (
              <article
                key={report.id}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand)]/30 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider">
                        {report.category}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-medium border capitalize ${
                          report.status === 'closed'
                            ? 'bg-emerald-950/20 text-emerald-400 border-emerald-800/40'
                            : isAwaitingCitizen
                            ? 'bg-amber-950/20 text-amber-400 border-amber-800/40'
                            : 'bg-[var(--surface-2)] text-[var(--fg-muted)] border-[var(--border)]'
                        }`}
                      >
                        {statusLabel}
                      </span>
                      {report.duplicate_count > 0 && (
                        <span className="text-[10px] text-[var(--fg-muted)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                          +{report.duplicate_count} merged duplicates
                        </span>
                      )}
                    </div>
                    <h2 className="text-sm font-semibold text-[var(--fg)]">{report.title}</h2>
                    {report.location_label && (
                      <p className="text-xs text-[var(--fg-muted)] flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[var(--brand)]" />
                        {report.location_label}
                      </p>
                    )}
                  </div>

                  <span className="text-[11px] text-[var(--fg-muted)] font-mono shrink-0">
                    {new Date(report.created_at).toLocaleDateString()}
                  </span>
                </div>

                {report.description && (
                  <p className="text-xs text-[var(--fg-muted)] leading-relaxed bg-[var(--surface-2)] p-2.5 rounded border border-[var(--border)]">
                    {report.description}
                  </p>
                )}

                {/* Citizen Resolution Confirmation Box */}
                {isAwaitingCitizen && (
                  <div className="mt-3 p-4 rounded-md border border-amber-800/40 bg-amber-950/20 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Field Work Completed: Awaiting Your Confirmation
                    </div>
                    <p className="text-xs text-amber-300/80 leading-relaxed">
                      A volunteer has completed the repair work. Please confirm if the issue is completely resolved
                      to close the ticket, or reject to reopen it.
                    </p>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleConfirmResolution(report.id, true)}
                        disabled={saving === report.id}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded text-xs font-semibold shadow transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirm Fixed (Close)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmResolution(report.id, false)}
                        disabled={saving === report.id}
                        className="flex items-center gap-1.5 border border-red-800/40 text-red-400 hover:bg-red-950/20 px-3.5 py-1.5 rounded text-xs font-medium transition-colors"
                      >
                        Not Fixed (Reopen)
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
