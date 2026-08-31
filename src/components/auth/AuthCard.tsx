"use client";

import { UtensilsCrossed } from "lucide-react";
import Link from "next/link";

interface AuthCardProps {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthCard({ title, children, footer }: AuthCardProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white">
            <UtensilsCrossed className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {children}
        </div>
        {footer ? (
          <div className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}

export function AuthLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="font-medium text-brand-600 hover:underline">
      {children}
    </Link>
  );
}
