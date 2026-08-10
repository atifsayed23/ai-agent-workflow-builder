'use client';

import React, { useState } from 'react';
import { Workflow, WorkflowStep, StepType, UserSession } from '@/lib/types';
import { Plus, Trash2, ShieldAlert, Sparkles, MoveUp, MoveDown, Save, ArrowLeft, Bot, Globe, Database, Bell, GitBranch, PauseCircle } from 'lucide-react';

interface WorkflowBuilderProps {
  workflow?: Workflow;
  session: UserSession;
  onSave: (wf: { name: string; description: string; steps: Partial<WorkflowStep>[] }) => void;
  onCancel: () => void;
}

export function WorkflowBuilder({ workflow, session, onSave, onCancel }: WorkflowBuilderProps) {
  const [name, setName] = useState(workflow?.name || 'New AI Agent Workflow');
  const [description, setDescription] = useState(workflow?.description || 'Automated agent chain combining LLM, HTTP, and Approval Gates.');
  const [steps, setSteps] = useState<Partial<WorkflowStep>[]>(
    workflow?.steps || [
      {
        name: 'LLM Sentiment & Intent Classifier',
        type: 'llm_call',
        config: { prompt: 'Analyze incoming customer inquiry and extract urgency & sentiment.', model: 'gemini-1.5-flash' },
      },
      {
        name: 'Verify Account Status via API',
        type: 'http_request',
        config: { url: 'https://jsonplaceholder.typicode.com/posts/1', method: 'GET' },
      },
      {
        name: 'Executive Approval Gate',
        type: 'approval_gate',
        config: { required_role: 'editor' },
      },
      {
        name: 'Persist Security Audit Log',
        type: 'db_write',
        config: { entity_type: 'security_audit' },
      },
    ]
  );

  const [securityWarning, setSecurityWarning] = useState<string | null>(null);

  const handleAddStep = (type: StepType) => {
    // Layer 2 Security Check: db_write and notify require owner role!
    if ((type === 'db_write' || type === 'notify') && session.role !== 'owner') {
      setSecurityWarning(`Layer 2 Security Block: Step type '${type}' reaches outside the sandbox and can ONLY be added by an Organization Owner. Your current role is '${session.role}'.`);
      return;
    }

    setSecurityWarning(null);

    const defaultConfig: Record<StepType, any> = {
      llm_call: { prompt: 'Summarize target input data', model: 'gemini-1.5-flash' },
      http_request: { url: 'https://jsonplaceholder.typicode.com/posts/1', method: 'GET' },
      conditional_branch: { condition_expression: 'prev_output.status === 200' },
      approval_gate: { required_role: 'editor' },
      db_write: { entity_type: 'custom_record' },
      notify: { recipient: '#sec-ops', channel: 'slack' },
    };

    setSteps([
      ...steps,
      {
        name: `Step ${steps.length + 1}: ${type.toUpperCase()}`,
        type,
        config: defaultConfig[type],
      },
    ]);
  };

  const handleRemoveStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const handleMoveStep = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= steps.length) return;

    const updated = [...steps];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setSteps(updated);
  };

  const handleConfigChange = (idx: number, key: string, value: any) => {
    const updated = [...steps];
    updated[idx] = {
      ...updated[idx],
      config: {
        ...updated[idx].config,
        [key]: value,
      },
    };
    setSteps(updated);
  };

  const handleStepNameChange = (idx: number, newName: string) => {
    const updated = [...steps];
    updated[idx].name = newName;
    setSteps(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (session.role === 'viewer') {
      alert('Layer 1 Violation: Viewer role is read-only and cannot save workflows.');
      return;
    }
    onSave({ name, description, steps });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <span>Workflow Canvas & Step Builder</span>
            </h2>
            <p className="text-xs text-slate-400">Configure ordered step nodes and execution triggers.</p>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={session.role === 'viewer'}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all"
        >
          <Save className="w-4 h-4" />
          <span>Save Workflow</span>
        </button>
      </div>

      {/* Security Layer Warning Alert */}
      {securityWarning && (
        <div className="p-3.5 bg-rose-500/20 border border-rose-500/40 text-rose-200 rounded-xl text-xs flex items-center justify-between gap-3 animate-shake">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <span>{securityWarning}</span>
          </div>
          <button onClick={() => setSecurityWarning(null)} className="text-rose-400 hover:text-white font-bold">✕</button>
        </div>
      )}

      {/* Basic Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300">Workflow Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Add Step Action Palette */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Available Step Nodes:</span>
          <span className="text-[11px] text-slate-400">Layer 2: DB Write & Alert require Owner role</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          <button
            type="button"
            onClick={() => handleAddStep('llm_call')}
            className="flex flex-col items-center p-3 bg-slate-800/80 hover:bg-slate-700 border border-purple-500/30 rounded-xl text-purple-300 text-xs font-semibold transition-all hover:scale-105"
          >
            <Bot className="w-5 h-5 mb-1 text-purple-400" />
            <span>LLM Call</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddStep('http_request')}
            className="flex flex-col items-center p-3 bg-slate-800/80 hover:bg-slate-700 border border-blue-500/30 rounded-xl text-blue-300 text-xs font-semibold transition-all hover:scale-105"
          >
            <Globe className="w-5 h-5 mb-1 text-blue-400" />
            <span>HTTP API</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddStep('conditional_branch')}
            className="flex flex-col items-center p-3 bg-slate-800/80 hover:bg-slate-700 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-semibold transition-all hover:scale-105"
          >
            <GitBranch className="w-5 h-5 mb-1 text-emerald-400" />
            <span>Branch</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddStep('approval_gate')}
            className="flex flex-col items-center p-3 bg-slate-800/80 hover:bg-slate-700 border border-orange-500/30 rounded-xl text-orange-300 text-xs font-semibold transition-all hover:scale-105"
          >
            <PauseCircle className="w-5 h-5 mb-1 text-orange-400" />
            <span>Approval Gate</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddStep('db_write')}
            className={`flex flex-col items-center p-3 bg-slate-800/80 hover:bg-slate-700 border rounded-xl text-xs font-semibold transition-all ${
              session.role === 'owner' ? 'border-amber-500/40 text-amber-300 hover:scale-105' : 'border-slate-700 text-slate-500 cursor-not-allowed opacity-60'
            }`}
          >
            <Database className="w-5 h-5 mb-1 text-amber-400" />
            <span>DB Write 🔒</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddStep('notify')}
            className={`flex flex-col items-center p-3 bg-slate-800/80 hover:bg-slate-700 border rounded-xl text-xs font-semibold transition-all ${
              session.role === 'owner' ? 'border-pink-500/40 text-pink-300 hover:scale-105' : 'border-slate-700 text-slate-500 cursor-not-allowed opacity-60'
            }`}
          >
            <Bell className="w-5 h-5 mb-1 text-pink-400" />
            <span>Notify Alert 🔒</span>
          </button>
        </div>
      </div>

      {/* Step Sequence List */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Ordered Step Execution Pipeline ({steps.length}):</h3>

        {steps.map((step, idx) => (
          <div
            key={idx}
            className="p-4 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl space-y-3 transition-all"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1">
                <span className="w-6 h-6 rounded-full bg-slate-800 text-indigo-400 font-bold text-xs flex items-center justify-center border border-slate-700">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={step.name || ''}
                  onChange={(e) => handleStepNameChange(idx, e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none flex-1 max-w-sm"
                />
                <span className="text-[11px] font-mono uppercase bg-slate-900 text-indigo-300 px-2 py-0.5 rounded border border-slate-800">
                  {step.type}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleMoveStep(idx, 'up')}
                  disabled={idx === 0}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 rounded"
                >
                  <MoveUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveStep(idx, 'down')}
                  disabled={idx === steps.length - 1}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 rounded"
                >
                  <MoveDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveStep(idx)}
                  className="p-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 rounded border border-rose-800/40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Node-specific configuration fields */}
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800/80 text-xs space-y-2">
              {step.type === 'llm_call' && (
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium">LLM Prompt Template:</label>
                  <textarea
                    value={step.config?.prompt || ''}
                    onChange={(e) => handleConfigChange(idx, 'prompt', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    rows={2}
                  />
                </div>
              )}

              {step.type === 'http_request' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div className="md:col-span-1">
                    <label className="text-slate-400 font-medium">Method:</label>
                    <select
                      value={step.config?.method || 'GET'}
                      onChange={(e) => handleConfigChange(idx, 'method', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-slate-400 font-medium">URL Endpoint:</label>
                    <input
                      type="text"
                      value={step.config?.url || ''}
                      onChange={(e) => handleConfigChange(idx, 'url', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200"
                    />
                  </div>
                </div>
              )}

              {step.type === 'conditional_branch' && (
                <div>
                  <label className="text-slate-400 font-medium">Branch Condition Expression:</label>
                  <input
                    type="text"
                    value={step.config?.condition_expression || ''}
                    onChange={(e) => handleConfigChange(idx, 'condition_expression', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-emerald-300 font-mono"
                  />
                </div>
              )}

              {step.type === 'approval_gate' && (
                <div>
                  <label className="text-slate-400 font-medium">Required Approval Role:</label>
                  <select
                    value={step.config?.required_role || 'editor'}
                    onChange={(e) => handleConfigChange(idx, 'required_role', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-amber-300 font-bold"
                  >
                    <option value="owner">Owner Only</option>
                    <option value="editor">Editor or Owner</option>
                  </select>
                </div>
              )}

              {step.type === 'db_write' && (
                <div>
                  <label className="text-slate-400 font-medium">Target Entity Type:</label>
                  <input
                    type="text"
                    value={step.config?.entity_type || 'custom_record'}
                    onChange={(e) => handleConfigChange(idx, 'entity_type', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-amber-300"
                  />
                </div>
              )}

              {step.type === 'notify' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 font-medium">Recipient Channel:</label>
                    <input
                      type="text"
                      value={step.config?.recipient || '#alerts'}
                      onChange={(e) => handleConfigChange(idx, 'recipient', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-pink-300"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-medium">Channel Type:</label>
                    <select
                      value={step.config?.channel || 'slack'}
                      onChange={(e) => handleConfigChange(idx, 'channel', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white"
                    >
                      <option value="slack">Slack Alert</option>
                      <option value="email">Email Notification</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
