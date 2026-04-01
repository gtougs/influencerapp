import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { Account, InfluencerProfile, Subscription } from '@influencerapp/shared-types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  account: Omit<Account, 'stripeCustomerId'> | null;
  subscriptions: Subscription[];
  isHydrated: boolean;
  setAuth: (tokens: { accessToken: string; refreshToken: string }, account: Omit<Account, 'stripeCustomerId'>) => Promise<void>;
  setSubscriptions: (subs: Subscription[]) => void;
  clearAuth: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  account: null,
  subscriptions: [],
  isHydrated: false,

  setAuth: async (tokens, account) => {
    await SecureStore.setItemAsync('accessToken', tokens.accessToken);
    await SecureStore.setItemAsync('refreshToken', tokens.refreshToken);
    await SecureStore.setItemAsync('account', JSON.stringify(account));
    set({ ...tokens, account });
  },

  setSubscriptions: (subscriptions) => set({ subscriptions }),

  clearAuth: async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('account');
    set({ accessToken: null, refreshToken: null, account: null, subscriptions: [] });
  },

  hydrate: async () => {
    const [accessToken, refreshToken, accountJson] = await Promise.all([
      SecureStore.getItemAsync('accessToken'),
      SecureStore.getItemAsync('refreshToken'),
      SecureStore.getItemAsync('account'),
    ]);
    const account = accountJson ? JSON.parse(accountJson) : null;
    set({ accessToken, refreshToken, account, isHydrated: true });
  },
}));
