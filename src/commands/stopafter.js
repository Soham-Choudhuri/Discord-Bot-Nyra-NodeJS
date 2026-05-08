const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stopafter')
        .setDescription('Wait for the current song to finish, then stop and clear the queue'),

    async execute(interaction, client) {
        const player = client.lavalink.getPlayer(interaction.guildId);

        if (!player || !player.playing) {
            return interaction.reply({
                content: '❌ Nothing is currently playing.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        // Clear the upcoming tracks and disable autoplay
        player.queue.splice(0, player.queue.tracks.length);
        player.set('autoplay', false);
        player.set('favoritesQueue', null);

        await interaction.reply('⏳ **Lazy Stop**: Current song will finish, then playback will stop and queue will be cleared.');
    },
};