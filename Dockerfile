FROM node:22-slim

# Instala ferramentas essenciais (ffmpeg, python3, yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    build-essential \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências do Node.js
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o código da aplicação
COPY . .

# Inicializa o bot
CMD ["npm", "start"]
