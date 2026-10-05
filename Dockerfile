FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

# Rebuild the source code only when needed
FROM base AS source
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies first so this layer is cached unless manifests change.
# (Single stage on purpose: pnpm's node_modules symlinks point into its
# content-addressable store, so they can't be COPYed from a deps stage.)
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .

FROM source AS db-init
CMD ["pnpm", "run", "db:init"]

FROM source AS builder
# Browser settings are compiled by Next.js. Only public values go here;
# database, storage, auth secrets and provider keys are supplied at runtime.
ARG NEXT_PUBLIC_AUTH_PROVIDER=local
ARG NEXT_PUBLIC_ENABLE_BILLING=false
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_GOOGLE_REDIRECT_URI
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_HELPER_ORIGIN
ARG NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU=false

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
# Secrets are NOT baked into the image. Provide them at runtime
# (compose env_file, -e flags, or a secrets manager). Firebase Admin also
# accepts a service-account.json file mounted at /app for local dev.

# Set the correct permission for prerender cache
RUN mkdir -p .next && chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "server.js"]
