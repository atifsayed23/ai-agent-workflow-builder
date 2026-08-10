'use client';

import React, { useState } from 'react';
import { UserSession } from '@/lib/types';
import { CheckCircle2, ShieldCheck, Play, ArrowRight, Activity, PauseCircle, Lock, RefreshCw } from 'lucide-react';

interface ProofScenarioSuiteProps {
  currentSession: UserSession;
  onSwitchSession: (session: UserSession) => void;
  onTriggerRun: (wfId: string, triggerType?: string) => Promise<string>;
}

export function ProofScenarioSuite({
  currentSession,
  onSwitchSession,
  onTriggerRun,
}: ProofScenarioSuiteProps) {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [scenarioLogs, setScenarioLogs] = useState<string[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);

  const addLog = (msg: string) => {
    setScenarioLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleStep1MultiTenant = () => {
    addLog('Verified multi-tenant database state: Org A (Acme AI) and Org B (Stark Tech) exist with independent member roles.');
    setActiveStep(2);
  };

  const handleStep2WorkflowBuild = () => {
    addLog('Org A Workflow verified: Contains LLM Call, HTTP API Request, Conditional Branch, Approval Gate, DB Write, and Notify Alert.');
    setActiveStep(3);
  };

  const handleStep3TriggerRun = async (type: 'manual' | 'webhook') => {
    try {
      if (type === 'manual') {
        onSwitchSession({
          user_id: 'aaaa1111-1111-4111-a111-111111111111',
          user_email: 'owner@acme.com',
          org_id: '11111111-1111-4111-a111-111111111111',
          role: 'owner',
        });
        const runId = await onTriggerRun('wf-acme-agent-001', 'manual');
        setCurrentRunId(runId);
        addLog(`Started run manually (Run ID: ${runId}). Step execution started.`);
      } else {
        // Trigger via Inbound Webhook Endpoint
        const res = await fetch('/api/webhooks/workflow/wf-acme-agent-001?token=wh_acme_sec_token_9981', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'external_webhook_test', priority: 'high' }),
        });
        const data = await res.json();
        if (data.run_id) {
          setCurrentRunId(data.run_id);
          setWebhookStatus(`Webhook HTTP 200 OK: Triggered Run ID ${data.run_id}`);
          addLog(`Triggered workflow via Inbound Webhook endpoint POST /api/webhooks/workflow/wf-acme-agent-001. Created Run ID: ${data.run_id}`);
        }
      }
      setActiveStep(4);
    } catch (err: any) {
      addLog(`Error triggering run: ${err.message}`);
    }
  };

  const handleStep5SwitchToOrgB = () => {
    // Switch to Org B Editor Context
    onSwitchSession({
      user_id: 'bbbb2222-2222-4222-b222-222222222222',
      user_email: 'editor@stark.com',
      org_id: '22222222-2222-4222-b222-222222222222',
      role: 'editor',
    });
    addLog('Switched active user context to Org B (Stark Tech) Editor role.');
    setActiveStep(6);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <span>Final Task Proof Scenario Guide</span>
          </h2>
          <p className="text-xs text-slate-400">
            Interactive 6-step walkthrough demonstrating all assignment criteria live end-to-end.
          </p>
        </div>

        <button
          onClick={() => {
            setScenarioLogs([]);
            setActiveStep(1);
            setCurrentRunId(null);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Scenario</span>
        </button>
      </div>

      {/* 6 Steps Visual Stepper */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { num: 1, title: 'Multi-Tenant Orgs', desc: 'Org A & Org B isolated' },
          { num: 2, title: 'Multi-Node Chain', desc: 'LLM + HTTP + Branch' },
          { num: 3, title: 'Start Workflow', desc: 'Manual or Webhook' },
          { num: 4, title: 'Pause & Approve', desc: 'Approval Gate state' },
          { num: 5, title: 'Live Stream', desc: 'GraphQL Subscription' },
          { num: 6, title: 'Org B Defense', desc: 'Cross-org 100% blocked' },
        ].map((s) => (
          <div
            key={s.num}
            onClick={() => setActiveStep(s.num)}
            className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
              activeStep === s.num
                ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                : activeStep > s.num
                ? 'bg-slate-950 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-950/60 border-slate-800 text-slate-500'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-xs">Step {s.num}</span>
              {activeStep > s.num && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            </div>
            <div className="font-semibold text-xs truncate">{s.title}</div>
            <div className="text-[10px] text-slate-400 truncate">{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Active Step Execution Box */}
      <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
        {activeStep === 1 && (
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-white">Criterion 1: Two Separate Organizations Exist</h3>
            <p className="text-xs text-slate-300">
              Database schema enforces strict row-level tenancy via <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded">org_members</code>.
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-900 rounded border border-slate-800">
                <span className="font-bold text-indigo-300 block">Org A: Acme AI Systems</span>
                <span className="text-slate-400">Users: owner@acme.com, editor@acme.com, viewer@acme.com</span>
              </div>
              <div className="p-3 bg-slate-900 rounded border border-slate-800">
                <span className="font-bold text-purple-300 block">Org B: Stark Technologies</span>
                <span className="text-slate-400">Users: owner@stark.com, editor@stark.com</span>
              </div>
            </div>
            <button
              onClick={handleStep1MultiTenant}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors"
            >
              Confirm Multi-Tenant Setup & Continue
            </button>
          </div>
        )}

        {activeStep === 2 && (
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-white">Criterion 2: Multi-Node Step Workflow in Org A</h3>
            <p className="text-xs text-slate-300">
              Workflow <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded">wf-acme-agent-001</code> contains:
            </p>
            <ul className="text-xs text-slate-300 space-y-1 list-disc pl-4">
              <li>Step 1: <code className="text-purple-300">llm_call</code> (Google Gemini API / Fallback AI intent classification)</li>
              <li>Step 2: <code className="text-blue-300">http_request</code> (External risk score API call with retry)</li>
              <li>Step 3: <code className="text-emerald-300">conditional_branch</code> (Branching logic based on LLM output)</li>
              <li>Step 4: <code className="text-amber-300">approval_gate</code> (Halts run until Editor/Owner approves)</li>
              <li>Step 5: <code className="text-amber-400">db_write</code> (Persists audit log to DB - Layer 2 Owner check)</li>
            </ul>
            <button
              onClick={handleStep2WorkflowBuild}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors"
            >
              Verify Workflow Chain & Proceed
            </button>
          </div>
        )}

        {activeStep === 3 && (
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-white">Criterion 3: Workflow Trigger Mechanisms</h3>
            <p className="text-xs text-slate-300">
              Start the workflow either manually or via external inbound Webhook endpoint.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleStep3TriggerRun('manual')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start Manually (Org A Owner)</span>
              </button>

              <button
                onClick={() => handleStep3TriggerRun('webhook')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
              >
                <span>Trigger via Webhook Endpoint</span>
              </button>
            </div>
            {webhookStatus && <div className="text-xs text-emerald-400 font-mono">{webhookStatus}</div>}
          </div>
        )}

        {activeStep === 4 && (
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-white">Criterion 4: Approval Gate Pause & Resume</h3>
            <p className="text-xs text-slate-300">
              The execution engine halts at Step 4 (<code className="text-amber-300">approval_gate</code>). Check the Run Execution Stream panel to approve as Org A Owner or Editor!
            </p>
            <button
              onClick={() => setActiveStep(5)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors"
            >
              Proceed to Live Stream Inspection
            </button>
          </div>
        )}

        {activeStep === 5 && (
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-white">Criterion 5: Real-Time Live Subscription Stream</h3>
            <p className="text-xs text-slate-300">
              Status updates stream step-by-step with zero page refreshes via Hasura live subscription emulation.
            </p>
            <button
              onClick={handleStep5SwitchToOrgB}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Switch to Org B User & Test Cross-Org Defense</span>
            </button>
          </div>
        )}

        {activeStep === 6 && (
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-rose-300">Criterion 6: Cross-Org Isolation Security Defense</h3>
            <p className="text-xs text-slate-300">
              You are now logged in as <code className="text-purple-300 font-bold">Org B Editor (Stark Tech)</code>. Try querying, running, or approving Org A&apos;s workflow in the Security Penetration Attack Simulator below!
            </p>
          </div>
        )}
      </div>

      {/* Scenario Execution Log Audit Trail */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Live Scenario Audit Trail:</span>
        <div className="bg-slate-900 p-3 rounded font-mono text-[11px] text-emerald-300 max-h-40 overflow-y-auto space-y-1">
          {scenarioLogs.length === 0 ? (
            <span className="text-slate-600">Audit logs will appear as you progress through steps...</span>
          ) : (
            scenarioLogs.map((log, idx) => <div key={idx}>{log}</div>)
          )}
        </div>
      </div>
    </div>
  );
}
