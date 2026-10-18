"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { Button, buttonClass } from "@/components/ui";

/** Rendered only when Clerk is configured (otherwise there is no provider). */
export function AuthControls() {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <Button variant="ghost" size="sm">Sign in</Button>
        </SignInButton>
        <SignUpButton mode="modal">
          <Button size="sm">Sign up free</Button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Link href="/dashboard" prefetch={false} className={buttonClass("ghost", "sm")}>
          <LayoutDashboard className="size-4" aria-hidden /> Dashboard
        </Link>
        <UserButton />
      </Show>
    </>
  );
}
