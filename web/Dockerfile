# LineReady tablet UI. LINEREADY_API_URL is needed at build time (the /backend/* proxy is fixed then) and at run time.
FROM node:20-alpine AS build
WORKDIR /web
ARG LINEREADY_API_URL=""
ENV LINEREADY_API_URL=$LINEREADY_API_URL NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /web
ARG LINEREADY_API_URL=""
ENV NODE_ENV=production LINEREADY_API_URL=$LINEREADY_API_URL NEXT_TELEMETRY_DISABLED=1
COPY --from=build /web ./
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
