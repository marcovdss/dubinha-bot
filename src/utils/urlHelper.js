/**
 * Utilitário para extração rápida de títulos e metadados de links compartilhados no chat
 */

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

/**
 * Extrai títulos e prévias de URLs encontradas na mensagem
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function extractUrlContext(text) {
  if (!text) return '';

  const matches = text.match(URL_REGEX);
  if (!matches || matches.length === 0) return '';

  const urlSummaries = [];

  for (const rawUrl of matches.slice(0, 2)) {
    try {
      const response = await fetch(rawUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(3500)
      });

      if (response.ok) {
        const html = await response.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                              html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);

        let title = titleMatch ? titleMatch[1].trim() : '';
        let desc = metaDescMatch ? metaDescMatch[1].trim() : '';

        // Limpa entidades HTML comuns
        title = title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        desc = desc.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

        if (title) {
          urlSummaries.push(`- Link (${rawUrl}): Título: "${title}"${desc ? ` | Resumo: "${desc.slice(0, 120)}..."` : ''}`);
        }
      }
    } catch {
      // Falha silenciosa em caso de timeout ou bloqueio
    }
  }

  if (urlSummaries.length === 0) return '';

  return `[CONTEÚDO DO(S) LINK(S) ENVIADO(S)]:\n${urlSummaries.join('\n')}\n`;
}
