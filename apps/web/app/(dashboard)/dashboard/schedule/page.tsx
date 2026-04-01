'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import type { Video, Plan } from '@influencerapp/shared-types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface ScheduleEntry {
  id?: string;
  day_of_week: number;
  title?: string;
  description?: string;
  video_id?: string | null;
  plan_id?: string | null;
  is_active?: boolean;
  video_title?: string;
  plan_title?: string;
}

export default function SchedulePage() {
  const { accessToken } = useAuthStore();
  const [schedule, setSchedule] = useState<ScheduleEntry[]>(
    Array.from({ length: 7 }, (_, i) => ({ day_of_week: i }))
  );
  const [videos, setVideos] = useState<Video[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', description: '', videoId: '', planId: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.get<{ schedule: ScheduleEntry[] }>('/v1/schedule/me', accessToken),
      api.get<{ videos: Video[] }>('/v1/videos', accessToken),
      api.get<{ plans: Plan[] }>('/v1/plans/me', accessToken),
    ]).then(([sched, vids, plns]) => {
      setSchedule(sched.schedule);
      setVideos(vids.videos);
      setPlans(plns.plans);
    }).catch(() => {});
  }, [accessToken]);

  function openEdit(day: ScheduleEntry) {
    setEditingDay(day.day_of_week);
    setForm({
      title: day.title ?? '',
      description: day.description ?? '',
      videoId: day.video_id ?? '',
      planId: day.plan_id ?? '',
    });
  }

  async function saveDay() {
    if (editingDay === null || !accessToken) return;
    setSaving(true);
    try {
      const entry = await api.put<ScheduleEntry>(
        `/v1/schedule/me/${editingDay}`,
        { title: form.title, description: form.description, videoId: form.videoId || null, planId: form.planId || null, isActive: true },
        accessToken
      );
      setSchedule((s) => s.map((d) => (d.day_of_week === editingDay ? { ...d, ...entry } : d)));
      setEditingDay(null);
    } catch (err: any) {
      alert(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function clearDay(dayOfWeek: number) {
    if (!accessToken || !confirm('Clear this day?')) return;
    await api.delete(`/v1/schedule/me/${dayOfWeek}`, accessToken).catch(() => {});
    setSchedule((s) => s.map((d) => d.day_of_week === dayOfWeek ? { day_of_week: dayOfWeek } : d));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Daily Schedule</h1>
        <p className="text-muted-foreground">Assign a workout video to each day. Subscribers get an 8 AM push notification with that day's video.</p>
      </div>

      <div className="space-y-3">
        {schedule.map((day) => (
          <div key={day.day_of_week} className="bg-card border rounded-lg p-4 flex items-center justify-between gap-4">
            <div className="w-24 text-sm font-semibold">{DAY_NAMES[day.day_of_week]}</div>

            {day.title ? (
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{day.title}</p>
                <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                  {day.video_title && <span>Video: {day.video_title}</span>}
                  {day.plan_title && <span>Plan: {day.plan_title}</span>}
                </div>
              </div>
            ) : (
              <div className="flex-1 text-sm text-muted-foreground italic">Rest day / not set</div>
            )}

            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => openEdit(day)}
                className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded-md"
              >
                {day.title ? 'Edit' : 'Set'}
              </button>
              {day.title && (
                <button
                  onClick={() => clearDay(day.day_of_week)}
                  className="px-3 py-1.5 text-xs text-destructive border border-destructive/30 rounded-md"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editingDay !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border p-6 w-full max-w-md space-y-4">
            <h2 className="font-semibold text-lg">{DAY_NAMES[editingDay]} Workout</h2>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Upper Body Push"
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Description (optional)</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Video</label>
                <select
                  value={form.videoId}
                  onChange={(e) => setForm((f) => ({ ...f, videoId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                >
                  <option value="">None</option>
                  {videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Related Plan</label>
                <select
                  value={form.planId}
                  onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                >
                  <option value="">None</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={saveDay}
                disabled={saving || !form.title.trim()}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditingDay(null)}
                className="flex-1 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
