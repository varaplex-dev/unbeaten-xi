import Link from "next/link";

// Placeholder contact page — the user will fill in real contact details
// (support email, socials, form) later. Linked from the top-nav menu.
export default function ContactPage() {
  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight mb-6">Contact Us</h1>
      <div className="space-y-4 text-foreground-muted text-sm">
        <p className="text-base font-semibold text-foreground">
          We&apos;d love to hear from you.
        </p>
        <p>
          Questions, feedback, bug reports, or partnership ideas — get in touch
          and we&apos;ll get back to you.
        </p>
        <div className="rounded-2xl border border-border bg-background-elevated/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground-muted">
            Email
          </p>
          <p className="mt-1 text-base font-semibold text-foreground">
            {/* TODO: replace with the real support address */}
            hello@unbeatengame.com
          </p>
          <p className="mt-4 text-xs text-foreground-muted">
            More contact options coming soon.
          </p>
        </div>
        <p className="pt-2 text-xs text-foreground-muted">
          The Unbeaten XI is a Varaplex Studios game.
        </p>
      </div>
      <Link href="/" className="inline-block mt-8 text-accent underline underline-offset-4">
        Back to Home
      </Link>
    </main>
  );
}
