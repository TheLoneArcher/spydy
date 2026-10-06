'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  UserCheck, Check, X, Loader2, AlertCircle, Phone, MapPin,
  Clock, Shield, FileText, Compass, Award
} from 'lucide-react';
import { parsePoint, haversineDistanceKm } from '@/lib/domain/geo';

interface SkillEntry {
  slug: string;
  label?: string;
  level?: string;
}

interface VolunteerApplication {
  id: string;
  user_id: string;
  motivation: string;
  availability: Record<string, any>;
  radius_km: number;
  location?: any;
  phone: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  created_at: string;
  profiles?: {
    full_name: string;
    avatar_url: string | null;
    phone: string | null;
  };
  skills?: SkillEntry[];
  distanceToIncidentKm?: number | null;
}

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<VolunteerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Review modal state
  const [reviewApp, setReviewApp] = useState<VolunteerApplication | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');

  const loadApplications = async () => {
    setLoading(true);
    try {
      const [appRes, repRes] = await Promise.all([
        supabase
          .from('volunteer_applications')
          .select(`
            id, user_id, motivation, availability, radius_km, location, phone, status, created_at,
            profiles:user_id(full_name, avatar_url, phone)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('reports')
          .select('lat, lon')
          .in('status', ['pending', 'triaged', 'assigned', 'in_progress'])
          .limit(100),
      ]);

      if (appRes.error) throw appRes.error;

      const openReports = (repRes.data || []).filter(
        (r: any) => typeof r.lat === 'number' && typeof r.lon === 'number'
      );

      // Fetch volunteer_skills with level and label
      const userIds = (appRes.data || []).map((a: any) => a.user_id);
      const skillsMap: Record<string, SkillEntry[]> = {};

      if (userIds.length > 0) {
        const { data: skillRows } = await supabase
          .from('volunteer_skills')
          .select('user_id, level, skills:skill_id(slug, label)')
          .in('user_id', userIds);

        if (skillRows) {
          for (const row of skillRows as any[]) {
            if (!skillsMap[row.user_id]) skillsMap[row.user_id] = [];
            if (row.skills?.slug) {
              skillsMap[row.user_id].push({
                slug: row.skills.slug,
                label: row.skills.label || row.skills.slug,
                level: row.level || 'intermediate',
              });
            }
          }
        }
      }

      const formatted: VolunteerApplication[] = (appRes.data || []).map((app: any) => {
        let nearestDistance: number | null = null;
        const coords = parsePoint(app.location);

        if (coords && openReports.length > 0) {
          const [appLat, appLon] = coords;
          let minD = Infinity;
          for (const rep of openReports) {
            const d = haversineDistanceKm(appLat, appLon, rep.lat, rep.lon);
            if (d < minD) minD = d;
          }
          if (minD !== Infinity) {
            nearestDistance = Math.round(minD * 10) / 10;
          }
        }

        return {
          ...app,
          profiles: app.profiles,
          skills: skillsMap[app.user_id] || [],
          distanceToIncidentKm: nearestDistance,
        };
      });

      setApplications(formatted);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Could not load applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewApp) return;

    setActionLoading(reviewApp.id);
    try {
      const { error } = await supabase.rpc('review_volunteer_application', {
        p_application: reviewApp.id,
        p_decision: reviewDecision,
        p_note: reviewNote.trim() || undefined,
      });

      if (error) throw error;

      setReviewApp(null);
      setReviewNote('');
      await loadApplications();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error submitting review');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold text-[var(--fg)] flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-[var(--brand)]" />
          Volunteer Applications Review
        </h1>
        <p className="text-xs text-[var(--fg-muted)] mt-1">
          Review community volunteer applications, evaluate verified skills, check proximity to open civic hazards, and grant task response privileges.
        </p>
      </div>

      {message && (
        <div className="p-3.5 rounded-lg bg-red-950/20 border border-red-900/40 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-[var(--fg-muted)]">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--brand)]" />
          Loading applications...
        </div>
      ) : applications.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-lg p-12 text-center text-xs text-[var(--fg-muted)]">
          No volunteer applications submitted yet.
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map(app => (
            <div
              key={app.id}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {app.profiles?.avatar_url ? (
                    <img
                      src={app.profiles.avatar_url}
                      alt={app.profiles.full_name}
                      className="w-10 h-10 rounded-full object-cover border border-[var(--border)] shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--brand-soft)] border border-[var(--brand)]/30 text-[var(--brand)] flex items-center justify-center text-xs font-bold shrink-0">
                      {app.profiles?.full_name ? app.profiles.full_name.slice(0, 2).toUpperCase() : 'VO'}
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--fg)]">
                      {app.profiles?.full_name || 'Citizen Applicant'}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--fg-muted)] mt-0.5">
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3.5 h-3.5" />
                        {app.phone || app.profiles?.phone || 'No phone'}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[var(--brand)]" />
                        {app.radius_km} km max radius
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Applied {new Date(app.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {app.distanceToIncidentKm !== null && app.distanceToIncidentKm !== undefined ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--surface-2)] text-[var(--brand)] border border-[var(--brand)]/30">
                      <Compass className="w-3.5 h-3.5" />
                      {app.distanceToIncidentKm} km to nearest open incident
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--fg-muted)]">No active incidents nearby</span>
                  )}

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${
                      app.status === 'approved'
                        ? 'bg-emerald-950/20 text-emerald-400 border-emerald-800/40'
                        : app.status === 'rejected'
                        ? 'bg-red-950/20 text-red-400 border-red-800/40'
                        : 'bg-amber-950/20 text-amber-400 border-amber-800/40'
                    }`}
                  >
                    {app.status}
                  </span>
                </div>
              </div>

              {/* Motivation */}
              <div className="text-xs text-[var(--fg-muted)] bg-[var(--surface-2)] p-3 rounded-lg border border-[var(--border)]">
                <p className="font-medium text-[var(--fg)] mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[var(--brand)]" />
                  Applicant Statement &amp; Motivation:
                </p>
                {app.motivation}
              </div>

              {/* Skills with levels */}
              {app.skills && app.skills.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[var(--fg-muted)] mb-1.5 uppercase tracking-wider flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-[var(--brand)]" />
                    Declared Field Skills &amp; Proficiency:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {app.skills.map(skill => (
                      <span
                        key={skill.slug}
                        className="bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand)]/30 px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5"
                      >
                        <span>{skill.label || skill.slug.replace('_', ' ')}</span>
                        {skill.level && (
                          <span className="text-[10px] font-mono uppercase bg-[var(--surface)] text-[var(--fg-muted)] px-1.5 py-0.2 rounded border border-[var(--border)]">
                            {skill.level}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {app.status === 'pending' && (
                <div className="flex gap-2.5 pt-2 border-t border-[var(--border)]">
                  <button
                    onClick={() => {
                      setReviewApp(app);
                      setReviewDecision('approved');
                      setReviewNote('');
                    }}
                    disabled={actionLoading === app.id}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve Application
                  </button>
                  <button
                    onClick={() => {
                      setReviewApp(app);
                      setReviewDecision('rejected');
                      setReviewNote('');
                    }}
                    disabled={actionLoading === app.id}
                    className="flex items-center gap-1.5 border border-red-800/40 text-red-400 hover:bg-red-950/20 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      {reviewApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-xl space-y-4">
            <h2 className="text-base font-semibold text-[var(--fg)] flex items-center gap-2">
              <Shield className="w-5 h-5 text-[var(--brand)]" />
              {reviewDecision === 'approved' ? 'Approve Volunteer' : 'Reject Application'}
            </h2>
            <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
              {reviewDecision === 'approved'
                ? `Approving ${reviewApp.profiles?.full_name || 'this applicant'} will automatically activate their on-duty volunteer profile, send an in-app notification, and grant task response privileges.`
                : `Specify an optional reason for not accepting ${reviewApp.profiles?.full_name || 'this applicant'}'s application.`}
            </p>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--fg)] mb-1">
                  Staff Review Note / Feedback (Optional)
                </label>
                <textarea
                  rows={3}
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder={
                    reviewDecision === 'approved'
                      ? 'Welcome to the municipal rapid response team! Review open missions in My Tasks.'
                      : 'We currently have full coverage in your area, please apply next quarter...'
                  }
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2.5 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewApp(null)}
                  className="px-3 py-1.5 rounded-lg text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === reviewApp.id}
                  className={`px-4 py-2 rounded-lg text-xs font-medium text-white flex items-center gap-1.5 transition-colors ${
                    reviewDecision === 'approved'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  {actionLoading === reviewApp.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm {reviewDecision === 'approved' ? 'Approval' : 'Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
