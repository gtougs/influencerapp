'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import type { AuthResponse } from '@influencerapp/shared-types';

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({
    email: '', password: '', displayName: '', handle: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post<AuthResponse>('/v1/auth/register', {
        ...form,
        role: 'influencer',
      });
      setAuth({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.account);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-lg border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Become a Creator</h1>
          <p className="text-muted-foreground mt-1">$50/month — share your plans with your fans</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { id: 'displayName', label: 'Your Name', type: 'text', autocomplete: 'name' },
            { id: 'handle', label: 'Handle (e.g. johndoe)', type: 'text', autocomplete: 'username' },
            { id: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
            { id: 'password', label: 'Password (8+ chars)', type: 'password', autocomplete: 'new-password' },
          ].map(({ id, label, type, autocomplete }) => (
            <div key={id} className="space-y-2">
              <label htmlFor={id} className="text-sm font-medium">{label}</label>
              <input
                id={id}
                type={type}
                value={(form as any)[id]}
                onChange={update(id)}
                autoComplete={autocomplete}
                className="w-full px-3 py-2 border rounded-md bg-background"
                required
              />
            </div>
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create Creator Account'}
          </button>
        </form>

        <p className="text-sm text-center text-muted-foreground">
          Already have an account?{' '}
          <a href="/login" className="text-primary underline underline-offset-4">Sign in</a>
        </p>
      </div>
    </div>
  );
}
