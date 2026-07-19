import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight mb-6">About The Unbeaten XI</h1>
      <div className="space-y-4 text-foreground-muted text-sm">
        <p className="text-base font-semibold text-foreground">
          Build your ultimate cricket team and see if your squad has what it
          takes to go undefeated.
        </p>
        <p>
          The Unbeaten XI is a fast-paced cricket team-building game where
          every decision matters. Choose players from the world&apos;s top
          cricket leagues, balance your batting and bowling lineup, assign the
          right roles, and create a complete XI built to dominate.
        </p>
        <p>
          Once your team is ready, simulate the season and find out whether
          your lineup can achieve the perfect unbeaten record. Compete for
          high scores, challenge your friends, unlock new players, and share
          your best XI with cricket fans around the world.
        </p>
        <p>
          Whether you prefer explosive openers, dependable all-rounders,
          dangerous fast bowlers, or elite spin attacks, every team you build
          creates a new challenge.
        </p>
        <p className="text-base font-semibold text-foreground">
          Build your XI. Simulate the season. Stay unbeaten.
        </p>
        <p className="pt-2 text-xs text-foreground-muted">
          The Unbeaten XI is a Varaplex Studios game.
        </p>
      </div>
      <Link href="/settings" className="inline-block mt-8 text-accent underline underline-offset-4">
        Back to Settings
      </Link>
    </main>
  );
}
