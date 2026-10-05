FROM node:22.23.2-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdbus-1-3 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global npm@10.9.8 @openai/codex@0.160.0 \
    && mkdir -p /workspace /result /home/node/.codex /home/node/.cache/ms-playwright \
    && touch /home/node/.codex/auth.json \
    && chown -R node:node /workspace /result /home/node/.codex /home/node/.cache

USER node
ENV HOME=/home/node
WORKDIR /workspace
