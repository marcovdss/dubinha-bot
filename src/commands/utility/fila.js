import { SlashCommandBuilder } from 'discord.js';
import { getQueueList } from '../../services/musicPlayer.js';

export const data = new SlashCommandBuilder()
  .setName('fila')
  .setDescription('Mostra a lista das músicas na fila de reprodução.');

export async function execute(interaction) {
  const result = getQueueList(interaction);

  await interaction.reply({
    content: result.message,
    ephemeral: true
  });
}
