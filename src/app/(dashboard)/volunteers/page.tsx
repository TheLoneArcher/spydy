'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Users, Circle, ChevronRight, Search, Star, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const SKILL_COLORS: Record<string, string> = {
  medical:       'text-red-400 bg-red-500/10 border-red-500/20',
  logistics:     'text-blue-400 bg-blue-500/10 border-blue-500/20',
  heavy_lifting: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  tech_support:  'text-purple-400 bg-purple-500/10 border-purple-500/20',
};

export default function VolunteersPage() {
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterSkill, setFilterSkill] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchVolunteers = async () => {
    const { data } = await supabase
      .from('volunteers')
      .select('id, profile_id, skills, last_location, is_available, profiles(full_name), updated_at')
      .order('updated_at', { ascending: false });
    setVolunteers(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchVolunteers();
    const chan = supabase.channel('volunteers_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteers' }, fetchVolunteers)
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, []);

  const toggleAvailability = async (id: string, cur: boolean) => {
    // If trying to set available, check they have no active task first
    if (cur === false) { // current is false, we want to set it true
      const { data: activeTasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('volunteer_id', id)
        .in('status', ['dispatched', 'in_progress']);
      
      if (activeTasks && activeTasks.length > 0) {
        alert('This volunteer still has an active task. Resolve the task first.');
        return;
      }
    }

    const { error } = await supabase.from('volunteers').update({ is_available: !cur }).eq('id', id);
    if (error) console.error('Toggle error:', error.message);
    else fetchVolunteers();
  };

  const parseSkills = (skills: any): string[] => {
    if (Array.isArray(skills)) return skills;
    if (typeof skills === 'string') return skills.replace(/[{}]/g, '').split(',').filter(Boolean);
    return [];
  };

  const filtered = volunteers.filter(v => {
    const name = v.profiles?.full_name?.toLowerCase() ?? '';
    const vSkills = parseSkills(v.skills);
    const matchSearch = name.includes(search.toLowerCase()) || vSkills.some((s: string) => s.includes(search.toLowerCase()));
    const matchSkill  = filterSkill === 'all' || vSkills.includes(filterSkill);
    const matchStatus = filterStatus === 'all'
      || (filterStatus === 'available' && v.is_available)
      || (filterStatus === 'busy' && !v.is_available);
    return matchSearch && matchSkill && matchStatus;
  });

  const stats = {
    total:     volunteers.length,
    available: volunteers.filter(v => v.is_available).length,
    busy:      volunteers.filter(v => !v.is_available).length,
  };

  return (
    <div className="p-6 md:p-8 min-h-screen bg-[#0A0E17] text-[#F1F5F9]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Volunteers</h1>
          <p className="text-[13px] text-[#94A3B8] mt-0.5">Manage and monitor your field team</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total', value: stats.total, color: 'text-white' },
          { label: 'Available', value: stats.available, color: 'text-emerald-400' },
          { label: 'On Task', value: stats.busy, color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-[#111827] border border-[#1F2937] rounded-lg px-4 py-3">
            <p className={`text-2xl font-bold ${s.color} mb-0.5`}>{s.value}</p>
            <p className="text-[11px] text-[#64748B] uppercase tracking-wider font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <input
            type="text"
            placeholder="Search by name or skill..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#111827] border border-[#1F2937] rounded-md pl-9 pr-4 py-2 text-sm text-white placeholder-[#6B7280] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
        <select
          value={filterSkill}
          onChange={e => setFilterSkill(e.target.value)}
          className="bg-[#111827] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-[#94A3B8] focus:outline-none focus:border-blue-500 transition-colors"
        >
          <option value="all">All skills</option>
          <option value="medical">Medical</option>
          <option value="logistics">Logistics</option>
          <option value="heavy_lifting">Heavy Lifting</option>
          <option value="tech_support">Tech Support</option>
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-[#111827] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-[#94A3B8] focus:outline-none focus:border-blue-500 transition-colors"
        >
          <option value="all">All status</option>
          <option value="available">Available</option>
          <option value="busy">On task</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : (
        <div className="bg-[#111827] border border-[#1F2937] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1F2937]">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#64748B]">Volunteer</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#64748B]">Skills</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#64748B]">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#64748B]">Last Active</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#64748B]">Toggle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[#64748B] text-[13px]">
                    No volunteers match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((vol) => {
                const initials = vol.profiles?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase() ?? '??';
                return (
                  <tr key={vol.id} className="border-b border-[#1F2937]/50 hover:bg-[#1a2235] transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-900/30 border border-blue-800/40 flex items-center justify-center text-blue-400 text-[11px] font-bold flex-shrink-0">
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium text-white text-[13px]">{vol.profiles?.full_name ?? '—'}</p>
                          <p className="text-[11px] text-[#64748B]">{vol.phone ?? 'No phone'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {parseSkills(vol.skills).length > 0
                          ? parseSkills(vol.skills).map((s) => (
                              <span key={s} className={`px-2 py-0.5 rounded text-[10px] font-medium border capitalize ${SKILL_COLORS[s] ?? 'text-[#94A3B8] bg-[#1F2937] border-[#374151]'}`}>
                                {s.replace('_', ' ')}
                              </span>
                            ))
                          : <span className="text-[12px] text-[#64748B] italic">None</span>
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${vol.is_available ? 'text-emerald-400' : 'text-[#94A3B8]'}`}>
                        <Circle className={`w-2 h-2 fill-current ${vol.is_available ? 'text-emerald-500' : 'text-[#64748B]'}`} />
                        {vol.is_available ? 'Available' : 'On task'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-[12px] text-[#64748B]">
                      {vol.updated_at ? formatDistanceToNow(new Date(vol.updated_at), { addSuffix: true }) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => toggleAvailability(vol.id, vol.is_available)}
                        className={`px-3 py-1 rounded text-[11px] font-medium border transition-colors ${
                          vol.is_available
                            ? 'text-amber-400 border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20'
                            : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20'
                        }`}
                      >
                        {vol.is_available ? 'Set busy' : 'Set free'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
