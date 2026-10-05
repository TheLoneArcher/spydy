'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Map, Users, ClipboardList, BarChart3, LogOut, FileText,
  AlertTriangle, UserCircle, ChevronRight, Radio, Package
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface SidebarProps { role: string; profile: any; }

export function Sidebar({ role, profile }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const adminNav = [
    { label: 'Dashboard', href: '/map',        icon: Map },
    { label: 'Tasks',     href: '/tasks',      icon: ClipboardList },
    { label: 'Volunteers',href: '/volunteers', icon: Users },
    { label: 'Resources', href: '/resources',  icon: Package },
    { label: 'Analytics', href: '/analytics',  icon: BarChart3 },
    { label: 'Reports',   href: '/reports',    icon: FileText },
  ];

  const volunteerNav = [
    { label: 'My Tasks',      href: '/my-tasks',      icon: ClipboardList },
    { label: 'Nearby Issues', href: '/nearby',         icon: Map },
    { label: 'Submit Report', href: '/submit-report',  icon: AlertTriangle },
    { label: 'Profile',       href: '/my-profile',     icon: UserCircle },
  ];

  const links = role === 'admin' ? adminNav : volunteerNav;
  const initials = profile?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase() || '??';

  const NavContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-[#1F2937] flex-shrink-0">
        <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center flex-shrink-0">
          <Radio className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-white text-[15px] tracking-tight">ResponSys</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        <p className="text-[10px] uppercase tracking-widest text-[#4B5563] font-semibold px-2 mb-3">
          {role === 'admin' ? 'Operations' : 'Field'}
        </p>
        {links.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors group',
                active
                  ? 'bg-[#1a2235] text-white'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#1a2235]'
              )}
            >
              <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-blue-500' : 'text-[#6B7280] group-hover:text-[#9CA3AF]')} />
              <span>{label}</span>
              {active && <ChevronRight className="w-3 h-3 ml-auto text-blue-500 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-[#1F2937] p-3">
        <div className="flex items-center gap-3 px-1 py-1">
          <div className="w-8 h-8 rounded-full bg-blue-900/40 border border-blue-800/60 flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white truncate">{profile?.full_name || '—'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {role === 'volunteer' && (
                <div className={cn('w-1.5 h-1.5 rounded-full', profile?.is_available ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-[#4B5563]')} />
              )}
              <p className="text-[11px] text-[#6B7280] capitalize">{role}{role === 'volunteer' && (profile?.is_available ? ' • On Duty' : ' • Off Duty')}</p>
            </div>
          </div>
          <button onClick={handleLogout} title="Sign out" className="text-[#6B7280] hover:text-white transition-colors p-1 rounded">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex w-[220px] flex-shrink-0 flex-col h-screen bg-[#0D1117] border-r border-[#1F2937] fixed inset-y-0 left-0 z-30">
        <NavContent />
      </div>

      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 p-2 bg-[#111827] border border-[#1F2937] rounded-md text-[#94A3B8] hover:text-white transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-[220px] bg-[#0D1117] border-r border-[#1F2937] animate-slide-left h-full flex-col flex">
            <NavContent />
          </div>
        </div>
      )}
    </>
  );
}
