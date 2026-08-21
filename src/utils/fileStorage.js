import fs from 'node:fs';
import path from 'node:path';

/**
 * Utilitário central de persistência segura e atômica de arquivos JSON.
 * Evita corrupção por concorrência, desligamento abrupto ou gravações parciais.
 */

const fileLocks = new Map();

/**
 * Valida se uma string é um JSON estruturado válido
 * @param {string} content
 * @returns {boolean}
 */
export function isValidJson(content) {
  if (!content || typeof content !== 'string') return false;
  const trimmed = content.trim();
  if (trimmed.length < 2) return false;
  if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lê um arquivo JSON de forma segura com fallback para backup (.bak) se o principal estiver corrompido
 * @param {string} filePath - Caminho absoluto para o arquivo
 * @param {any} defaultValue - Valor padrão retornado caso o arquivo não exista ou esteja corrompido
 * @returns {any}
 */
export function readJsonSafe(filePath, defaultValue = {}) {
  if (!filePath) return defaultValue;

  const bakPath = `${filePath}.bak`;

  // 1. Tenta ler o arquivo principal
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content && content.trim().length > 0) {
        return JSON.parse(content);
      }
    } catch (err) {
      console.warn(`⚠️ [FileStorage] Arquivo JSON corrompido em "${filePath}". Tentando recuperar backup (.bak)...`);
    }
  }

  // 2. Fallback de recuperação automática a partir do .bak (apenas se for válido)
  if (fs.existsSync(bakPath)) {
    try {
      const bakContent = fs.readFileSync(bakPath, 'utf-8');
      if (isValidJson(bakContent)) {
        const recovered = JSON.parse(bakContent);
        console.log(`✅ [FileStorage] Backup recuperado com sucesso para "${filePath}"!`);
        // Restaura o arquivo principal com segurança
        const tmpPath = `${filePath}.tmp.${process.pid}_${Date.now()}`;
        fs.writeFileSync(tmpPath, JSON.stringify(recovered, null, 2), 'utf-8');
        try {
          fs.renameSync(tmpPath, filePath);
        } catch {
          fs.copyFileSync(tmpPath, filePath);
          try { fs.unlinkSync(tmpPath); } catch {}
        }
        return recovered;
      }
    } catch (bakErr) {
      console.error(`❌ [FileStorage] Falha ao ler backup (.bak) de "${filePath}":`, bakErr.message);
    }
  }

  return defaultValue;
}

/**
 * Grava dados em arquivo JSON de forma 100% atômica garantindo que o .bak só seja atualizado com JSONs íntegros
 * @param {string} filePath - Caminho absoluto para o arquivo de destino
 * @param {any} data - Dados a serem serializados em JSON
 * @returns {boolean}
 */
export function writeJsonAtomic(filePath, data) {
  if (!filePath || data === undefined) return false;

  const dir = path.dirname(filePath);
  const tmpPath = `${filePath}.tmp.${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const bakPath = `${filePath}.bak`;

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const jsonString = JSON.stringify(data, null, 2);

    // 1. Grava no arquivo temporário único
    fs.writeFileSync(tmpPath, jsonString, 'utf-8');

    // 2. Garante snapshot de backup (.bak) apenas se o arquivo atual for válido
    if (fs.existsSync(filePath)) {
      try {
        const currentContent = fs.readFileSync(filePath, 'utf-8');
        if (isValidJson(currentContent)) {
          fs.copyFileSync(filePath, bakPath);
        }
      } catch (copyErr) {}
    } else {
      try {
        fs.copyFileSync(tmpPath, bakPath);
      } catch (copyErr) {}
    }

    // 3. Substituição atômica
    try {
      fs.renameSync(tmpPath, filePath);
    } catch (renameErr) {
      // Fallback para Windows caso rename falhe por lock temporário
      fs.copyFileSync(tmpPath, filePath);
      try { fs.unlinkSync(tmpPath); } catch {}
    }

    return true;
  } catch (err) {
    console.error(`❌ [FileStorage Error] Erro ao gravar atomicamente em "${filePath}":`, err.message);
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    return false;
  }
}

/**
 * Gravação assíncrona encadeada com controle de fila por arquivo para evitar race conditions
 * @param {string} filePath
 * @param {any} data
 * @returns {Promise<boolean>}
 */
export async function writeJsonAtomicAsync(filePath, data) {
  let lock = fileLocks.get(filePath);
  if (!lock) {
    lock = Promise.resolve();
  }

  const nextLock = lock.then(() => {
    return writeJsonAtomic(filePath, data);
  }).catch(err => {
    console.error(`❌ [Async FileStorage Error]:`, err);
    return false;
  });

  fileLocks.set(filePath, nextLock);
  return nextLock;
}
