// English is the source dictionary — every other locale file is typed
// against `Dictionary` (derived from this object's shape), so a missing or
// misspelled key in any translation fails typecheck instead of silently
// falling back to English at runtime.
export const en = {
  "nav.howToPlay": "How to Play",
  "nav.about": "About",
  "nav.privacy": "Privacy",
  "nav.leaderboard": "Leaderboard",
  "nav.myHistory": "My History",
  "nav.settings": "Settings",

  "landing.seasonTag": "T20 League · Season One",
  "landing.tagline": "Can You Go Undefeated?",
  "landing.description":
    "Spin into real teams and pick real players — then it's on you to build the XI: batting order, captain, bowling plan, all your call. The season simulation runs on real career stats, so how well you actually know the game decides how close you get to 14-0.",
  "landing.startSpinning": "Start Spinning",
  "landing.dailyChallenge": "Daily Challenge",
  "landing.footerKicker": "Spin. Build. Simulate.",
  "landing.footerTagline": "Real Players · Real Stats · 14 League Matches",

  "play.chooseMode": "Choose a Mode",
  "play.intro":
    "More modes are on the way. Every squad is spun together from real players — current stars, all-time legends, and actual franchise-season rosters — using their real career stats.",
  "play.allTimeXi": "All-Time XI",
  "play.allTimeXiDesc":
    "Spin to land on a real historic squad, current national team, or an actual past-season IPL/BBL/PSL franchise roster — then pick one player from it. Real players, real stats. See if you can go 14-0.",
  "play.spin": "Spin",
  "play.comingSoon": "Coming Soon",

  "settings.title": "Settings",
  "settings.description":
    "The Unbeaten XI saves your progress locally in this browser — nothing is sent anywhere unless you're signed in.",
  "settings.account": "Account",
  "settings.signedInAs": "Signed in as",
  "settings.signedInDesc": "Your season results save to your account and count toward the leaderboard.",
  "settings.signOut": "Sign Out",
  "settings.continueWithGoogle": "Continue with Google",
  "settings.continueWithFacebook": "Continue with Facebook",
  "settings.or": "or",
  "settings.emailSignIn": "Email Me a Sign-In Link",
  "settings.checkEmail": "Check your email for a sign-in link.",
  "settings.activeGame": "Active Game",
  "settings.activeGameDesc": "Clear your current draft, lineup, and season progress. This can't be undone.",
  "settings.noActiveGame": "No active game right now.",
  "settings.resetGame": "Reset Current Game",
  "settings.confirmReset": "Yes, Clear It",
  "settings.cancel": "Cancel",
  "settings.about": "About",
  "settings.aboutTagline": "A Varaplex Studios game.",
  "settings.readMore": "Read More",
  "settings.language": "Language",
  "settings.languageDesc": "Choose your preferred language for the app.",
  "settings.hardcoreMode": "Hardcore Mode",
  "settings.hardcoreModeDesc":
    "Adds real fielding-position placement to your XI — a bowler or all-rounder at slip or gully sharpens your wicket-taking; a specialist batter there is a gamble.",
} satisfies Record<string, string>;

// Keys are literal (drawn from `en`, the source of truth for what keys
// exist); values are just `string` so every other locale can supply its
// own translated text rather than being type-constrained to the English
// literal. A locale file typed against `Dictionary` still fails to compile
// if it's missing a key or has an extra one — only the value type is open.
export type Dictionary = { [K in keyof typeof en]: string };
export type TranslationKey = keyof Dictionary;
