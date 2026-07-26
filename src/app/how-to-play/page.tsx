"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/useTranslation";

function Metric({ name, impact }: { name: string; impact: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="shrink-0 font-semibold text-foreground">{name}</span>
      <span className="text-right text-sm text-foreground-muted">{impact}</span>
    </div>
  );
}

export default function HowToPlayPage() {
  const { t } = useTranslation();

  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight mb-1">{t("htp.title")}</h1>
      <p className="text-foreground-muted mb-8">{t("htp.intro")}</p>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("htp.s1.title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-2">
            <p>{t("htp.s1.p1")}</p>
            <p>{t("htp.s1.p2")}</p>
            <p>{t("htp.s1.p3")}</p>
            <p>{t("htp.s1.p4")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("htp.s2.title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-3">
            <p>{t("htp.s2.p1")}</p>
            <div>
              <Metric name={t("htp.s2.m1.name")} impact={t("htp.s2.m1.impact")} />
              <Metric name={t("htp.s2.m2.name")} impact={t("htp.s2.m2.impact")} />
              <Metric name={t("htp.s2.m3.name")} impact={t("htp.s2.m3.impact")} />
              <Metric name={t("htp.s2.m4.name")} impact={t("htp.s2.m4.impact")} />
            </div>
            <p>{t("htp.s2.p2")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("htp.s3.title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-3">
            <p>{t("htp.s3.p1")}</p>
            <p>{t("htp.s3.p2")}</p>
            <p>{t("htp.s3.p3")}</p>
            <p>{t("htp.s3.p4")}</p>
            <p>{t("htp.s3.p5")}</p>
            <p>{t("htp.s3.p6")}</p>
            <p>{t("htp.s3.p7")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("htp.s4.title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-3">
            <p>{t("htp.s4.p1")}</p>
            <p>{t("htp.s4.p2")}</p>
            <p>{t("htp.s4.p3")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("htp.s5.title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-2">
            <p>{t("htp.s5.p1")}</p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t("htp.s5.r1")}</li>
              <li>{t("htp.s5.r2")}</li>
              <li>{t("htp.s5.r3")}</li>
              <li>{t("htp.s5.r4")}</li>
              <li>{t("htp.s5.r5")}</li>
            </ul>
            <p>{t("htp.s5.p2")}</p>
            <p className="pt-1">{t("htp.s5.p3")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("htp.s6.title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-2">
            <p>{t("htp.s6.p1")}</p>
            <p>{t("htp.s6.p2")}</p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t("htp.s6.li1")}</li>
              <li>{t("htp.s6.li2")}</li>
              <li>{t("htp.s6.li3")}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("htp.s7.title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-2">
            <p>{t("htp.s7.p1")}</p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t("htp.s7.allTime")}</li>
              <li>{t("htp.s7.monthly")}</li>
              <li>{t("htp.s7.weekly")}</li>
              <li>{t("htp.s7.daily")}</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/play">
          <Button>{t("landing.startSpinning")}</Button>
        </Link>
        <Badge variant="accent">{t("htp.badge")}</Badge>
      </div>
    </main>
  );
}
