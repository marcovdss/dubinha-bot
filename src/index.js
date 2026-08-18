import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { config, validateEnv } from './config/env.js';
import { loadCommands } from './utils/commandLoader.js';
import { registerEvents } from './utils/eventLoader.js';

// 1. Valida variáveis de ambiente
validateEnv();

// 2. Previne que erros assíncronos não tratados derrubem a aplicação
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [Unhandled Rejection]:', reason);
});

process.on('uncaughtException', (error) => {
  if (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED') {
    return; // Ignora EPIPE inofensivo de encerramento de pipe de áudio
  }
  console.error('💥 [Uncaught Exception]:', error);
});

// 3. Inicializa o cliente do Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.commands = new Collection();

async function bootstrap() {
  try {
    // 4. Carrega comandos
    const commands = await loadCommands();
    for (const cmd of commands) {
      client.commands.set(cmd.data.name, cmd);
      console.log(`📦 [Comando Carregado]: /${cmd.data.name}`);
    }

    // 5. Registra eventos
    await registerEvents(client);

    // 6. Conecta ao Discord
    console.log('\n⏳ Conectando o bot ao Discord...');
    await client.login(config.discord.token);
  } catch (error) {
    console.error('\n❌ Falha crítica ao inicializar o bot:');
    console.error(error.message);
    process.exit(1);
  }
}

bootstrap();
