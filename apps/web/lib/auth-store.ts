'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Account, InfluencerProfile, Subscription } from '@influencerapp/shared-types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  account: Omit<Account, 'stripeCustomerId'> | null;
  influencerProfile: InfluencerProfile | null;
  subscriptions: Subscription[];
  setAuth: (tokens: { accessToken: string; refreshToken: string }, account: Omit<Account, 'stripeCustomerId'>, influencerProfile?: InfluencerProfile | null) => void;
  setSubscriptions: (subs: Subscription[]) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      account: null,
      influencerProfile: null,
      subscriptions: [],
      setAuth: (tokens, account, influencerProfile = null) =>
        set({ ...tokens, account, influencerProfile }),
      setSubscriptions: (subscriptions) => set({ subscriptions }),
      clearAuth: () =>
        set({ accessToken: null, refreshToken: null, account: null, influencerProfile: null, subscriptions: [] }),
    }),
    { name: 'influencerapp-auth' }
  )
);
