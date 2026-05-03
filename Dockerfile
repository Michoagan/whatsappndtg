FROM node:20-slim

# Installer Google Chrome et les dépendances nécessaires pour Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    wget \
    gnupg \
    libxss1 \
    libnss3 \
    libgbm1 \
    libasound2 \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
