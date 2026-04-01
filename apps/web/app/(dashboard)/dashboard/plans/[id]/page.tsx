'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import PlanEditor from '@/components/plan-editor/PlanEditor';
import type { Plan, PlanCategory, PlanContent } from '@influencerapp/shared-types';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function EditPlanPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api.get<Plan>(`/v1/plans/me/${params.id}`, accessToken)
      .then(setPlan)
      .catch(() => router.push('/dashboard/plans'))
      .finally(() => setLoading(false));
  }, [accessToken, params.id, router]);

  async function handleSave(data: {
    title: string; description: string; category: PlanCategory; content: PlanContent;
  }) {
    if (!accessToken || !plan) return;
    setSaving(true);
    try {
      const updated = await api.put<Plan>(`/v1/plans/me/${plan.id}`, data, accessToken);
      setPlan(updated);
    } catch (err: any) {
      alert(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading...</div>;
  if (!plan) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/plans" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold">Edit Plan</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ml-auto ${plan.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {plan.isPublished ? 'Published' : 'Draft'}
        </span>
      </div>

      <PlanEditor
        initialTitle={plan.title}
        initialDescription={plan.description ?? ''}
        initialCategory={plan.category}
        initialContent={plan.content}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
