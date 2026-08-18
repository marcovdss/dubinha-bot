import { SlashCommandBuilder } from 'discord.js';
import { pauseMusic } from '../../services/musicPlayer.js';

export const data = new SlashCommandBuilder()
  .setName('pausar')
  .setDescription('Pausa a música atual.');

export async function execute(interaction) {
  const result = await pauseMusic(interaction);

  await interaction.reply({
    content: result.message,
    ephemeral: true
  });
}
