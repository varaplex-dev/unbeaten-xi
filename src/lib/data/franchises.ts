// Fictional opponent franchises for the season simulation. Reuses the same
// team names players are drawn from in players.ts so the league feels
// consistent, plus a couple of away-only names for variety.
export const OPPONENT_FRANCHISES = [
  "Mumbai Sharks",
  "Chennai Kings",
  "Delhi Dragons",
  "Punjab Lions",
  "Rajasthan Royals XI",
  "Kolkata Tigers",
  "Bengaluru Blazers",
  "Hyderabad Hawks",
  "Ahmedabad Titans",
  "Lucknow Falcons",
] as const;

export const VENUES = [
  { name: "William Pursson Stadium", city: "Mumbai" },
  { name: "MA Turf Ground", city: "Chennai" },
  { name: "Ferozeshah Arena", city: "Delhi" },
  { name: "PCA Bowl", city: "Mohali" },
  { name: "Sawai Park", city: "Jaipur" },
  { name: "Eden Fields", city: "Kolkata" },
  { name: "Chinnaswamy Bowl", city: "Bengaluru" },
  { name: "Uppal Arena", city: "Hyderabad" },
] as const;
