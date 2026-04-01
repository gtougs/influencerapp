'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Analytics {
  subscribers: number;
  planViews: number;
  videoViews: number;
  chatSessions: number;
}

// Placeholder chart data — in production this would come from time-series API endpoints
const placeholderGrowth = [
  { month: 'Aug', subscribers: 12 },
  { month: 'Sep', subscribers: 28 },
  { month: 'Oct', subscribers: 45 },
  { month: 'Nov', subscribers: 61 },
  { month: 'Dec', subscribers: 89 },
  { month: 'Jan', subscribers: 134 },
];

const placeholderViews = [
  { week: 'W1', plans: 42, videos: 87 },
  { week: 'W2', plans: 55, videos: 110 },
  { week: 'W3', plans: 38, videos: 95 },
  { week: 'W4', plans: 70, videos: 143 },
];

export default function AnalyticsPage() {
  const { accessToken } = useAuthStore();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api.get<Analytics>('/v1/influencers/me/analytics', accessToken)
      .then(setAnalytics)
      .catch(() => {});
  }, [accessToken]);

  const kpis = [
    { label: 'Active Subscribers', value: analytics?.subscribers ?? 0, color: 'text-primary' },
    { label: 'Plan Views', value: analytics?.planViews ?? 0, color: 'text-blue-600' },
    { label: 'Video Views', value: analytics?.videoViews ?? 0, color: 'text-green-600' },
    { label: 'Chat Sessions', value: analytics?.chatSessions ?? 0, color: 'text-purple-600' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Your content performance</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, color }) => (
          <div key={label} className="bg-card border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border rounded-lg p-5">
          <h2 className="text-sm font-semibold mb-4">Subscriber Growth</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={placeholderGrowth}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="subscribers" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border rounded-lg p-5">
          <h2 className="text-sm font-semibold mb-4">Weekly Views</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={placeholderViews}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="plans" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="videos" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
