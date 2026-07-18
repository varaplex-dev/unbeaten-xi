import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HowToPlayPage() {
  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight mb-6">How to Play</h1>
      <ol className="space-y-4 text-foreground-muted list-decimal list-inside">
        <li>Draft 11 players, one per round, from randomized categories.</li>
        <li>Build a legal XI: a wicketkeeper, enough bowling options, a pace bowler, and a spinner.</li>
        <li>Set your batting order, bowling roles, captain, and Impact Player.</li>
        <li>Simulate a 14-match T20 league season and make key match decisions.</li>
        <li>Finish undefeated — or as close to it as you can — and share your result.</li>
      </ol>
      <Link href="/play" className="inline-block mt-8">
        <Button>Start Drafting</Button>
      </Link>
    </main>
  );
}
