'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react';

interface Report {
  id: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  category: string;
  location_label: string;
  created_at: string;
}

interface VoteCounts {
  upvotes: number;
  downvotes: number;
}

export default function MyReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [votes, setVotes] = useState<Record<string, VoteCounts>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [resolutionFiles, setResolutionFiles] = useState<Record<string, File | null>>({});

  const loadReports = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: reportData }, { data: voteData }] = await Promise.all([
      supabase.from('reports').select('id, title, description, status, severity, category, location_label, created_at').eq('reporter_id', user.id).order('created_at', { ascending: false }),
      supabase.from('report_votes').select('report_id, value'),
    ]);

    setReports(reportData ?? []);
    const counts: Record<string, VoteCounts> = {};
    (voteData ?? []).forEach((vote: { report_id: string; value: number }) => {
      counts[vote.report_id] ??= { upvotes: 0, downvotes: 0 };
      if (vote.value === 1) counts[vote.report_id].upvotes += 1;
      if (vote.value === -1) counts[vote.report_id].downvotes += 1;
    });
    setVotes(counts);
    setLoading(false);
  };

  useEffect(() => { void loadReports(); }, []);

  const vote = async (reportId: string, value: 1 | -1) => {
    setSaving(reportId);
    setMessage('');
    const { error } = await supabase.rpc('vote_report', { p_report: reportId, p_value: value });
    if (error) setMessage(error.message);
    else await loadReports();
    setSaving(null);
  };

  const confirmResolution = async (report: Report, agrees: boolean) => {
    setSaving(report.id);
    setMessage('');
    let imagePath: string | null = null;
    const file = resolutionFiles[report.id];

    if (file) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        imagePath = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from('report-images').upload(imagePath, file, { upsert: false, contentType: file.type });
        if (uploadError) {
          setMessage(uploadError.message);
          setSaving(null);
          return;
        }
      }
    }

    const { error } = await supabase.rpc('confirm_report_resolution', {
      p_report: report.id,
      p_agrees: agrees,
      p_image_path: imagePath,
    });
    if (error) setMessage(error.message);
    else await loadReports();
    setSaving(null);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0A0E17]"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  return (
    <div className="min-h-screen bg-[#0A0E17] p-6 text-[#F1F5F9] md:p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold text-white">My Reports</h1>
        <p className="mt-1 text-[13px] text-[#94A3B8]">Track progress and help prioritize the issues you reported.</p>
        {message && <div className="mt-4 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-400">{message}</div>}
        {reports.length === 0 ? (
          <div className="mt-10 rounded-lg border border-[#1F2937] bg-[#111827] p-8 text-center text-sm text-[#64748B]">You have not submitted any reports yet.</div>
        ) : (
          <div className="mt-6 space-y-3">
            {reports.map(report => {
              const count = votes[report.id] ?? { upvotes: 0, downvotes: 0 };
              return (
                <article key={report.id} className="rounded-lg border border-[#1F2937] bg-[#111827] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
                        <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-blue-400">{report.category}</span>
                        <span className="rounded border border-[#374151] px-2 py-0.5 text-[#94A3B8]">{report.status.replace('_', ' ')}</span>
                      </div>
                      <h2 className="text-[15px] font-semibold text-white">{report.title}</h2>
                      <p className="mt-1 text-[12px] text-[#64748B]">{report.location_label}</p>
                    </div>
                    <span className="text-[11px] text-[#64748B]">{new Date(report.created_at).toLocaleDateString()}</span>
                  </div>
                  {report.description && <p className="mt-3 text-[13px] leading-relaxed text-[#94A3B8]">{report.description}</p>}
                  <div className="mt-4 flex items-center gap-2 border-t border-[#1F2937] pt-3">
                    <button type="button" onClick={() => vote(report.id, 1)} disabled={saving === report.id} className="flex items-center gap-1 rounded border border-emerald-500/20 px-2.5 py-1.5 text-[12px] text-emerald-400 hover:bg-emerald-500/10"><ThumbsUp className="h-3.5 w-3.5" /> {count.upvotes}</button>
                    <button type="button" onClick={() => vote(report.id, -1)} disabled={saving === report.id} className="flex items-center gap-1 rounded border border-red-500/20 px-2.5 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10"><ThumbsDown className="h-3.5 w-3.5" /> {count.downvotes}</button>
                  </div>
                  {report.status === 'resolved' && (
                    <div className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                      <p className="flex items-center gap-2 text-[13px] font-medium text-amber-300"><AlertTriangle className="h-4 w-4" /> Confirm this resolution</p>
                      <p className="mt-1 text-[12px] text-[#94A3B8]">Agree to close the report, or reject it to reopen the issue.</p>
                      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-[#94A3B8]"><ImagePlus className="h-4 w-4" /> Attach an after photo<input type="file" accept="image/*" className="sr-only" onChange={event => setResolutionFiles(current => ({ ...current, [report.id]: event.target.files?.[0] ?? null }))} /></label>
                      <div className="mt-3 flex gap-2"><button type="button" onClick={() => confirmResolution(report, true)} disabled={saving === report.id} className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white"><CheckCircle2 className="h-3.5 w-3.5" /> Agree</button><button type="button" onClick={() => confirmResolution(report, false)} disabled={saving === report.id} className="rounded border border-red-500/30 px-3 py-1.5 text-[12px] text-red-400">Reject</button></div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
