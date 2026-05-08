const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database/schema').db; // Adjust this path if your SQLite connection is located elsewhere

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blend')
        .setDescription('Start a personalized radio session seeded from your favorites')
        .addStringOption(option =>
            option.setName('vibe')
                .setDescription('Which specific vibe do you want to listen to?')
                .setRequired(false)
                .addChoices(
                    { name: '🎸 Heavy / Metalcore', value: 'heavy' },
                    { name: '🌙 Late Night / Chill', value: 'chill' },
                    { name: '🔥 High Energy', value: 'energy' },
                    { name: '📁 Uncategorized', value: 'uncategorized' }
                )
        ),

    async execute(interaction, client) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
            return interaction.reply({
                content: '❌ You must be in a voice channel to start a blend.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const vibe = interaction.options.getString('vibe');

        // 1. Build the dynamic SQLite Query
        let query = `SELECT track_url, track_title, track_author FROM user_favorites WHERE user_id = ?`;
        let params = [interaction.user.id];

        if (vibe) {
            query += ` AND tag = ?`;
            params.push(vibe);
        }

        // Fetch the user's curated list
        const userTracks = db.prepare(query).all(...params);

        if (userTracks.length === 0) {
            const vibeText = vibe ? `in the **${vibe}** vibe` : `in your favorites`;
            return interaction.reply({
                content: `❌ You don't have enough tracks saved ${vibeText} to start a blend. Click the ❤️ on some tracks first!`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        await interaction.deferReply();

        // 2. The Algorithmic Seed (Pick a random track from their curated list)
        const randomSeed = userTracks[Math.floor(Math.random() * userTracks.length)];

        try {
            // 3. Initialize NodeLink Player
            const player = client.lavalink.createPlayer({
                guildId: interaction.guildId,
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction.channelId,
                selfDeaf: true,
                volume: 100
            });

            if (!player.connected) await player.connect();

            // 4. Resolve the seed track
            const result = await player.search({ query: randomSeed.track_url }, interaction.user);

            if (!result.tracks || result.tracks.length === 0) {
                return interaction.editReply('❌ Nyra failed to resolve the seed track from YouTube. Please try again.');
            }

            const track = result.tracks[0];

            // 5. Inject into the JIT Autoplay Engine
            await player.queue.add(track);

            if (!player.playing) {
                await player.play();
            }

            // 6. UI Confirmation
            const vibeDisplay = vibe ? `(${vibe.toUpperCase()})` : '(ALL VIBES)';
            await interaction.editReply(`🔀 **Nyra Blend ${vibeDisplay}:** Session seeded with **${randomSeed.track_title}** by **${randomSeed.track_author}**.\n*Autoplay will dynamically curate the upcoming tracks based on this vibe.*`);

        } catch (error) {
            console.error('❌ Blend Command Error:', error);
            await interaction.editReply('❌ An error occurred while starting your blend.');
        }
    }
};