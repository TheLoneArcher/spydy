'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      setSuccess(true);
      setTimeout(() => {
        router.push('/feed');
        router.refresh();
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not set password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-[var(--bg)] text-[var(--fg)]">
      <div className="w-full max-w-[400px] bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Set Your Password</h1>
            <p className="text-xs text-[var(--fg-muted)]">Complete your account setup</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded bg-red-950/20 border border-red-900/40 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Password updated successfully! Redirecting to feed...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1" htmlFor="password">
              New Password (min 10 characters)
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
              placeholder="••••••••••••"
              required
              minLength={10}
            />
            {password && (
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
                <p className="text-[11px] text-[var(--fg-muted)]">
                  Strength: {strengthLabels[Math.min(strength, 4)]}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
              placeholder="••••••••••••"
              required
              minLength={10}
            />
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full bg-[var(--brand)] hover:opacity-90 disabled:opacity-50 text-[var(--brand-fg)] font-medium py-2 rounded text-sm transition-opacity flex items-center justify-center gap-2 mt-4"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Password & Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
