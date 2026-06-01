import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types/api';

type AuthState = {
  user: User | null;
  setUser: (u: User | null) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (u) => set({ user: u }),
      clear: () => set({ user: null }),
    }),
    {
      name: 'variantum-auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
