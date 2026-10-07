"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";
import { Button, Card } from "@heroui/react";
import { ArrowRight, RotateCcw, TriangleAlert } from "lucide-react";
import { publicEnv } from "@/lib/public-env";

export default function AppError({
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
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 py-10 sm:px-6">
      <Card className="w-full p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-danger/10 text-danger">
            <TriangleAlert className="h-5 w-5" />
          </div>
          <div className="space-y-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                This page hit an unexpected error.
              </h2>
              <p className="mt-1 text-sm leading-6 text-default-600">
                The failure has been reported. You can retry, or jump to a stable view while
                we look into it.
              </p>
            </div>

            {publicEnv.NODE_ENV === "development" && error.message ? (
              <p className="rounded-lg border border-default-200 bg-default-50 px-3 py-2 text-xs leading-5 text-default-600">
                {error.message}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" onPress={reset} className="rounded-full px-6 font-semibold">
                <RotateCcw className="h-4 w-4" />
                Try again
              </Button>
              <Link
                href="/recordings"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-default-200 bg-default-50 px-6 py-2 text-sm font-medium text-foreground transition-colors hover:bg-default-100"
              >
                Go to recordings
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
