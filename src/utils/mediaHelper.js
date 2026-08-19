import { AttachmentBuilder } from 'discord.js';

/**
 * Mapeamento contextual de imagens de alta qualidade por tema para fallback garantido
 */
const CONTEXTUAL_FALLBACKS = {
  cuscuz: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=900',
  macaxeira: 'https://images.unsplash.com/photo-1628837775988-7517c52db865?w=900',
  gato: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=900',
  teclado: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=900',
  pc: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=900',
  setup: 'https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=900',
  pizza: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=900',
  hamburguer: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900',
  cafe: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=900',
  cachorro: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=900',
  macaco: 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?w=900',
  monge: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=900'
};

const COMMON_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0'
];

function getRandomUserAgent() {
  return COMMON_USER_AGENTS[Math.floor(Math.random() * COMMON_USER_AGENTS.length)];
}

/**
 * Tenta baixar um buffer de imagem a partir de uma URL
 * @param {string} rawUrl
 * @returns {Promise<AttachmentBuilder | null>}
 */
async function downloadImageAttachment(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith('http')) return null;

  try {
    const res = await fetch(rawUrl, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Rejeita buffers vazios ou excessivamente pequenos (< 2KB geralmente é tracking pixel/ícone quebrado)
    if (buffer.length < 2048) return null;

    let ext = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('gif')) ext = 'gif';
    else if (contentType.includes('webp')) ext = 'webp';

    return new AttachmentBuilder(buffer, { name: `foto_${Date.now()}.${ext}` });
  } catch {
    return null;
  }
}

/**
 * Camada 1: Busca de Imagens via DuckDuckGo
 */
async function searchDuckDuckGoImages(query) {
  try {
    const tokenRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(5000)
    });

    const text = await tokenRes.text();
    const tokenMatch = text.match(/vqd=([\d-]+)&/);
    if (!tokenMatch) return null;

    const vqd = tokenMatch[1];
    const imgRes = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&s=0&u=bing&f=,,,&l=pt-br&vqd=${vqd}`, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Referer': 'https://duckduckgo.com/'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!imgRes.ok) return null;

    const data = await imgRes.json();
    const results = data.results || [];

    for (let i = 0; i < Math.min(results.length, 6); i++) {
      const item = results[i];
      if (item && item.image) {
        const attachment = await downloadImageAttachment(item.image);
        if (attachment) {
          console.log(`✅ [Media Engine] Imagem encontrada via DuckDuckGo para "${query}"`);
          return attachment;
        }
      }
    }
  } catch {}
  return null;
}

/**
 * Camada 2: Busca de Imagens via Wikimedia Commons API (Pública, sem limites)
 */
async function searchWikimediaImages(query) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime&format=json&gsrlimit=6`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DubinhaBot/1.0 (Discord Bot; contact@dubinha.internal)' },
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) return null;

    const data = await res.json();
    const pages = data.query?.pages || {};

    for (const pageId of Object.keys(pages)) {
      const imgInfo = pages[pageId]?.imageinfo?.[0];
      if (imgInfo?.url && imgInfo.mime?.startsWith('image/')) {
        // Ignora SVGs e ícones pequenos
        if (imgInfo.mime.includes('svg')) continue;

        const attachment = await downloadImageAttachment(imgInfo.url);
        if (attachment) {
          console.log(`✅ [Media Engine] Imagem encontrada via Wikimedia Commons para "${query}"`);
          return attachment;
        }
      }
    }
  } catch {}
  return null;
}

/**
 * Camada 3: Pixabay API (caso configurado PIXABAY_API_KEY no .env)
 */
async function searchPixabayImages(query) {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=5&lang=pt`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json();
    const hits = data.hits || [];
    for (const hit of hits) {
      const imgUrl = hit.webformatURL || hit.largeImageURL;
      if (imgUrl) {
        const attachment = await downloadImageAttachment(imgUrl);
        if (attachment) {
          console.log(`✅ [Media Engine] Imagem encontrada via Pixabay para "${query}"`);
          return attachment;
        }
      }
    }
  } catch {}
  return null;
}

/**
 * Camada 4: Fallback Contextual Inteligente
 */
async function getContextualFallback(query) {
  const qLower = query.toLowerCase();
  for (const [key, fallbackUrl] of Object.entries(CONTEXTUAL_FALLBACKS)) {
    if (qLower.includes(key)) {
      const attachment = await downloadImageAttachment(fallbackUrl);
      if (attachment) {
        console.log(`⚠️ [Media Engine] Usando fallback contextual "${key}" para "${query}"`);
        return attachment;
      }
    }
  }

  // Fallback final universal
  const defaultUrl = CONTEXTUAL_FALLBACKS.pizza;
  return downloadImageAttachment(defaultUrl);
}

/**
 * Motor Central Resiliente de Busca e Download de Imagens Reais
 * @param {string} query - Termo de busca (ex: 'cuscuz com ovo', 'setup gamer', 'gato dormindo')
 * @returns {Promise<AttachmentBuilder | null>}
 */
export async function fetchImageAttachment(query) {
  if (!query || !query.trim()) return null;
  const cleanQuery = query.trim();

  // 1. Tenta Pixabay (se tiver API key configurada)
  const pixabayResult = await searchPixabayImages(cleanQuery);
  if (pixabayResult) return pixabayResult;

  // 2. Tenta DuckDuckGo Scraper V2
  const ddgResult = await searchDuckDuckGoImages(cleanQuery);
  if (ddgResult) return ddgResult;

  // 3. Tenta Wikimedia Commons
  const wikiResult = await searchWikimediaImages(cleanQuery);
  if (wikiResult) return wikiResult;

  // 4. Fallback contextual por palavras-chave
  return getContextualFallback(cleanQuery);
}
