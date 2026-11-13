# noccooo's image for maxcloud (maxcloud.yaml). It runs maxcloud-functions, which starts
# the function named in FUNCTION_TARGET. migrations/ is drizzle-kit's (meta/_journal.json),
# so the runtime leaves it to the app, which applies it on start (src/db).

FROM node:24-slim AS build
WORKDIR /app
RUN npm install -g pnpm@12
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json drizzle.config.ts ./
COPY src src
RUN pnpm build
# Production dependencies only, for the final image.
RUN pnpm install --frozen-lockfile --prod

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY migrations migrations
# The image's own node user, by number: the namespace's Pod Security checks runAsNonRoot.
USER 1000
CMD ["node_modules/.bin/maxcloud-functions"]
