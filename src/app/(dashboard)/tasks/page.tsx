'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, AlertCircle, Clock, UserIcon, MoreHorizontal, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type Status = 'pending' | 'dispatched' | 'in_progress' | 'verified';

const COL_CONFIG: { id: Status; label: string; dot: string }[] = [
  { id: 'pending',     label: 'Pending',     dot: 'bg-slate-400' },
  { id: 'dispatched',  label: 'Dispatched',  dot: 'bg-purple-400' },
  { id: 'in_progress', label: 'In Progress', dot: 'bg-amber-400' },
  { id: 'verified',    label: 'Resolved',    dot: 'bg-emerald-400' },
];

const SEV: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  moderate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low:      'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

export default function TasksPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState('');
  const [adminName, setAdminName] = useState('');
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [dispatchModal, setDispatchModal] = useState<{ report: any } | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [search, setSearch] = useState('');

  const fetchAll = useCallback(async () => {
    const [{ data: reps }, { data: vols }] = await Promise.all([
      supabase.from('need_reports').select('*, profiles(full_name), tasks(status, volunteers(profiles(full_name)))').order('created_at', { ascending: false }),
      supabase.from('volunteers').select('id, profile_id, skills, is_available, profiles(full_name)').eq('is_available', true),
    ]);
    setReports(reps ?? []);
    setVolunteers(vols ?? []);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setAdminId(user.id);
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
        setAdminName(prof?.full_name ?? 'Admin');
      }
      await fetchAll();
      setLoading(false);
    };
    init();
    const chan = supabase.channel('tasks_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'need_reports' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteers' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, []);

  const handleDispatch = async (volunteerId: string) => {
    if (!dispatchModal || !adminId || dispatching) return;
    setDispatching(true);
    const report = dispatchModal.report;
    const vol = volunteers.find(v => v.id === volunteerId);

    try {
      // 1. Create the task
      const { data: task, error: tErr } = await supabase.from('tasks').insert({
        report_id: report.id,
        volunteer_id: volunteerId,
        assigned_by: adminId,
        status: 'dispatched',
        notes: 'Assigned via Task Board'
      }).select().single();

      if (tErr) throw tErr;

      // 2. Mark incident as dispatched
      await supabase.from('need_reports').update({ status: 'dispatched' }).eq('id', report.id);

      // 3. Log update
      await supabase.from('report_updates').insert({
        report_id: report.id,
        author_id: adminId,
        message: `Task assigned to ${vol?.profiles?.full_name || 'Volunteer'}`
      });

      // 4. Mark volunteer busy
      await supabase.from('volunteers').update({ is_available: false }).eq('id', volunteerId);

      // 5. Notify
      if (vol?.profile_id) {
        await supabase.from('notifications').insert({
          recipient_id: vol.profile_id,
          title: 'New Task Assignment',
          message: `You have been dispatched to: ${report.title}`,
          type: 'assignment',
          related_report_id: report.id,
          related_task_id: task?.id
        });
      }

      setDispatchModal(null);
      fetchAll();
    } catch (err: any) {
      console.error('Dispatch error:', err.message);
    } finally {
      setDispatching(false);
    }
  };

  if (loading) return <div className="flex h-full items-center justify-center bg-[#0A0E17]"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  const filtered = reports.filter(r => r.title.toLowerCase().includes(search.toLowerCase()) || (r.location_label ?? '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-screen bg-[#0A0E17] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2937] flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-white">Task Board</h1>
          <p className="text-[13px] text-[#94A3B8] mt-0.5">Manage all field operations</p>
        </div>
        <input
          type="text"
          placeholder="Search reports..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-[#111827] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-56 transition-colors"
        />
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-5 gap-4 flex">
        {COL_CONFIG.map(col => {
          const colReports = filtered.filter(r => r.status === col.id);
          return (
            <div key={col.id} className="flex-shrink-0 w-72 flex flex-col bg-[#0D1117] border border-[#1F2937] rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1F2937]">
                <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className="text-[13px] font-semibold text-white">{col.label}</span>
                <span className="ml-auto text-[11px] text-[#64748B] bg-[#111827] px-2 py-0.5 rounded-full border border-[#1F2937]">{colReports.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {colReports.map(report => {
                  const activeTask = report.tasks?.[0];
                  const assigned   = activeTask?.volunteers?.profiles?.full_name;
                  return (
                    <div
                      key={report.id}
                      className={`bg-[#111827] border border-[#1F2937] hover:border-[#374151] rounded-md p-3 group transition-colors ${col.id === 'pending' ? 'cursor-pointer' : 'cursor-default'}`}
                      onClick={() => {
                        if (col.id === 'pending') setDispatchModal({ report });
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${SEV[report.severity] ?? ''}`}>
                          {report.severity}
                        </span>
                        {col.id === 'pending' && (
                          <span className="text-[11px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity font-medium">Dispatch →</span>
                        )}
                      </div>
                      <h3 className="text-[13px] font-medium text-white line-clamp-2 leading-snug mb-2">{report.title}</h3>
                      <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                        {assigned ? (
                          <span className="flex items-center gap-1 text-blue-400">
                            <UserIcon className="w-3 h-3" />{assigned}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-amber-500" />Unassigned</span>
                        )}
                        <span>{formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  );
                })}
                {colReports.length === 0 && (
                  <div className="h-20 flex items-center justify-center rounded-md border border-dashed border-[#1F2937]">
                    <span className="text-[12px] text-[#4B5563]">Empty</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dispatch modal */}
      {dispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0D1117] border border-[#1F2937] rounded-xl w-full max-w-sm p-6 animate-fade-in">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Dispatch Volunteer</h3>
                <p className="text-[12px] text-[#64748B] mt-1 line-clamp-2">{dispatchModal.report.title}</p>
              </div>
              <button onClick={() => setDispatchModal(null)} className="text-[#64748B] hover:text-white ml-4 transition-colors text-xl leading-none">&times;</button>
            </div>
            {dispatchModal.report.required_skill && (
              <p className="text-[12px] text-amber-400 mb-3 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-md">
                Requires: <strong className="capitalize">{dispatchModal.report.required_skill.replace('_', ' ')}</strong>
              </p>
            )}
            {volunteers.length === 0 ? (
              <p className="text-[13px] text-[#64748B] py-4 text-center">No available volunteers right now.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {volunteers.map(vol => {
                  const initials = vol.profiles?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase() ?? '??';
                  const parseSkills = (s: any) => Array.isArray(s) ? s : (typeof s === 'string' ? s.replace(/[{}]/g, '').split(',').filter(Boolean) : []);
                  const vSkills = parseSkills(vol.skills);
                  const matches  = dispatchModal.report.required_skill && vSkills.includes(dispatchModal.report.required_skill);
                  return (
                    <button
                      key={vol.id}
                      onClick={() => handleDispatch(vol.id)}
                      disabled={dispatching}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#111827] border border-[#1F2937] hover:border-blue-500/30 hover:bg-blue-900/5 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-blue-900/40 border border-blue-800/60 flex items-center justify-center text-blue-400 text-[10px] font-bold flex-shrink-0">
                        {initials}
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-[13px] font-medium text-white">{vol.profiles?.full_name}</p>
                        <p className="text-[11px] text-[#64748B]">{vSkills.map((s: string) => s.replace('_', ' ')).join(', ') || 'No skills listed'}</p>
                      </div>
                      {matches && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-medium">Match</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
