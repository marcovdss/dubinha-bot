FROM node:20-slim

# Instala ffmpeg, python3 e yt-dlp oficial mais recente para streaming de áudio
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm ci --omit=dev

# Copia código fonte e dados
COPY . .

# Comando de inicialização
CMD ["npm", "start"]
