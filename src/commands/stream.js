const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const configManager = require('../services/configManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stream')
        .setDescription('Play a song or playlist from YouTube Music')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('A search term or URL')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        const member = interaction.member;
        const voiceChannel = member?.voice?.channel;

        // Validate: user must be in a voice channel
        if (!voiceChannel) {
            return interaction.reply({
                content: '❌ You must be in a voice channel to use this command.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        await interaction.deferReply();

        const query = interaction.options.getString('query');

        try {
            // Get or Create the Lavalink Player
            // lavalink-client automatically selects the best node and manages the connection
            const player = client.lavalink.createPlayer({
                guildId: interaction.guildId,
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction.channelId,
                selfDeaf: true,
                volume: 100
            });

            // Ensure the player is connected to the voice channel
            if (!player.connected) await player.connect();

            // Enforce Max Queue Size from config
            const config = configManager.get(interaction.guildId);
            if (player.queue.tracks.length >= config.max_queue_size) {
                return interaction.editReply(`❌ The queue is full! Maximum allowed songs: **${config.max_queue_size}**`);
            }

            // Determine the search identifier
            const isUrl = /^https?:\/\//.test(query);

            // Resolve the query through Lavalink-Client
            const result = await player.search(
                { query: query, source: isUrl ? undefined : 'ytmsearch' },
                interaction.user
            );

            if (!result || !result.tracks || result.tracks.length === 0 || result.loadType === 'empty' || result.loadType === 'error') {
                return interaction.editReply(`❌ No results found for: **${query}**`);
            }

            let tracksToAdd = [];
            let embedTitle = '';
            let embedDesc = '';

            switch (result.loadType) {
                case 'track':
                case 'search': {
                    // Logic Improvement: Find the closest title match in search results
                    const exactMatch = result.tracks.find(t =>
                        t.info.title.toLowerCase().includes(query.split('-').pop().trim().toLowerCase())
                    );
                    tracksToAdd = [exactMatch || result.tracks[0]];
                    embedTitle = '🎵 Track Queued';
                    embedDesc = `[${tracksToAdd[0].info.title}](${tracksToAdd[0].info.uri}) — ${tracksToAdd[0].info.author}`;
                    break;
                }
                case 'playlist': {
                    tracksToAdd = result.tracks;
                    embedTitle = '📋 Playlist Queued';
                    embedDesc = `**${result.playlist?.name || 'Unknown Playlist'}** — ${tracksToAdd.length} track(s)`;
                    break;
                }
                default: {
                    return interaction.editReply(`❌ Unexpected result type.`);
                }
            }

            // Add the track(s) to the lavalink-client managed queue
            await player.queue.add(tracksToAdd);

            // If nothing is playing, tell the player to start immediately
            if (!player.playing) {
                await player.play();
            }

            // Send confirmation embed
            const embed = new EmbedBuilder()
                .setColor(0x7C3AED)
                .setTitle(embedTitle)
                .setDescription(embedDesc)
                .setTimestamp();

            if (player.queue.tracks.length > 0) {
                embed.setFooter({ text: `Queue length: ${player.queue.tracks.length}` });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('❌ /stream error:', error);
            await interaction.editReply('❌ An error occurred while processing your request.').catch(() => { });
        }
    },
};