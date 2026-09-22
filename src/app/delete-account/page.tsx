"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/lib/store/authStore";

// Self-serve account deletion page. Google Play requires a reachable URL where a
// user can delete their own account and data (not just an email request), so
// this lives at a stable path: /delete-account. Kept English like the other
// static/legal pages (privacy, about, contact). The actual delete runs through
// authStore.deleteAccount() -> the delete_my_account RPC.
export default function DeleteAccountPage() {
  const hasLoaded = useAuthStore((s) => s.hasLoaded);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAnon = Boolean((user as { is_anonymous?: boolean } | null)?.is_anonymous);
  const label = profile?.username ?? (isAnon ? "your guest account" : "your account");

  async function onDelete() {
    setBusy(true);
    setError(null);
    const res = await deleteAccount();
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error ?? "Something went wrong. Please try again.");
  }

  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight">Delete your account</h1>

      {done ? (
        <div className="mt-6 rounded-2xl border border-accent/40 bg-background-elevated/70 p-5">
          <p className="text-base font-semibold text-foreground">Your account has been deleted.</p>
          <p className="mt-2 text-sm text-foreground-muted">
            Your account and all associated data have been permanently removed. Thanks for playing.
          </p>
          <Link href="/" className="mt-6 inline-block text-accent underline underline-offset-4">
            Back to Home
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-3 text-sm text-foreground-muted">
            <p>
              Deleting your account for <strong className="text-foreground">The Unbeaten Game</strong>{" "}
              is permanent and cannot be undone. It removes:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your account and sign-in identity (email or guest ID)</li>
              <li>Your profile and display name</li>
              <li>Your saved season results and leaderboard entries</li>
              <li>Your Head-to-Head match and ladder history</li>
            </ul>
            <p>
              Game progress kept only in this browser (as a guest) is also cleared when you clear your
              browser&apos;s site data.
            </p>
          </div>

          {!hasLoaded ? (
            <p className="mt-6 text-sm text-foreground-muted">Checking your account…</p>
          ) : user ? (
            <div className="mt-6 rounded-2xl border border-danger/40 bg-background-elevated/70 p-5">
              <p className="text-sm text-foreground">
                Signed in as <strong>{label}</strong>.
              </p>
              <label className="mt-4 flex items-start gap-3 text-sm text-foreground-muted">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[color:var(--danger)]"
                />
                <span>
                  I understand this permanently deletes my account and all of its data, and cannot be
                  undone.
                </span>
              </label>

              {error && <p className="mt-4 text-sm font-semibold text-danger">{error}</p>}

              <button
                type="button"
                disabled={!confirmed || busy}
                onClick={onDelete}
                className="mt-5 w-full rounded-xl bg-danger px-4 py-3 text-center font-bold text-white transition-opacity disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Delete my account permanently"}
              </button>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-border bg-background-elevated/70 p-5 text-sm text-foreground-muted">
              <p className="text-foreground font-semibold">You&apos;re not signed in on this device.</p>
              <p className="mt-2">
                To delete an account, open{" "}
                <Link href="/settings" className="text-accent underline underline-offset-4">
                  Settings
                </Link>{" "}
                and sign in (or start playing as a guest) on the device that holds the account, then
                return to this page. If you need help, contact{" "}
                <a
                  href="mailto:hello@unbeatengame.com"
                  className="text-accent underline underline-offset-4"
                >
                  hello@unbeatengame.com
                </a>
                .
              </p>
            </div>
          )}

          <Link href="/settings" className="mt-8 inline-block text-accent underline underline-offset-4">
            Back to Settings
          </Link>
        </>
      )}
    </main>
  );
}
