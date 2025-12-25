FROM node:20-bookworm-slim

# Install Linux tools used by Tasks.sh
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    bc \
    procps \
    sysstat \
    pciutils \
    iproute2 \
    net-tools \
    ifstat \
    lm-sensors \
    smartmontools \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app
COPY . .

# Ensure script is executable
RUN chmod +x /app/Tasks.sh

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]


