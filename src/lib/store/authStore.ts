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
  /** Starts (or resumes) an anonymous Supabase session so a guest can play
   * modes that need a real auth identity — chiefly online Head-to-Head, whose
   * tables key off auth.users and whose RLS checks auth.uid(). A local guest id
   * alone can't satisfy those. The auto-created profile is renamed to the
   * browser's guest id so the guest plays under the identity shown elsewhere.
   * Requires "Anonymous sign-ins" to be enabled in the Supabase dashboard. */
  signInAsGuest: (guestId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("profiles").select("id, username").eq("id", userId).single();
  return data ?? null;
}

function isAnonymous(user: User | null): boolean {
  return Boolean((user as { is_anonymous?: boolean } | null)?.is_anonymous);
}

export const useAuthStore = create<AuthState>()((set, get) => {
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
      const redirect = typeof window !== "undefined" ? window.location.origin : undefined;

      // If a guest is already playing, LINK the email to their existing
      // anonymous account rather than starting a fresh one — this keeps the
      // same auth uid, so all their season results, H2H ladder rows and
      // profile carry straight over once they confirm the email. A brand-new
      // OTP sign-in would instead strand that guest history under an orphaned
      // anonymous id.
      if (isAnonymous(get().user)) {
        const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirect });
        if (error) {
          set({ authError: error.message });
          return;
        }
        set({ magicLinkSentTo: email });
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirect },
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
      const redirect = typeof window !== "undefined" ? window.location.origin : undefined;

      // A guest linking an OAuth identity keeps their anonymous uid (and all
      // their history/ladder rows); a fresh sign-in would strand it. Both
      // redirect the browser to the provider's consent screen and back —
      // errors here are almost always "this provider isn't enabled in the
      // Supabase dashboard yet," not a bug in this call.
      const { error } = isAnonymous(get().user)
        ? await supabase.auth.linkIdentity({ provider, options: { redirectTo: redirect } })
        : await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirect } });
      if (error) set({ authError: error.message });
    },

    signInAsGuest: async (guestId) => {
      if (!supabase) {
        set({ authError: "Accounts aren't configured for this app yet." });
        return;
      }
      set({ authError: null });
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user) {
        // The most common cause is "Anonymous sign-ins are disabled" — a
        // Supabase dashboard toggle, not a bug here.
        set({ authError: error?.message ?? "Couldn't start a guest session." });
        return;
      }
      // The signup trigger created a profile named `player_<id>`; rename it to
      // the browser's guest id so the ladder shows their guest identity.
      // Best-effort: a unique-name clash just leaves the default name.
      await supabase.from("profiles").update({ username: guestId }).eq("id", data.user.id);
      // onAuthStateChange already set user + the pre-rename profile; refetch so
      // the store reflects the new username (this call resolves last and wins).
      const profile = await fetchProfile(data.user.id);
      set({ hasLoaded: true, user: data.user, profile });
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
