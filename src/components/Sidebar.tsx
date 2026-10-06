'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  Rss, Camera, FileText, ClipboardList, Map, Users,
  BarChart3, Package, UserCheck, Shield, LogOut,
  ChevronRight, Compass, Sparkles, CheckCircle2, Clock
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredRole?: 'civilian' | 'dispatcher' | 'admin';
  volunteerOnly?: boolean;
  staffOnly?: boolean;
  adminOnly?: boolean;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  // Core items (all users)
  { id: 'feed', label: 'Civic Feed', href: '/feed', icon: Rss },
  { id: 'submit', label: 'Report Issue', href: '/submit-report', icon: Camera },
  { id: 'my-reports', label: 'My Reports', href: '/my-reports', icon: FileText },
  { id: 'map', label: 'Live Map', href: '/map', icon: Map },

  // Volunteer items (only for approved volunteers or staff)
  { id: 'my-tasks', label: 'My Tasks', href: '/my-tasks', icon: ClipboardList, volunteerOnly: true },
  { id: 'nearby', label: 'Nearby Issues', href: '/nearby', icon: Compass, volunteerOnly: true },

  // Dispatch operations (dispatcher & admin)
  { id: 'dispatch-map', label: 'Operations Map', href: '/dispatch/map', icon: Map, staffOnly: true },
  { id: 'dispatch-tasks', label: 'Task Coordination', href: '/dispatch/tasks', icon: ClipboardList, staffOnly: true },
  { id: 'dispatch-volunteers', label: 'Field Volunteers', href: '/dispatch/volunteers', icon: Users, staffOnly: true },
  { id: 'dispatch-reports', label: 'Incident Triage', href: '/dispatch/reports', icon: FileText, staffOnly: true },
  { id: 'dispatch-resources', label: 'Equipment & Stock', href: '/dispatch/resources', icon: Package, staffOnly: true },
  { id: 'dispatch-analytics', label: 'Civic Analytics', href: '/dispatch/analytics', icon: BarChart3, staffOnly: true },

  // Administration (admin only)
  { id: 'admin-applications', label: 'Volunteer Review', href: '/admin/applications', icon: UserCheck, adminOnly: true },
  { id: 'admin-people', label: 'People & Privileges', href: '/admin/people', icon: Shield, adminOnly: true },
];

interface SidebarProps {
  role: string;
  profile: any;
  isVolunteer?: boolean;
  onDuty?: boolean;
  applicationStatus?: 'none' | 'pending' | 'approved' | 'rejected' | 'withdrawn';
}

export function Sidebar({
  role,
  profile,
  isVolunteer = false,
  onDuty = false,
  applicationStatus = 'none',
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [togglingDuty, setTogglingDuty] = useState(false);

  const isAdmin = role === 'admin';
  const isDispatcher = role === 'dispatcher' || isAdmin;

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      // Clear cache cookie
      document.cookie = 'rs_role_cache=; max-age=0; path=/;';
    } catch {}
    router.push('/');
    router.refresh();
  };

  const handleToggleDuty = async () => {
    setTogglingDuty(true);
    try {
      await supabase.rpc('set_volunteer_availability', { p_on_duty: !onDuty });
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingDuty(false);
    }
  };

  const visibleNav = NAV_ITEMS.filter(item => {
    if (item.adminOnly) return isAdmin;
    if (item.staffOnly) return isDispatcher;
    if (item.volunteerOnly) return isVolunteer || isDispatcher;
    return true;
  });

  const initials =
    profile?.full_name
      ?.split(' ')
      .map((n: string) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'RS';

  const NavContent = () => (
    <div className="flex h-full flex-col bg-[var(--surface)] text-[var(--fg)]">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-[var(--border)] shrink-0">
        <Link href="/feed" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-[var(--brand)] text-[var(--brand-fg)] flex items-center justify-center font-bold text-sm shadow-sm">
            R
          </div>
          <div>
            <span className="font-semibold text-base tracking-tight text-[var(--fg)]">ResponSys</span>
            <span className="block text-[10px] text-[var(--fg-muted)] tracking-wider uppercase font-mono">Civic Response</span>
          </div>
        </Link>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
        {/* Core & Field Section */}
        <p className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)] font-semibold px-2 mb-2 mt-1">
          {isDispatcher ? 'Civic Operations' : 'Citizen Platform'}
        </p>

        {visibleNav.map(item => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== '/feed' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition-colors group',
                active
                  ? 'bg-[var(--brand-soft)] text-[var(--brand)] font-semibold'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0 transition-colors', active ? 'text-[var(--brand)]' : 'text-[var(--fg-muted)] group-hover:text-[var(--fg)]')} />
              <span className="truncate">{item.label}</span>
              {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-[var(--brand)] opacity-70" />}
            </Link>
          );
        })}

        {/* Volunteer Application status-aware card for civilians */}
        {!isDispatcher && (
          <div className="mt-6 pt-4 border-t border-[var(--border)] px-1">
            {isVolunteer ? (
              <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-[var(--fg)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--brand)]" />
                    Volunteer Status
                  </span>
                  <span className={cn('w-2 h-2 rounded-full', onDuty ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-[var(--fg-muted)]')} />
                </div>
                <button
                  onClick={handleToggleDuty}
                  disabled={togglingDuty}
                  className={cn(
                    'w-full py-1.5 px-2 rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5',
                    onDuty
                      ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-800/40 hover:bg-emerald-950/30'
                      : 'bg-[var(--surface)] text-[var(--fg-muted)] border border-[var(--border)] hover:text-[var(--fg)]'
                  )}
                >
                  {onDuty ? 'On Duty (Active)' : 'Off Duty (Tap to activate)'}
                </button>
              </div>
            ) : applicationStatus === 'pending' ? (
              <Link
                href="/profile"
                className="block bg-amber-950/20 border border-amber-800/40 rounded-md p-3 hover:border-amber-700/60 transition-colors"
              >
                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  Application Pending
                </div>
                <p className="text-[11px] text-amber-300/80 leading-snug">
                  Your volunteer application is awaiting coordinator review.
                </p>
              </Link>
            ) : applicationStatus === 'rejected' ? (
              <Link
                href="/volunteer/apply"
                className="block bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-3 hover:border-[var(--brand)] transition-colors group"
              >
                <div className="text-xs font-semibold text-[var(--fg)] group-hover:text-[var(--brand)] mb-1">
                  Re-apply as Volunteer
                </div>
                <p className="text-[11px] text-[var(--fg-muted)] leading-snug">
                  Update your area or skills to re-submit for triage dispatch.
                </p>
              </Link>
            ) : (
              <Link
                href="/volunteer/apply"
                className="block bg-[var(--brand-soft)] border border-[var(--brand)]/30 rounded-md p-3 hover:border-[var(--brand)] transition-colors group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-[var(--brand)] flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    Become a Volunteer
                  </span>
                </div>
                <p className="text-[11px] text-[var(--fg-muted)] leading-snug">
                  Join field teams to resolve municipal potholes, lighting, and leaks.
                </p>
              </Link>
            )}
          </div>
        )}
      </nav>

      {/* User profile footer */}
      <div className="border-t border-[var(--border)] p-3">
        <div className="flex items-center gap-2">
          <Link
            href="/profile"
            className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 rounded hover:bg-[var(--surface-2)] transition-colors"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name || 'Avatar'}
                className="w-8 h-8 rounded-full object-cover border border-[var(--border)] shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--brand-soft)] border border-[var(--brand)]/30 text-[var(--brand)] font-semibold text-xs flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--fg)] truncate">
                {profile?.full_name || 'Citizen User'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-[var(--surface-2)] text-[var(--fg-muted)] border border-[var(--border)]">
                  {role}
                </span>
                {isVolunteer && (
                  <span className="text-[10px] text-emerald-500 font-medium">
                    · {onDuty ? 'On Duty' : 'Off Duty'}
                  </span>
                )}
              </div>
            </div>
          </Link>

          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-[var(--fg-muted)] hover:text-[var(--danger)] transition-colors p-2 rounded hover:bg-[var(--surface-2)]"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Rail */}
      <aside className="hidden md:flex w-[248px] shrink-0 flex-col h-screen border-r border-[var(--border)] fixed inset-y-0 left-0 z-30">
        <NavContent />
      </aside>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 p-2 bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--fg)] shadow-sm"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-[248px] border-r border-[var(--border)] h-full flex flex-col z-10">
            <NavContent />
          </div>
        </div>
      )}
    </>
  );
}
