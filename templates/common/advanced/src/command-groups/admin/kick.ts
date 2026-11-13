import { defineSubcommand, hasPermission } from '@sxnnyside/circe';
import { MessageFlags, PermissionFlagsBits, SlashCommandSubcommandBuilder } from 'discord.js';

export default defineSubcommand({
  builder: new SlashCommandSubcommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the guild.')
    .addUserOption((opt) =>
      opt.setName('target').setDescription('The member to kick').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the kick').setRequired(false),
    ),
  guards: [hasPermission(PermissionFlagsBits.KickMembers)],
  async execute({ interaction, logger }) {
    const targetUser = interaction.options.getUser('target', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      await interaction.reply({
        content: 'Member not found in this guild.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!member.kickable) {
      await interaction.reply({
        content: 'Cannot kick this member due to hierarchy permissions.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await member.kick(reason);
    logger.info(`Kicked ${member.user.tag} for: ${reason}`);
    await interaction.reply({
      content: `Successfully kicked ${member.user.tag}. Reason: ${reason}`,
    });
  },
});
