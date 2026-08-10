'use client';

import React, { useState } from 'react';
import { Workflow, UserSession, WorkflowStep } from '@/lib/types';
import { Play, Webhook, Layers, ArrowRight, ShieldAlert, CheckCircle2, Clock, PauseCircle, Code2, Plus } from 'lucide-react';

interface WorkflowListProps {
  workflows: Workflow[];
  session: UserSession;
  onSelectWorkflow: (wf: Workflow) => void;
  onRunWorkflow: (wfId: string) => void;
  onCreateNew: () => void;
}

export function WorkflowList({
  workflows,
  session,
  onSelectWorkflow,
  onRunWorkflow,
  onCreateNew,
}: WorkflowListProps) {
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null);

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'llm_call': return <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded border border-purple-500/30">🤖 LLM Call</span>;
      case 'http_request': return <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded border border-blue-500/30">🌐 HTTP API</span>;
      case 'db_write': return <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-xs rounded border border-amber-500/30">💾 DB Write (Owner)</span>;
      case 'notify': return <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 text-xs rounded border border-pink-500/30">🔔 Alert (Owner)</span>;
      case 'conditional_branch': return <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs rounded border border-emerald-500/30">🔀 Branch</span>;
      case 'approval_gate': return <span className="px-2 py-0.5 bg-orange-500/20 text-orange-300 text-xs rounded border border-orange-500/30 font-semibold">⏸️ Approval Gate</span>;
      default: return <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">{type}</span>;
    }
  };

  const copyWebhookSnippet = (wf: Workflow) => {
    const url = `${window.location.origin}/api/webhooks/workflow/${wf.id}?token=wh_acme_sec_token_9981`;
    navigator.clipboard.writeText(`curl -X POST "${url}" -H "Content-Type: application/json" -d '{"event": "user_signup", "tier": "enterprise"}'`);
    setCopiedWebhookId(wf.id);
    setTimeout(() => setCopiedWebhookId(null), 2500);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Organization Workflows</span>
          </h2>
          <p className="text-xs text-slate-400">
            Workflows created within your active organization context.
          </p>
        </div>

        {session.role !== 'viewer' ? (
          <button
            onClick={onCreateNew}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs transition-all shadow-md shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Build Workflow</span>
          </button>
        ) : (
          <div className="flex items-center gap-1 text-xs text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20">
            <ShieldAlert className="w-4 h-4" />
            <span>Viewer Role: Cannot Create or Modify</span>
          </div>
        )}
      </div>

      {workflows.length === 0 ? (
        <div className="p-8 text-center bg-slate-900/60 border border-slate-800 rounded-xl">
          <p className="text-sm text-slate-400">No workflows found for this organization.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {workflows.map((wf) => {
            const steps = wf.steps || [];
            const triggers = wf.triggers || [];
            const lastRun = wf.most_recent_run;

            return (
              <div
                key={wf.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition-all shadow-lg hover:shadow-slate-900/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <h3
                        onClick={() => onSelectWorkflow(wf)}
                        className="text-lg font-bold text-white hover:text-indigo-400 cursor-pointer transition-colors"
                      >
                        {wf.name}
                      </h3>
                      <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
                        {wf.id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{wf.description}</p>
                  </div>

                  {/* Run Button Layer 1 Protection */}
                  <div className="flex items-center gap-2">
                    {session.role !== 'viewer' ? (
                      <button
                        onClick={() => onRunWorkflow(wf.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg font-bold text-xs shadow-md shadow-emerald-600/20 transition-all transform active:scale-95"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        <span>Run Now</span>
                      </button>
                    ) : (
                      <button
                        disabled
                        title="Run button is hidden / disabled for viewer role"
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-slate-500 rounded-lg text-xs font-semibold cursor-not-allowed border border-slate-700"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                        <span>Run Disabled (Viewer)</span>
                      </button>
                    )}

                    <button
                      onClick={() => copyWebhookSnippet(wf)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                      title="Copy Inbound Webhook curl command"
                    >
                      <Webhook className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{copiedWebhookId === wf.id ? 'Copied Curl!' : 'Webhook URL'}</span>
                    </button>
                  </div>
                </div>

                {/* Steps Chain Preview */}
                <div className="mt-4 pt-3 border-t border-slate-800/80">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Step Chain ({steps.length} Steps):
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {steps.map((s, idx) => (
                      <React.Fragment key={s.id}>
                        {getStepIcon(s.type)}
                        {idx < steps.length - 1 && <ArrowRight className="w-3 h-3 text-slate-600" />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Triggers & Last Run Bar */}
                <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-300">Triggers:</span>
                    {triggers.map((t) => (
                      <span key={t.id} className="bg-slate-800 px-2 py-0.5 rounded text-[11px] font-mono text-indigo-300">
                        ⚡ {t.type}
                      </span>
                    ))}
                  </div>

                  {lastRun && (
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span>Last Run:</span>
                      <span
                        className={`flex items-center gap-1 px-2 py-0.5 rounded font-bold ${
                          lastRun.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : lastRun.status === 'paused'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {lastRun.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                        {lastRun.status === 'paused' && <PauseCircle className="w-3 h-3" />}
                        {lastRun.status.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
