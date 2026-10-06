'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  User, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft,
  Camera, Upload, Shield, MapPin, Clock, Truck, Loader2, Sparkles
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cropToSquare512 } from '@/lib/client/avatar-crop';
import { isInsideTirupatiBounds } from '@/lib/domain/geo';

const step1Schema = z.object({
  displayName: z.string().trim().min(2, 'Display name must be at least 2 characters').max(100),
  phone: z.string().trim().optional().refine(val => {
    if (!val || val.length === 0) return true;
    const clean = val.replace(/[\s\-]/g, '');
    return /^(\+91)?[6-9]\d{9}$/.test(clean) || /^\+[1-9]\d{6,14}$/.test(clean);
  }, 'Enter a valid Indian 10-digit mobile (+91...) or E.164 phone number'),
  avatarUrl: z.string().optional(),
});

const step2Schema = z.object({
  skills: z.array(z.string()).min(1, 'Please select at least one field skill'),
  skillLevels: z.record(z.string(), z.enum(['beginner', 'intermediate', 'expert'])),
  radiusKm: z.number().int().min(1).max(50),
  haveVehicle: z.boolean(),
  availability: z.record(z.string(), z.array(z.string())),
  motivation: z.string().trim().min(20, 'Please write at least 20 characters of motivation').max(1000, 'Maximum 1000 characters'),
});

const step3Schema = z.object({
  lat: z.number().refine(val => val >= 13.55 && val <= 13.72, 'Location must be within Tirupati service area (13.55 - 13.72 N)'),
  lon: z.number().refine(val => val >= 79.33 && val <= 79.58, 'Location must be within Tirupati service area (79.33 - 79.58 E)'),
  dpdpConsent: z.literal(true, {
    message: 'You must provide consent under the DPDP Act 2023 to proceed',
  }),
});

interface SkillOption {
  slug: string;
  label: string;
}

const DEFAULT_SKILLS: SkillOption[] = [
  { slug: 'road_repair', label: 'Road & Pavement Repair' },
  { slug: 'electrical', label: 'Electrical & Lighting' },
  { slug: 'plumbing', label: 'Water Supply & Plumbing' },
  { slug: 'waste_handling', label: 'Waste Clearance & Sanitation' },
  { slug: 'logistics', label: 'Logistics & Transport' },
  { slug: 'first_aid', label: 'First Aid' },
  { slug: 'driving', label: 'Driving & Transport' },
  { slug: 'languages', label: 'Languages & Translation' },
  { slug: 'heavy_lifting', label: 'Heavy Lifting' },
  { slug: 'tech_support', label: 'Tech & Communications' },
];

const DAYS_OF_WEEK = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
];

const TIME_WINDOWS = [
  { id: 'morning', label: 'Morning (06:00 - 12:00)' },
  { id: 'afternoon', label: 'Afternoon (12:00 - 18:00)' },
  { id: 'evening', label: 'Evening (18:00 - 22:00)' },
];

export function VolunteerApplyForm({
  user,
  existingApplication,
  profile,
}: {
  user: any;
  existingApplication: any;
  profile: any;
}) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [skillsList, setSkillsList] = useState<SkillOption[]>(DEFAULT_SKILLS);

  // Form State
  const [displayName, setDisplayName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || existingApplication?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillLevels, setSkillLevels] = useState<Record<string, 'beginner' | 'intermediate' | 'expert'>>({});
  const [radiusKm, setRadiusKm] = useState<number>(existingApplication?.radius_km || 15);
  const [haveVehicle, setHaveVehicle] = useState<boolean>(false);
  const [availability, setAvailability] = useState<Record<string, string[]>>({
    mon: ['morning'],
    tue: ['morning'],
    wed: ['morning'],
    thu: ['morning'],
    fri: ['morning'],
    sat: ['morning', 'afternoon'],
    sun: ['morning', 'afternoon'],
  });
  const [motivation, setMotivation] = useState(existingApplication?.motivation || '');

  const [lat, setLat] = useState<number>(13.6288);
  const [lon, setLon] = useState<number>(79.4192);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [dpdpConsent, setDpdpConsent] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Fetch available skills from DB
  useEffect(() => {
    async function loadSkills() {
      const { data } = await supabase.from('skills').select('slug, label').order('label');
      if (data && data.length > 0) {
        setSkillsList(data);
      }
    }
    loadSkills();
  }, []);

  // Handle avatar photo selection & crop
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, avatar: 'Please choose an image file (JPEG, PNG, or WebP)' }));
      return;
    }

    setAvatarUploading(true);
    setErrors(prev => ({ ...prev, avatar: '' }));

    try {
      const squareBlob = await cropToSquare512(file);
      const storagePath = `${user.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(storagePath, squareBlob, {
          upsert: true,
          contentType: 'image/jpeg',
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(storagePath);
      const bustUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(bustUrl);

      // Update profile avatar immediately
      await supabase.from('profiles').update({ avatar_url: bustUrl }).eq('id', user.id);
    } catch (err: any) {
      setErrors(prev => ({ ...prev, avatar: err.message || 'Avatar upload failed' }));
    } finally {
      setAvatarUploading(false);
    }
  };

  const toggleSkill = (slug: string) => {
    if (selectedSkills.includes(slug)) {
      setSelectedSkills(prev => prev.filter(s => s !== slug));
      setSkillLevels(prev => {
        const next = { ...prev };
        delete next[slug];
        return next;
      });
    } else {
      setSelectedSkills(prev => [...prev, slug]);
      setSkillLevels(prev => ({ ...prev, [slug]: 'intermediate' }));
    }
  };

  const setSkillLevel = (slug: string, level: 'beginner' | 'intermediate' | 'expert') => {
    setSkillLevels(prev => ({ ...prev, [slug]: level }));
  };

  const toggleAvailabilitySlot = (day: string, slotId: string) => {
    setAvailability(prev => {
      const currentSlots = prev[day] || [];
      const updated = currentSlots.includes(slotId)
        ? currentSlots.filter(s => s !== slotId)
        : [...currentSlots, slotId];
      return { ...prev, [day]: updated };
    });
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setErrors(prev => ({ ...prev, location: 'Geolocation is not supported by your browser' }));
      return;
    }
    setLocating(true);
    setErrors(prev => ({ ...prev, location: '' }));

    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        setLat(Number(latitude.toFixed(6)));
        setLon(Number(longitude.toFixed(6)));
        setGpsAccuracy(Math.round(accuracy));

        if (!isInsideTirupatiBounds(latitude, longitude)) {
          setErrors(prev => ({
            ...prev,
            location: 'Your current location is outside the Tirupati municipal service area (13.55 - 13.72 N, 79.33 - 79.58 E).',
          }));
        }
      },
      err => {
        setLocating(false);
        setErrors(prev => ({
          ...prev,
          location: `Geolocation error: ${err.message}. You can manually adjust coordinates.`,
        }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Step 1 validation
  const validateStep1 = () => {
    setErrors({});
    const res = step1Schema.safeParse({ displayName, phone, avatarUrl });
    if (!res.success) {
      const errMap: Record<string, string> = {};
      for (const issue of res.error.issues) {
        errMap[issue.path[0] as string] = issue.message;
      }
      setErrors(errMap);
      return false;
    }
    return true;
  };

  // Step 2 validation
  const validateStep2 = () => {
    setErrors({});
    const res = step2Schema.safeParse({
      skills: selectedSkills,
      skillLevels,
      radiusKm,
      haveVehicle,
      availability,
      motivation,
    });
    if (!res.success) {
      const errMap: Record<string, string> = {};
      for (const issue of res.error.issues) {
        errMap[issue.path[0] as string] = issue.message;
      }
      setErrors(errMap);
      return false;
    }
    return true;
  };

  // Step 3 validation & submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const res = step3Schema.safeParse({ lat, lon, dpdpConsent });
    if (!res.success) {
      const errMap: Record<string, string> = {};
      for (const issue of res.error.issues) {
        errMap[issue.path[0] as string] = issue.message;
      }
      setErrors(errMap);
      return;
    }

    setSubmitting(true);
    try {
      // 1. Update profile display name and phone
      await supabase
        .from('profiles')
        .update({
          full_name: displayName.trim(),
          phone: phone.trim() || null,
        })
        .eq('id', user.id);

      // 2. Submit volunteer application via Postgres RPC
      const availabilityPayload = {
        schedule: availability,
        have_vehicle: haveVehicle,
        skill_levels: skillLevels,
      };

      const { data, error: rpcErr } = await supabase.rpc('apply_volunteer', {
        p_skills: selectedSkills,
        p_lat: lat,
        p_lon: lon,
        p_radius_km: radiusKm,
        p_availability: availabilityPayload,
        p_motivation: motivation.trim(),
        p_phone: phone.trim() || undefined,
      });

      if (rpcErr) throw rpcErr;

      setSubmittedSuccess(true);
    } catch (err: any) {
      setServerError(err.message || 'Failed to submit application. Please check your inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedSuccess) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 max-w-xl mx-auto text-center space-y-4 shadow-sm">
        <div className="w-14 h-14 bg-emerald-950/20 text-emerald-400 border border-emerald-800/40 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-semibold text-[var(--fg)]">Volunteer Application Submitted!</h2>
        <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
          Your field volunteer application has been placed in the municipal coordinator queue. Our dispatchers
          will verify your declared skills and service area. You will receive an in-app notification upon review.
        </p>
        <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/profile"
            className="bg-[var(--brand)] text-[var(--brand-fg)] px-4 py-2 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
          >
            View Application Status on Profile
          </Link>
          <Link
            href="/feed"
            className="border border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg)] px-4 py-2 rounded-lg text-xs font-medium hover:bg-[var(--surface)] transition-colors"
          >
            Return to Civic Feed
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Stepper Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
        {[
          { step: 1, label: '1. You' },
          { step: 2, label: '2. Skills & Availability' },
          { step: 3, label: '3. Location & Consent' },
        ].map(item => (
          <div
            key={item.step}
            className={`flex items-center gap-2 text-xs font-medium transition-colors ${
              currentStep === item.step
                ? 'text-[var(--brand)] font-semibold'
                : currentStep > item.step
                ? 'text-emerald-500'
                : 'text-[var(--fg-muted)]'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono border ${
                currentStep === item.step
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                  : currentStep > item.step
                  ? 'border-emerald-600 bg-emerald-950/20 text-emerald-400'
                  : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg-muted)]'
              }`}
            >
              {currentStep > item.step ? '✓' : item.step}
            </span>
            <span className="hidden sm:inline">{item.label}</span>
          </div>
        ))}
      </div>

      {serverError && (
        <div className="p-3.5 rounded-lg bg-red-950/20 border border-red-900/40 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* STEP 1: YOU */}
      {currentStep === 1 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-[var(--fg)]">Your Profile & Contact Credentials</h2>
            <p className="text-xs text-[var(--fg-muted)] mt-1">
              Field coordinators require a clear identity and reliable telephone reachability for urgent dispatch.
            </p>
          </div>

          {/* Avatar square crop & upload */}
          <div className="flex items-center gap-5 p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
            <div className="relative group">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="w-16 h-16 rounded-full object-cover border border-[var(--border)]"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[var(--brand-soft)] border border-[var(--brand)]/30 text-[var(--brand)] flex items-center justify-center text-xl font-bold">
                  {displayName ? displayName.slice(0, 2).toUpperCase() : 'VO'}
                </div>
              )}
              <label
                className="absolute bottom-0 right-0 p-1.5 rounded-full bg-[var(--brand)] text-[var(--brand-fg)] shadow cursor-pointer hover:opacity-90 transition-opacity"
                title="Upload or capture square profile photo"
              >
                <Camera className="w-3.5 h-3.5" />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={avatarUploading}
                  onChange={handleAvatarChange}
                />
              </label>
            </div>

            <div>
              <p className="text-xs font-medium text-[var(--fg)]">Square Profile Photo</p>
              <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                Automatically centered and cropped to 512×512 px for coordinator identification badges.
              </p>
              {avatarUploading && (
                <span className="text-xs text-[var(--brand)] flex items-center gap-1 mt-1 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin" /> Processing &amp; uploading photo...
                </span>
              )}
              {errors.avatar && <p className="text-xs text-red-400 mt-1">{errors.avatar}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--fg)] mb-1">
              Full Legal or Operational Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. S. Venkat Reddy"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
            />
            {errors.displayName && <p className="text-xs text-red-400 mt-1">{errors.displayName}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--fg)] mb-1">
              Contact Phone (SMS &amp; Critical Voice Dispatch)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
            />
            <p className="text-[11px] text-[var(--fg-muted)] mt-1">
              Indian 10-digit or international E.164. Only shared with coordinators and dispatch staff.
            </p>
            {errors.phone && <p className="text-xs text-red-400 mt-1">{errors.phone}</p>}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                if (validateStep1()) setCurrentStep(2);
              }}
              className="bg-[var(--brand)] text-[var(--brand-fg)] px-5 py-2 rounded-lg text-xs font-medium hover:opacity-90 flex items-center gap-1.5 transition-opacity"
            >
              Next: Skills &amp; Availability
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: SKILLS & AVAILABILITY */}
      {currentStep === 2 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-[var(--fg)]">Field Skills, Vehicle &amp; Availability</h2>
            <p className="text-xs text-[var(--fg-muted)] mt-1">
              Select what repairs and hazards you can address, along with your weekly time windows.
            </p>
          </div>

          {/* Skill chips & experience level */}
          <div>
            <label className="block text-xs font-semibold text-[var(--fg)] mb-2">
              Select Your Practical Skills <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {skillsList.map(skill => {
                const isSelected = selectedSkills.includes(skill.slug);
                return (
                  <div
                    key={skill.slug}
                    className={`border rounded-lg p-3 transition-colors ${
                      isSelected
                        ? 'border-[var(--brand)] bg-[var(--brand-soft)]/20'
                        : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--brand)]/50'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSkill(skill.slug)}
                        className="rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)]"
                      />
                      <span className="text-xs font-medium text-[var(--fg)]">{skill.label}</span>
                    </label>

                    {isSelected && (
                      <div className="mt-2.5 pl-6 flex items-center gap-2">
                        <span className="text-[11px] text-[var(--fg-muted)] font-medium">Level:</span>
                        {(['beginner', 'intermediate', 'expert'] as const).map(lvl => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setSkillLevel(skill.slug, lvl)}
                            className={`text-[10px] capitalize px-2 py-0.5 rounded border transition-colors ${
                              skillLevels[skill.slug] === lvl
                                ? 'bg-[var(--brand)] text-[var(--brand-fg)] border-[var(--brand)] font-medium'
                                : 'bg-[var(--surface)] text-[var(--fg-muted)] border-[var(--border)] hover:text-[var(--fg)]'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {errors.skills && <p className="text-xs text-red-400 mt-1.5">{errors.skills}</p>}
          </div>

          {/* 7x3 Availability Grid */}
          <div>
            <label className="block text-xs font-semibold text-[var(--fg)] mb-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--brand)]" />
              Weekly Operating Availability (7 × 3 Windows)
            </label>
            <p className="text-[11px] text-[var(--fg-muted)] mb-2.5">
              Click the time slots during which you can accept dispatches.
            </p>

            <div className="border border-[var(--border)] rounded-lg overflow-x-auto bg-[var(--surface-2)]">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                    <th className="p-2 text-left text-[11px] font-medium text-[var(--fg-muted)]">Window</th>
                    {DAYS_OF_WEEK.map(d => (
                      <th key={d.id} className="p-2 text-[11px] font-medium text-[var(--fg)]">
                        {d.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIME_WINDOWS.map(tw => (
                    <tr key={tw.id} className="border-b border-[var(--border)] last:border-none">
                      <td className="p-2 text-left text-[11px] font-medium text-[var(--fg-muted)] whitespace-nowrap">
                        {tw.label}
                      </td>
                      {DAYS_OF_WEEK.map(d => {
                        const active = availability[d.id]?.includes(tw.id);
                        return (
                          <td key={d.id} className="p-1.5">
                            <button
                              type="button"
                              onClick={() => toggleAvailabilitySlot(d.id, tw.id)}
                              className={`w-full py-1 rounded text-[10px] font-mono transition-colors ${
                                active
                                  ? 'bg-emerald-600 text-white font-semibold'
                                  : 'bg-[var(--surface)] text-[var(--fg-muted)] hover:bg-[var(--border)]'
                              }`}
                            >
                              {active ? 'ON' : '—'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Operational radius slider */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-[var(--fg)]">Maximum Travel Radius</label>
              <span className="text-xs font-mono font-bold text-[var(--brand)]">{radiusKm} km</span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              value={radiusKm}
              onChange={e => setRadiusKm(Number(e.target.value))}
              className="w-full accent-[var(--brand)] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[var(--fg-muted)] mt-1">
              <span>1 km (Neighborhood)</span>
              <span>25 km (Greater City)</span>
              <span>50 km (Regional)</span>
            </div>
          </div>

          {/* Vehicle checkbox */}
          <div className="p-3.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={haveVehicle}
                onChange={e => setHaveVehicle(e.target.checked)}
                className="rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)]"
              />
              <div>
                <span className="text-xs font-medium text-[var(--fg)] flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-[var(--brand)]" />
                  Have Own Transportation (Two-wheeler / Four-wheeler)
                </span>
                <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                  Check if you have your own vehicle to transport tools or materials across Tirupati.
                </p>
              </div>
            </label>
          </div>

          {/* Motivation text */}
          <div>
            <label className="block text-xs font-semibold text-[var(--fg)] mb-1">
              Motivation &amp; Relevant Experience <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={motivation}
              onChange={e => setMotivation(e.target.value)}
              placeholder="Describe your background in civic work, trade skills, or why you want to serve Tirupati..."
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
            />
            <div className="flex justify-between text-[11px] text-[var(--fg-muted)] mt-1">
              <span>Min. 20 characters</span>
              <span className={motivation.length < 20 ? 'text-amber-500' : 'text-emerald-500'}>
                {motivation.length} / 1000
              </span>
            </div>
            {errors.motivation && <p className="text-xs text-red-400 mt-1">{errors.motivation}</p>}
          </div>

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="border border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg)] px-4 py-2 rounded-lg text-xs font-medium hover:bg-[var(--surface)] flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (validateStep2()) setCurrentStep(3);
              }}
              className="bg-[var(--brand)] text-[var(--brand-fg)] px-5 py-2 rounded-lg text-xs font-medium hover:opacity-90 flex items-center gap-1.5 transition-opacity"
            >
              Next: Location &amp; DPDP Consent
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: LOCATION & CONSENT */}
      {currentStep === 3 && (
        <form onSubmit={handleSubmit} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-[var(--fg)]">Operational Base &amp; DPDP Consent</h2>
            <p className="text-xs text-[var(--fg-muted)] mt-1">
              Your base location helps coordinators dispatch nearby incidents. Public users see only coarse coordinates.
            </p>
          </div>

          {/* Location input & Geo Button */}
          <div className="space-y-3 p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--fg)] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[var(--brand)]" />
                  Primary Operating Base (Tirupati Region)
                </p>
                <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                  Coarse location rounded to 2 decimals (~1.1 km) for public privacy; exact for staff dispatch.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGetCurrentLocation}
                disabled={locating}
                className="bg-[var(--brand)] text-[var(--brand-fg)] px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 flex items-center gap-1.5 shrink-0 transition-opacity disabled:opacity-50"
              >
                {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                {locating ? 'Acquiring GPS...' : 'Use My Current Location'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-medium text-[var(--fg-muted)] mb-1">Base Latitude</label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={lat}
                  onChange={e => setLat(Number(e.target.value))}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 text-xs font-mono text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--fg-muted)] mb-1">Base Longitude</label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={lon}
                  onChange={e => setLon(Number(e.target.value))}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 text-xs font-mono text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
                />
              </div>
            </div>

            {gpsAccuracy !== null && (
              <p className="text-[11px] text-emerald-500 font-mono">
                GPS Accuracy: ±{gpsAccuracy} meters
              </p>
            )}

            {errors.location && <p className="text-xs text-red-400 mt-1">{errors.location}</p>}
            {errors.lat && <p className="text-xs text-red-400 mt-1">{errors.lat}</p>}
            {errors.lon && <p className="text-xs text-red-400 mt-1">{errors.lon}</p>}
          </div>

          {/* DPDP Act 2023 Consent Box */}
          <div className="p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--brand)]" />
              <h3 className="text-xs font-semibold text-[var(--fg)]">
                Digital Personal Data Protection Act 2023 (DPDP) Consent
              </h3>
            </div>

            <p className="text-[11px] text-[var(--fg-muted)] leading-relaxed">
              In compliance with Section 6 of the Digital Personal Data Protection Act 2023, ResponSys requests
              your explicit consent to collect, store, and process your geolocation coordinates and phone number for
              the specified purpose of coordinating municipal hazard repair and dispatching nearby tasks.
            </p>

            <ul className="text-[11px] text-[var(--fg-muted)] space-y-1 list-disc pl-4">
              <li>Your exact coordinates are strictly restricted to authorized dispatchers and municipal admins.</li>
              <li>Public incident attestation feeds display only coarse coordinates rounded to 2 decimals (~1.1 km).</li>
              <li>Consent is revocable at any time in Profile Settings or by withdrawing from volunteering.</li>
              <li>Withdrawing will permanently purge your location record from active dispatch routing.</li>
            </ul>

            <label className="flex items-start gap-2.5 pt-2 cursor-pointer border-t border-[var(--border)]">
              <input
                type="checkbox"
                required
                checked={dpdpConsent}
                onChange={e => setDpdpConsent(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)]"
              />
              <span className="text-xs text-[var(--fg)] font-medium leading-snug">
                I hereby grant consent for the storage and use of my operational location and contact details for civic
                task dispatch under the DPDP Act 2023. I have reviewed the{' '}
                <Link href="/privacy" target="_blank" className="text-[var(--brand)] underline hover:opacity-80">
                  Data Protection &amp; Privacy Policy
                </Link>
                .
              </span>
            </label>
            {errors.dpdpConsent && <p className="text-xs text-red-400 mt-1">{errors.dpdpConsent}</p>}
          </div>

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="border border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg)] px-4 py-2 rounded-lg text-xs font-medium hover:bg-[var(--surface)] flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-[var(--brand)] text-[var(--brand-fg)] px-6 py-2.5 rounded-lg text-xs font-medium hover:opacity-90 flex items-center gap-2 transition-opacity disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Submitting Application...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Submit Volunteer Application
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
