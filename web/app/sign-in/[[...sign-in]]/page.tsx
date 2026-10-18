import { SignIn } from "@clerk/nextjs";
import { notFound } from "next/navigation";

import { Section } from "@/components/ui";
import { clerkEnabled } from "@/lib/auth/config";

export const metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage() {
  if (!clerkEnabled) notFound();
  return <Section className="flex justify-center py-16"><SignIn /></Section>;
}
