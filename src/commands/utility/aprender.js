import { SlashCommandBuilder } from 'discord.js';
import { addManualMemory } from '../../services/learning.js';

export const data = new SlashCommandBuilder()
  .setName('aprender')
  .setDescription('Atualiza a memória, fatos ou regras de comportamento do Dubinha')
  .addStringOption(option =>
    option
      .setName('instrucao')
      .setDescription('A regra de comportamento, fato sobre a vida dele ou fala autêntica')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('tipo')
      .setDescription('O tipo de atualização (opcional - auto-detecta por padrão)')
      .setRequired(false)
      .addChoices(
        { name: '🤖 Auto-Detectar', value: 'auto' },
        { name: '⚙️ Regra de Comportamento (Como agir / Proibições)', value: 'regra' },
        { name: '📖 Fato & Biografia (História de vida / Gostos)', value: 'fato' },
        { name: '💬 Frase & Resposta de Diálogo', value: 'frase' }
      )
  )
  .addStringOption(option =>
    option
      .setName('contexto')
      .setDescription('Contexto da conversa ou pergunta feita (opcional)')
      .setRequired(false)
  );

export async function execute(interaction) {
  const instrucao = interaction.options.getString('instrucao');
  const tipo = interaction.options.getString('tipo') || 'auto';
  const contexto = interaction.options.getString('contexto');

  const result = await addManualMemory(instrucao, contexto, tipo);

  if (result.success) {
    let emoji = '🧠';
    if (result.type === 'regra') emoji = '⚙️';
    if (result.type === 'fato') emoji = '📖';
    if (result.type === 'frase') emoji = '💬';

    let reply = `${emoji} **Dubinha Atualizado com Sucesso!**\n\n`;
    reply += `📂 **Tipo de Atualização:** \`${result.categoryName}\`\n`;
    reply += `📝 **Conteúdo:** \`${result.item}\`\n`;

    if (contexto) {
      reply += `🎯 **Gatilho / Contexto:** \`${contexto}\`\n`;
    }

    reply += `\n💾 *Salvo permanentemente em \`data/custom_memory.json\` e ativo na persona do bot a partir de agora!*`;

    await interaction.reply({
      content: reply,
      ephemeral: true
    });
  } else {
    await interaction.reply({
      content: '❌ Ocorreu um erro ao salvar a atualização. Tente novamente!',
      ephemeral: true
    });
  }
}
