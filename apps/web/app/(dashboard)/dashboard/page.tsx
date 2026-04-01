'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';

interface Analytics {
  subscribers: number;
  planViews: number;
  videoViews: number;
  chatSessions: number;
}

export default function DashboardPage() {
  const { accessToken, account } = useAuthStore();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api.get<Analytics>('/v1/influencers/me/analytics', accessToken)
      .then(setAnalytics)
      .catch(() => {});
  }, [accessToken]);

  const stats = [
    { label: 'Subscribers', value: analytics?.subscribers ?? '—' },
    { label: 'Plan Views', value: analytics?.planViews ?? '—' },
    { label: 'Video Views', value: analytics?.videoViews ?? '—' },
    { label: 'Chat Sessions', value: analytics?.chatSessions ?? '—' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Welcome back, {account?.displayName}</h1>
        <p className="text-muted-foreground mt-1">Here&apos;s your performance overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-card border rounded-lg p-6">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-2">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Quick Actions</h2>
        <div className="flex gap-3 flex-wrap">
          <a href="/dashboard/plans" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">
            + New Plan
          </a>
          <a href="/dashboard/videos" className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium">
            + Upload Video
          </a>
          <a href="/dashboard/schedule" className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium">
            Edit Daily Schedule
          </a>
        </div>
      </div>
    </div>
  );
}
