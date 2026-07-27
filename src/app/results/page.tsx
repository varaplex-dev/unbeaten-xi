"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PosterShell } from "@/components/brand/PosterShell";
import { ShareMenu } from "@/components/results/ShareMenu";
import { useGameStore } from "@/lib/store/gameStore";
import { useAuthStore } from "@/lib/store/authStore";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { getPlayerById } from "@/lib/data/players";
import { getRealPoolPlayerById } from "@/lib/data/gameData";
import { useGameDataReady } from "@/lib/data/useGameData";
import { seasonPoints } from "@/lib/engine/seasonPoints";
import type { MatchResult, DecisionOutcomeKind } from "@/lib/engine/simulate";
import type { PitchType } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TranslationKey } from "@/lib/i18n";

// The eight pitch types the sim can produce, mapped to their dictionary keys
// so the match log renders the pitch in the active language.
const PITCH_KEY: Record<PitchType, TranslationKey> = {
  "flat-batting": "sim.pitch.flatBatting",
  "slow-turning": "sim.pitch.slowTurning",
  "pace-and-bounce": "sim.pitch.paceBounce",
  "swing-friendly": "sim.pitch.swingFriendly",
  "dry-surface": "sim.pitch.drySurface",
  "high-scoring-small-ground": "sim.pitch.smallGround",
  "large-boundaries": "sim.pitch.largeBoundaries",
  "heavy-dew-night": "sim.pitch.heavyDew",
};

// The Hardcore in-match decision outcome (engine-emitted) → its result line.
const DECISION_RESULT_KEY: Record<DecisionOutcomeKind, TranslationKey> = {
  "pace-spin-good": "sim.dec.paceSpinGood",
  "pace-spin-bad": "sim.dec.paceSpinBad",
  "defend-good": "sim.dec.defendGood",
  "defend-bad": "sim.dec.defendBad",
  "impact-good": "sim.dec.impactGood",
  "impact-bad": "sim.dec.impactBad",
  "impact-hold": "sim.dec.impactHold",
};

/** Fills {placeholders} in a translated string, so word order around the
 * values is free per language. */
function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(String(value)),
    template
  );
}

// Postgres unique_violation — the Daily Challenge has one row per user per
// day (see season_results_one_daily_per_user in supabase/schema.sql). A
// re-submit on revisit isn't an error from the user's point of view.
const UNIQUE_VIOLATION = "23505";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background-elevated px-3 py-3 text-center">
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
        {label}
      </p>
    </div>
  );
}

export default function ResultsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const dataReady = useGameDataReady();
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const seed = useGameStore((s) => s.seed);
  const mode = useGameStore((s) => s.mode);
  const isDaily = useGameStore((s) => s.isDaily);
  const stats = useGameStore((s) => s.seasonStats);
  const matches = useGameStore((s) => s.matchResults);
  const draftPicks = useGameStore((s) => s.draftPicks);
  const resultSaved = useGameStore((s) => s.resultSaved);
  const markResultSaved = useGameStore((s) => s.markResultSaved);
  const startNewGame = useGameStore((s) => s.startNewGame);
  const spinEraTeam = useGameStore((s) => s.spinEraTeam);
  const usedEraTeamIds = useGameStore((s) => s.usedEraTeamIds);
  const competition = useGameStore((s) => s.competition);
  const user = useAuthStore((s) => s.user);
  const lookupPlayer = (id: string) =>
    mode === "all-time-real" ? getRealPoolPlayerById(id) : getPlayerById(id);

  // Render the engine-generated match strings in the active language. Results
  // saved before the structured fields existed fall back to the stored English.
  const marginText = (m: MatchResult) =>
    m.marginType != null && m.marginValue != null
      ? fill(t(m.marginType === "wickets" ? "sim.marginWickets" : "sim.marginRuns"), { n: m.marginValue })
      : m.margin;
  const summaryText = (m: MatchResult) =>
    m.marginType != null
      ? fill(t(m.result === "win" ? "sim.matchWin" : "sim.matchLoss"), {
          opponent: m.opponent,
          margin: marginText(m),
          star: lookupPlayer(m.playerOfMatchId)?.shortName ?? "",
        })
      : m.summary;
  const pitchText = (m: MatchResult) => (m.pitchType ? t(PITCH_KEY[m.pitchType]) : m.pitch);
  const decisionText = (d: NonNullable<MatchResult["decision"]>) =>
    d.outcome
      ? fill(t(DECISION_RESULT_KEY[d.outcome]), { name: d.subjectName ?? "" })
      : d.resultLabel;
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const isSaving = Boolean(isSupabaseConfigured && user && stats && !resultSaved && saveStatus === "idle");

  const shareText = useMemo(() => {
    if (!stats) return "";
    const record = `${stats.wins}-${stats.losses}`;
    // The challenge quotes the length actually played — a World Cup run is
    // 9 matches, so daring someone to "go 14-0" off a 9-match season would
    // be simply wrong.
    const perfect = `${stats.wins + stats.losses}-0`;
    return fill(t(stats.losses === 0 ? "res.shareUnbeaten" : "res.shareFinished"), { record, perfect });
  }, [stats, t]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user || !stats || resultSaved) return;
    supabase
      .from("season_results")
      .insert({
        user_id: user.id,
        mode,
        // Which competition this was — each has its own leaderboard, since a
        // 9-match World Cup can't be ranked against a 14-match league by wins.
        competition,
        is_daily: isDaily,
        seed,
        wins: stats.wins,
        losses: stats.losses,
        team_rating_out_of_100: stats.teamRatingOutOf100,
        net_run_rate: stats.netRunRate,
        draft_picks: draftPicks,
        match_results: matches,
        season_stats: stats,
      })
      .then(({ error }) => {
        if (!error || error.code === UNIQUE_VIOLATION) {
          markResultSaved();
          setSaveStatus("saved");
        } else {
          setSaveStatus("error");
        }
      });
  }, [user, stats, resultSaved, mode, competition, isDaily, seed, draftPicks, matches, markResultSaved]);

  if (!hasHydrated) return null;

  // The real/legend/national pools load lazily; hold the player-detail render
  // until they're in so nothing resolves to "—" (fictional mode is static).
  if (mode === "all-time-real" && !dataReady) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-foreground-muted">{t("lb.loading")}</p>
      </main>
    );
  }

  if (!seed || !stats) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-foreground-muted mb-4">{t("res.noResult")}</p>
        <Link href="/play">
          <Button>{t("res.startDraft")}</Button>
        </Link>
      </main>
    );
  }

  const mvp = lookupPlayer(stats.mvpPlayerId);
  const runScorer = lookupPlayer(stats.leadingRunScorer.playerId);
  const wicketTaker = lookupPlayer(stats.leadingWicketTaker.playerId);
  const bestPick = lookupPlayer(stats.bestPickPlayerId);
  const weakestPick = lookupPlayer(stats.weakestPickPlayerId);
  const unbeaten = stats.losses === 0;

  function handlePlayAgain() {
    // A spin-drafted squad (usedEraTeamIds non-empty) was built by spinning
    // into a fresh team per pick, not the category-based draft — Play Again
    // should hand the user straight into another spin, not the old picker.
    if (usedEraTeamIds.length > 0) {
      // Replay the SAME competition — otherwise finishing a 9-match World Cup
      // Run and hitting Play Again silently dropped you into a 14-match league
      // drawing from franchises, since spinEraTeam() defaults to league-major.
      spinEraTeam(competition);
      router.push("/squad-select");
    } else {
      startNewGame({ mode });
      router.push("/draft");
    }
  }

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell kicker={unbeaten ? t("res.unbeatenKicker") : t("res.completeKicker")}>
        <div className="text-center">
          <p className="text-sm font-bold tracking-[0.35em] text-saffron uppercase mb-1">
            {t("res.finalRecord")}
          </p>
          <h1 className="text-stack-shadow text-7xl font-black italic tracking-tight sm:text-8xl">
            {stats.wins}-{stats.losses}
          </h1>
          <p
            className={`text-stack-shadow -mt-1 text-2xl font-black italic tracking-tight sm:text-3xl ${
              unbeaten ? "text-accent" : "text-foreground"
            }`}
          >
            {unbeaten ? t("res.unbeatenXi") : t("res.seasonComplete")}
          </p>
          <p className="mt-2 text-sm text-foreground-muted">
            {fill(t("res.betterThan"), { pct: stats.percentile })}
          </p>
          <p className="mt-4 text-sm font-bold uppercase tracking-[0.2em] text-gold">
            {fill(t("res.points"), {
              n: seasonPoints(stats.wins, stats.losses, stats.netRunRate).toLocaleString("en-US"),
            })}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-2">
          <StatTile label={t("res.teamRating")} value={String(stats.teamRatingOutOf100)} />
          <StatTile label={t("res.netRunRate")} value={stats.netRunRate.toFixed(2)} />
          <StatTile label={t("res.highestScore")} value={String(stats.highestScore)} />
          <StatTile label={t("res.bestChase")} value={stats.bestChase !== null ? String(stats.bestChase) : "—"} />
          <StatTile
            label={t("res.lowestDefended")}
            value={stats.lowestDefendedScore !== null ? String(stats.lowestDefendedScore) : "—"}
          />
          <StatTile label={t("res.runsFor")} value={String(stats.totalRunsFor)} />
        </div>

        <div className="mt-6 grid gap-2">
          <Card>
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground-muted">{t("res.orangeCap")}</span>
              <span className="font-semibold">
                {runScorer?.name ?? "—"} <span className="text-foreground-muted">({stats.leadingRunScorer.runs})</span>
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground-muted">{t("res.purpleCap")}</span>
              <span className="font-semibold">
                {wicketTaker?.name ?? "—"}{" "}
                <span className="text-foreground-muted">({stats.leadingWicketTaker.wickets})</span>
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground-muted">{t("res.mvp")}</span>
              <span className="font-semibold">{mvp?.name ?? "—"}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground-muted">{t("res.bestPick")}</span>
              <span className="font-semibold">{bestPick?.name ?? "—"}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground-muted">{t("res.weakestPick")}</span>
              <span className="font-semibold">{weakestPick?.name ?? "—"}</span>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <ShareMenu
            shareText={shareText}
            wins={stats.wins}
            losses={stats.losses}
            teamRating={stats.teamRatingOutOf100}
            netRunRate={stats.netRunRate}
            mvpName={mvp?.name ?? null}
          />
          <Button size="lg" variant="secondary" onClick={handlePlayAgain} className="w-full sm:w-auto">
            {t("res.playAgain")}
          </Button>
        </div>

        {user && (
          <p className="mt-3 text-center text-xs text-foreground-muted">
            {isSaving && t("res.saving")}
            {saveStatus === "saved" && t("res.saved")}
            {saveStatus === "error" && t("res.saveError")}
          </p>
        )}

        <h2 className="mt-10 mb-3 text-lg font-bold tracking-tight">{t("res.matchLog")}</h2>
        <div className="grid gap-2">
          {matches.map((m) => (
            <div
              key={m.matchNumber}
              className="rounded-xl border border-border bg-background-elevated px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-foreground-muted">
                  {fill(t("res.matchVs"), { n: m.matchNumber, opp: m.opponent })}
                </span>
                <Badge variant={m.result === "win" ? "accent" : "danger"}>
                  {m.result === "win" ? t("res.recordWin") : t("res.recordLoss")} &middot; {marginText(m)}
                </Badge>
              </div>
              <p className="mt-1 text-sm">{summaryText(m)}</p>
              {m.decision && (
                <p className="mt-1 text-xs text-gold">{decisionText(m.decision)}</p>
              )}
              <p className="mt-1 text-xs text-foreground-muted">
                {pitchText(m)} &middot; {m.city}
              </p>
            </div>
          ))}
        </div>
      </PosterShell>
    </main>
  );
}
