"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PosterShell } from "@/components/brand/PosterShell";
import { useGameStore, type GameMode } from "@/lib/store/gameStore";

// Every playable mode uses real players (see realPlayers.ts and
// legendPlayers.ts) — the old fictional roster/engine still exists in the
// codebase but is no longer reachable from any UI entry point.

interface ModeDef {
  id: string;
  name: string;
  description: string;
  available: boolean;
  gameMode?: GameMode;
}

const MODES: ModeDef[] = [
  {
    id: "all-time-xi",
    name: "All-Time XI",
    description:
      "Spin to land on a real historic squad, current national team, or an actual past-season IPL/BBL/PSL franchise roster — then pick one player from it. Real players, real stats. See if you can go 14-0.",
    available: true,
    gameMode: "all-time-real",
  },
  { id: "chase-200", name: "Chase 200", description: "One high-pressure run chase.", available: false },
  { id: "defend-160", name: "Defend 160", description: "Defend a target with the ball.", available: false },
  { id: "world-cup-run", name: "World Cup Run", description: "A knockout tournament format.", available: false },
  { id: "test-invincibles", name: "Test Invincibles", description: "A five-day format challenge.", available: false },
  { id: "india-xi", name: "India XI", description: "Indian players only.", available: false },
  { id: "auction-mode", name: "Auction Mode", description: "Bid for players with a salary cap.", available: false },
  { id: "head-to-head", name: "Head-to-Head Challenge", description: "Compare your XI against a friend's.", available: false },
];

export default function PlayPage() {
  const router = useRouter();
  const spinEraTeam = useGameStore((s) => s.spinEraTeam);

  function handleSpin(mode: ModeDef) {
    if (!mode.available || !mode.gameMode) return;
    spinEraTeam();
    router.push("/squad-select");
  }

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell kicker="11 Not Out">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-stack-shadow text-4xl font-black italic tracking-tight mb-1">
            Choose a Mode
          </h1>
          <p className="text-foreground-muted mb-8">
            More modes are on the way. Every squad is spun together from
            real players — current stars, all-time legends, and actual
            franchise-season rosters — using their real career stats.
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
                      <Button size="sm" onClick={() => handleSpin(mode)}>
                        Spin
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
