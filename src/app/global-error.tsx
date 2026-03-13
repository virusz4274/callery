"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { ArrowRight, RotateCcw, TriangleAlert } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <div className="relative min-h-dvh overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(220,38,38,0.12),transparent_26%)]" />
          <div className="mx-auto max-w-5xl">
            <div className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/92 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
              <div className="grid gap-8 px-6 py-8 md:px-8 md:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">
                      App error
                    </span>
                    <span className="rounded-full bg-default-100 px-3 py-1 text-xs font-semibold text-default-600">
                      Recovery options
                    </span>
                  </div>

                  <div className="space-y-3">
                    <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                      Something broke before the page could finish loading.
                    </h1>
                    <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                      The app hit an unexpected error. You can retry the current view or return to a
                      stable route while we capture the failure for debugging.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={reset}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_16px_40px_-28px_rgba(38,132,255,0.7)] transition-colors hover:bg-primary/90 sm:w-auto"
                    >
                      Try again
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <Link
                      href="/"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-default-200 bg-default-50 px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-default-100 sm:w-auto"
                    >
                      Go to homepage
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-danger/10 text-danger">
                        <TriangleAlert className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Captured for debugging</p>
                        <p className="text-sm leading-6 text-default-500">
                          This failure has been reported so it can be investigated without you
                          needing to reproduce it again.
                        </p>
                      </div>
                    </div>
                  </div>

                  {process.env.NODE_ENV === "development" && error.message ? (
                    <div className="rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                        Dev detail
                      </p>
                      <p className="mt-2 text-sm leading-6 text-default-600">{error.message}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
