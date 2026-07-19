"use client";

import { PosterShell } from "@/components/brand/PosterShell";
import { ModeGrid } from "@/components/play/ModeGrid";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function PlayPage() {
  const { t } = useTranslation();

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell kicker="11 Not Out">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-stack-shadow text-4xl font-black italic tracking-tight mb-1">
            {t("play.chooseMode")}
          </h1>
          <p className="text-foreground-muted mb-8">{t("play.intro")}</p>
          <ModeGrid />
        </div>
      </PosterShell>
    </main>
  );
}
