'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  UserCheck, Check, X, Loader2, AlertCircle, Phone, MapPin,
  Clock, Shield, FileText
} from 'lucide-react';

interface VolunteerApplication {
  id: string;
  user_id: string;
  motivation: string;
  availability: Record<string, string[]>;
  radius_km: number;
  phone: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  created_at: string;
  profiles?: {
    full_name: string;
    avatar_url: string | null;
    phone: string | null;
  };
  skills?: string[];
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
      const { data, error } = await supabase
        .from('volunteer_applications')
        .select(`
          id, user_id, motivation, availability, radius_km, phone, status, created_at,
          profiles:user_id(full_name, avatar_url, phone)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Also fetch volunteer_skills for each user
      const userIds = (data || []).map((a: any) => a.user_id);
      let skillsMap: Record<string, string[]> = {};

      if (userIds.length > 0) {
        const { data: skillRows } = await supabase
          .from('volunteer_skills')
          .select('user_id, skills:skill_id(slug)')
          .in('user_id', userIds);

        if (skillRows) {
          for (const row of skillRows as any[]) {
            if (!skillsMap[row.user_id]) skillsMap[row.user_id] = [];
            if (row.skills?.slug) skillsMap[row.user_id].push(row.skills.slug);
          }
        }
      }

      const formatted: VolunteerApplication[] = (data || []).map((app: any) => ({
        ...app,
        profiles: app.profiles,
        skills: skillsMap[app.user_id] || [],
      }));

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
          Volunteer Applications
        </h1>
        <p className="text-xs text-[var(--fg-muted)] mt-1">
          Review community volunteer applications, evaluate verified skills, and grant task response privileges.
        </p>
      </div>

      {message && (
        <div className="p-3 rounded bg-red-950/20 border border-red-900/40 text-red-400 text-xs flex items-center gap-2">
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
        <div className="border border-dashed border-[var(--border)] rounded-md p-12 text-center text-xs text-[var(--fg-muted)]">
          No volunteer applications submitted yet.
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map(app => (
            <div
              key={app.id}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg)]">
                    {app.profiles?.full_name || 'Citizen Applicant'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--fg-muted)] mt-1">
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5" />
                      {app.phone || app.profiles?.phone || 'No phone provided'}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[var(--brand)]" />
                      {app.radius_km} km max operational radius
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Applied {new Date(app.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-medium capitalize border ${
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

              {/* Motivation */}
              <div className="text-xs text-[var(--fg-muted)] bg-[var(--surface-2)] p-3 rounded border border-[var(--border)]">
                <p className="font-medium text-[var(--fg)] mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[var(--brand)]" />
                  Applicant Statement & Motivation:
                </p>
                {app.motivation}
              </div>

              {/* Skills */}
              {app.skills && app.skills.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-[var(--fg-muted)] mb-1.5 uppercase tracking-wider">
                    Declared Field Skills:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {app.skills.map(skill => (
                      <span
                        key={skill}
                        className="bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand)]/30 px-2 py-0.5 rounded text-[11px] font-medium"
                      >
                        {skill.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {app.status === 'pending' && (
                <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
                  <button
                    onClick={() => {
                      setReviewApp(app);
                      setReviewDecision('approved');
                      setReviewNote('');
                    }}
                    disabled={actionLoading === app.id}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
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
                    className="flex items-center gap-1.5 border border-red-800/40 text-red-400 hover:bg-red-950/20 px-3 py-1.5 rounded text-xs font-medium transition-colors"
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
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 shadow-xl space-y-4">
            <h2 className="text-base font-semibold text-[var(--fg)] flex items-center gap-2">
              <Shield className="w-5 h-5 text-[var(--brand)]" />
              {reviewDecision === 'approved' ? 'Approve Volunteer' : 'Reject Application'}
            </h2>
            <p className="text-xs text-[var(--fg-muted)]">
              {reviewDecision === 'approved'
                ? `Approving ${reviewApp.profiles?.full_name} will automatically create their on-duty volunteer profile and grant dispatch response privileges.`
                : `Specify an optional reason for not accepting ${reviewApp.profiles?.full_name}'s application.`}
            </p>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">
                  Staff Review Note / Feedback (Optional)
                </label>
                <textarea
                  rows={3}
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder={
                    reviewDecision === 'approved'
                      ? 'Welcome to the municipal rapid response team...'
                      : 'We currently have full coverage in your area, please apply next quarter...'
                  }
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded p-2.5 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewApp(null)}
                  className="px-3 py-1.5 rounded text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === reviewApp.id}
                  className={`px-4 py-1.5 rounded text-xs font-medium text-white flex items-center gap-1.5 ${
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
