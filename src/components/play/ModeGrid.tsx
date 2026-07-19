"use client";

import { useRouter } from "next/navigation";
import { Trophy, Target, Shield, Globe, CalendarDays, Flag, Gavel, Swords, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGameStore, type GameMode } from "@/lib/store/gameStore";
import { useTranslation } from "@/lib/i18n/useTranslation";

// Every playable mode uses real players (see realPlayers.ts and
// legendPlayers.ts) — the old fictional roster/engine still exists in the
// codebase but is no longer reachable from any UI entry point. Only
// All-Time XI is live for now; the rest are shown as a roadmap so the plan
// is visible, not because they're playable yet.

interface ModeDef {
  id: string;
  icon: LucideIcon;
  name: string;
  description: string;
  available: boolean;
  gameMode?: GameMode;
}

const MODES: ModeDef[] = [
  {
    id: "all-time-xi",
    icon: Trophy,
    name: "All-Time XI",
    description:
      "Spin to land on a real historic squad, current national team, or an actual past-season IPL/BBL/PSL franchise roster — then pick one player from it. Real players, real stats. See if you can go 14-0.",
    available: true,
    gameMode: "all-time-real",
  },
  { id: "chase-200", icon: Target, name: "Chase 200", description: "One high-pressure run chase.", available: false },
  { id: "defend-160", icon: Shield, name: "Defend 160", description: "Defend a target with the ball.", available: false },
  {
    id: "world-cup-run",
    icon: Globe,
    name: "World Cup Run",
    description: "A knockout tournament format.",
    available: false,
  },
  {
    id: "test-invincibles",
    icon: CalendarDays,
    name: "Test Invincibles",
    description: "A five-day format challenge.",
    available: false,
  },
  { id: "india-xi", icon: Flag, name: "India XI", description: "Indian players only.", available: false },
  {
    id: "auction-mode",
    icon: Gavel,
    name: "Auction Mode",
    description: "Bid for players with a salary cap.",
    available: false,
  },
  {
    id: "head-to-head",
    icon: Swords,
    name: "Head-to-Head Challenge",
    description: "Compare your XI against a friend's.",
    available: false,
  },
];

export function ModeGrid() {
  const router = useRouter();
  const spinEraTeam = useGameStore((s) => s.spinEraTeam);
  const { t } = useTranslation();

  function handleSpin(mode: ModeDef) {
    if (!mode.available || !mode.gameMode) return;
    spinEraTeam();
    router.push("/squad-select");
  }

  return (
    <div className="grid gap-4">
      {MODES.map((mode) => (
        <Card key={mode.id} className={!mode.available ? "opacity-60" : undefined}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <mode.icon className="h-5 w-5" />
              </div>
              <CardTitle>{mode.id === "all-time-xi" ? t("play.allTimeXi") : mode.name}</CardTitle>
            </div>
            {!mode.available && <Badge variant="gold">{t("play.comingSoon")}</Badge>}
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-4">
            <p className="text-sm text-foreground-muted">
              {mode.id === "all-time-xi" ? t("play.allTimeXiDesc") : mode.description}
            </p>
            {mode.available && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => handleSpin(mode)}>
                  {t("play.spin")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
