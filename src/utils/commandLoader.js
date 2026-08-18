import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsPath = path.join(__dirname, '../commands');

/**
 * Carrega todos os comandos da pasta src/commands
 * @returns {Promise<Array<{ data: any, execute: Function, filePath: string }>>}
 */
export async function loadCommands() {
  const loadedCommands = [];

  if (!fs.existsSync(commandsPath)) {
    return loadedCommands;
  }

  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const fileUrl = new URL(`file://${filePath}`).href;

      try {
        const command = await import(fileUrl);
        if (command.data && typeof command.execute === 'function') {
          loadedCommands.push({
            data: command.data,
            execute: command.execute,
            filePath
          });
        } else {
          console.warn(`⚠️ [Aviso] Comando em "${file}" precisa exportar "data" e função "execute".`);
        }
      } catch (error) {
        console.error(`❌ Erro ao importar comando de "${filePath}":`, error);
      }
    }
  }

  return loadedCommands;
}
