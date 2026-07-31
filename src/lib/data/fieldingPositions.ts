// Real cricket fielding positions + preset formations, per
// https://blog.networldsports.co.uk/cricket-fielding-positions-explained/ —
// used only in Hardcore Mode's field-setting screen.
//
// A fielding side is 11: the wicketkeeper (fixed behind the striker's stumps)
// and the bowler (fixed at the far end) are placed for you; the remaining NINE
// are the fielders you position. Rather than an even ring, real captains set an
// uneven, situational field, so we ship named PRESET FORMATIONS (attacking,
// balanced, defensive, powerplay, death) — each a realistic nine-position set —
// and let the user tap to swap players between spots.
//
// (x, y) are percentages on the oval ground graphic the board draws. The pitch
// runs vertically through the middle; the striker's (batsman's) end is toward
// the bottom (y≈70), the bowler's end near the top (y≈30). Coordinates assume a
// right-handed batter: the OFF side is screen-right (higher x), the LEG side
// screen-left (lower x).

export type FieldingSide = "off" | "leg";
export type FieldingZone = "catching" | "infield" | "boundary";
export type FormationId = "attacking" | "balanced" | "defensive" | "powerplay" | "death";

export interface FieldingPosition {
  id: string;
  name: string;
  short: string;
  side: FieldingSide;
  zone: FieldingZone;
  x: number;
  y: number;
}

// Canonical spot coordinates, referenced by the formations below.
const POS: Record<string, FieldingPosition> = {
  slip: { id: "slip", name: "Slip", short: "Slip", side: "off", zone: "catching", x: 60, y: 74 },
  "second-slip": { id: "second-slip", name: "Second Slip", short: "2 Slip", side: "off", zone: "catching", x: 64, y: 77 },
  gully: { id: "gully", name: "Gully", short: "Gully", side: "off", zone: "catching", x: 69, y: 69 },
  point: { id: "point", name: "Point", short: "Point", side: "off", zone: "infield", x: 82, y: 59 },
  "deep-point": { id: "deep-point", name: "Deep Point", short: "Dp Pt", side: "off", zone: "boundary", x: 92, y: 57 },
  cover: { id: "cover", name: "Cover", short: "Cover", side: "off", zone: "infield", x: 78, y: 45 },
  "deep-cover": { id: "deep-cover", name: "Deep Cover", short: "Dp Cov", side: "off", zone: "boundary", x: 88, y: 38 },
  "mid-off": { id: "mid-off", name: "Mid-Off", short: "Mid-Off", side: "off", zone: "infield", x: 60, y: 31 },
  "long-off": { id: "long-off", name: "Long-Off", short: "Lng-Off", side: "off", zone: "boundary", x: 60, y: 9 },
  "mid-on": { id: "mid-on", name: "Mid-On", short: "Mid-On", side: "leg", zone: "infield", x: 40, y: 31 },
  "long-on": { id: "long-on", name: "Long-On", short: "Lng-On", side: "leg", zone: "boundary", x: 40, y: 9 },
  "mid-wicket": { id: "mid-wicket", name: "Mid-Wicket", short: "Mid-Wkt", side: "leg", zone: "infield", x: 24, y: 45 },
  "deep-mid-wicket": { id: "deep-mid-wicket", name: "Deep Mid-Wicket", short: "Dp MW", side: "leg", zone: "boundary", x: 12, y: 43 },
  "square-leg": { id: "square-leg", name: "Square Leg", short: "Sq Leg", side: "leg", zone: "infield", x: 19, y: 59 },
  "deep-square-leg": { id: "deep-square-leg", name: "Deep Square Leg", short: "Dp SL", side: "leg", zone: "boundary", x: 9, y: 61 },
  "fine-leg": { id: "fine-leg", name: "Fine Leg", short: "Fine Leg", side: "leg", zone: "boundary", x: 32, y: 90 },
  "third-man": { id: "third-man", name: "Third Man", short: "3rd Man", side: "off", zone: "boundary", x: 70, y: 90 },
};

interface FormationDef {
  id: FormationId;
  positionIds: string[]; // exactly 9
}

// Each preset lists its nine positions catching-zone-first, so the auto-assign
// walks bowlers/all-rounders (the better catchers) into the close spots. The
// display name and blurb for each id live in i18n (field.formation* /
// field.blurb*), rendered by FieldingBoard.
export const FIELD_FORMATIONS: FormationDef[] = [
  {
    id: "balanced",
    positionIds: ["slip", "point", "cover", "mid-off", "mid-on", "mid-wicket", "square-leg", "fine-leg", "third-man"],
  },
  {
    id: "attacking",
    positionIds: ["slip", "second-slip", "gully", "point", "cover", "mid-off", "mid-on", "mid-wicket", "square-leg"],
  },
  {
    id: "defensive",
    positionIds: ["point", "cover", "mid-off", "mid-on", "deep-cover", "deep-mid-wicket", "long-on", "long-off", "third-man"],
  },
  {
    id: "powerplay",
    positionIds: ["slip", "gully", "point", "cover", "mid-off", "mid-on", "mid-wicket", "square-leg", "fine-leg"],
  },
  {
    id: "death",
    positionIds: ["cover", "mid-on", "deep-point", "deep-cover", "long-off", "long-on", "deep-mid-wicket", "deep-square-leg", "third-man"],
  },
];

// Law 41.5: no more than two fielders may stand behind the popping crease on
// the LEG side. Because the field-setter is preset-only — tap-to-swap moves
// players between a formation's fixed nine slots, never adds a slot — a user
// can never build an illegal field; legality is a property of each preset. So
// we just guarantee the presets themselves are legal. This throws at module
// load (build/dev) if a future edit adds a third behind-square leg-side spot.
// (The striker's popping crease is at y≈68; "behind" it is a larger y, toward
// the striker's-end boundary. The wicketkeeper and bowler aren't counted.)
const STRIKER_CREASE_Y = 68;
function legSideBehindSquareCount(positionIds: string[]): number {
  return positionIds.filter((id) => {
    const p = POS[id];
    return p && p.side === "leg" && p.y > STRIKER_CREASE_Y;
  }).length;
}
for (const f of FIELD_FORMATIONS) {
  const count = legSideBehindSquareCount(f.positionIds);
  if (count > 2) {
    throw new Error(
      `Formation "${f.id}" is illegal: ${count} fielders behind square on the leg side (Law 41.5 allows at most 2).`
    );
  }
}

export function formationPositions(id: FormationId): FieldingPosition[] {
  const def = FIELD_FORMATIONS.find((f) => f.id === id) ?? FIELD_FORMATIONS[0];
  return def.positionIds.map((pid) => POS[pid]);
}

export function getFieldingPositionById(id: string): FieldingPosition | undefined {
  return POS[id];
}

/** Ids of the close-catching spots across all formations — the sim gives a
 * small wicket-taking nudge for putting a bowler/all-rounder here. */
export const CATCHING_POSITION_IDS: ReadonlySet<string> = new Set(
  Object.values(POS)
    .filter((p) => p.zone === "catching")
    .map((p) => p.id)
);

export const DEFAULT_FORMATION: FormationId = "balanced";
