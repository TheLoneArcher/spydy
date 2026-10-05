'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const schema = z.object({
  motivation: z.string().trim().min(20).max(2000),
  radius: z.coerce.number().int().min(1).max(100),
  lat: z.coerce.number().min(13.55).max(13.72),
  lon: z.coerce.number().min(79.33).max(79.58),
});
const skills = ['medical', 'logistics', 'heavy_lifting', 'tech_support'];

export default function VolunteerApplyPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [motivation, setMotivation] = useState('');
  const [radius, setRadius] = useState('10');
  const [lat, setLat] = useState('13.6288');
  const [lon, setLon] = useState('79.4192');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase.from('volunteer_applications').select('status').eq('user_id', user.id).maybeSingle();
      setExisting(data?.status ?? null);
      setLoading(false);
    };
    void load();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setMessage('');
    const parsed = schema.safeParse({ motivation, radius, lat, lon });
    if (!parsed.success || selectedSkills.length === 0 || !userId) {
      setError('Choose at least one skill and enter a location inside the service area.');
      return;
    }
    setSaving(true);
    const { data: application, error: applicationError } = await supabase.from('volunteer_applications').upsert({
      user_id: userId, motivation: parsed.data.motivation, radius_km: parsed.data.radius,
      location: { type: 'Point', coordinates: [parsed.data.lon, parsed.data.lat] }, availability: { weekdays: true }, status: 'pending',
    }, { onConflict: 'user_id' }).select('id').single();
    if (applicationError || !application) {
      setError(applicationError?.message ?? 'Could not submit application.');
      setSaving(false);
      return;
    }
    const { data: skillRows } = await supabase.from('skills').select('id, slug').in('slug', selectedSkills);
    await supabase.from('volunteer_skills').delete().eq('user_id', userId);
    const { error: skillsError } = await supabase.from('volunteer_skills').insert((skillRows ?? []).map(skill => ({ user_id: userId, skill_id: skill.id })));
    setSaving(false);
    if (skillsError) setError(skillsError.message);
    else { setExisting('pending'); setMessage('Application submitted for admin review.'); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (existing === 'approved') return <div className="mx-auto max-w-xl p-8"><div className="border border-resolved/30 bg-resolved/10 p-5"><CheckCircle2 className="mb-2 h-5 w-5 text-resolved" /><h1 className="font-semibold">You are an approved volunteer</h1><p className="mt-1 text-sm text-muted">Your missions will appear in My Tasks.</p></div></div>;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6 md:p-10">
      <h1 className="font-serif text-3xl text-text">Become a volunteer</h1>
      <p className="mt-2 text-sm text-text-muted">Tell dispatch what you can help with around Tirupati and Renigunta.</p>
      {message && <div className="mt-5 flex gap-2 border border-resolved/30 bg-resolved/10 p-3 text-sm text-resolved"><CheckCircle2 className="h-4 w-4" />{message}</div>}
      {error && <div className="mt-5 flex gap-2 border border-critical/30 bg-critical/10 p-3 text-sm text-critical"><AlertTriangle className="h-4 w-4" />{error}</div>}
      <form onSubmit={submit} className="mt-7 space-y-5">
        <fieldset><legend className="mb-2 text-sm font-medium">Skills</legend><div className="grid grid-cols-2 gap-2">{skills.map(skill => <label key={skill} className="flex items-center gap-2 border border-border bg-surface p-3 text-sm capitalize"><input type="checkbox" checked={selectedSkills.includes(skill)} onChange={() => setSelectedSkills(current => current.includes(skill) ? current.filter(item => item !== skill) : [...current, skill])} />{skill.replace('_', ' ')}</label>)}</div></fieldset>
        <label className="block text-sm font-medium">Motivation<textarea required minLength={20} maxLength={2000} value={motivation} onChange={event => setMotivation(event.target.value)} className="mt-2 min-h-32 w-full border border-border bg-surface p-3 text-sm text-text outline-none focus:ring-2 focus:ring-ring" placeholder="What kind of civic response can you support?" /></label>
        <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-medium">Radius (km)<input type="number" min="1" max="100" value={radius} onChange={event => setRadius(event.target.value)} className="mt-2 w-full border border-border bg-surface p-3 text-sm text-text" /></label><label className="text-sm font-medium">Latitude<input type="number" step="any" value={lat} onChange={event => setLat(event.target.value)} className="mt-2 w-full border border-border bg-surface p-3 text-sm text-text" /></label><label className="text-sm font-medium">Longitude<input type="number" step="any" value={lon} onChange={event => setLon(event.target.value)} className="mt-2 w-full border border-border bg-surface p-3 text-sm text-text" /></label></div>
        <button disabled={saving} className="border border-accent bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50">{saving ? 'Submitting...' : existing === 'pending' ? 'Update application' : 'Submit application'}</button>
      </form>
    </main>
  );
}
