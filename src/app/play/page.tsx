"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PosterShell } from "@/components/brand/PosterShell";
import { useGameStore, type GameMode } from "@/lib/store/gameStore";

interface ModeDef {
  id: string;
  name: string;
  description: string;
  available: boolean;
  gameMode?: GameMode;
}

const MODES: ModeDef[] = [
  {
    id: "14-0-t20-league",
    name: "14-0 T20 League",
    description: "Draft an XI and try to go unbeaten through a 14-match league season.",
    available: true,
    gameMode: "fictional",
  },
  {
    id: "all-time-xi",
    name: "All-Time XI",
    description:
      "Draft real current stars from the IPL, Big Bash, PSL, and other major leagues worldwide — ratings built from real stats. See if you can go 14-0.",
    available: true,
    gameMode: "all-time-real",
  },
  { id: "chase-200", name: "Chase 200", description: "One high-pressure run chase.", available: false },
  { id: "defend-160", name: "Defend 160", description: "Defend a target with the ball.", available: false },
  { id: "world-cup-run", name: "World Cup Run", description: "A knockout tournament format.", available: false },
  { id: "test-invincibles", name: "Test Invincibles", description: "A five-day format challenge.", available: false },
  { id: "franchise-legends", name: "Franchise Legends", description: "Build a squad from one franchise's history.", available: false },
  { id: "india-xi", name: "India XI", description: "Indian players only.", available: false },
  { id: "auction-mode", name: "Auction Mode", description: "Bid for players with a salary cap.", available: false },
  { id: "head-to-head", name: "Head-to-Head Challenge", description: "Compare your XI against a friend's.", available: false },
];

export default function PlayPage() {
  const router = useRouter();
  const startNewGame = useGameStore((s) => s.startNewGame);
  const spinTheWheel = useGameStore((s) => s.spinTheWheel);

  function handleStart(mode: ModeDef) {
    if (!mode.available || !mode.gameMode) return;
    startNewGame({ mode: mode.gameMode });
    router.push("/draft");
  }

  function handleSpin(mode: ModeDef) {
    if (!mode.available || !mode.gameMode) return;
    spinTheWheel(mode.gameMode);
    router.push("/team-setup");
  }

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell kicker="11 Not Out">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-stack-shadow text-4xl font-black italic tracking-tight mb-1">
            Choose a Mode
          </h1>
          <p className="text-foreground-muted mb-8">
            More modes are on the way. Draft, auto-build your lineup, and
            simulate the season in one go — fictional or real players.
          </p>
          <div className="grid gap-4">
            {MODES.map((mode) => (
              <Card key={mode.id} className={!mode.available ? "opacity-60" : undefined}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <CardTitle>{mode.name}</CardTitle>
                  {!mode.available && <Badge variant="gold">Coming Soon</Badge>}
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-4">
                  <p className="text-sm text-foreground-muted">{mode.description}</p>
                  {mode.available && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="secondary" onClick={() => handleSpin(mode)}>
                        Spin the Wheel
                      </Button>
                      <Button size="sm" onClick={() => handleStart(mode)}>
                        Draft
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PosterShell>
    </main>
  );
}
