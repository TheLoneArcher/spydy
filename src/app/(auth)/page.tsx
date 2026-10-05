'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'admin' | 'volunteer'>('volunteer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) throw authError;

        if (data.user) {
          const { data: profile, error: profError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .single();
          
          if (profError) {
             console.error('Profile fetch error:', profError);
             setError('Account setup incomplete. Please contact support or re-register.');
             setLoading(false);
             return;
          } else if (profile?.role === 'admin') {
            router.push('/map');
          } else {
            router.push('/my-tasks');
          }
        }
      } else {
        const { data: signUpData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: role
            }
          }
        });

        if (authError) throw authError;

        const newUser = signUpData.user;
        if (newUser) {
          // 1. Create the profile row
          const { error: profileError } = await supabase.from('profiles').insert({
            id: newUser.id,
            full_name: fullName,
            role: role,
          });
          if (profileError) throw profileError;

          // 2. If volunteer, create the volunteers row too
          if (role === 'volunteer') {
            const { error: volError } = await supabase.from('volunteers').insert({
              profile_id: newUser.id,
              skills: [],
              is_available: true,
            });
            if (volError) throw volError;
          }
        }

        if (role === 'admin') router.push('/map');
        else router.push('/my-tasks');
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      // Small delay to prevent flashing if router.push takes a moment
      setTimeout(() => setLoading(false), 500);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-[#0A0E17] text-[#D1D5DB] font-sans">
      {/* Brand Section */}
      <div className="hidden lg:flex w-[40%] bg-[#111827] flex-col justify-between border-r border-[#1F2937] p-16">
        <div>
          <div className="flex items-center gap-3 mb-20">
            <div className="bg-blue-600 w-8 h-8 rounded flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]">R</div>
            <span className="font-semibold text-lg text-white tracking-tight">ResponSys</span>
          </div>
          <h1 className="text-3xl font-medium text-white mb-6 leading-tight">
            Resilient response <br /> for crisis situations.
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed max-w-xs mb-10">
            A high-fidelity coordination platform designed for rapid response and tactical field operations.
          </p>
          <div className="space-y-6">
            <div className="bg-[#1F2937]/30 border border-[#1F2937] px-4 py-3 rounded-md">
              <p className="text-white font-semibold text-lg">Live Tactical Sync</p>
              <p className="text-[11px] text-[#64748B] uppercase tracking-wider">Real-time dispatcher-to-field connection</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1 h-1 rounded-full bg-blue-500 mt-1.5" />
              <p className="text-[12px] text-[#94A3B8]">Mission-critical uptime for emergency NGOs.</p>
            </div>
          </div>
        </div>
        <div className="text-[10px] text-gray-500 uppercase tracking-widest flex items-center gap-2">
          <span>Tactical Hub 2.0</span>
          <span className="w-1 h-1 rounded-full bg-[#374151]" />
          <span>NGO Logistics System</span>
        </div>
      </div>

      {/* Auth Section */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12">
        <div className="w-full max-w-[340px]">
          <div className="mb-8">
            <h2 className="text-xl font-medium text-white mb-1">
              {isLogin ? 'Sign in' : 'Join ResponSys'}
            </h2>
            <p className="text-sm text-gray-400">
              {isLogin ? 'Enter your details to manage operations.' : 'Register your profile to start helping.'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {error && (
              <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-[13px] rounded p-3 mb-4">
                {error}
              </div>
            )}
            
            {!isLogin && (
              <>
                <div>
                  <label className="block text-[12px] font-medium text-gray-400 mb-1" htmlFor="fullName">Full Name</label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-[#111827] border border-[#374151] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Jane Doe"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-[12px] font-medium text-gray-400 mb-1">Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole('admin')}
                      className={`py-1.5 px-3 rounded text-[12px] font-medium transition-colors border ${role === 'admin' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-[#374151] text-gray-400 hover:border-gray-500'}`}
                    >
                       Dispatcher
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('volunteer')}
                      className={`py-1.5 px-3 rounded text-[12px] font-medium transition-colors border ${role === 'volunteer' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-[#374151] text-gray-400 hover:border-gray-500'}`}
                    >
                       Volunteer
                    </button>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-[12px] font-medium text-gray-400 mb-1" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#111827] border border-[#374151] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-400 mb-1" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#111827] border border-[#374151] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium py-2 rounded text-[13px] transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isLogin ? 'Continue' : 'Create Account')}
            </button>
          </form>

          <button 
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="w-full mt-6 text-[12px] text-gray-400 hover:text-white transition-colors"
          >
            {isLogin ? "Don&apos;t have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
