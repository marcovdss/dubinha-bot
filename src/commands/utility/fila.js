import { SlashCommandBuilder } from 'discord.js';
import { getQueueList } from '../../services/musicPlayer.js';

export const data = new SlashCommandBuilder()
  .setName('fila')
  .setDescription('Mostra a música tocando agora e as próximas músicas da fila.');

export async function execute(interaction) {
  const result = getQueueList(interaction);

  await interaction.reply({
    content: result.message
  });
}
