import Link from "next/link";

// Real privacy policy (replaces the earlier placeholder). Kept as plain English
// so it stays the single authoritative version; it must stay consistent with
// the Google Play "Data safety" declaration. If the data practices change
// (new SDKs, ads, new collected fields), update this AND the Play form together.
export const metadata = {
  title: "Privacy Policy — The Unbeaten Game",
  description:
    "How The Unbeaten Game handles your data: what is collected, how it is used, and how to delete it.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-xs text-foreground-muted">Last updated: 21 September 2026</p>

      <div className="mt-6 space-y-3 text-sm text-foreground-muted">
        <p>
          The Unbeaten Game (&ldquo;the app&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a cricket
          team-building game published by Varaplex Studios. This policy explains what information the
          app collects, how it is used, and the choices you have. By using the app you agree to this
          policy.
        </p>
        <p>
          We built the app to work with as little personal data as possible: you can play the entire
          single-player game as a guest, without an account.
        </p>
      </div>

      <Section title="Information we collect">
        <p className="text-sm text-foreground-muted">
          <strong className="text-foreground">Playing as a guest.</strong> Your game progress — your
          drafts, lineups, settings, and season results — is stored locally in your browser or device
          and is not sent to us. To make online features work, we create an{" "}
          <em>anonymous account</em> with a randomly generated ID. This ID is not linked to your name,
          email, or any personal detail.
        </p>
        <p className="text-sm text-foreground-muted">
          <strong className="text-foreground">If you create an account.</strong> If you choose to
          sign in — by email sign-in link, Google, or Facebook — we collect your{" "}
          <strong className="text-foreground">email address</strong> and a display name in order to
          save your results, place you on the leaderboard, and let you play Head-to-Head. Sign-in and
          account storage are handled by our provider, Supabase.
        </p>
        <p className="text-sm text-foreground-muted">
          <strong className="text-foreground">Head-to-Head matches.</strong> When you play online
          against another player, your display name and the team you draft (and any in-match chat you
          send) are shared with your opponent and stored to run and score the match.
        </p>
        <p className="text-sm text-foreground-muted">
          <strong className="text-foreground">Usage analytics.</strong> We use Vercel Web Analytics to
          understand aggregate usage — such as page views, approximate country, device type, and the
          site that referred you. This is privacy-friendly and does not use cookies or build a profile
          of you; it is not tied to your identity.
        </p>
        <p className="text-sm text-foreground-muted">
          <strong className="text-foreground">Cricket statistics.</strong> Real player ratings and
          career statistics shown in the game come from public cricket data sources. No personal
          information about you is shared with those sources.
        </p>
      </Section>

      <Section title="How we use your information">
        <ul className="list-disc pl-5 text-sm text-foreground-muted space-y-1">
          <li>To run the game and save your progress and results.</li>
          <li>To operate accounts, leaderboards, and online Head-to-Head matches.</li>
          <li>To understand, in aggregate, how the app is used so we can improve it.</li>
          <li>To keep the service secure and prevent abuse.</li>
        </ul>
      </Section>

      <Section title="How your information is shared">
        <p className="text-sm text-foreground-muted">
          We do <strong className="text-foreground">not</strong> sell your personal information. We
          share data only with the service providers that run the app on our behalf:
        </p>
        <ul className="list-disc pl-5 text-sm text-foreground-muted space-y-1">
          <li>
            <strong className="text-foreground">Supabase</strong> — authentication, account, and
            game/match data storage.
          </li>
          <li>
            <strong className="text-foreground">Vercel</strong> — hosting and privacy-friendly
            analytics.
          </li>
          <li>
            <strong className="text-foreground">Your opponent</strong>, in Head-to-Head — your display
            name, drafted team, and any chat you send during the match.
          </li>
        </ul>
        <p className="text-sm text-foreground-muted">
          We may also disclose information if required by law.
        </p>
      </Section>

      <Section title="Data retention and deletion">
        <p className="text-sm text-foreground-muted">
          Guest progress lives in your browser/device and is removed when you clear your browser data.
          If you created an account, you can ask us to delete your account and associated data at any
          time by emailing{" "}
          <a href="mailto:hello@unbeatengame.com" className="text-accent underline underline-offset-4">
            hello@unbeatengame.com
          </a>
          . We will delete it within a reasonable period, except where we must keep certain records to
          comply with the law.
        </p>
      </Section>

      <Section title="Security">
        <p className="text-sm text-foreground-muted">
          Data is transmitted over encrypted HTTPS connections, and account access is managed by our
          authentication provider. No method of transmission or storage is completely secure, but we
          take reasonable measures to protect your information.
        </p>
      </Section>

      <Section title="Children's privacy">
        <p className="text-sm text-foreground-muted">
          The app is intended for users aged 13 and older and is not directed at children under 13. We
          do not knowingly collect personal information from children under 13. If you believe a child
          has provided us personal information, contact us and we will delete it.
        </p>
      </Section>

      <Section title="International users">
        <p className="text-sm text-foreground-muted">
          The app is operated using service providers that may process and store data in countries
          other than your own. By using the app, you consent to this processing.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p className="text-sm text-foreground-muted">
          We may update this policy from time to time. Material changes will be reflected by updating
          the &ldquo;Last updated&rdquo; date above, and where appropriate we will provide additional
          notice.
        </p>
      </Section>

      <Section title="Contact">
        <p className="text-sm text-foreground-muted">
          Questions about this policy or your data? Email{" "}
          <a href="mailto:hello@unbeatengame.com" className="text-accent underline underline-offset-4">
            hello@unbeatengame.com
          </a>
          .
        </p>
      </Section>

      <Link
        href="/settings"
        className="inline-block mt-10 text-accent underline underline-offset-4"
      >
        Back to Settings
      </Link>
    </main>
  );
}
