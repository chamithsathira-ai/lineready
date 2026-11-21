# Postgres 16 (Alpine) + pgvector compiled from source: ~half the size of the Debian pgvector image.
ARG PG=16
FROM postgres:${PG}-alpine AS build
ARG PGVECTOR=v0.8.0
RUN apk add --no-cache git build-base \
 && git clone --branch ${PGVECTOR} --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector \
 && cd /tmp/pgvector && make with_llvm=no OPTFLAGS="" && make with_llvm=no install DESTDIR=/out

FROM postgres:${PG}-alpine
COPY --from=build /out/usr/local/ /usr/local/
