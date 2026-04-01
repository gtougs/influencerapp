'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const { accessToken, account } = useAuthStore();
  const [form, setForm] = useState({ bio: '', personaPrompt: '', specialtyTags: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api.get<any>('/v1/influencers/me', accessToken)
      .then((profile) => {
        setForm({
          bio: profile.bio ?? '',
          personaPrompt: profile.persona_prompt ?? '',
          specialtyTags: (profile.specialty_tags ?? []).join(', '),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    try {
      await api.put('/v1/influencers/me', {
        bio: form.bio,
        personaPrompt: form.personaPrompt,
        specialtyTags: form.specialtyTags.split(',').map((t) => t.trim()).filter(Boolean),
      }, accessToken);
      alert('Profile saved!');
    } catch (err: any) {
      alert(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function openBillingPortal() {
    if (!accessToken) return;
    setBillingLoading(true);
    try {
      const { portalUrl } = await api.post<{ portalUrl: string }>('/v1/subscriptions/portal', {}, accessToken);
      window.open(portalUrl, '_blank');
    } catch {
      alert('Billing portal unavailable');
    } finally {
      setBillingLoading(false);
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="font-semibold mb-5">Creator Profile</h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="Tell your fans about yourself..."
              rows={3}
              className="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">AI Persona Prompt</label>
            <p className="text-xs text-muted-foreground mb-2">
              Describe your coaching style. This shapes how your AI chatbot speaks to fans.
            </p>
            <textarea
              value={form.personaPrompt}
              onChange={(e) => setForm((f) => ({ ...f, personaPrompt: e.target.value }))}
              placeholder='e.g. "You are direct and no-nonsense. You love compound lifts and a carnivore approach to diet. You push people hard but keep it fun."'
              rows={4}
              className="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Specialty Tags (comma-separated)</label>
            <input
              value={form.specialtyTags}
              onChange={(e) => setForm((f) => ({ ...f, specialtyTags: e.target.value }))}
              placeholder="strength, powerlifting, nutrition"
              className="w-full px-3 py-2 border rounded-md bg-background text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>

      {/* Billing */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="font-semibold mb-2">Billing</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Manage your $50/month creator subscription, update payment method, or cancel.
        </p>
        <button
          onClick={openBillingPortal}
          disabled={billingLoading}
          className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium disabled:opacity-50"
        >
          {billingLoading ? 'Opening...' : 'Open Billing Portal'}
        </button>
      </div>

      {/* Account info */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="font-semibold mb-2">Account</h2>
        <p className="text-sm text-muted-foreground">
          Signed in as <strong>{account?.email}</strong>
        </p>
      </div>
    </div>
  );
}
