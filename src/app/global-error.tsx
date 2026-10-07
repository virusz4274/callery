"use client";

import { Button, Card, Chip, Surface } from '@heroui/react';
import * as Sentry from "@sentry/nextjs";
import { ActionLink } from '@/components/action-link';
import { useEffect } from "react";
import { ArrowRight, RotateCcw, TriangleAlert } from "lucide-react";
import { publicEnv } from "@/lib/public-env";

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

          <div className="mx-auto max-w-5xl">
            <Card className="overflow-hidden">
              <Card.Content className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip color="danger" variant="soft">
                      App error
                    </Chip>
                    <Chip variant="soft">
                      Recovery options
                    </Chip>
                  </div>

                  <div className="space-y-3">
                    <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
                      Something broke before the page could finish loading.
                    </h1>
                    <p className="max-w-2xl text-base leading-7 text-muted md:text-lg">
                      The app hit an unexpected error. You can retry the current view or return to a
                      stable route while we capture the failure for debugging.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button variant="primary"
                      type="button"
                      onPress={reset}
                      className="min-h-11 w-full sm:w-auto"
                    >
                      Try again
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <ActionLink variant="secondary"
                      href="/"
                      className="min-h-11 w-full sm:w-auto"
                    >
                      Go to homepage
                      <ArrowRight className="h-4 w-4" />
                    </ActionLink>
                  </div>
                </div>

                <div className="grid gap-3">
                  <Surface variant="secondary" className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-danger/10 text-danger">
                        <TriangleAlert className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Captured for debugging</p>
                        <p className="text-sm leading-6 text-muted">
                          This failure has been reported so it can be investigated without you
                          needing to reproduce it again.
                        </p>
                      </div>
                    </div>
                  </Surface>

                  {publicEnv.NODE_ENV === "development" && error.message ? (
                    <Surface variant="secondary" className="p-5">
                      <p className="text-xs font-semibold uppercase text-muted">
                        Dev detail
                      </p>
                      <p className="mt-2 text-sm leading-6 text-muted">{error.message}</p>
                    </Surface>
                  ) : null}
                </div>
              </Card.Content>
            </Card>
          </div>
        </div>
      </body>
    </html>
  );
}
