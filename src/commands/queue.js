const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

// Helper function to convert milliseconds to a clean HH:MM:SS format
function formatDuration(ms) {
    if (ms == null || isNaN(ms)) return 'Unknown';
    if (ms >= 9223372036854770000) return '🔴 LIVE'; // Lavalink Live Stream
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('View the current playback queue'),

    async execute(interaction, client) {
        const player = client.lavalink.getPlayer(interaction.guildId);

        // 1. Guard Clauses
        if (!player || (!player.playing && player.queue.tracks.length === 0)) {
            return interaction.reply({ content: '❌ The queue is currently empty.', flags: [MessageFlags.Ephemeral] });
        }

        // Handle variations in Lavalink wrapper queue structures
        const queueTracks = player.queue.tracks || []; 
        const currentTrack = player.queue.current;

        if (!currentTrack) {
            return interaction.reply({ content: '❌ Nothing is currently playing.', flags: [MessageFlags.Ephemeral] });
        }

        // 2. Pagination Setup
        let currentPage = 0;
        const tracksPerPage = 10;
        const maxPages = Math.ceil(queueTracks.length / tracksPerPage) || 1;

        // 3. Total Time Math
        const totalQueueMs = queueTracks.reduce((acc, track) => acc + (track.info.length || 0), 0);
        const totalTimeStr = formatDuration(totalQueueMs + (currentTrack.info.length || 0));

        // 4. The Embed Generator Function
        const generateEmbed = (page) => {
            const start = page * tracksPerPage;
            const end = start + tracksPerPage;
            const currentSlice = queueTracks.slice(start, end);

            const embed = new EmbedBuilder()
                .setColor('#2b2d31') // Clean, dark Discord-native color
                .setAuthor({ name: `🎶 Queue for ${interaction.guild.name}` })
                .setDescription(`**💿 Now Playing**\n[${currentTrack.info.title}](${currentTrack.info.uri}) \`[${formatDuration(currentTrack.info.length)}]\`\n\n**🔼 Up Next**`)
                .setFooter({ text: `Page ${page + 1} of ${maxPages} | Total Time: ${totalTimeStr}` });

            if (currentSlice.length > 0) {
                const trackList = currentSlice.map((track, index) => {
                    return `**${start + index + 1}.** [${track.info.title}](${track.info.uri}) \`[${formatDuration(track.info.length)}]\``;
                }).join('\n');
                embed.addFields({ name: '\u200b', value: trackList });
            } else {
                embed.addFields({ name: '\u200b', value: '*The queue is empty.*' });
            }

            return embed;
        };

        // 5. The Buttons Generator Function
        const generateButtons = (page) => {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('queue_prev')
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('queue_next')
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === maxPages - 1 || maxPages === 0)
            );
            return row;
        };

        // 6. Send Initial Payload
        const message = await interaction.reply({
            embeds: [generateEmbed(currentPage)],
            components: maxPages > 1 ? [generateButtons(currentPage)] : [],
            fetchReply: true
        });

        if (maxPages <= 1) return; // No need for a collector if there's only 1 page

        // 7. The Interactive Collector (Listens for clicks on this specific message)
        const collector = message.createMessageComponentCollector({ 
            filter: i => i.user.id === interaction.user.id, // Only the requester can click
            time: 60000 // Buttons expire after 60 seconds
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'queue_prev') currentPage--;
            if (i.customId === 'queue_next') currentPage++;

            await i.update({
                embeds: [generateEmbed(currentPage)],
                components: [generateButtons(currentPage)]
            });
        });

        // 8. Cleanup after 60 seconds to clear Discord API memory
        collector.on('end', () => {
            message.edit({ components: [] }).catch(() => {}); // Remove buttons silently
        });
    }
};