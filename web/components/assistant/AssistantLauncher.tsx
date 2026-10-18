"use client";

import { Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/api/client";
import { PublicConfig } from "@/lib/api/schemas";

const AssistantDrawer = dynamic(() => import("./AssistantDrawer").then((m) => m.AssistantDrawer), { ssr: false });

/** Header button for the security assistant; shown only when the backend has it enabled. */
export function AssistantLauncher() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api("/api/v2/config", { schema: PublicConfig }).then(setConfig).catch(() => setConfig(null));
  }, []);
  if (!config?.assistant_enabled) return null;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Sparkles className="size-4 text-accent-2" aria-hidden /> <span className="hidden sm:inline">Assistant</span>
      </Button>
      {open && <AssistantDrawer open={open} onClose={() => setOpen(false)}
                                needsSignIn={config.assistant_requires_sign_in && config.auth_enabled} />}
    </>
  );
}
