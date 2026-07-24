# Lumen Bridge — outbound agent for Ergo node REST
# Build:  docker build -t lumen-bridge .
# Run:    docker run -d --name lumen-bridge --restart unless-stopped --network host \
#           -e LUMEN_TOKEN=lumen_xxx -e LUMEN_SERVER=ws://host:3100/bridge lumen-bridge

FROM node:20-alpine

LABEL org.opencontainers.image.title="lumen-bridge" \
      org.opencontainers.image.description="Lumen Bridge — outbound WebSocket agent for Ergo node REST" \
      org.opencontainers.image.source="https://github.com/from-ufa/aether"

WORKDIR /app

# Install deps first (better layer cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit

COPY bridge.js ./

# Defaults — override with -e at runtime
ENV NODE_ENV=production \
    LUMEN_NODE_URL=http://127.0.0.1:9053

# Non-root; --network host still reaches host Ergo on Linux
USER node

# Token + server come from env (LUMEN_TOKEN / LUMEN_SERVER or long names)
ENTRYPOINT ["node", "bridge.js"]
