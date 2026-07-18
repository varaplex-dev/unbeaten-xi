// Analytics abstraction: every call site imports `track()` from here, never
// a specific provider. Swap NoopAnalyticsAdapter for a real one (PostHog,
// Plausible, GA, etc.) via setAnalyticsAdapter() once one is chosen — no
// call sites need to change.
export type AnalyticsEvent =
  | "game_started"
  | "new_game_started"
  | "draft_round_viewed"
  | "player_selected"
  | "draft_completed"
  | "lineup_completed"
  | "season_started"
  | "match_decision_made"
  | "season_completed"
  | "result_shared"
  | "daily_challenge_started"
  | "daily_challenge_completed";

export interface AnalyticsAdapter {
  track(event: AnalyticsEvent, properties?: Record<string, unknown>): void;
}

class NoopAnalyticsAdapter implements AnalyticsAdapter {
  track() {
    // Intentionally empty. Replace via setAnalyticsAdapter() when a real
    // analytics provider is wired in.
  }
}

let adapter: AnalyticsAdapter = new NoopAnalyticsAdapter();

export function setAnalyticsAdapter(next: AnalyticsAdapter): void {
  adapter = next;
}

export function track(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
  adapter.track(event, properties);
}
