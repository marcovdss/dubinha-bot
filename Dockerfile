FROM node:22-slim

# Define ambiente de produção
ENV NODE_ENV=production

# Instala ferramentas essenciais de áudio e extração (ffmpeg, python3, yt-dlp, curl, ca-certificates)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências de produção com cache otimizado
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o código da aplicação
COPY . .

# Garante existência do diretório de dados para persistência
RUN mkdir -p data

# Inicializa o bot
CMD ["npm", "start"]

