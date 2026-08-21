import { REST, Routes } from 'discord.js';
import { config, validateEnv } from './config/env.js';
import { loadCommands } from './utils/commandLoader.js';

validateEnv();

const { token, clientId, guildId } = config.discord;

if (!clientId || clientId === 'seu_client_id_aqui') {
  console.error('❌ ERRO: CLIENT_ID não foi configurado no arquivo .env!');
  process.exit(1);
}

const args = process.argv.slice(2);
const isCleanOnly = args.includes('--clean') || args.includes('--wipe') || args.includes('--clear');

async function deploy() {
  try {
    const rest = new REST().setToken(token);

    if (isCleanOnly) {
      console.log('\n🧹 [Modo Limpeza Total] Removendo todos os comandos registrados na API do Discord...');

      // 1. Limpa comandos globais
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log('✅ Comandos globais zerados com sucesso!');

      // 2. Limpa comandos de servidor se guildId estiver configurado
      if (guildId) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        console.log(`✅ Comandos do servidor (Guild ID: ${guildId}) zerados com sucesso!`);
      } else {
        console.log('ℹ️ Se você registrou comandos em um servidor específico antes, defina GUILD_ID no .env para limpar lá também.');
      }

      console.log('\n✨ Limpeza concluída! No app do Discord, pressione CTRL + R para limpar o cache visual.');
      console.log('👉 Em seguida, rode "npm run deploy" para registrar os comandos limpos.\n');
      return;
    }

    const commands = await loadCommands();
    const commandData = commands.map(cmd => cmd.data.toJSON());

    if (guildId) {
      // Modo Servidor Específico (desenvolvimento / guild exclusivo):
      console.log(`\n⏳ Registrando ${commandData.length} comando(s) no servidor (Guild ID: ${guildId})...`);
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandData }
      );
      console.log(`✅ Sucesso instantâneo! ${data.length} comando(s) registrados no seu servidor.`);

      // Limpa comandos globais legados para evitar duplicidade na interface
      console.log('🧹 Limpando comandos globais antigos para evitar duplicatas...');
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log('✅ Comandos globais limpos.\n');
    } else {
      // Modo Global (para funcionar em todos os servidores):
      console.log(`\n⏳ Registrando ${commandData.length} comando(s) de barra globalmente...`);
      const data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandData }
      );
      console.log(`✅ Sucesso! ${data.length} comando(s) registrados globalmente na API do Discord.`);
      console.log('ℹ️ Comandos globais podem levar de alguns minutos até 1h para atualizar em todos os servidores.\n');
    }

    console.log('👉 Dica essencial: Se ainda vir comandos antigos ou duplicados no Discord, feche e abra o Discord ou pressione CTRL + R para recarregar o cache local!\n');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos na API do Discord:', error);
    process.exit(1);
  }
}

deploy();

