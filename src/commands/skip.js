const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the currently playing track'),

    async execute(interaction, client) {
        const player = client.lavalink.getPlayer(interaction.guildId);

        if (!player || !player.playing) {
            return interaction.reply({
                content: '❌ Nothing is currently playing.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        const skippedTitle = player.queue.current?.info?.title || 'Unknown';

        // lavalink-client automatically handles queue progression on skip
        await player.skip();

        await interaction.reply(`⏭️ Skipped: **${skippedTitle}**`);
    },
};