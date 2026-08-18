import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const eventsPath = path.join(__dirname, '../events');

/**
 * Registra todos os manipuladores de eventos no cliente do Discord
 * @param {import('discord.js').Client} client
 */
export async function registerEvents(client) {
  if (!fs.existsSync(eventsPath)) return;

  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const fileUrl = new URL(`file://${filePath}`).href;

    try {
      const event = await import(fileUrl);
      if (!event.name || typeof event.execute !== 'function') {
        console.warn(`⚠️ [Aviso] Evento em "${file}" precisa exportar "name" e função "execute".`);
        continue;
      }

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }

      console.log(`⚡ [Evento Registrado]: ${event.name}`);
    } catch (error) {
      console.error(`❌ Erro ao registrar evento de "${filePath}":`, error);
    }
  }
}
