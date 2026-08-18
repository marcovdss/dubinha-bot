import { SlashCommandBuilder } from 'discord.js';
import { skipMusic } from '../../services/musicPlayer.js';

export const data = new SlashCommandBuilder()
  .setName('pular')
  .setDescription('Pula para a próxima música da fila.');

export async function execute(interaction) {
  const result = await skipMusic(interaction);

  await interaction.reply({
    content: result.message,
    ephemeral: true
  });
}
