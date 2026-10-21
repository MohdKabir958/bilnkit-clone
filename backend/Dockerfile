FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN --mount=type=secret,id=build_ca,required=false if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; npm ci
COPY prisma ./prisma
RUN --mount=type=secret,id=build_ca,required=false if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; npx prisma generate
COPY scripts ./scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Use this target only for the one-off migration job; it contains the pinned Prisma CLI.
FROM build AS migrate
CMD ["npm", "run", "db:deploy"]

FROM build AS production-deps
RUN npm prune --omit=dev

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=5000 UPLOAD_DIR=/var/lib/market/uploads
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && mkdir -p /var/lib/market/uploads && chown node:node /var/lib/market/uploads
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Render pre-deploy commands use the same final image as the API.
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package*.json ./
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-render.mjs"]
