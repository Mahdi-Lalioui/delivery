FROM node:26.13.0-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS node
FROM heic AS decoder

FROM node AS build
ENV CI=1
WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.18.0
COPY . .
RUN --mount=type=cache,target=/app/.pnpm-store \
    pnpm --filter @zaafran/api... --filter @zaafran/worker... install --frozen-lockfile \
 && pnpm -r --filter @zaafran/api... --filter @zaafran/worker... run build \
 && pnpm --filter @zaafran/api... --filter @zaafran/worker... install --prod --frozen-lockfile --offline

FROM node AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/worker ./apps/worker
COPY --from=build /app/packages ./packages
COPY --from=decoder /usr/local/bin/zaafran-heic-decode /usr/local/bin/
COPY --from=decoder /usr/local/lib/zaafran-heic /usr/local/lib/zaafran-heic
COPY --from=decoder /usr/local/share/zaafran-heic /usr/local/share/zaafran-heic
RUN install -d -o node -g node -m 0700 /var/awid/media
USER node
