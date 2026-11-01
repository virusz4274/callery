# Optional compatibility storage, not a promise of maintained upstream MinIO.
# Sources: https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z
#          https://github.com/minio/mc/releases/tag/RELEASE.2025-08-13T08-35-41Z
FROM golang:1.26.10-alpine3.23@sha256:a07f231c19b03e6106cf442f02a5bcf262147e744d15b7b5e4b6d81d420c70a0 AS build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
RUN go install -trimpath github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a \
    && go install -trimpath github.com/minio/mc@7394ce0dd2a80935aded936b09fa12cbb3cb8096 \
    && mkdir /licenses \
    && cp "$(go list -m -f '{{.Dir}}' github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a)/LICENSE" /licenses/minio-LICENSE \
    && cp "$(go list -m -f '{{.Dir}}' github.com/minio/mc@7394ce0dd2a80935aded936b09fa12cbb3cb8096)/LICENSE" /licenses/mc-LICENSE

FROM alpine:3.23.6@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0 AS runtime
RUN apk add --no-cache ca-certificates curl
COPY --from=build /licenses /usr/share/licenses/minio

FROM runtime AS minio
LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.revision="9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
COPY --from=build /go/bin/minio /usr/local/bin/minio
ENTRYPOINT ["minio"]

FROM runtime AS mc
LABEL org.opencontainers.image.source="https://github.com/minio/mc" \
      org.opencontainers.image.revision="7394ce0dd2a80935aded936b09fa12cbb3cb8096" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
COPY --from=build /go/bin/mc /usr/local/bin/mc
ENTRYPOINT ["mc"]
