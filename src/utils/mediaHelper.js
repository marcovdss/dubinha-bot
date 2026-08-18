import { AttachmentBuilder } from 'discord.js';

/**
 * Busca uma imagem real e retorna um AttachmentBuilder com o Buffer direto
 * @param {string} query - Termo de busca (ex: 'pizza', 'mulher na praia', 'gato')
 * @returns {Promise<AttachmentBuilder | null>}
 */
export async function fetchImageAttachment(query) {
  if (!query || !query.trim()) return null;
  const cleanQuery = query.trim();

  try {
    // 1. Busca URLs de imagens no DuckDuckGo
    const tokenRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&iax=images&ia=images`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const text = await tokenRes.text();
    const tokenMatch = text.match(/vqd=([\d-]+)&/);

    if (tokenMatch) {
      const vqd = tokenMatch[1];
      const imgRes = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(cleanQuery)}&o=json&p=1&s=0&u=bing&f=,,,&l=us-en&vqd=${vqd}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (imgRes.ok) {
        const data = await imgRes.json();
        const results = data.results || [];

        // Tenta baixar os 4 primeiros resultados até achar um que responda com imagem válida
        for (let i = 0; i < Math.min(results.length, 5); i++) {
          const item = results[i];
          const rawUrl = item.image;

          try {
            const downloadRes = await fetch(rawUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
              },
              signal: AbortSignal.timeout(5000)
            });

            if (downloadRes.ok) {
              const contentType = downloadRes.headers.get('content-type') || '';
              if (contentType.startsWith('image/')) {
                const arrayBuffer = await downloadRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                let ext = 'jpg';
                if (contentType.includes('png')) ext = 'png';
                if (contentType.includes('gif')) ext = 'gif';
                if (contentType.includes('webp')) ext = 'webp';

                console.log(`✅ [Media Downloader] Imagem baixada com sucesso (${(buffer.length / 1024).toFixed(1)} KB) de: ${rawUrl.slice(0, 60)}...`);
                return new AttachmentBuilder(buffer, { name: `foto.${ext}` });
              }
            }
          } catch (dlErr) {
            // Tenta o próximo resultado se esse falhar
          }
        }
      }
    }

    // 2. Fallback de alta confiabilidade no Unsplash caso o DuckDuckGo falhe
    console.log(`⚠️ Usando fallback Unsplash para "${cleanQuery}"...`);
    const fallbackRes = await fetch(`https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800`);
    if (fallbackRes.ok) {
      const buffer = Buffer.from(await fallbackRes.arrayBuffer());
      return new AttachmentBuilder(buffer, { name: 'foto.jpg' });
    }

    return null;
  } catch (error) {
    console.error('[MediaHelper Error]:', error.message || error);
    return null;
  }
}
