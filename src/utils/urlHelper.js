/**
 * Utilitário avançado para extração rápida de títulos, metadados e URLs de mídia (vídeo/imagem) de links compartilhados no chat
 */

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
};

/**
 * Remove qualquer tag HTML/XML de uma string
 * @param {string} str
 * @returns {string}
 */
export function stripHtmlTags(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Limpa entidades e tags HTML de títulos, tweets e textos
 * @param {string} str
 * @returns {string}
 */
export function cleanHtmlEntities(str) {
  if (!str) return '';
  const decoded = str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
  return stripHtmlTags(decoded);
}

/**
 * Extrai metadados de vídeo do YouTube via oEmbed oficial (rápido e sem bloqueios)
 * @param {string} rawUrl
 * @returns {Promise<{title: string, author: string, isVideo: boolean, thumbnailUrl?: string} | null>}
 */
async function fetchYouTubeOEmbed(rawUrl) {
  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`;
    const res = await fetch(oEmbedUrl, {
      headers: COMMON_HEADERS,
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const data = await res.json();
      return {
        title: cleanHtmlEntities(data.title || ''),
        author: cleanHtmlEntities(data.author_name || ''),
        isVideo: true,
        thumbnailUrl: data.thumbnail_url
      };
    }
  } catch {}
  return null;
}

/**
 * Extrai metadados e mídias de tweets do Twitter / X via vxtwitter / fixvx API
 * @param {string} rawUrl
 * @returns {Promise<{text: string, author: string, mediaUrls: Array<{url: string, isVideo: boolean, mimeType: string}>} | null>}
 */
async function fetchTwitterData(rawUrl) {
  try {
    const match = rawUrl.match(/(?:twitter\.com|x\.com|fixvx\.com|vxtwitter\.com|fxtwitter\.com|fixupx\.com)\/([^/]+)\/status\/(\d+)/i);
    if (!match) return null;

    const [, user, tweetId] = match;
    const apiUrl = `https://api.vxtwitter.com/${user}/status/${tweetId}`;
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'DubinhaBot/1.0' },
      signal: AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const data = await res.json();
      const mediaUrls = [];

      if (Array.isArray(data.media_extended)) {
        for (const item of data.media_extended) {
          const isVid = item.type === 'video' || item.type === 'gif';
          mediaUrls.push({
            url: item.url,
            isVideo: isVid,
            mimeType: isVid ? 'video/mp4' : 'image/jpeg'
          });
        }
      } else if (Array.isArray(data.mediaURLs)) {
        for (const mUrl of data.mediaURLs) {
          const isVid = /\.(mp4|webm|mov)/i.test(mUrl) || data.has_video;
          mediaUrls.push({
            url: mUrl,
            isVideo: isVid,
            mimeType: isVid ? 'video/mp4' : 'image/jpeg'
          });
        }
      }

      return {
        text: cleanHtmlEntities(data.text || ''),
        author: cleanHtmlEntities(data.user_name || user),
        mediaUrls
      };
    }
  } catch {}
  return null;
}

/**
 * Tenta extrair URLs de streaming direto ou OpenGraph de uma página HTML
 * @param {string} rawUrl
 * @returns {Promise<{title: string, desc: string, mediaUrls: Array<{url: string, isVideo: boolean, mimeType: string}>}>}
 */
async function scrapeOpenGraph(rawUrl) {
  const result = { title: '', desc: '', mediaUrls: [] };
  try {
    // Transforma links de Instagram e TikTok para proxies amigáveis para obter OpenGraph
    let targetUrl = rawUrl;
    if (/instagram\.com\/p\/|instagram\.com\/reel\//i.test(rawUrl)) {
      targetUrl = rawUrl.replace('instagram.com', 'ddinstagram.com');
    } else if (/tiktok\.com\/@/i.test(rawUrl)) {
      targetUrl = rawUrl.replace('tiktok.com', 'tnktok.com');
    }

    const response = await fetch(targetUrl, {
      headers: COMMON_HEADERS,
      signal: AbortSignal.timeout(4000)
    });

    if (!response.ok) return result;

    const html = await response.text();

    const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

    result.title = titleMatch ? cleanHtmlEntities(titleMatch[1]) : '';
    result.desc = descMatch ? cleanHtmlEntities(descMatch[1]) : '';

    // Extrai tags de vídeo OpenGraph
    const videoMatch = html.match(/<meta[^>]*property=["']og:video(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]*name=["']twitter:player:stream["'][^>]*content=["']([^"']+)["']/i);
    if (videoMatch && videoMatch[1]) {
      result.mediaUrls.push({
        url: videoMatch[1],
        isVideo: true,
        mimeType: 'video/mp4'
      });
    }

    // Extrai tags de imagem OpenGraph se não houver vídeo
    const imageMatch = html.match(/<meta[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
    if (imageMatch && imageMatch[1] && result.mediaUrls.length === 0) {
      result.mediaUrls.push({
        url: imageMatch[1],
        isVideo: false,
        mimeType: 'image/jpeg'
      });
    }
  } catch {}
  return result;
}

/**
 * Identifica se uma URL aponta diretamente para vídeo, imagem ou rede de mídia
 * @param {string} url
 * @returns {boolean}
 */
export function isMediaUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    /\.(?:mp4|webm|mov|mkv|avi|png|jpg|jpeg|webp|gif)(?:\?|$)/i.test(lower) ||
    /(?:youtube\.com\/(?:watch|shorts)|youtu\.be\/)/i.test(lower) ||
    /(?:twitter\.com|x\.com|fixvx\.com|vxtwitter\.com|fxtwitter\.com|fixupx\.com)\/[^/]+\/status\/\d+/i.test(lower) ||
    /(?:instagram\.com|ddinstagram\.com|kkinstagram\.com)\/(?:p|reel|reels)\//i.test(lower) ||
    /(?:tiktok\.com|tnktok\.com|tiktxk\.com)\//i.test(lower) ||
    /(?:tenor\.com\/view|media\.tenor\.com|giphy\.com\/gifs|klipy\.com\/gifs)/i.test(lower)
  );
}

/**
 * Extrai URLs de mídia prontas para download multimodal a partir do texto
 * @param {string} text
 * @returns {Promise<Array<{url: string, isVideo: boolean, mimeType: string}>>}
 */
export async function extractMediaUrlsFromText(text) {
  if (!text) return [];

  const matches = text.match(URL_REGEX);
  if (!matches || matches.length === 0) return [];

  const mediaList = [];

  for (const rawUrl of matches.slice(0, 2)) {
    // 1. Link direto de arquivo de mídia
    const directVideoMatch = rawUrl.match(/(https?:\/\/[^\s]+?\.(?:mp4|webm|mov)(?:\?[^\s]*)?)/i);
    if (directVideoMatch) {
      mediaList.push({
        url: directVideoMatch[1],
        isVideo: true,
        mimeType: 'video/mp4'
      });
      continue;
    }

    const directImageMatch = rawUrl.match(/(https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s]*)?)/i);
    if (directImageMatch) {
      const ext = directImageMatch[1].toLowerCase();
      let mime = 'image/jpeg';
      if (ext.includes('.png')) mime = 'image/png';
      else if (ext.includes('.webp')) mime = 'image/webp';
      else if (ext.includes('.gif')) mime = 'image/gif';
      mediaList.push({
        url: directImageMatch[1],
        isVideo: false,
        mimeType: mime
      });
      continue;
    }

    // 2. Twitter / X (via vxtwitter API)
    if (/(?:twitter\.com|x\.com|fixvx\.com|vxtwitter\.com|fxtwitter\.com|fixupx\.com)\/[^/]+\/status\/\d+/i.test(rawUrl)) {
      const twData = await fetchTwitterData(rawUrl);
      if (twData && twData.mediaUrls && twData.mediaUrls.length > 0) {
        mediaList.push(...twData.mediaUrls);
        continue;
      }
    }

    // 3. Tenor / Klipy / Giphy (scrape para achar gif/mp4)
    if (/(?:tenor\.com\/view|klipy\.com\/gifs|giphy\.com\/gifs)/i.test(rawUrl)) {
      const og = await scrapeOpenGraph(rawUrl);
      if (og.mediaUrls.length > 0) {
        mediaList.push(...og.mediaUrls);
        continue;
      }
    }

    // 4. Instagram / TikTok (via proxies amigáveis)
    if (/(?:instagram\.com|ddinstagram\.com|kkinstagram\.com|tiktok\.com|tnktok\.com|tiktxk\.com)/i.test(rawUrl)) {
      const og = await scrapeOpenGraph(rawUrl);
      if (og.mediaUrls.length > 0) {
        mediaList.push(...og.mediaUrls);
        continue;
      }
    }
  }

  return mediaList;
}

/**
 * Extrai títulos, autores e resumos ricos de URLs encontradas na mensagem para contexto do Gemini
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function extractUrlContext(text) {
  if (!text) return '';

  const matches = text.match(URL_REGEX);
  if (!matches || matches.length === 0) return '';

  const urlSummaries = [];

  for (const rawUrl of matches.slice(0, 2)) {
    // 1. Caso especial: YouTube (via oEmbed oficial)
    if (/(?:youtube\.com\/(?:watch|shorts)|youtu\.be\/)/i.test(rawUrl)) {
      const yt = await fetchYouTubeOEmbed(rawUrl);
      if (yt && yt.title) {
        urlSummaries.push(`- Vídeo do YouTube (${rawUrl}): Título: "${yt.title}"${yt.author ? ` (Canal: ${yt.author})` : ''}`);
        continue;
      }
    }

    // 2. Caso especial: Twitter / X (via vxtwitter API)
    if (/(?:twitter\.com|x\.com|fixvx\.com|vxtwitter\.com|fxtwitter\.com|fixupx\.com)\/[^/]+\/status\/\d+/i.test(rawUrl)) {
      const tw = await fetchTwitterData(rawUrl);
      if (tw && (tw.text || tw.author)) {
        urlSummaries.push(`- Post do Twitter/X de @${tw.author} (${rawUrl}): "${tw.text || 'Mídia compartilhada'}"${tw.mediaUrls.length > 0 ? ` [Contém ${tw.mediaUrls.some(m => m.isVideo) ? 'Vídeo/Clipe' : 'Foto/Imagem'}]` : ''}`);
        continue;
      }
    }

    // 3. Fallback genérico para outros sites / notícias / Reddit / Instagram / TikTok
    const og = await scrapeOpenGraph(rawUrl);
    if (og.title) {
      urlSummaries.push(`- Link (${rawUrl}): Título: "${og.title}"${og.desc ? ` | Resumo: "${og.desc.slice(0, 160)}..."` : ''}`);
    }
  }

  if (urlSummaries.length === 0) return '';

  return `[CONTEÚDO DO(S) LINK(S) ENVIADO(S)]:\n${urlSummaries.join('\n')}\n`;
}

