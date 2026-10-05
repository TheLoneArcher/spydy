'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function VolunteerApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = async () => {
    const { data, error } = await supabase.from('volunteer_applications').select('*, profiles:user_id(full_name, phone)').order('created_at', { ascending: false });
    if (error) setMessage(error.message);
    setApplications(data ?? []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const review = async (application: any, status: 'approved' | 'rejected') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('volunteer_applications').update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', application.id);
    if (error) { setMessage(error.message); return; }
    if (status === 'approved') {
      const { data: skills } = await supabase.from('volunteer_skills').select('skills:skill_id(slug)').eq('user_id', application.user_id);
      const slugs = (skills ?? []).map((row: any) => row.skills?.slug).filter(Boolean);
      await supabase.from('volunteer_profiles').upsert({ user_id: application.user_id, skills: slugs, location: application.location, max_radius_km: application.radius_km, on_duty: true }, { onConflict: 'user_id' });
    }
    await load();
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  return <main className="min-h-screen p-6 md:p-10"><div className="mx-auto max-w-4xl"><h1 className="font-serif text-3xl text-text">Volunteer applications</h1><p className="mt-2 text-sm text-text-muted">Review people who want to support field response.</p>{message && <p className="mt-4 text-sm text-critical">{message}</p>}<div className="mt-7 space-y-3">{applications.length === 0 && <div className="border border-dashed border-border p-10 text-center text-sm text-text-muted">No applications yet.</div>}{applications.map(application => <article key={application.id} className="border border-border bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-medium text-text">{application.profiles?.full_name ?? 'Unknown applicant'}</h2><p className="mt-1 text-xs text-text-muted">{application.profiles?.phone || 'No phone'} · {application.radius_km} km radius</p></div><span className="border border-border px-2 py-1 text-xs capitalize text-text-muted">{application.status}</span></div><p className="mt-4 text-sm leading-6 text-text-muted">{application.motivation}</p>{application.status === 'pending' && <div className="mt-5 flex gap-2"><button onClick={() => review(application, 'approved')} className="flex items-center gap-1 border border-resolved/30 bg-resolved/10 px-3 py-2 text-xs text-resolved"><Check className="h-3.5 w-3.5" />Approve</button><button onClick={() => review(application, 'rejected')} className="flex items-center gap-1 border border-critical/30 bg-critical/10 px-3 py-2 text-xs text-critical"><X className="h-3.5 w-3.5" />Reject</button></div>}</article>)}</div></div></main>;
}
