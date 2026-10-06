'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Loader2, Save, User, Phone, MapPin, Camera,
  ShieldCheck, AlertTriangle, CheckCircle2, Clock, Trash2
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [volunteer, setVolunteer] = useState<any>(null);
  const [application, setApplication] = useState<any>(null);

  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'error' } | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [homeArea, setHomeArea] = useState('');
  const [onDuty, setOnDuty] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const showToast = (message: string, type: 'ok' | 'error' = 'ok') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push('/');
      return;
    }

    const [profRes, volRes, appRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('volunteer_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('volunteer_applications').select('*').eq('user_id', user.id).maybeSingle(),
    ]);

    if (profRes.data) {
      setProfile(profRes.data);
      setFullName(profRes.data.full_name || '');
      setPhone(profRes.data.phone || '');
      setBio(profRes.data.bio || '');
      setHomeArea(profRes.data.home_area || '');
    }

    if (volRes.data) {
      setVolunteer(volRes.data);
      setOnDuty(Boolean(volRes.data.on_duty));
    }

    if (appRes.data) {
      setApplication(appRes.data);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [router]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Avatar image must be under 2 MB.', 'error');
      return;
    }

    if (!file.type.startsWith('image/')) {
      showToast('Please upload a valid image file (JPEG, PNG, or WebP).', 'error');
      return;
    }

    setAvatarUploading(true);
    try {
      const ext = file.type.split('/')[1] || 'jpg';
      const storagePath = `${profile.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(storagePath, file, {
        upsert: true,
        contentType: file.type,
      });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(storagePath);
      // Cache bust the avatar URL
      const finalAvatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: finalAvatarUrl })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      setProfile((prev: any) => ({ ...prev, avatar_url: finalAvatarUrl }));
      showToast('Profile photo updated successfully!');
      router.refresh();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not upload avatar.', 'error');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          bio: bio.trim() || null,
          home_area: homeArea.trim() || null,
        })
        .eq('id', profile.id);

      if (error) throw error;

      showToast('Profile information saved.');
      router.refresh();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error updating profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDuty = async (newVal: boolean) => {
    setOnDuty(newVal);
    try {
      const { error } = await supabase.rpc('set_volunteer_availability', {
        p_on_duty: newVal,
      });
      if (error) throw error;
      showToast(newVal ? 'You are now marked ON DUTY.' : 'You are now marked OFF DUTY.');
      router.refresh();
    } catch (err: unknown) {
      setOnDuty(!newVal);
      showToast(err instanceof Error ? err.message : 'Could not change duty status.', 'error');
    }
  };

  const handleWithdrawVolunteer = async () => {
    if (!confirm('Are you sure you want to withdraw from field volunteering? Your active assignment records will be unlinked.')) {
      return;
    }

    try {
      const { error } = await supabase.rpc('withdraw_volunteer');
      if (error) throw error;

      setVolunteer(null);
      setApplication((prev: any) => (prev ? { ...prev, status: 'withdrawn' } : null));
      showToast('You have withdrawn from the volunteer program.');
      router.refresh();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to withdraw from volunteering.', 'error');
    }
  };

  const handleDeleteAccount = async () => {
    if (
      !confirm(
        'Are you sure you want to request account deletion under the Digital Personal Data Protection Act? Your profile will be deactivated.'
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase.rpc('deactivate_my_account');
      if (error) throw error;

      await supabase.auth.signOut();
      document.cookie = 'rs_role_cache=; max-age=0; path=/;';
      router.push('/');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to process account deletion.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[var(--fg-muted)]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  const initials =
    profile?.full_name
      ?.split(' ')
      .map((n: string) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'RS';

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold text-[var(--fg)]">Account & Profile Settings</h1>
        <p className="text-xs text-[var(--fg-muted)] mt-1">
          Manage your personal information, contact credentials, and municipal volunteer participation.
        </p>
      </div>

      {toast && (
        <div
          className={`p-3 rounded text-xs flex items-center gap-2 border ${
            toast.type === 'ok'
              ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/40'
              : 'bg-red-950/20 text-red-400 border-red-900/40'
          }`}
        >
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Avatar & Identity Box */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <div className="flex items-center gap-5">
          <div className="relative group">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile Avatar"
                className="w-16 h-16 rounded-full object-cover border border-[var(--border)]"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[var(--brand-soft)] border border-[var(--brand)]/30 text-[var(--brand)] flex items-center justify-center text-xl font-bold">
                {initials}
              </div>
            )}
            <label className="absolute bottom-0 right-0 p-1.5 rounded-full bg-[var(--brand)] text-[var(--brand-fg)] shadow cursor-pointer hover:opacity-90 transition-opacity">
              <Camera className="w-3.5 h-3.5" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={avatarUploading}
                onChange={handleAvatarUpload}
              />
            </label>
          </div>

          <div>
            <h2 className="text-base font-semibold text-[var(--fg)]">{profile?.full_name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] font-mono capitalize px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--fg-muted)] border border-[var(--border)]">
                Role: {profile?.role}
              </span>
              {avatarUploading && (
                <span className="text-xs text-[var(--brand)] flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Uploading photo...
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Personal Info Form */}
      <form onSubmit={handleSaveProfile} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[var(--fg)] flex items-center gap-2">
          <User className="w-4 h-4 text-[var(--brand)]" />
          General Information
        </h3>

        <div>
          <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">Full Name</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">
              Phone Number (SMS & Task Dispatch)
            </label>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">Home Area / Neighborhood</label>
            <input
              type="text"
              placeholder="e.g. Alipiri, Tirupati"
              value={homeArea}
              onChange={e => setHomeArea(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">Short Bio</label>
          <textarea
            rows={2}
            placeholder="Tell us about yourself and your civic involvement..."
            value={bio}
            onChange={e => setBio(e.target.value)}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-[var(--brand)] text-[var(--brand-fg)] px-4 py-2 rounded text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Profile
        </button>
      </form>

      {/* Volunteer Status & Participation Section */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[var(--fg)] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--brand)]" />
          Field Volunteer Program
        </h3>

        {volunteer ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded bg-[var(--surface-2)] border border-[var(--border)]">
              <div>
                <p className="text-xs font-semibold text-[var(--fg)]">Active Response Status</p>
                <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                  When on duty, municipal coordinators can assign you local civic repair tasks.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={onDuty}
                  onChange={e => handleToggleDuty(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-[var(--border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600" />
              </label>
            </div>

            {volunteer.skills && volunteer.skills.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[var(--fg-muted)] mb-1.5">Approved Field Skills:</p>
                <div className="flex flex-wrap gap-1.5">
                  {volunteer.skills.map((s: string) => (
                    <span
                      key={s}
                      className="bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand)]/30 px-2 py-0.5 rounded text-[11px] font-medium"
                    >
                      {s.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-between items-center border-t border-[var(--border)]">
              <Link href="/my-tasks" className="text-xs text-[var(--brand)] hover:underline font-medium">
                View My Assigned Tasks &rarr;
              </Link>
              <button
                type="button"
                onClick={handleWithdrawVolunteer}
                className="text-xs text-[var(--danger)] hover:underline"
              >
                Withdraw from Volunteering
              </button>
            </div>
          </div>
        ) : application ? (
          <div className="p-4 rounded bg-[var(--surface-2)] border border-[var(--border)] space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded border capitalize ${
                  application.status === 'pending'
                    ? 'bg-amber-950/20 text-amber-400 border-amber-800/40'
                    : application.status === 'rejected'
                    ? 'bg-red-950/20 text-red-400 border-red-800/40'
                    : 'bg-[var(--surface)] text-[var(--fg-muted)] border-[var(--border)]'
                }`}
              >
                Application {application.status}
              </span>
            </div>
            <p className="text-xs text-[var(--fg-muted)]">
              {application.status === 'pending'
                ? 'Your application to join field operations has been submitted and is currently under coordinator review.'
                : application.status === 'rejected'
                ? 'Your previous application was not accepted at this time. You may update your profile or re-apply.'
                : 'Your application has been withdrawn.'}
            </p>
            {application.status !== 'pending' && (
              <Link
                href="/volunteer/apply"
                className="inline-block mt-2 text-xs text-[var(--brand)] font-medium hover:underline"
              >
                Submit New Volunteer Application &rarr;
              </Link>
            )}
          </div>
        ) : (
          <div className="p-4 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--fg-muted)]">
            <p className="mb-2">
              You are currently registered as a civilian citizen. You can apply to become an on-the-ground volunteer
              to fix potholes, inspect lighting, and confirm municipal leak repairs.
            </p>
            <Link
              href="/volunteer/apply"
              className="inline-flex items-center gap-1.5 bg-[var(--brand)] text-[var(--brand-fg)] px-3 py-1.5 rounded font-medium hover:opacity-90"
            >
              Apply to Become a Volunteer &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* Account Deletion / DPDP Act Section */}
      <div className="border border-[var(--border)] rounded-lg p-5 bg-[var(--surface)]">
        <h3 className="text-sm font-semibold text-[var(--danger)] mb-1 flex items-center gap-1.5">
          <Trash2 className="w-4 h-4" />
          Delete Account &amp; Personal Data
        </h3>
        <p className="text-xs text-[var(--fg-muted)] mb-3 leading-relaxed">
          In accordance with the Digital Personal Data Protection Act 2023, you may request complete account
          deactivation and removal of your personal contact information.
        </p>
        <button
          type="button"
          onClick={handleDeleteAccount}
          className="border border-red-900/40 text-red-400 hover:bg-red-950/20 px-3 py-1.5 rounded text-xs font-medium transition-colors"
        >
          Deactivate My Account
        </button>
      </div>
    </div>
  );
}
