import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function Metric({ name, impact }: { name: string; impact: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="shrink-0 font-semibold text-foreground">{name}</span>
      <span className="text-right text-sm text-foreground-muted">{impact}</span>
    </div>
  );
}

export default function HowToPlayPage() {
  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight mb-1">How to Play</h1>
      <p className="text-foreground-muted mb-8">
        The objective of The Unbeaten XI is to assemble a real cricket XI —
        spun together one player at a time from real teams — capable of an
        unbeaten 14-match season. Your result is decided by a simulation
        engine that runs your squad&apos;s actual career stats against a full
        schedule, not an abstract rating.
      </p>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>1. Every Pick Comes From a Spin</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-2">
            <p>
              Hit <span className="font-semibold text-foreground">Spin</span>{" "}
              and the wheel lands on a real team — a specific past season of
              an IPL, BBL, or PSL franchise, a great historic national side,
              or a current national squad. Pick exactly one player from that
              team&apos;s actual roster.
            </p>
            <p>
              Picking doesn&apos;t lock in their spot — you then tap an open
              slot on the field to place them in your batting order. That
              choice is real: the top of the order carries more weight in the
              season simulation than the tail, so where you put a strong
              batter matters, not just who you pick.
            </p>
            <p>
              Spin again for your next pick and you&apos;ll land on a
              completely different team — no two picks in your XI can come
              from the same squad. Repeat until all 11 spots are filled, then
              spin once more for an optional 12th player, your Impact Player
              (or skip it and lock in your XI as-is).
            </p>
            <p>There&apos;s no reroll — once you land on a team, you&apos;re choosing from that roster.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Real Stats, Not Ratings</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-3">
            <p>
              Every player card shows their actual career numbers, and the
              simulation reads those numbers directly — there&apos;s no
              hidden 0-99 rating standing in for them. Four numbers drive the
              engine:
            </p>
            <div>
              <Metric name="Batting Average" impact="Reliability — how often a big score turns into a real score." />
              <Metric name="Strike Rate" impact="Raw scoring pace, the backbone of your batting output." />
              <Metric name="Bowling Average" impact="Wicket-taking threat — how often your attack breaks a partnership." />
              <Metric name="Economy Rate" impact="Run suppression — how tightly your attack can squeeze an over." />
            </div>
            <p>
              A 1980s Test average and a 2020s IPL strike rate aren&apos;t
              directly comparable numbers, so before any of this feeds the
              simulation, each stat is read relative to what a genuinely
              good player looks like in that player&apos;s own format and
              era, then mapped onto a common scale. A legend picked from a
              1990s national side and a star pulled from last season&apos;s
              IPL squad compete on fair terms.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. The 14-Match Season</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-2">
            <p>
              Once your XI is set, the engine simulates 14 matches from your
              squad&apos;s combined batting and bowling strength. The
              relationship between team strength and wins isn&apos;t
              linear — each additional win gets harder to earn as your
              squad&apos;s output climbs, so a genuinely unbeaten 14-0 season
              takes real strength across{" "}
              <span className="font-semibold text-foreground">both</span>{" "}
              batting and bowling at once. A stacked batting order with no
              bowling attack behind it will still drop matches.
            </p>
            <p>
              Along the way you&apos;ll make in-match calls — how to attack
              with the ball, when to bring on your Impact Player — that shift
              individual results on the margins.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Squad Requirements</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-2">
            <p>Before you can simulate, your XI needs:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>At least one wicketkeeper</li>
              <li>At least 4 bowling options</li>
              <li>At least one specialist pace bowler</li>
              <li>At least one specialist spinner</li>
              <li>An explicit captain (and a wicketkeeper set, if you drafted one)</li>
            </ul>
            <p>
              Since every player comes from a different team by construction,
              there&apos;s no overseas-quota limit here — mix players from as
              many countries as you spin into.
            </p>
            <p className="pt-1">
              A realistic XI generally breaks down as{" "}
              <span className="font-semibold text-foreground">2 openers</span>,{" "}
              <span className="font-semibold text-foreground">3 middle-order batters</span>,{" "}
              <span className="font-semibold text-foreground">1 wicketkeeper-batter</span>,{" "}
              <span className="font-semibold text-foreground">2 all-rounders</span>, and{" "}
              <span className="font-semibold text-foreground">3 specialist bowlers</span> — the
              field&apos;s 11 batting slots are labeled with that structure as a guide, though
              nothing stops you placing a player anywhere you choose.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. The Slot Machine</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-2">
            <p>
              Each spin runs two reels at once — Team and Era — that land
              together on one real combination, like &ldquo;Islamabad
              United, PSL 2022&rdquo; or &ldquo;West Indies, 1980s.&rdquo;
              That reveals the actual roster you&apos;re picking from: every
              player who suited up for that team that season.
            </p>
            <p>The pool spans three kinds of teams:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Real past-season IPL, BBL, and PSL franchise rosters</li>
              <li>Great historic national sides from cricket history</li>
              <li>Current national squads, as they stand today</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Leaderboards</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-2">
            <p>
              Sign in and every season you complete is tracked automatically
              across four boards:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <span className="font-semibold text-foreground">All-Time</span> — your best-ever result.
              </li>
              <li>
                <span className="font-semibold text-foreground">Monthly</span> — resets every month, your
                best result since the 1st.
              </li>
              <li>
                <span className="font-semibold text-foreground">Weekly</span> — resets every week, your
                best result since Monday.
              </li>
              <li>
                <span className="font-semibold text-foreground">Daily</span> — everyone plays the same
                seed on the same day, so it&apos;s a fair head-to-head.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/play">
          <Button>Start Spinning</Button>
        </Link>
        <Badge variant="accent">Real players. Real stats. Go 14-0.</Badge>
      </div>
    </main>
  );
}
