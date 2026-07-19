// Real cricket fielding positions, per
// https://blog.networldsports.co.uk/cricket-fielding-positions-explained/ —
// used only in Hardcore Mode. A standard XI has 11 players: the bowler and
// wicketkeeper have fixed, implicit roles each over, so the other 10 get
// assigned to 10 of the real named positions below (a mix of catching,
// infield, and boundary spots, split across both sides of the wicket, the
// same balance a real captain would set).
//
// (x, y) are percentages within the same 0-100 ground graphic SquadField
// draws (pitch strip running vertically through x:44-56, batsman's end
// toward the bottom around y:66-70, bowler's end near y:30).

export type FieldingSide = "off" | "leg";
export type FieldingZone = "catching" | "infield" | "boundary";

export interface FieldingPosition {
  id: string;
  name: string;
  short: string;
  side: FieldingSide;
  zone: FieldingZone;
  x: number;
  y: number;
}

export const FIELDING_POSITIONS: FieldingPosition[] = [
  { id: "slip", name: "Slip", short: "Slip", side: "off", zone: "catching", x: 58, y: 72 },
  { id: "gully", name: "Gully", short: "Gully", side: "off", zone: "catching", x: 67, y: 68 },
  { id: "point", name: "Point", short: "Point", side: "off", zone: "infield", x: 81, y: 62 },
  { id: "cover", name: "Cover", short: "Cover", side: "off", zone: "infield", x: 77, y: 45 },
  { id: "mid-off", name: "Mid-Off", short: "Mid-Off", side: "off", zone: "infield", x: 58, y: 32 },
  { id: "mid-on", name: "Mid-On", short: "Mid-On", side: "leg", zone: "infield", x: 42, y: 32 },
  { id: "mid-wicket", name: "Mid-Wicket", short: "Mid-Wkt", side: "leg", zone: "infield", x: 23, y: 45 },
  { id: "square-leg", name: "Square Leg", short: "Sq Leg", side: "leg", zone: "infield", x: 19, y: 62 },
  { id: "fine-leg", name: "Fine Leg", short: "Fine Leg", side: "leg", zone: "boundary", x: 34, y: 86 },
  { id: "third-man", name: "Third Man", short: "3rd Man", side: "off", zone: "boundary", x: 66, y: 86 },
];

export function getFieldingPositionById(id: string): FieldingPosition | undefined {
  return FIELDING_POSITIONS.find((p) => p.id === id);
}
