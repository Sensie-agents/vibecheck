FROM --platform=linux/amd64 node:22-alpine@sha256:76789712cd1ae89a1225eac9077010d68987a423588042dac30446f502f1858c

LABEL org.opencontainers.image.title="SomaCheck Vibecheck MCP (local runtime)" \
      org.opencontainers.image.description="Glama discovery image for the MIT-licensed SomaCheck local stdio MCP runtime" \
      org.opencontainers.image.source="https://github.com/Sensie-agents/vibecheck" \
      org.opencontainers.image.version="0.6.14" \
      org.opencontainers.image.licenses="MIT"

ENV HOME=/home/node \
    NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

USER node

ENTRYPOINT ["./node_modules/.bin/vibecheck"]
