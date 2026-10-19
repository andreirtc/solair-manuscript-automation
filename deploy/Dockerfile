FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git && rm -rf /var/lib/apt/lists/*
RUN npm install -g @openai/codex@0.162.1
WORKDIR /opt/solair/manuscript-app
COPY package.json package-lock.json tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps apps
COPY packages packages
COPY scripts scripts
COPY deploy/context /opt/solair/outputs
RUN npm run build && mkdir -p /home/node/.codex .local && chown -R node:node /home/node/.codex .local
COPY --chown=node:node deploy/worker-config.toml /home/node/.codex/config.toml
USER node
CMD ["npm","run","server"]
