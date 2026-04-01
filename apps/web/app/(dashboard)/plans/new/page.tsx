'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import PlanEditor from '@/components/plan-editor/PlanEditor';
import type { Plan, PlanCategory, PlanContent } from '@influencerapp/shared-types';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function NewPlanPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [saving, setSaving] = useState(false);

  async function handleSave(data: {
    title: string; description: string; category: PlanCategory; content: PlanContent;
  }) {
    if (!accessToken) return;
    setSaving(true);
    try {
      const plan = await api.post<Plan>('/v1/plans/me', data, accessToken);
      router.push(`/dashboard/plans/${plan.id}`);
    } catch (err: any) {
      alert(err.message ?? 'Failed to create plan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/plans" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold">New Plan</h1>
      </div>
      <PlanEditor onSave={handleSave} saving={saving} />
    </div>
  );
}
