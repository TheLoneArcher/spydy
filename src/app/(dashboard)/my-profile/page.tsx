'use client';
import { useEffect, useState } from 'react';
import { parsePoint } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { Loader2, Save, MapPin, CheckCircle2, AlertTriangle } from 'lucide-react';

const SKILLS = [
  { id: 'medical',       label: 'Medical' },
  { id: 'logistics',     label: 'Logistics' },
  { id: 'heavy_lifting', label: 'Heavy Lifting' },
  { id: 'tech_support',  label: 'Tech Support' },
];

export default function ProfilePage() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [profile, setProfile]   = useState<any>(null);
  const [volunteer, setVolunteer] = useState<any>(null);
  const [toast, setToast]       = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const [form, setForm] = useState({
    fullName:    '',
    phone:       '',
    isAvailable: true,
    skills:      [] as string[],
    lat:         '',
    lon:         '',
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);
      setForm(f => ({ ...f, fullName: prof?.full_name ?? '', phone: prof?.phone ?? '' }));

      if (prof?.role === 'volunteer') {
        const { data: vol } = await supabase.from('volunteers').select('*').eq('profile_id', user.id).single();
        setVolunteer(vol);
        if (vol) {
          setForm(f => ({
            ...f,
            isAvailable: vol.is_available ?? true,
            skills: vol.skills ?? [],
            lat: '', lon: '',
          }));
          if (vol.last_location) {
            const coords = parsePoint(vol.last_location);
            if (coords) setForm(f => ({ ...f, lat: coords[0].toFixed(6), lon: coords[1].toFixed(6) }));
          }
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const getGps = () => {
    navigator.geolocation?.getCurrentPosition(pos => {
      setForm(f => ({ ...f, lat: pos.coords.latitude.toFixed(6), lon: pos.coords.longitude.toFixed(6) }));
      showToast('GPS location acquired.', 'success');
    }, () => showToast('Could not get GPS.', 'error'));
  };

  const toggleSkill = (s: string) => {
    setForm(f => ({
      ...f,
      skills: f.skills.includes(s) ? f.skills.filter(x => x !== s) : [...f.skills, s],
    }));
  };

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast(msg); setToastType(type);
    setTimeout(() => setToast(''), 3000);
  };

  const handleToggleAvailability = async (newValue: boolean) => {
    setForm(f => ({ ...f, isAvailable: newValue }));
    if (!profile || profile.role !== 'volunteer') return;

    // Use upsert-like logic to ensure volunteer row exists
    const payload: any = { 
      profile_id: profile.id,
      is_available: newValue,
      skills: form.skills
    };

    const { data: vol, error } = await supabase
      .from('volunteers')
      .upsert(payload, { onConflict: 'profile_id' })
      .select()
      .single();

    if (error) {
      setForm(f => ({ ...f, isAvailable: !newValue }));
      showToast('Failed to update availability.', 'error');
    } else {
      setVolunteer(vol);
      showToast(newValue ? 'You are now available.' : 'You are now unavailable.', 'success');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await supabase.from('profiles').update({ full_name: form.fullName, phone: form.phone }).eq('id', profile?.id);
      
      if (profile?.role === 'volunteer') {
        const payload: any = { 
          profile_id: profile.id,
          is_available: form.isAvailable, 
          skills: form.skills 
        };
        if (form.lat && form.lon) payload.last_location = `POINT(${form.lon} ${form.lat})`;
        
        const { data: vol, error } = await supabase
          .from('volunteers')
          .upsert(payload, { onConflict: 'profile_id' })
          .select()
          .single();
          
        if (vol) setVolunteer(vol);
        if (error) throw error;
      }
      showToast('Profile saved.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error saving profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex h-full items-center justify-center bg-[#0A0E17]"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  const initials = profile?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase() ?? '??';

  return (
    <div className="p-6 md:p-8 min-h-screen bg-[#0A0E17] text-[#F1F5F9]">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Profile</h1>
          <p className="text-[13px] text-[#94A3B8] mt-0.5">Manage your account details and skills</p>
        </div>

        {toast && (
          <div className={`mb-5 flex items-center gap-2 px-4 py-3 rounded-md text-[13px] font-medium border animate-fade-in
            ${toastType === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {toastType === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {toast}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          {/* Identity */}
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5">
            <div className="flex items-center gap-4 mb-5 pb-5 border-b border-[#1F2937]">
              <div className="w-14 h-14 rounded-full bg-blue-900/40 border border-blue-800/60 flex items-center justify-center text-blue-400 text-xl font-bold">
                {initials}
              </div>
              <div>
                <p className="font-semibold text-white">{profile?.full_name}</p>
                <p className="text-[12px] text-[#64748B] capitalize mt-0.5">{profile?.role}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#94A3B8] mb-1.5">Full Name</label>
                <input
                  value={form.fullName}
                  onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                  className="w-full bg-[#0A0E17] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#94A3B8] mb-1.5">Phone</label>
                <input
                  type="tel"
                  placeholder="+91 ..."
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-[#0A0E17] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Volunteer settings */}
          {profile?.role === 'volunteer' && (
            <>
              <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5">
                <h2 className="text-[13px] font-semibold text-white mb-4">Skills</h2>
                <p className="text-[12px] text-[#64748B] mb-3">Select all skills that apply. You&apos;ll be matched to incidents that need them.</p>
                <div className="grid grid-cols-2 gap-2">
                  {SKILLS.map(({ id, label }) => {
                    const active = form.skills.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleSkill(id)}
                        className={`px-3 py-2 rounded-md text-[13px] font-medium border text-left transition-colors
                          ${active
                            ? 'border-blue-500/40 bg-blue-600/10 text-blue-300'
                            : 'border-[#1F2937] bg-[#0A0E17] text-[#64748B] hover:border-[#374151] hover:text-[#94A3B8]'
                          }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[13px] font-semibold text-white">Availability</h2>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <span className="text-[13px] text-[#94A3B8]">{form.isAvailable ? 'Available' : 'Unavailable'}</span>
                    <div className="relative">
                      <input type="checkbox" checked={form.isAvailable} onChange={e => handleToggleAvailability(e.target.checked)} className="sr-only peer" />
                      <div className="w-9 h-5 bg-[#1F2937] rounded-full peer peer-checked:bg-blue-600 transition-colors" />
                      <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                    </div>
                  </label>
                </div>
                <p className="text-[12px] text-[#64748B]">When available, dispatchers can assign you to active incidents.</p>
              </div>

              <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[13px] font-semibold text-white">Location</h2>
                  <button type="button" onClick={getGps} className="flex items-center gap-1.5 text-[12px] text-blue-400 hover:text-blue-300 border border-blue-500/20 bg-blue-600/10 px-3 py-1.5 rounded-md transition-colors">
                    <MapPin className="w-3.5 h-3.5" /> Get GPS
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input readOnly value={form.lat || ''} placeholder="Lat" className="bg-[#0A0E17] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-[#64748B] font-mono focus:outline-none" />
                  <input readOnly value={form.lon || ''} placeholder="Lon" className="bg-[#0A0E17] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-[#64748B] font-mono focus:outline-none" />
                </div>
                <p className="text-[11px] text-[#4B5563] mt-2">Location is used to calculate proximity to incidents.</p>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-md text-[13px] transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
