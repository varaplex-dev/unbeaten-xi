"use client";

import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

interface ShareMenuProps {
  shareText: string;
  wins: number;
  losses: number;
}

/** Big primary "Share Result" button (tries the native OS share sheet first,
 * which on mobile already lists WhatsApp/Facebook/X/etc. installed apps),
 * plus a row of direct platform links as a fallback for desktop browsers
 * that don't support navigator.share and for anyone who wants a specific
 * platform without going through the OS sheet. */
export function ShareMenu({ shareText, wins, losses }: ShareMenuProps) {
  const [copied, setCopied] = useState(false);

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";
  const fullText = siteUrl ? `${shareText}\n${siteUrl}` : shareText;

  function logShare(method: string) {
    track("result_shared", { wins, losses, unbeaten: losses === 0, method });
  }

  async function handleNativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      logShare("native");
      try {
        await navigator.share({ text: shareText, title: "The Unbeaten XI", url: siteUrl || undefined });
      } catch {
        // user cancelled the share sheet — nothing else to do
      }
      return;
    }
    handleCopy();
  }

  async function handleCopy() {
    logShare("copy");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const platformLinks = [
    {
      label: "X",
      method: "twitter",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(fullText)}`,
    },
    {
      label: "WhatsApp",
      method: "whatsapp",
      href: `https://wa.me/?text=${encodeURIComponent(fullText)}`,
    },
    {
      label: "Facebook",
      method: "facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}&quote=${encodeURIComponent(shareText)}`,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={handleNativeShare} className="w-full sm:w-auto">
          Share Result
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {platformLinks.map((link) => (
          <a
            key={link.method}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => logShare(link.method)}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            {link.label}
          </a>
        ))}
        <button type="button" onClick={handleCopy} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
          {copied ? "Copied!" : "Copy Text"}
        </button>
      </div>
    </div>
  );
}
