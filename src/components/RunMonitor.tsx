'use client';

import React, { useEffect, useState } from 'react';
import { WorkflowRun, StepRun, UserSession } from '@/lib/types';
import { Play, PauseCircle, CheckCircle2, XCircle, Loader2, ShieldCheck, ShieldAlert, Sparkles, RefreshCw, Terminal, AlertTriangle } from 'lucide-react';

interface RunMonitorProps {
  runId: string | null;
  session: UserSession;
  onRunUpdated?: () => void;
}

export function RunMonitor({ runId, session, onRunUpdated }: RunMonitorProps) {
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);

  // Live Subscription using EventSource / SSE
  useEffect(() => {
    if (!runId) return;

    setErrorMsg(null);
    setApprovalFeedback(null);

    const eventSource = new EventSource(`/api/graphql?run_id=${runId}`);

    eventSource.onmessage = (event) => {
      try {
        const data: WorkflowRun = JSON.parse(event.data);
        setRun(data);
        if (onRunUpdated) onRunUpdated();
      } catch (err) {
        console.error('Subscription parse error:', err);
      }
    };

    eventSource.onerror = () => {
      console.warn('Subscription connection retry...');
    };

    return () => {
      eventSource.close();
    };
  }, [runId]);

  if (!runId) {
    return (
      <div className="p-8 text-center bg-slate-900/60 border border-slate-800 rounded-xl text-slate-400">
        <Terminal className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm">Select or trigger a workflow run to view real-time subscription progress.</p>
      </div>
    );
  }

  const handleApproveAction = async (stepRunId: string, decision: 'approve' | 'reject') => {
    setIsApproving(true);
    setApprovalFeedback(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/actions/approve-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-org-id': session.org_id,
          'x-hasura-user-id': session.user_id,
          'x-hasura-org-role': session.role,
          'x-hasura-user-email': session.user_email,
        },
        body: JSON.stringify({
          input: {
            step_run_id: stepRunId,
            decision,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Approval action failed');
      }

      setApprovalFeedback(data.message);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsApproving(false);
    }
  };

  const pausedStepRun = run?.step_runs?.find((sr) => sr.status === 'paused');

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-6">
      {/* Run Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <span>Run Execution Stream</span>
            </h2>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-rose-500/20 text-rose-300 text-[11px] font-semibold rounded-full border border-rose-500/30 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              Live Subscription Active
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">Run ID: {runId}</p>
        </div>

        {run && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium">Status:</span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
                run.status === 'completed'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : run.status === 'paused'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                  : run.status === 'running'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}
            >
              {run.status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {run.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              {run.status === 'paused' && <PauseCircle className="w-3.5 h-3.5 text-amber-400" />}
              {run.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-rose-400" />}
              <span>{run.status}</span>
            </span>
          </div>
        )}
      </div>

      {/* Security Feedback Alerts */}
      {errorMsg && (
        <div className="p-4 bg-rose-950/80 border border-rose-500/50 text-rose-200 rounded-xl text-xs flex items-start gap-3 shadow-lg">
          <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block text-sm">Security / Action Error</span>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {approvalFeedback && (
        <div className="p-3.5 bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 rounded-xl text-xs flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>{approvalFeedback}</span>
        </div>
      )}

      {/* Paused Approval Gate Banner */}
      {run?.status === 'paused' && pausedStepRun && (
        <div className="p-5 bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-2 border-amber-500/60 rounded-xl space-y-4 shadow-xl shadow-amber-950/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/40">
                <PauseCircle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-amber-200 text-sm">Execution Paused at Approval Gate</h3>
                <p className="text-xs text-amber-300/80">Step Name: &quot;{pausedStepRun.step_name}&quot;</p>
              </div>
            </div>

            <span className="text-[11px] font-semibold bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded border border-amber-500/30">
              Layer 2 Role Requirement: Owner or Editor
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-amber-500/30">
            <p className="text-xs text-slate-300">
              Resuming requires calling Hasura Action <code className="bg-slate-950 px-1.5 py-0.5 rounded text-amber-300">approveStep</code>.
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleApproveAction(pausedStepRun.id, 'reject')}
                disabled={isApproving}
                className="px-3.5 py-1.5 bg-rose-900 hover:bg-rose-800 text-rose-200 rounded-lg text-xs font-bold border border-rose-700 transition-colors"
              >
                Reject Step
              </button>

              <button
                onClick={() => handleApproveAction(pausedStepRun.id, 'approve')}
                disabled={isApproving}
                className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-extrabold shadow-lg shadow-amber-500/30 transition-all transform active:scale-95"
              >
                {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Approve & Resume Run</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step Runs Timeline Stream */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Step Execution Progress:</h3>

        {(!run?.step_runs || run.step_runs.length === 0) ? (
          <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/60 rounded-lg">
            Initializing step stream...
          </div>
        ) : (
          <div className="space-y-3">
            {run.step_runs.map((stepRun) => (
              <div
                key={stepRun.id}
                className={`p-4 rounded-xl border transition-all ${
                  stepRun.status === 'completed'
                    ? 'bg-slate-950/80 border-slate-800'
                    : stepRun.status === 'paused'
                    ? 'bg-amber-950/30 border-amber-500/50'
                    : stepRun.status === 'running'
                    ? 'bg-blue-950/30 border-blue-500/50'
                    : 'bg-rose-950/30 border-rose-500/50'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    {stepRun.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {stepRun.status === 'paused' && <PauseCircle className="w-4 h-4 text-amber-400 animate-pulse" />}
                    {stepRun.status === 'running' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                    {stepRun.status === 'failed' && <XCircle className="w-4 h-4 text-rose-400" />}

                    <span className="font-bold text-xs text-white">{stepRun.step_name}</span>
                    <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                      {stepRun.step_type}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                    <span className="bg-slate-800 px-2 py-0.5 rounded text-indigo-300">
                      Attempts: {stepRun.attempt_count}
                    </span>
                    <span>{stepRun.status.toUpperCase()}</span>
                  </div>
                </div>

                {/* Step Output / Error JSON Inspector */}
                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800/80 text-[11px] font-mono space-y-1.5">
                  <div className="text-slate-400 font-semibold flex justify-between">
                    <span>Step Output Payload:</span>
                    {stepRun.approved_by && (
                      <span className="text-emerald-400 font-normal">Approved by ID: {stepRun.approved_by}</span>
                    )}
                  </div>
                  <pre className="text-slate-300 overflow-x-auto p-2 bg-slate-950 rounded border border-slate-800 max-h-36">
                    {JSON.stringify(stepRun.output, null, 2)}
                  </pre>
                  {stepRun.error && (
                    <div className="p-2 bg-rose-950/60 text-rose-300 rounded border border-rose-800/50">
                      Error: {stepRun.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
