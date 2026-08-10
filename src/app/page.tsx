'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { WorkflowList } from '@/components/WorkflowList';
import { WorkflowBuilder } from '@/components/WorkflowBuilder';
import { RunMonitor } from '@/components/RunMonitor';
import { ProofScenarioSuite } from '@/components/ProofScenarioSuite';
import { SecurityTestPanel } from '@/components/SecurityTestPanel';
import { UserSession, Organization, Workflow } from '@/lib/types';
import { Layers, Activity, ShieldCheck, Sparkles, Terminal } from 'lucide-react';

export default function Home() {
  // Session State (Initial default: Org A Owner)
  const [session, setSession] = useState<UserSession>({
    user_id: 'aaaa1111-1111-4111-a111-111111111111',
    user_email: 'owner@acme.com',
    org_id: '11111111-1111-4111-a111-111111111111',
    role: 'owner',
  });

  const [organizations, setOrganizations] = useState<Organization[]>([
    {
      id: '11111111-1111-4111-a111-111111111111',
      name: 'Acme AI Systems (Org A)',
      calls_used: 4,
      calls_allowed: 50,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '22222222-2222-4222-b222-222222222222',
      name: 'Stark Technologies (Org B)',
      calls_used: 12,
      calls_allowed: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | undefined>(undefined);
  const [isBuilding, setIsBuilding] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'workflows' | 'runs' | 'proof'>('workflows');

  // Fetch Workflows via Hasura Layer 1 GraphQL Endpoint
  const fetchWorkflows = async (currentSession: UserSession) => {
    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-org-id': currentSession.org_id,
          'x-hasura-user-id': currentSession.user_id,
          'x-hasura-org-role': currentSession.role,
        },
        body: JSON.stringify({
          query: `
            query GetOrgWorkflows($org_id: uuid!) {
              workflows(where: { org_id: { _eq: $org_id } }) {
                id
                name
                description
                org_id
                steps
                triggers
                runs
                most_recent_run
              }
            }
          `,
          variables: { org_id: currentSession.org_id },
        }),
      });

      const data = await res.json();
      if (data.data?.workflows) {
        setWorkflows(data.data.workflows);
      }
    } catch (err) {
      console.error('Error fetching workflows:', err);
    }
  };

  useEffect(() => {
    fetchWorkflows(session);
  }, [session]);

  const handleTriggerRun = async (workflowId: string): Promise<string> => {
    const res = await fetch('/api/actions/trigger-workflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-org-id': session.org_id,
        'x-hasura-user-id': session.user_id,
        'x-hasura-org-role': session.role,
        'x-hasura-user-email': session.user_email,
      },
      body: JSON.stringify({
        input: { workflow_id: workflowId, payload: { source: 'dashboard_button' } },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(`Action Error: ${data.message}`);
      throw new Error(data.message);
    }

    setActiveRunId(data.run_id);
    setActiveTab('runs');
    fetchWorkflows(session);
    return data.run_id;
  };

  const handleSaveWorkflow = async (wfData: any) => {
    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-org-id': session.org_id,
          'x-hasura-user-id': session.user_id,
          'x-hasura-org-role': session.role,
        },
        body: JSON.stringify({
          query: `
            mutation CreateWorkflow($name: String!, $description: String!, $org_id: uuid!, $steps: json) {
              insert_workflows_one(name: $name, description: $description, org_id: $org_id, steps: $steps) {
                id
                name
              }
            }
          `,
          variables: {
            name: wfData.name,
            description: wfData.description,
            org_id: session.org_id,
            steps: wfData.steps,
          },
        }),
      });

      const data = await res.json();

      if (data.errors) {
        alert(data.errors[0].message);
        return;
      }

      setIsBuilding(false);
      fetchWorkflows(session);
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar
        currentSession={session}
        onSessionChange={(newSession) => {
          setSession(newSession);
          setIsBuilding(false);
        }}
        organizations={organizations}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => {
              setActiveTab('workflows');
              setIsBuilding(false);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'workflows' && !isBuilding
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Workflows & Canvas ({workflows.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('runs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'runs'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Run Stream Monitor {activeRunId ? '(Active)' : ''}</span>
          </button>

          <button
            onClick={() => setActiveTab('proof')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'proof'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span>Final Task Proof Suite (6 Criteria)</span>
          </button>
        </div>

        {/* Tab Content rendering */}
        {isBuilding ? (
          <WorkflowBuilder
            workflow={selectedWorkflow}
            session={session}
            onSave={handleSaveWorkflow}
            onCancel={() => setIsBuilding(false)}
          />
        ) : activeTab === 'workflows' ? (
          <WorkflowList
            workflows={workflows}
            session={session}
            onSelectWorkflow={(wf) => {
              setSelectedWorkflow(wf);
              setIsBuilding(true);
            }}
            onRunWorkflow={handleTriggerRun}
            onCreateNew={() => {
              setSelectedWorkflow(undefined);
              setIsBuilding(true);
            }}
          />
        ) : activeTab === 'runs' ? (
          <RunMonitor
            runId={activeRunId}
            session={session}
            onRunUpdated={() => fetchWorkflows(session)}
          />
        ) : (
          <div className="space-y-6">
            <ProofScenarioSuite
              currentSession={session}
              onSwitchSession={(s) => setSession(s)}
              onTriggerRun={handleTriggerRun}
            />

            <SecurityTestPanel session={session} />
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800 bg-slate-900/50 p-4 text-center text-xs text-slate-500 font-mono">
        AI Agent Workflow Builder — Nhost + Hasura v2 + PostgreSQL + Next.js 14
      </footer>
    </div>
  );
}
