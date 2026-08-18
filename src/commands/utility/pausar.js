import { SlashCommandBuilder } from 'discord.js';
import { pauseMusic } from '../../services/musicPlayer.js';

export const data = new SlashCommandBuilder()
  .setName('pausar')
  .setDescription('Pausa a música que está tocando.');

export async function execute(interaction) {
  const result = pauseMusic(interaction);

  await interaction.reply({
    content: result.message
  });
}
