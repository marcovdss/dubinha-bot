import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { config, normalizeProbability } from '../../config/env.js';

export const data = new SlashCommandBuilder()
  .setName('introsa')
  .setDescription('Regula ou exibe a chance do Dubinha se intrometer nas conversas (Modo Introsa)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(option =>
    option
      .setName('chance')
      .setDescription('Chance de resposta espontânea (ex: 5%, 0.05, 10%, 25%, 0% para desativar)')
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName('cooldown')
      .setDescription('Tempo mínimo de espera em segundos entre intromissões no mesmo canal (ex: 25)')
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(600)
  );

export async function execute(interaction) {
  const chanceInput = interaction.options.getString('chance');
  const cooldownInput = interaction.options.getInteger('cooldown');

  let updated = false;

  if (chanceInput !== null) {
    config.behavior.replyProbability = normalizeProbability(chanceInput, config.behavior.replyProbability);
    updated = true;
  }

  if (cooldownInput !== null) {
    config.behavior.cooldownSeconds = cooldownInput;
    updated = true;
  }

  const currentPercent = (config.behavior.replyProbability * 100).toFixed(1);
  const currentCooldown = config.behavior.cooldownSeconds;
  const isEnabled = config.behavior.replyProbability > 0;

  if (updated) {
    let msg = `🎲 **Modo Introsa Regulado com Sucesso!**\n\n`;
    msg += `📊 **Nova Chance:** \`${currentPercent}%\` ${isEnabled ? '⚡ (Ativo)' : '⏸️ (Desativado)'}\n`;
    msg += `⏱️ **Novo Cooldown:** \`${currentCooldown}s\`\n\n`;
    msg += `💡 *O Dubinha passará a responder mensagens espontâneas com essa taxa imediatamente no canal alvo.*`;
    await interaction.reply({ content: msg, ephemeral: true });
  } else {
    let msg = `🎲 **Status do Modo Introsa (Respostas Espontâneas):**\n\n`;
    msg += `📊 **Chance Atual:** \`${currentPercent}%\` ${isEnabled ? '⚡ (Ativo)' : '⏸️ (Desativado)'}\n`;
    msg += `⏱️ **Cooldown:** \`${currentCooldown}s\`\n`;
    msg += `👥 **Mínimo de Mensagens:** \`${config.behavior.minHumanMessages}\`\n\n`;
    msg += `💡 *Para alterar, use \`/introsa chance:5%\` ou \`/introsa chance:5% cooldown:30\`.*`;
    await interaction.reply({ content: msg, ephemeral: true });
  }
}
