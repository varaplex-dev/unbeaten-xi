import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight mb-6">Privacy</h1>
      <div className="space-y-4 text-foreground-muted text-sm">
        <p>
          This is a placeholder privacy page for 14-0: Build the Unbeaten XI,
          a hobby project. It is not a substitute for a reviewed legal privacy
          policy before any public or commercial launch.
        </p>
        <p>
          Today, game progress (your draft, lineup, and season results) is
          stored only in your browser&apos;s local storage. Nothing is sent to
          a server unless you create an account and choose to save a result.
        </p>
        <p>
          Real player statistics used in All-Time XI mode are sourced from
          cricketdata.org. No personal data about you is shared with that
          service.
        </p>
        <p>
          If accounts and cloud saves are enabled, this page will be updated
          to describe what account data is collected, how long it&apos;s kept,
          and how to delete it, before that feature is made public.
        </p>
      </div>
      <Link href="/settings" className="inline-block mt-8 text-accent underline underline-offset-4">
        Back to Settings
      </Link>
    </main>
  );
}
