FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS node
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

FROM heic AS decoder

FROM node AS build
ENV CI=1
WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.18.0
COPY . .
RUN --mount=type=cache,target=/app/.pnpm-store \
    pnpm --filter @zaafran/api... --filter @zaafran/worker... install --frozen-lockfile \
 && pnpm -r --filter @zaafran/api... --filter @zaafran/worker... run build \
 && rm -rf node_modules apps/*/node_modules packages/*/node_modules \
 && pnpm --filter @zaafran/api... --filter @zaafran/worker... install --prod --frozen-lockfile --offline

FROM node AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
 && test ! -e /usr/local/lib/node_modules/npm \
 && test ! -e /usr/local/bin/npm \
 && test ! -e /usr/local/bin/npx \
 && command -v node >/dev/null
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/worker ./apps/worker
COPY --from=build /app/packages ./packages
COPY --from=decoder /usr/local/bin/zaafran-heic-decode /usr/local/bin/
COPY --from=decoder /usr/local/lib/zaafran-heic /usr/local/lib/zaafran-heic
COPY --from=decoder /usr/local/share/zaafran-heic /usr/local/share/zaafran-heic
RUN install -d -o node -g node -m 0700 /var/awid/media
USER node
