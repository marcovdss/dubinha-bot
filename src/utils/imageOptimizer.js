import sharp from 'sharp';
import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Verifica se um endereço IP pertence a faixas privadas, loopback ou link-local (Prevenção de SSRF)
 * @param {string} ip
 * @returns {boolean}
 */
export function isPrivateIp(ip) {
  if (!ip || !net.isIP(ip)) return true;
  if (ip === '127.0.0.1' || ip === '::1') return true;

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (Link Local / Cloud Metadata)
    if (parts[0] === 0) return true;
  } else if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (
      lower === '::1' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('::ffff:')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Valida se uma URL é segura para requisições externas sem expor a rede local (anti-SSRF)
 * @param {string} rawUrl
 * @returns {Promise<boolean>}
 */
export async function isSafeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname;
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan')
    ) {
      return false;
    }

    const lookup = await dns.lookup(hostname);
    if (isPrivateIp(lookup.address)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Otimiza e comprime buffers de imagem usando Sharp para envio eficiente ao Gemini Multimodal
 * @param {Buffer} buffer - Buffer bruto da imagem
 * @param {number} [maxDimension=1280] - Dimensão máxima permitida em pixels
 * @returns {Promise<{ data: string, mimeType: string } | null>}
 */
export async function optimizeImageForGemini(buffer, maxDimension = 1280) {
  try {
    if (!buffer || buffer.length === 0) return null;

    const optimizedBuffer = await sharp(buffer)
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    return {
      data: optimizedBuffer.toString('base64'),
      mimeType: 'image/jpeg'
    };
  } catch (err) {
    console.warn('[ImageOptimizer] Aviso ao otimizar com Sharp, usando fallback bruto:', err.message);
    return {
      data: buffer.toString('base64'),
      mimeType: 'image/jpeg'
    };
  }
}
