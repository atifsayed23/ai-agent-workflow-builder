'use client';

import React from 'react';
import { Organization, OrgRole, UserSession } from '@/lib/types';
import { Shield, ShieldAlert, Cpu, UserCheck, Activity } from 'lucide-react';

interface NavbarProps {
  currentSession: UserSession;
  onSessionChange: (session: UserSession) => void;
  organizations: Organization[];
}

export function Navbar({ currentSession, onSessionChange, organizations }: NavbarProps) {
  const currentOrg = organizations.find((o) => o.id === currentSession.org_id) || organizations[0];
  const quotaPercent = Math.min(100, Math.round(((currentOrg?.calls_used || 0) / (currentOrg?.calls_allowed || 100)) * 100));

  const handleOrgChange = (orgId: string) => {
    const isOrgA = orgId.includes('11111111');
    const newRole = isOrgA ? 'owner' : 'editor';
    const newEmail = isOrgA ? 'owner@acme.com' : 'editor@stark.com';
    const newUserId = isOrgA ? 'aaaa1111-1111-4111-a111-111111111111' : 'bbbb2222-2222-4222-b222-222222222222';

    onSessionChange({
      user_id: newUserId,
      user_email: newEmail,
      org_id: orgId,
      role: newRole as OrgRole,
    });
  };

  const handleRoleChange = (role: OrgRole) => {
    onSessionChange({
      ...currentSession,
      role,
    });
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-500/30">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-wide bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
              AgentFlow Engine
            </h1>
            <p className="text-xs text-slate-400 font-mono">nhost + Hasura + Postgres + LLM</p>
          </div>
        </div>

        {/* Quota Indicator */}
        <div className="flex items-center gap-3 bg-slate-800/80 px-3.5 py-1.5 rounded-lg border border-slate-700">
          <Activity className="w-4 h-4 text-indigo-400" />
          <div className="text-xs">
            <div className="flex justify-between font-medium gap-4 mb-0.5">
              <span className="text-slate-300">Monthly Quota</span>
              <span className={quotaPercent >= 90 ? 'text-rose-400 font-bold' : 'text-indigo-300'}>
                {currentOrg?.calls_used || 0} / {currentOrg?.calls_allowed || 100} calls
              </span>
            </div>
            <div className="w-36 bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  quotaPercent >= 90 ? 'bg-rose-500' : 'bg-gradient-to-r from-indigo-500 to-emerald-400'
                }`}
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Multi-Tenant Org & Role Switcher */}
        <div className="flex items-center gap-2 bg-slate-800/90 p-1.5 rounded-xl border border-slate-700 shadow-inner">
          <div className="flex items-center gap-1.5 px-2 text-xs font-semibold text-slate-400">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            <span>Org Context:</span>
          </div>

          <select
            value={currentSession.org_id}
            onChange={(e) => handleOrgChange(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          <span className="text-slate-600">|</span>

          <div className="flex items-center gap-1.5 px-2 text-xs font-semibold text-slate-400">
            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Role:</span>
          </div>

          <select
            value={currentSession.role}
            onChange={(e) => handleRoleChange(e.target.value as OrgRole)}
            className={`border rounded-md px-2.5 py-1 text-xs font-bold cursor-pointer transition-colors ${
              currentSession.role === 'owner'
                ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                : currentSession.role === 'editor'
                ? 'bg-blue-950/80 border-blue-500/50 text-blue-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            <option value="owner">Owner (Full Sandbox & Action Control)</option>
            <option value="editor">Editor (Create/Run & Approve)</option>
            <option value="viewer">Viewer (Read-Only Restricted)</option>
          </select>

          {currentSession.role === 'viewer' && (
            <div className="flex items-center gap-1 text-[11px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30">
              <ShieldAlert className="w-3 h-3" />
              <span>Read Only</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
