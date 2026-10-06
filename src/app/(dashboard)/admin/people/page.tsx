'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Users, UserPlus, Search, ShieldCheck, UserCheck, UserX,
  AlertTriangle, Loader2, CheckCircle2, Mail
} from 'lucide-react';

interface ProfileRow {
  id: string;
  full_name: string;
  role: 'civilian' | 'dispatcher' | 'admin';
  is_active: boolean;
  phone: string | null;
  created_at: string;
}

export default function AdminPeoplePage() {
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Role confirm dialog
  const [targetUser, setTargetUser] = useState<ProfileRow | null>(null);
  const [newRole, setNewRole] = useState<'civilian' | 'dispatcher' | 'admin'>('civilian');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [, startTransition] = useTransition();

  const fetchUsers = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, is_active, phone, created_at')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setUsers(data as ProfileRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleActive = async (u: ProfileRow) => {
    if (u.id === currentUserId && u.is_active) {
      alert('You cannot deactivate your own admin account.');
      return;
    }

    const { error } = await supabase.rpc('admin_set_active', {
      p_user: u.id,
      p_active: !u.is_active,
    });

    if (error) {
      alert(`Error updating account status: ${error.message}`);
    } else {
      fetchUsers();
    }
  };

  const handleRoleChangeConfirm = async () => {
    if (!targetUser) return;
    if (targetUser.id === currentUserId && newRole !== 'admin') {
      alert('You cannot demote your own admin account.');
      setShowConfirmModal(false);
      return;
    }

    const { error } = await supabase.rpc('admin_set_role', {
      p_user: targetUser.id,
      p_role: newRole,
    });

    if (error) {
      alert(`Error changing role: ${error.message}`);
    } else {
      setShowConfirmModal(false);
      setTargetUser(null);
      fetchUsers();
    }
  };

  const handleInviteDispatcher = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError(null);
    setInviteMessage(null);

    try {
      const res = await fetch('/api/admin/dispatchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, fullName: inviteName }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }

      setInviteMessage(`Invitation successfully sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteName('');
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteMessage(null);
        fetchUsers();
      }, 2000);
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Error sending invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.id.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--fg)] flex items-center gap-2">
            <Users className="w-5 h-5 text-[var(--brand)]" />
            User & Role Management
          </h1>
          <p className="text-xs text-[var(--fg-muted)] mt-1">
            Manage system roles, dispatch privileges, and civilian access accounts.
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 bg-[var(--brand)] text-[var(--brand-fg)] px-3.5 py-2 rounded text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <UserPlus className="w-4 h-4" />
          Add Dispatcher
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--fg-muted)]" />
          <input
            type="text"
            placeholder="Search by citizen name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded pl-9 pr-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'civilian', 'dispatcher', 'admin'].map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize border transition-colors ${
                roleFilter === r
                  ? 'bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]'
                  : 'bg-[var(--surface)] border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* People Table */}
      <div className="border border-[var(--border)] rounded-md bg-[var(--surface)] overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--surface-2)] border-b border-[var(--border)] text-[var(--fg-muted)] uppercase tracking-wider font-semibold">
            <tr>
              <th className="px-4 py-3">Citizen / User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-[var(--fg-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--brand)]" />
                  Loading user directory...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-[var(--fg-muted)]">
                  No users found matching current filters.
                </td>
              </tr>
            ) : (
              filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--fg)]">{u.full_name}</div>
                    <div className="text-[10px] text-[var(--fg-muted)] font-mono">{u.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                        u.role === 'admin'
                          ? 'bg-purple-950/20 text-purple-400 border border-purple-800/40'
                          : u.role === 'dispatcher'
                          ? 'bg-blue-950/20 text-blue-400 border border-blue-800/40'
                          : 'bg-[var(--surface-2)] text-[var(--fg-muted)] border border-[var(--border)]'
                      }`}
                    >
                      <ShieldCheck className="w-3 h-3" />
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                        u.is_active ? 'text-emerald-500' : 'text-red-400'
                      }`}
                    >
                      {u.is_active ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                      {u.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--fg-muted)]">{u.phone || '—'}</td>
                  <td className="px-4 py-3 text-[var(--fg-muted)]">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <select
                      value={u.role}
                      onChange={e => {
                        setTargetUser(u);
                        setNewRole(e.target.value as 'civilian' | 'dispatcher' | 'admin');
                        setShowConfirmModal(true);
                      }}
                      disabled={u.id === currentUserId}
                      className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-[11px] text-[var(--fg)] disabled:opacity-40"
                    >
                      <option value="civilian">Civilian</option>
                      <option value="dispatcher">Dispatcher</option>
                      <option value="admin">Admin</option>
                    </select>

                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={u.id === currentUserId && u.is_active}
                      className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                        u.is_active
                          ? 'border-red-900/40 text-red-400 hover:bg-red-950/20'
                          : 'border-emerald-900/40 text-emerald-400 hover:bg-emerald-950/20'
                      } disabled:opacity-40`}
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Dispatcher Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 shadow-xl">
            <h2 className="text-base font-semibold text-[var(--fg)] flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-[var(--brand)]" />
              Invite New Dispatcher
            </h2>
            <div className="p-3 mb-4 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--fg-muted)]">
              <p className="font-medium text-[var(--fg)] mb-0.5">Note: Dispatchers are invited by email</p>
              An invitation email with a secure setup link will be dispatched automatically. Once accepted, they gain access to the operations center.
            </div>

            {inviteError && (
              <div className="p-3 mb-4 rounded bg-red-950/20 border border-red-900/40 text-red-400 text-xs">
                {inviteError}
              </div>
            )}

            {inviteMessage && (
              <div className="p-3 mb-4 rounded bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {inviteMessage}
              </div>
            )}

            <form onSubmit={handleInviteDispatcher} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Official Name"
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="dispatcher@agency.gov"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-3 py-1.5 rounded text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="bg-[var(--brand)] text-[var(--brand-fg)] px-4 py-1.5 rounded text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {inviteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Change Confirmation Modal */}
      {showConfirmModal && targetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 shadow-xl">
            <div className="flex items-center gap-3 text-amber-500 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-sm font-semibold text-[var(--fg)]">Confirm Role Transition</h2>
            </div>
            <p className="text-xs text-[var(--fg-muted)] mb-4">
              Are you sure you want to change the role of <strong className="text-[var(--fg)]">{targetUser.full_name}</strong> from <strong className="capitalize">{targetUser.role}</strong> to <strong className="capitalize">{newRole}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-3 py-1.5 rounded text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChangeConfirm}
                className="bg-[var(--brand)] text-[var(--brand-fg)] px-3.5 py-1.5 rounded text-xs font-medium hover:opacity-90"
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
