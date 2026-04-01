'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import type { Plan } from '@influencerapp/shared-types';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Globe, Eye } from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  workout: 'Workout', diet: 'Diet', schedule: 'Schedule',
  habit: 'Habit', mindset: 'Mindset', other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  workout: 'bg-blue-100 text-blue-800',
  diet: 'bg-green-100 text-green-800',
  schedule: 'bg-yellow-100 text-yellow-800',
  habit: 'bg-purple-100 text-purple-800',
  mindset: 'bg-pink-100 text-pink-800',
  other: 'bg-gray-100 text-gray-800',
};

export default function PlansPage() {
  const { accessToken } = useAuthStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api.get<{ plans: Plan[] }>('/v1/plans/me', accessToken)
      .then((r) => setPlans(r.plans))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function deletePlan(id: string) {
    if (!accessToken || !confirm('Delete this plan? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await api.delete(`/v1/plans/me/${id}`, accessToken);
      setPlans((p) => p.filter((plan) => plan.id !== id));
    } catch {
      alert('Failed to delete plan');
    } finally {
      setDeleting(null);
    }
  }

  async function togglePublish(plan: Plan) {
    if (!accessToken) return;
    try {
      const updated = await api.put<Plan>(
        `/v1/plans/me/${plan.id}`,
        { isPublished: !plan.isPublished },
        accessToken
      );
      setPlans((p) => p.map((pl) => (pl.id === plan.id ? updated : pl)));
    } catch {
      alert('Failed to update plan');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Plans</h1>
          <p className="text-muted-foreground">Manage your workout, diet, and habit plans</p>
        </div>
        <Link
          href="/dashboard/plans/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> New Plan
        </Link>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading plans...</div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-card">
          <p className="text-muted-foreground mb-4">No plans yet</p>
          <Link href="/dashboard/plans/new" className="text-primary underline">Create your first plan</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="bg-card border rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[plan.category]}`}>
                  {CATEGORY_LABELS[plan.category]}
                </span>
                <div className="min-w-0">
                  <p className="font-medium truncate">{plan.title}</p>
                  {plan.description && (
                    <p className="text-xs text-muted-foreground truncate">{plan.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${plan.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {plan.isPublished ? 'Published' : 'Draft'}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Eye className="w-3 h-3" /> {plan.viewCount}
                </span>
                <button
                  onClick={() => togglePublish(plan)}
                  className="p-1.5 rounded hover:bg-accent"
                  title={plan.isPublished ? 'Unpublish' : 'Publish'}
                >
                  <Globe className="w-4 h-4" />
                </button>
                <Link href={`/dashboard/plans/${plan.id}`} className="p-1.5 rounded hover:bg-accent">
                  <Pencil className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => deletePlan(plan.id)}
                  disabled={deleting === plan.id}
                  className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
