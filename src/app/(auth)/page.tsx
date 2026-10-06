'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Loader2, CheckCircle2, AlertCircle, ShieldAlert,
  ChevronDown, ChevronUp, Sparkles, Check
} from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fixedCount, setFixedCount] = useState<number>(142);
  const [demoOpen, setDemoOpen] = useState(false);

  // Check for error in query params (e.g., from auth callback or proxy redirect)
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      if (errorParam === 'confirmation_failed') {
        setError('Email confirmation failed or link has expired. Please try signing in or request a new link.');
      } else {
        setError(decodeURIComponent(errorParam));
      }
    }
  }, [searchParams]);

  // Load count of resolved issues for the brand stats panel
  useEffect(() => {
    let active = true;
    async function loadStats() {
      try {
        const { data, error: countErr } = await supabase.rpc('public_stats');
        const count = Array.isArray(data) ? data[0]?.closed_count : data?.closed_count;

        if (!countErr && count !== null && active && count > 0) {
          setFixedCount(count);
        }
      } catch {
        // Fall back to default
      }
    }
    loadStats();
    return () => {
      active = false;
    };
  }, []);

  // Redirect active sessions to /feed
  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (active && session?.user) {
        router.replace('/feed');
      }
    };
    checkSession();
    return () => {
      active = false;
    };
  }, [router]);

  const mapAuthError = (err: any): string => {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
      return 'Incorrect email or password. Please verify and try again.';
    }
    if (msg.includes('email not confirmed')) {
      return 'Your email address has not been confirmed yet. Please check your inbox for the confirmation link.';
    }
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
      return 'Too many attempts. For security, please wait a few moments before trying again.';
    }
    if (msg.includes('user already registered')) {
      return 'An account with this email address already exists. Please sign in instead.';
    }
    if (msg.includes('password should be at least')) {
      return 'Password must be at least 10 characters long.';
    }
    return err?.message || 'Authentication failed. Please check your credentials.';
  };

  const getStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 10) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const strength = getStrength(password);
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');

    try {
      if (isLogin) {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError) throw authError;

        if (data.user) {
          // Clear any stale cached role cookie
          document.cookie = 'rs_role_cache=; max-age=0; path=/;';
          router.push('/feed');
          router.refresh();
        }
      } else {
        if (password.length < 10) {
          throw new Error('Password must be at least 10 characters long.');
        }

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
        const { data: signUpData, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${siteUrl}/auth/callback?next=/feed`,
          },
        });

        if (authError) throw authError;

        if (!signUpData.session) {
          setNotice(
            'Confirmation email sent! Please check your inbox and click the verification link to activate your account.'
          );
          setIsLogin(true);
          return;
        }

        router.push('/feed');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('ResponSys2026!');
    setIsLogin(true);
    setError('');
    setNotice('');
  };

  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === '1';

  return (
    <div className="flex min-h-screen w-full bg-[var(--bg)] text-[var(--fg)]">
      {/* Brand Side Panel */}
      <div className="hidden lg:flex w-[42%] bg-[var(--surface-2)] flex-col justify-between border-r border-[var(--border)] p-12 lg:p-16">
        <div>
          {/* Logo Brand Header */}
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-lg bg-[var(--brand)] text-[var(--brand-fg)] flex items-center justify-center font-bold text-lg shadow-sm">
              R
            </div>
            <div>
              <span className="font-semibold text-xl tracking-tight text-[var(--fg)]">ResponSys</span>
              <span className="block text-[11px] text-[var(--fg-muted)] font-mono uppercase tracking-wider">
                Municipal Incident Triage
              </span>
            </div>
          </div>

          <h1 className="text-2xl lg:text-3xl font-semibold text-[var(--fg)] mb-4 leading-snug">
            Civic issue detection &amp; <br />
            coordinated municipal response.
          </h1>

          <p className="text-[var(--fg-muted)] text-sm leading-relaxed max-w-sm mb-10">
            Citizen verification platform for potholes, streetlight failures, overflowing garbage, and water
            pipe leaks. Powered by camera geolocation and duplicate detection.
          </p>

          <div className="space-y-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg shadow-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-[var(--ok)]">{fixedCount}</span>
                <span className="text-xs font-medium text-[var(--fg)]">civic issues resolved</span>
              </div>
              <p className="text-[11px] text-[var(--fg-muted)] mt-1">
                Verified community repairs closed across Tirupati Municipal Corporation.
              </p>
            </div>

            <div className="flex items-start gap-2.5 text-xs text-[var(--fg-muted)]">
              <Check className="w-4 h-4 text-[var(--brand)] shrink-0 mt-0.5" />
              <span>Camera capture with location verification to ensure genuine reporting.</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-[var(--fg-muted)]">
              <Check className="w-4 h-4 text-[var(--brand)] shrink-0 mt-0.5" />
              <span>Community attestation and automated duplicate cluster detection.</span>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-[var(--fg-muted)] font-mono flex items-center gap-2">
          <span>Tirupati Municipal Corporation</span>
          <span className="w-1 h-1 rounded-full bg-[var(--border)]" />
          <span>ResponSys Engine v2.0</span>
        </div>
      </div>

      {/* Auth Form Panel */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12">
        <div className="w-full max-w-[360px]">
          {/* Mobile Logo Brand */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded bg-[var(--brand)] text-[var(--brand-fg)] flex items-center justify-center font-bold text-sm">
              R
            </div>
            <span className="font-semibold text-lg text-[var(--fg)]">ResponSys</span>
          </div>

          {/* Tab Selector */}
          <div className="flex border-b border-[var(--border)] mb-6">
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setError('');
                setNotice('');
              }}
              className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
                isLogin
                  ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                  : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLogin(false);
                setError('');
                setNotice('');
              }}
              className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
                !isLogin
                  ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                  : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              Create Account
            </button>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[var(--fg)] mb-1">
              {isLogin ? 'Sign in to ResponSys' : 'Join as Citizen'}
            </h2>
            <p className="text-xs text-[var(--fg-muted)]">
              {isLogin
                ? 'Enter your credentials to access the civic feed and operations.'
                : 'Register your civilian account to report and attest local issues.'}
            </p>
          </div>

          {error && (
            <div className="bg-red-950/20 border border-red-900/40 text-red-400 text-xs rounded p-3 mb-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-xs rounded p-3 mb-4 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1" htmlFor="fullName">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
                  placeholder="Citizen Name"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
                placeholder="citizen@responsys.test"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1" htmlFor="password">
                Password {isLogin ? '' : '(min 10 characters)'}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
                placeholder="••••••••••••"
                required
                minLength={isLogin ? 6 : 10}
              />

              {!isLogin && password && (
                <div className="mt-2">
                  <div className="flex gap-1 h-1 mb-1">
                    {[1, 2, 3, 4, 5].map(step => (
                      <div
                        key={step}
                        className={`h-full flex-1 rounded-full transition-colors ${
                          step <= strength
                            ? strength >= 4
                              ? 'bg-emerald-500'
                              : strength >= 3
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                            : 'bg-[var(--border)]'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-[var(--fg-muted)]">
                    Strength: {strengthLabels[Math.min(strength, 4)]}
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--brand)] hover:opacity-90 disabled:opacity-50 text-[var(--brand-fg)] font-medium py-2 rounded text-xs transition-opacity flex items-center justify-center gap-2 mt-4 shadow-sm"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isLogin ? (
                'Sign In & View Feed'
              ) : (
                'Create Citizen Account'
              )}
            </button>
          </form>

          {/* Demo Accounts Panel */}
          {isDemoMode && (
            <div className="mt-8 border border-[var(--border)] rounded-md bg-[var(--surface-2)] overflow-hidden">
              <button
                type="button"
                onClick={() => setDemoOpen(!demoOpen)}
                className="w-full p-2.5 text-xs font-medium text-[var(--fg)] flex items-center justify-between hover:bg-[var(--surface)] transition-colors"
              >
                <span className="flex items-center gap-1.5 text-[var(--brand)]">
                  <Sparkles className="w-3.5 h-3.5" />
                  Quick Demo Accounts
                </span>
                {demoOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {demoOpen && (
                <div className="p-3 border-t border-[var(--border)] space-y-1.5 bg-[var(--surface)]">
                  <p className="text-[11px] text-[var(--fg-muted)] mb-2">
                    Click any seeded profile to auto-fill credentials:
                  </p>
                  {[
                    { role: 'Admin', email: 'admin@responsys.test', desc: 'People & privileged setup' },
                    { role: 'Dispatcher', email: 'dispatcher@responsys.test', desc: 'Triage & volunteer coordination' },
                    { role: 'Volunteer', email: 'volunteer@responsys.test', desc: 'Field tasks & resolution proof' },
                    { role: 'Civilian', email: 'civilian@responsys.test', desc: 'Camera reporting & attestation' },
                  ].map(acc => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fillDemoAccount(acc.email)}
                      className="w-full text-left p-1.5 rounded hover:bg-[var(--surface-2)] flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <span className="font-semibold text-[var(--fg)]">{acc.role}</span>
                        <span className="block text-[10px] text-[var(--fg-muted)]">{acc.email}</span>
                      </div>
                      <span className="text-[10px] text-[var(--brand)] font-mono">Fill</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
