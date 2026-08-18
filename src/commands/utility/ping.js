import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Responde com a latência do bot e da API do Discord.');

export async function execute(interaction) {
  const sent = await interaction.reply({ content: 'Calculando ping...', fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiLatency = Math.round(interaction.client.ws.ping);

  await interaction.editReply(`🏓 Pong!\n⚡ **Latência do Bot:** \`${latency}ms\`\n🌐 **Latência da API:** \`${apiLatency}ms\``);
}
