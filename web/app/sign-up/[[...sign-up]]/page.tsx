import { SignUp } from "@clerk/nextjs";
import { notFound } from "next/navigation";

import { Section } from "@/components/ui";
import { clerkEnabled } from "@/lib/auth/config";

export const metadata = { title: "Sign up", robots: { index: false } };

export default function SignUpPage() {
  if (!clerkEnabled) notFound();
  return <Section className="flex justify-center py-16"><SignUp /></Section>;
}
