'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, CheckCircle2, Navigation, Clock, AlertTriangle, MapPin, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const SBadge = ({ s }: { s: string }) => {
  const c: Record<string, string> = {
    critical: 'text-red-400 bg-red-500/10 border-red-500/20',
    moderate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    low:      'text-blue-400 bg-blue-500/10 border-blue-500/20',
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${c[s] ?? ''}`}>{s}</span>;
};

const TBadge = ({ s }: { s: string }) => {
  const c: Record<string, string> = {
    pending:     'text-slate-400  bg-slate-500/10  border-slate-500/20',
    dispatched:  'text-purple-400 bg-purple-500/10 border-purple-500/20',
    in_progress: 'text-amber-400  bg-amber-500/10  border-amber-500/20',
    verified:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${c[s] ?? ''}`}>{s.replace('_', ' ')}</span>;
};

export default function MyTasksPage() {
  const [tasks, setTasks]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [tab, setTab]         = useState<'active' | 'done'>('active');

  const fetchTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: volunteer, error: volunteerError } = await supabase
        .from('volunteer_profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .single();
      if (volunteerError || !volunteer) {
        if (volunteerError) console.error('Volunteer fetch error:', volunteerError.message);
        setLoading(false); 
        return; 
      }
      const { data, error } = await supabase
        .from('tasks')
        .select('*, reports(id, title, description, severity, location_label, required_skill)')
        .eq('volunteer_id', user.id)
        .order('assigned_at', { ascending: false });

      if (error) console.error('Tasks fetch error:', error.message);
      setTasks(data ?? []);
    } catch (err: any) {
      console.error('Fetch tasks bug:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getUser().then((res: { data: { user: any } }) => {
      const user = res.data.user;
      if (!user) return;
      channel = supabase.channel('my_tasks_' + user.id)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'tasks',
        filter: `volunteer_id=eq.${user.id}`
      }, fetchTasks)
      .subscribe();
    });
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const updateStatus = async (taskId: string, newStatus: string) => {
    setUpdatingId(taskId);
    try {
      const { error } = await supabase.rpc('update_task_status', {
        p_task: taskId,
        p_status: newStatus,
      });
      if (error) throw error;

      fetchTasks();
    } catch (err: any) {
      console.error('Status update error:', err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <div className="flex h-full items-center justify-center bg-[#0A0E17]"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  const active = tasks.filter(t => !['completed', 'declined', 'cancelled'].includes(t.status));
  const done   = tasks.filter(t => ['completed', 'declined', 'cancelled'].includes(t.status));
  const displayed = tab === 'active' ? active : done;

  const nextStatus: Record<string, string> = {
    assigned:    'in_progress',
    in_progress: 'completed',
  };
  const nextLabel: Record<string, string> = {
    assigned:    'Start task',
    in_progress: 'Mark complete',
  };

  return (
    <div className="p-6 md:p-8 min-h-screen bg-[#0A0E17] text-[#F1F5F9]">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">My Tasks</h1>
            <p className="text-[13px] text-[#94A3B8] mt-0.5">Tasks assigned to you</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-[#111827] border border-[#1F2937] rounded px-3 py-1 text-[12px] text-[#94A3B8]">
              <span className="text-white font-semibold">{active.length}</span> active
            </div>
          </div>
        </div>

        <div className="flex gap-1 mb-5 bg-[#111827] border border-[#1F2937] p-1 rounded-lg w-fit">
          {(['active', 'done'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded text-[12px] font-medium transition-colors ${tab === t ? 'bg-[#1F2937] text-white' : 'text-[#64748B] hover:text-[#94A3B8]'}`}
            >
              {t === 'active' ? `Active (${active.length})` : `Completed (${done.length})`}
            </button>
          ))}
        </div>

        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="w-10 h-10 text-[#1F2937] mb-3" />
            <p className="text-[14px] text-[#64748B]">
              {tab === 'active' ? 'No active tasks.' : 'No completed tasks yet.'}
            </p>
            {tab === 'active' && (
              <p className="text-[12px] text-[#4B5563] mt-1">Check Nearby Issues to volunteer for open incidents.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map(task => {
              const r = task.reports;
              const next = nextStatus[task.status];
              return (
                <div key={task.id} className="bg-[#111827] border border-[#1F2937] rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-2 mb-2">
                        <SBadge s={r?.severity ?? 'low'} />
                        <TBadge s={task.status} />
                        {r?.required_skill && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1F2937] text-[#94A3B8] border border-[#374151] capitalize">
                            {r.required_skill.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <h3 className="text-[14px] font-semibold text-white leading-snug mb-1">{r?.title ?? 'Unknown incident'}</h3>
                      {r?.description && (
                        <p className="text-[12px] text-[#64748B] line-clamp-2 mb-2">{r.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-[12px] text-[#64748B]">
                        {r?.location_label && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.location_label}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(task.assigned_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    {next && (
                      <button
                        onClick={() => updateStatus(task.id, next)}
                        disabled={updatingId === task.id}
                        className={`flex-shrink-0 text-[12px] font-medium px-3 py-2 rounded-md transition-colors flex items-center gap-1.5
                          ${next === 'verified'
                            ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/20'
                            : 'bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600/20'
                          } disabled:opacity-50`}
                      >
                        {updatingId === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        {nextLabel[task.status]}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
