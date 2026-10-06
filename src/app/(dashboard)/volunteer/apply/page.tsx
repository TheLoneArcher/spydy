'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { VolunteerApplyForm } from '@/features/volunteer/VolunteerApplyForm';

export default function VolunteerApplyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [existingApp, setExistingApp] = useState<any>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  useEffect(() => {
    async function loadData() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push('/');
        return;
      }
      setUser(currentUser);

      const [profRes, volRes, appRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', currentUser.id).single(),
        supabase.from('volunteer_profiles').select('*').eq('user_id', currentUser.id).maybeSingle(),
        supabase.from('volunteer_applications').select('*').eq('user_id', currentUser.id).maybeSingle(),
      ]);

      if (profRes.data) setProfile(profRes.data);
      if (volRes.data) setIsApproved(true);
      if (appRes.data) setExistingApp(appRes.data);

      setLoading(false);
    }
    loadData();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[var(--fg-muted)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  if (isApproved) {
    return (
      <main className="mx-auto max-w-xl p-6 md:p-10">
        <div className="border border-emerald-800/40 bg-emerald-950/20 rounded-xl p-6 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
          <h1 className="text-lg font-semibold text-[var(--fg)]">You are an Approved Field Volunteer</h1>
          <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
            Your skills and operational service area have been verified by municipal coordinators. You have active dispatch response privileges.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Link
              href="/my-tasks"
              className="bg-[var(--brand)] text-[var(--brand-fg)] px-4 py-2 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Open My Task Missions &rarr;
            </Link>
            <Link
              href="/profile"
              className="border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] px-4 py-2 rounded-lg text-xs font-medium hover:bg-[var(--surface-2)] transition-colors"
            >
              Manage Duty in Profile
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (existingApp?.status === 'pending' && !showEditForm) {
    return (
      <main className="mx-auto max-w-xl p-6 md:p-10">
        <div className="border border-amber-800/40 bg-amber-950/20 rounded-xl p-6 text-center space-y-3">
          <Clock className="mx-auto h-10 w-10 text-amber-400" />
          <h1 className="text-lg font-semibold text-[var(--fg)]">Application Pending Coordinator Review</h1>
          <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
            Your application submitted on {new Date(existingApp.created_at).toLocaleDateString()} is currently in the dispatch review queue.
            You will receive an in-app notification when an admin or dispatcher approves your profile.
          </p>
          <div className="pt-3 flex flex-col sm:flex-row justify-center gap-2.5">
            <button
              onClick={() => setShowEditForm(true)}
              className="border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] px-4 py-2 rounded-lg text-xs font-medium hover:bg-[var(--surface-2)] transition-colors"
            >
              Update Application Details
            </button>
            <Link
              href="/feed"
              className="bg-[var(--brand)] text-[var(--brand-fg)] px-4 py-2 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Return to Civic Feed
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl p-6 md:p-10">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-semibold text-[var(--fg)]">Apply to Become a Field Volunteer</h1>
        <p className="mt-1 text-xs text-[var(--fg-muted)]">
          Join municipal rapid-response operations in Tirupati to inspect streetlights, fill potholes, and verify leak repairs.
        </p>
      </div>

      <VolunteerApplyForm
        user={user}
        existingApplication={existingApp}
        profile={profile}
      />
    </main>
  );
}
