import { getSupabaseServerClient } from '@/lib/server/supabase';
import { Sidebar } from '@/components/Sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role = 'civilian';
  let profile = null;
  let isVolunteer = false;
  let onDuty = false;
  let applicationStatus: 'none' | 'pending' | 'approved' | 'rejected' | 'withdrawn' = 'none';

  if (user) {
    const [profRes, volProfRes, volAppRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, role, phone, avatar_url, is_active, created_at')
        .eq('id', user.id)
        .single(),
      supabase
        .from('volunteer_profiles')
        .select('on_duty, skills, max_radius_km')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('volunteer_applications')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (profRes.data) {
      role = profRes.data.role;
      isVolunteer = Boolean(volProfRes.data);
      onDuty = Boolean(volProfRes.data?.on_duty);
      applicationStatus = (volAppRes.data?.status as any) || (isVolunteer ? 'approved' : 'none');

      profile = {
        ...profRes.data,
        is_volunteer: isVolunteer,
        on_duty: onDuty,
        application_status: applicationStatus,
      };
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-[var(--bg)] text-[var(--fg)]">
      <Sidebar
        role={role}
        profile={profile}
        isVolunteer={isVolunteer}
        onDuty={onDuty}
        applicationStatus={applicationStatus}
      />
      <main className="flex-1 md:ml-[248px] min-w-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}
