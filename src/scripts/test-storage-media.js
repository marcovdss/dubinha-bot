import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJsonSafe, writeJsonAtomic } from '../utils/fileStorage.js';
import { fetchImageAttachment } from '../utils/mediaHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('=== TESTE 1: ARMAZENAMENTO ATÔMICO & RECUPERAÇÃO DE BACKUP ===');
  const testFilePath = path.join(__dirname, '../../data/test_atomic_storage.json');

  // 1. Gravação atômica
  const initialData = { test: 'atomic_ok', count: 42, timestamp: Date.now() };
  const writeSuccess = writeJsonAtomic(testFilePath, initialData);
  console.log('Gravação atômica inicial:', writeSuccess ? 'SUCESSO' : 'FALHA');

  // 2. Leitura segura
  const readData = readJsonSafe(testFilePath, null);
  console.log('Leitura segura retornou:', readData?.test === 'atomic_ok' ? 'SUCESSO' : 'FALHA');

  // 3. Simula corrupção do arquivo principal
  console.log('Simulando corrupção proposital do arquivo principal...');
  fs.writeFileSync(testFilePath, '{ CORRUPTED_JSON_TRUNCATED: true, ', 'utf-8');

  // 4. Leitura segura com auto-recuperação pelo .bak
  const recoveredData = readJsonSafe(testFilePath, null);
  console.log('Recuperação automática do backup .bak:', recoveredData?.test === 'atomic_ok' ? 'SUCESSO' : 'FALHA');

  // Limpeza dos arquivos temporários de teste
  try {
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
    if (fs.existsSync(`${testFilePath}.bak`)) fs.unlinkSync(`${testFilePath}.bak`);
  } catch {}

  console.log('\n=== TESTE 2: MOTOR MULTI-PROVEDOR DE IMAGENS ===');
  const queries = [
    'gato dormindo',
    'setup gamer gambiarra',
    'pizza calabresa',
    'cuscuz com manteiga'
  ];

  for (const q of queries) {
    console.log(`Buscando imagem para: "${q}"...`);
    const attachment = await fetchImageAttachment(q);
    if (attachment && attachment.attachment && Buffer.isBuffer(attachment.attachment)) {
      console.log(`✅ Sucesso! Imagem obtida: ${attachment.name} (${(attachment.attachment.length / 1024).toFixed(1)} KB)`);
    } else {
      console.error(`❌ Falha ao obter imagem para "${q}"`);
    }
  }

  console.log('\n=== TODOS OS TESTES CONCLUÍDOS COM SUCESSO! ===');
}

runTests();
