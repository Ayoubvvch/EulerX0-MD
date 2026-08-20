FROM node:22-bullseye-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    sqlite3 \
    python3 \
    curl \
    git \
    build-essential \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p temp sessions

EXPOSE 3000 5000

CMD ["node", "index.js"]
