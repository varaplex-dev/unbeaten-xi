"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { XIcon, WhatsAppIcon, FacebookIcon } from "@/components/icons/SocialIcons";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

interface ShareMenuProps {
  shareText: string;
  wins: number;
  losses: number;
}

const ICON_BUTTON =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background-elevated transition-colors duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

/** Big primary "Share Result" button (tries the native OS share sheet first,
 * which on mobile already lists WhatsApp/Facebook/X/etc. installed apps),
 * plus a row of icon-only platform links as a fallback for desktop browsers
 * that don't support navigator.share and for anyone who wants a specific
 * platform without going through the OS sheet. Instagram has no public
 * share-intent URL (unlike X/WhatsApp/Facebook) so it isn't offered here. */
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
      label: "Share on X",
      method: "twitter",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(fullText)}`,
      icon: XIcon,
      hoverClass: "hover:border-foreground/40 hover:bg-white/10",
    },
    {
      label: "Share on WhatsApp",
      method: "whatsapp",
      href: `https://wa.me/?text=${encodeURIComponent(fullText)}`,
      icon: WhatsAppIcon,
      hoverClass: "hover:border-[#25D366]/50 hover:text-[#25D366]",
    },
    {
      label: "Share on Facebook",
      method: "facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}&quote=${encodeURIComponent(shareText)}`,
      icon: FacebookIcon,
      hoverClass: "hover:border-[#1877F2]/50 hover:text-[#1877F2]",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={handleNativeShare} className="w-full sm:w-auto">
          Share Result
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {platformLinks.map((link) => (
          <a
            key={link.method}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
            onClick={() => logShare(link.method)}
            className={cn(ICON_BUTTON, link.hoverClass)}
          >
            <link.icon className="h-5 w-5" />
          </a>
        ))}
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy result text"}
          title={copied ? "Copied" : "Copy result text"}
          className={cn(ICON_BUTTON, "hover:border-accent/50 hover:text-accent")}
        >
          {copied ? <Check className="h-5 w-5 text-accent" /> : <Copy className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
