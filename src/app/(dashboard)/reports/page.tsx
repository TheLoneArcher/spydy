'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Search, Download, FileText, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

const SEV: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  moderate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low:      'text-blue-400 bg-blue-500/10 border-blue-500/20',
};
const STA: Record<string, string> = {
  pending:     'text-slate-400 bg-slate-500/10 border-slate-500/20',
  dispatched:  'text-purple-400 bg-purple-500/10 border-purple-500/20',
  in_progress: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  verified:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [sev, setSev]         = useState('all');
  const [sta, setSta]         = useState('all');

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('need_reports')
        .select('*, profiles(full_name), tasks(volunteers(profiles(full_name)))')
        .order('created_at', { ascending: false });
      setReports(data ?? []);
      setLoading(false);
    };
    fetch();
    const chan = supabase.channel('reports_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'need_reports' }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, []);

  const exportCsv = () => {
    const rows = reports.map(r => [r.id, `"${r.title}"`, r.severity, r.status, `"${r.location_label ?? ''}"`, r.created_at].join(','));
    const csv  = ['ID,Title,Severity,Status,Location,Created'].concat(rows).join('\n');
    const a    = Object.assign(document.createElement('a'), { href: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv), download: `reports_${Date.now()}.csv` });
    a.click();
  };

  const filtered = reports.filter(r => {
    const q = search.toLowerCase();
    const matchText = r.title.toLowerCase().includes(q) || (r.location_label ?? '').toLowerCase().includes(q);
    const matchSev  = sev === 'all' || r.severity === sev;
    const matchSta  = sta === 'all' || r.status === sta;
    return matchText && matchSev && matchSta;
  });

  return (
    <div className="p-6 md:p-8 min-h-screen bg-[#0A0E17] text-[#F1F5F9]">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Report Log</h1>
          <p className="text-[13px] text-[#94A3B8] mt-0.5">Complete history of all submitted incidents</p>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 bg-[#111827] border border-[#1F2937] text-[#94A3B8] hover:text-white px-3 py-2 rounded-md text-[13px] font-medium transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <input
            placeholder="Search title or location..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#111827] border border-[#1F2937] rounded-md pl-9 pr-4 py-2 text-sm text-white placeholder-[#6B7280] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
        <select value={sev} onChange={e => setSev(e.target.value)} className="bg-[#111827] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-[#94A3B8] focus:outline-none focus:border-blue-500 transition-colors">
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="moderate">Moderate</option>
          <option value="low">Low</option>
        </select>
        <select value={sta} onChange={e => setSta(e.target.value)} className="bg-[#111827] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-[#94A3B8] focus:outline-none focus:border-blue-500 transition-colors">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="dispatched">Dispatched</option>
          <option value="in_progress">In Progress</option>
          <option value="verified">Resolved</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : (
        <div className="bg-[#111827] border border-[#1F2937] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-[#1F2937]">
                  {['Incident', 'Severity', 'Status', 'Submitted by', 'Assigned', 'Created'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#64748B]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-[13px] text-[#64748B]">No reports match your filters.</td></tr>
                )}
                {filtered.map(r => {
                  const assigned = r.tasks?.[0]?.volunteers?.profiles?.full_name;
                  return (
                    <tr key={r.id} className="border-b border-[#1F2937]/50 hover:bg-[#1a2235] transition-colors group">
                      <td className="px-4 py-3.5 max-w-[280px]">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded bg-[#1F2937] flex items-center justify-center flex-shrink-0">
                            {r.status === 'verified'
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              : <FileText className="w-4 h-4 text-blue-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">{r.title}</p>
                            <p className="text-[11px] text-[#64748B] truncate">{r.location_label}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${SEV[r.severity] ?? ''}`}>{r.severity}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${STA[r.status] ?? ''}`}>{r.status.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-[#94A3B8]">{r.profiles?.full_name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-[13px] text-[#94A3B8]">{assigned ?? <span className="italic text-[#4B5563]">Unassigned</span>}</td>
                      <td className="px-4 py-3.5 text-[12px] text-[#64748B]">{format(new Date(r.created_at), 'MMM d, HH:mm')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
