import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

export interface Profile {
  id: string;
  username: string;
}

interface AuthState {
  /** False until the initial getSession() check (and any stored session)
   * has resolved, so sign-in UI doesn't flash before we know the answer. */
  hasLoaded: boolean;
  user: User | null;
  profile: Profile | null;
  /** Set right after requestMagicLink() succeeds; cleared on any auth
   * state change. Lets the UI show "check your email" without extra state. */
  magicLinkSentTo: string | null;
  authError: string | null;
  requestMagicLink: (email: string) => Promise<void>;
  signInWithOAuth: (provider: "google" | "facebook") => Promise<void>;
  signOut: () => Promise<void>;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("profiles").select("id, username").eq("id", userId).single();
  return data ?? null;
}

export const useAuthStore = create<AuthState>()((set) => {
  if (isSupabaseConfigured && supabase) {
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user ?? null;
      const profile = user ? await fetchProfile(user.id) : null;
      set({ hasLoaded: true, user, profile });
    });

    supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      const profile = user ? await fetchProfile(user.id) : null;
      set({ hasLoaded: true, user, profile, magicLinkSentTo: null });
    });
  }

  return {
    // Accounts are opt-in: with no Supabase project configured there is no
    // session to wait for, so the app should never block on hasLoaded.
    hasLoaded: !isSupabaseConfigured,
    user: null,
    profile: null,
    magicLinkSentTo: null,
    authError: null,

    requestMagicLink: async (email) => {
      if (!supabase) {
        set({ authError: "Accounts aren't configured for this app yet." });
        return;
      }
      set({ authError: null });
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      });
      if (error) {
        set({ authError: error.message });
        return;
      }
      set({ magicLinkSentTo: email });
    },

    signInWithOAuth: async (provider) => {
      if (!supabase) {
        set({ authError: "Accounts aren't configured for this app yet." });
        return;
      }
      set({ authError: null });
      // Redirects the browser away to the provider's consent screen and
      // back — errors here are almost always "this provider isn't enabled
      // in the Supabase dashboard yet," not a bug in this call.
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      });
      if (error) set({ authError: error.message });
    },

    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
      set({ user: null, profile: null });
    },
  };
});

export function useIsSignedIn(): boolean {
  return useAuthStore((s) => Boolean(s.user));
}
