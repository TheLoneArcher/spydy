'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, ArrowUp, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type SortMode = 'newest' | 'nearest' | 'most_attested' | 'urgent';

type FeedReport = {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  created_at: string;
  location_label: string | null;
  lat: number;
  lon: number;
  distance_m: number | null;
  up: number;
  down: number;
  score: number;
  my_vote: number | null;
  media_path: string | null;
  reporter_name: string;
  duplicate_count: number;
  priority: number;
};

const statusStyles: Record<string, string> = {
  pending: 'text-slate-300 bg-slate-400/10 border-slate-400/20',
  triaged: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20',
  assigned: 'text-blue-300 bg-blue-400/10 border-blue-400/20',
  in_progress: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
  resolved_pending_confirmation: 'text-violet-300 bg-violet-400/10 border-violet-400/20',
  closed: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
  reopened: 'text-orange-300 bg-orange-400/10 border-orange-400/20',
};

const severityStyles: Record<string, string> = {
  critical: 'text-red-300',
  moderate: 'text-amber-300',
  low: 'text-sky-300',
};

function formatDistance(distanceM: number | null) {
  if (distanceM === null) return null;
  return distanceM < 1000 ? `${Math.round(distanceM)} m away` : `${(distanceM / 1000).toFixed(1)} km away`;
}

export default function FeedPage() {
  const [reports, setReports] = useState<FeedReport[]>([]);
  const [sort, setSort] = useState<SortMode>('newest');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);

  const loadFeed = async (nextSort = sort) => {
    setError(null);
    setRefreshing(true);
    const { data, error: rpcError } = await supabase.rpc('feed_reports', {
      p_lat: location?.lat ?? null,
      p_lon: location?.lon ?? null,
      p_sort: nextSort,
      p_status: null,
      p_category: null,
      p_radius_km: null,
      p_mine: false,
      p_limit: 20,
      p_cursor: null,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      const rows = (data ?? []) as FeedReport[];
      const paths = rows.map(row => row.media_path).filter((path): path is string => Boolean(path));
      if (paths.length > 0) {
        const response = await fetch('/api/media/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths }),
        });
        if (response.ok) {
          const signed = (await response.json()) as { urls?: Record<string, string> };
          setReports(rows.map(row => ({ ...row, media_path: row.media_path ? signed.urls?.[row.media_path] ?? row.media_path : null })));
        } else {
          setReports(rows);
        }
      } else {
        setReports(rows);
      }
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      void loadFeed();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        setLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      () => {
        void loadFeed();
      },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    if (location) void loadFeed();
  }, [location]);

  const handleSortChange = (value: SortMode) => {
    setSort(value);
    void loadFeed(value);
  };

  const vote = async (report: FeedReport) => {
    const nextValue = report.my_vote === 1 ? 0 : 1;
    const { data, error: voteError } = await supabase.rpc('vote_report', {
      p_report: report.id,
      p_value: nextValue,
    });

    if (voteError) {
      setError(voteError.message);
      return;
    }

    const summary = Array.isArray(data) ? data[0] : data;
    setReports(current => current.map(item => item.id === report.id
      ? { ...item, my_vote: nextValue || null, up: summary?.upvotes ?? item.up, down: summary?.downvotes ?? item.down, score: summary?.score ?? item.score }
      : item
    ));
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--fg)] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Civic pulse</p>
            <h1 className="text-3xl font-semibold tracking-tight">What needs attention?</h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--fg-muted)]">See verified reports from the community and add your voice when an issue affects you too.</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="feed-sort" className="sr-only">Sort reports</label>
            <select id="feed-sort" value={sort} onChange={event => handleSortChange(event.target.value as SortMode)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)]">
              <option value="newest">Newest</option>
              <option value="nearest" disabled={!location}>Nearest</option>
              <option value="most_attested">Most attested</option>
              <option value="urgent">Highest priority</option>
            </select>
            <button type="button" onClick={() => void loadFeed()} disabled={refreshing} className="rounded-lg border border-[var(--border)] p-2 text-[var(--fg-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--fg)]" aria-label="Refresh feed" title="Refresh feed">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-[var(--brand)]" /></div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-20 text-center"><MapPin className="mx-auto mb-3 h-7 w-7 text-[var(--fg-muted)]" /><p className="font-medium">No reports to show yet</p><p className="mt-1 text-sm text-[var(--fg-muted)]">New verified issues will appear here.</p></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {reports.map(report => (
              <article key={report.id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                {report.media_path && <img src={report.media_path} alt="" className="h-48 w-full object-cover" />}
                <div className="p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className={`text-xs font-semibold uppercase ${severityStyles[report.severity] ?? 'text-[var(--fg-muted)]'}`}>{report.severity}</span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${statusStyles[report.status] ?? 'text-[var(--fg-muted)]'}`}>{report.status.replaceAll('_', ' ')}</span>
                  </div>
                  <h2 className="text-lg font-semibold">{report.title}</h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--fg-muted)]">{report.description}</p>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--fg-muted)]">
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{report.location_label ?? 'Location captured'}</span>
                    {formatDistance(report.distance_m) && <span>{formatDistance(report.distance_m)}</span>}
                    <span>{formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}</span>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4">
                    <span className="text-xs text-[var(--fg-muted)]">Reported by {report.reporter_name}</span>
                    <button type="button" onClick={() => void vote(report)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${report.my_vote === 1 ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]'}`} aria-label={`Attest ${report.title}`}>
                      <ArrowUp className="h-3.5 w-3.5" /> {report.up}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
