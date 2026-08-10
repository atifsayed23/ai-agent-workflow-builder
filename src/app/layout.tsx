import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Agent Workflow Builder — Nhost + Hasura + Postgres + GraphQL',
  description: 'Purpose-built AI agent workflow orchestrator with dual-layer security, live subscriptions, and Hasura Actions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
