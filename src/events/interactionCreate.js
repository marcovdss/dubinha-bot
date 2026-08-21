import { Events } from 'discord.js';
import { handleMusicButton } from '../services/musicPlayer.js';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
  // 1. Processa Cliques em Botões Interativos (Player de Música)
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('music_')) {
      try {
        await handleMusicButton(interaction);
      } catch (buttonErr) {
        console.error('[Erro ao processar botão de música]:', buttonErr);
      }
    }
    return;
  }

  // 2. Processa Comandos de Barra (Slash Commands)
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`[Aviso] Nenhum comando correspondente a ${interaction.commandName} foi encontrado.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Erro no comando ${interaction.commandName}]:`, error);
    const replyContent = {
      content: 'qual foi mano, deu um erro aqui pra executar esse comando!',
      ephemeral: true
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyContent).catch(() => null);
      } else {
        await interaction.reply(replyContent).catch(() => null);
      }
    } catch {}
  }
}
