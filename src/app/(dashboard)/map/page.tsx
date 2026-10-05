'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, AlertTriangle, CheckCircle2, Clock, MapPin, X, User, ChevronRight, Activity } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow } from 'date-fns';

const MapClient = dynamic(() => import('@/components/MapClient'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0D1117]">
      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
    </div>
  ),
});

import { parsePoint } from '@/components/MapClient';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2)*Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  moderate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low:      'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

const STATUS_COLOR: Record<string, string> = {
  pending:     'text-slate-400 bg-slate-500/10 border-slate-500/20',
  dispatched:  'text-purple-400 bg-purple-500/10 border-purple-500/20',
  in_progress: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  verified:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

export default function MapPage() {
  const [reports, setReports]         = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<any>(null);
  const [volunteers, setVolunteers]   = useState<any[]>([]);
  const [updates, setUpdates]         = useState<any[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [filter, setFilter]           = useState<string>('all');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [toast, setToast]             = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setCurrentUser(prof);

      const [repsData, volsData, updatesData] = await Promise.all([
        supabase.from('need_reports').select('*, profiles(full_name)').order('created_at', { ascending: false }),
        supabase.from('volunteers').select('id, profile_id, skills, last_location, is_available, profiles(full_name)').eq('is_available', true),
        supabase.from('report_updates').select('*, profiles:author_id(full_name)').order('created_at', { ascending: false }).limit(20)
      ]);

      if (repsData.data) setReports(repsData.data);
      if (volsData.data) setVolunteers(volsData.data);
      if (updatesData.data) setUpdates(updatesData.data);
      setLoading(false);
    };
    init();

    const chan = supabase.channel('map_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'need_reports' }, () => init())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'report_updates' }, () => init())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteers' }, () => init())
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, []);

  const handleDispatch = async (volunteerId: string) => {
    if (!selected || !currentUser) return;
    setDispatching(true);
    try {
      const vol = volunteers.find(v => v.id === volunteerId);
      
      // 1. Create the task
      const { data: task, error: tErr } = await supabase.from('tasks').insert({
        report_id: selected.id,
        volunteer_id: volunteerId,
        assigned_by: currentUser.id,
        status: 'dispatched',
        notes: 'Assigned via Map Dispatch'
      }).select().single();

      if (tErr) throw tErr;

      // 2. Mark incident as dispatched
      await supabase.from('need_reports').update({ status: 'dispatched' }).eq('id', selected.id);

      // 3. Log the update
      await supabase.from('report_updates').insert({
        report_id: selected.id,
        author_id: currentUser.id,
        message: `Task assigned to ${vol?.profiles?.full_name || 'Volunteer'}`
      });

      // 4. Mark the volunteer as busy
      await supabase.from('volunteers').update({ is_available: false }).eq('id', volunteerId);

      // 5. Notify volunteer (if we have their profile_id)
      if (vol?.profile_id) {
        await supabase.from('notifications').insert({
          recipient_id: vol.profile_id,
          title: 'New Dispatch Assignment',
          message: `You have been dispatched to: ${selected.title}`,
          type: 'assignment',
          related_report_id: selected.id,
          related_task_id: task?.id
        });
      }
    } catch (err: any) {
      console.error('Dispatch error:', err.message);
      setToast(`Dispatch failed: ${err.message}`);
    } finally {
      setDispatching(false);
      setSelected(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const filtered = reports.filter(r => filter === 'all' || r.severity === filter || r.status === filter);
  const stats = {
    active:   reports.filter(r => r.status !== 'verified').length,
    critical: reports.filter(r => r.severity === 'critical' && r.status !== 'verified').length,
    pending:  reports.filter(r => r.status === 'pending').length,
    resolved: reports.filter(r => r.status === 'verified').length,
  };

  const sortedVolunteers = useMemo(() => {
    // Filter out "bystanders" (volunteers with NO skills selected)
    const activeVolunteers = volunteers.filter(v => v.skills && Array.isArray(v.skills) && v.skills.length > 0);
    
    if (!selected) return activeVolunteers;
    const sLoc = parsePoint(selected.location);
    if (!sLoc) return activeVolunteers;
    
    return [...activeVolunteers].map(v => {
      const vLoc = parsePoint(v.last_location);
      const dist = vLoc ? getDistance(sLoc[0], sLoc[1], vLoc[0], vLoc[1]) : Infinity;
      return { ...v, _dist: dist };
    }).sort((a, b) => a._dist - b._dist);
  }, [selected, volunteers]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#0A0E17]">
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {/* Map */}
          <div className="absolute inset-0">
            <MapClient 
              reports={filtered} 
              onSelectReport={setSelected} 
              center={selected ? (parsePoint(selected.location) || undefined) : undefined}
              zoom={selected ? 13 : 5}
            />
          </div>

          {/* Stats bar */}
          <div className="absolute top-4 left-4 right-4 z-[400] flex gap-2 pointer-events-none">
            {[
              { label: 'Active', value: stats.active, color: 'text-blue-400' },
              { label: 'Critical', value: stats.critical, color: 'text-red-400' },
              { label: 'Pending', value: stats.pending, color: 'text-amber-400' },
              { label: 'Resolved', value: stats.resolved, color: 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="pointer-events-auto bg-[#0D1117]/90 backdrop-blur-md border border-[#1F2937] rounded-lg px-4 py-2.5 flex items-center gap-3">
                <span className={`text-xl font-bold ${s.color}`}>{s.value}</span>
                <span className="text-[11px] text-[#64748B] uppercase tracking-wide font-medium">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Report sidepanel */}
          {selected && (
            <div className="absolute right-0 top-0 bottom-0 w-[360px] z-[450] bg-[#0D1117] border-l border-[#1F2937] flex flex-col animate-slide-left overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2937] shrink-0 bg-[#0D1117]">
                <h2 className="text-sm font-semibold text-white">Incident Details</h2>
                <button onClick={() => setSelected(null)} className="text-[#64748B] hover:text-white transition-colors bg-[#1F2937]/50 hover:bg-[#1F2937] p-1.5 rounded-full">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                <div>
                  <div className="flex gap-2 mb-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${SEVERITY_COLOR[selected.severity] || ''}`}>
                      {selected.severity}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${STATUS_COLOR[selected.status] || ''}`}>
                      {selected.status.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white leading-snug">{selected.title}</h3>
                  {selected.description && (
                    <p className="text-sm text-[#94A3B8] mt-3 leading-relaxed bg-[#111827] p-3 rounded-md border border-[#1F2937]/50">{selected.description}</p>
                  )}
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3 text-[#94A3B8]">
                    <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
                    <span>{selected.location_label || 'No location set'}</span>
                  </div>
                  <div className="flex items-start gap-3 text-[#94A3B8]">
                    <Clock className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
                    <span>{formatDistanceToNow(new Date(selected.created_at), { addSuffix: true })}</span>
                  </div>
                  {selected.profiles?.full_name && (
                    <div className="flex items-start gap-3 text-[#94A3B8]">
                      <User className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
                      <span>Submitted by <span className="text-[#E2E8F0]">{selected.profiles.full_name}</span></span>
                    </div>
                  )}
                </div>

                {selected.required_skill && (
                  <div className="bg-[#111827] border border-[#1F2937] rounded-md px-4 py-3 text-[13px] text-[#94A3B8] shadow-sm">
                    Required Skill: <span className="text-white font-medium capitalize ml-1 bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/20">{selected.required_skill.replace('_', ' ')}</span>
                  </div>
                )}

                {/* Dispatch panel */}
                {currentUser?.role === 'admin' && (selected.status === 'pending' || selected.status === 'dispatched') && (
                  <div className="pt-4 border-t border-[#1F2937]">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] uppercase tracking-widest font-semibold text-[#64748B]">
                        {selected.status === 'dispatched' ? 'Re-assign Volunteer' : 'Available Volunteers'}
                      </p>
                      <span className="text-[10px] text-blue-400 font-medium bg-blue-500/10 px-2 py-0.5 rounded-full">Nearest first</span>
                    </div>
                    
                    {sortedVolunteers.length === 0 ? (
                      <p className="text-[13px] text-[#64748B] italic bg-[#111827] p-3 rounded border border-[#1F2937]/50">No available volunteers.</p>
                    ) : (
                      <div className="space-y-2">
                        {sortedVolunteers.slice(0, 5).map((vol: any) => (
                          <button
                            key={vol.id}
                            onClick={() => handleDispatch(vol.id)}
                            disabled={dispatching}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-md bg-[#111827] border border-[#1F2937] hover:border-blue-500/40 hover:bg-[#1E293B]/80 transition-all group shadow-sm"
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-900/40 border border-blue-800/60 flex items-center justify-center text-blue-400 text-[11px] font-bold flex-shrink-0 shadow-inner">
                              {vol.profiles?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || 'V'}
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-[#E2E8F0] truncate group-hover:text-white transition-colors">{vol.profiles?.full_name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {vol._dist !== undefined && vol._dist !== Infinity && (
                                  <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 rounded">{vol._dist < 1 ? '<1' : Math.round(vol._dist)} km away</span>
                                )} 
                                {vol.skills && vol.skills.length > 0 && (
                                  <span className="text-[10px] text-[#64748B] truncate capitalize">• {vol.skills.join(', ').replace(/_/g, ' ')}</span>
                                )}
                              </div>
                            </div>
                            <div className="w-6 h-6 rounded-full bg-[#1F2937] flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                              {dispatching 
                                ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                                : <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-white transition-colors" />
                              }
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Left Side Overlay */}
          <div className="absolute left-4 top-20 bottom-6 z-[400] w-[320px] flex flex-col gap-4 pointer-events-none">
            
            {/* Horizontal Filter Bar */}
            <div className="pointer-events-auto shrink-0 bg-[#0D1117]/90 backdrop-blur-md border border-[#1F2937] rounded-lg p-2 flex items-center shadow-lg overflow-x-auto hide-scrollbar">
              <span className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold px-2 shrink-0">Filter</span>
              <div className="w-px h-4 bg-[#1F2937] mx-1 shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                {[
                  { label: 'All', value: 'all' },
                  { label: 'Critical', value: 'critical' },
                  { label: 'Moderate', value: 'moderate' },
                  { label: 'Pending', value: 'pending' },
                  { label: 'Resolved', value: 'verified' },
                ].map(f => (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    className={`px-3 py-1.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                      filter === f.value
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-[#94A3B8] hover:text-white hover:bg-[#1F2937]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Operations Feed */}
            <div className="pointer-events-auto shrink-0 bg-[#0D1117]/90 backdrop-blur-md border border-[#1F2937] rounded-lg h-[180px] flex flex-col shadow-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-[#1F2937] flex items-center justify-between shadow-sm">
                <p className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Live Operations Feed</p>
                <Activity className="w-3 h-3 text-blue-500 animate-pulse" />
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {updates.length === 0 ? (
                  <p className="text-[11px] text-[#4B5563] text-center mt-4 italic">Waiting for reports...</p>
                ) : (
                  updates.map((u) => (
                    <div key={u.id} className="text-[11px] leading-relaxed border-b border-[#1F2937]/50 pb-1.5 last:border-0">
                      <span className="text-blue-400 font-medium break-keep">[{formatDistanceToNow(new Date(u.created_at), { addSuffix: false })}]</span>{" "}
                      <span className="text-white font-medium">{u.profiles?.full_name}:</span>{" "}
                      <span className="text-[#94A3B8]">{u.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Incident Queue */}
            <div className="pointer-events-auto flex-1 bg-[#0D1117]/90 backdrop-blur-md border border-[#1F2937] rounded-lg flex flex-col min-h-0 shadow-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-[#1F2937] shadow-sm shrink-0">
                <p className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Incident Queue</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filtered.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="w-full flex items-center gap-3 px-3 py-3 hover:bg-[#1f293799] transition-colors border-b border-[#1F2937]/50 last:border-0 text-left group"
                  >
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm ${r.severity === 'critical' ? 'bg-red-500 shadow-red-500/40' : r.severity === 'moderate' ? 'bg-amber-500 shadow-amber-500/40' : 'bg-blue-500 shadow-blue-500/40'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#E2E8F0] group-hover:text-white transition-colors truncate">{r.title}</p>
                      <p className="text-[11px] text-[#64748B] truncate mt-0.5">{r.location_label || 'Location not specified'}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#374151] group-hover:text-blue-400 transition-colors flex-shrink-0" />
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-[12px] text-[#4B5563] text-center mt-6 italic">No incidents match the active filters.</p>
                )}
              </div>
            </div>
          </div>

          {/* Toast */}
          {toast && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] bg-[#111827] border border-[#1F2937] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in-up">
              <div className={`w-2 h-2 rounded-full ${toast.includes('failed') ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
              <p className="text-sm font-medium text-white">{toast}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
