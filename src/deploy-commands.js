import { REST, Routes } from 'discord.js';
import { config, validateEnv } from './config/env.js';
import { loadCommands } from './utils/commandLoader.js';

validateEnv();

const { token, clientId, guildId } = config.discord;

if (!clientId || clientId === 'seu_client_id_aqui') {
  console.error('❌ ERRO: CLIENT_ID não foi configurado no arquivo .env!');
  process.exit(1);
}

async function deploy() {
  try {
    const commands = await loadCommands();
    const commandData = commands.map(cmd => cmd.data.toJSON());
    const rest = new REST().setToken(token);

    if (guildId) {
      // Registro direto no servidor específico (instantâneo - 0 segundos de espera)
      console.log(`\n⏳ Registrando ${commandData.length} comando(s) no servidor (Guild ID: ${guildId})...`);
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandData }
      );
      console.log(`✅ Sucesso instantâneo! ${data.length} comando(s) registrados no seu servidor.`);
    }

    // Registro global (para funcionar em todos os servidores)
    console.log(`\n⏳ Registrando ${commandData.length} comando(s) de barra globalmente...`);
    const data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commandData }
    );
    console.log(`✅ Sucesso! ${data.length} comando(s) registrados globalmente na API do Discord.\n`);

    console.log('👉 Dica: Se os comandos ainda não aparecerem no Discord, pressione CTRL + R no aplicativo do Discord para recarregar o cache!\n');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos na API do Discord:', error);
    process.exit(1);
  }
}

deploy();
