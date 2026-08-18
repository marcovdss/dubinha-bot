import { Events, ActivityType } from 'discord.js';
import { startPizzaScheduler } from '../services/randomEvents.js';
import { startTerminalInput } from '../services/terminalInput.js';
import { startPresenceRotation } from '../services/presenceManager.js';

export const name = Events.ClientReady;
export const once = true;

export function execute(client) {
  console.log(`🚀 [Dubinha Online] Conectado como ${client.user.tag} (ID: ${client.user.id}) | Servidores: ${client.guilds.cache.size}`);

  // Inicia o Rich Presence realista simulando que ele está jogando WoW, BF4, Delta, etc.
  startPresenceRotation(client);

  // Inicia os eventos aleatórios periódicos (ex: pedir pizza ao longo do dia)
  startPizzaScheduler(client);

  // Inicia a interface de controle direto pelo terminal (God Mode)
  startTerminalInput(client);
}
