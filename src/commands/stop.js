const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playback and clear the queue'),

    async execute(interaction, client) {
        const player = client.lavalink.getPlayer(interaction.guildId);

        if (!player || (!player.playing && player.queue.tracks.length === 0)) {
            return interaction.reply({
                content: '❌ Nothing is currently playing.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        // Clear the upcoming tracks and stop playback
        player.queue.splice(0, player.queue.tracks.length);
        player.set('autoplay', false);
        player.set('favoritesQueue', null);

        const autoplayManager = player.get('autoplayManager');
        if (autoplayManager) autoplayManager.playedIds.clear();

        // Stop the current track but STAY in the voice channel
        await player.stopPlaying();
        client.user.setActivity();

        await interaction.reply('⏹️ Stopped playback and cleared the queue. I\'m still in the channel.');
    },
};