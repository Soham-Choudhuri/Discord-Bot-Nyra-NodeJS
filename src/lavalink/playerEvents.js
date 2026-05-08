const { EmbedBuilder, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ytmusic = require('../services/ytmusic');
const configManager = require('../services/configManager');

/**
 * Extracts the YouTube videoId from a track URI.
 */
function extractVideoId(uri) {
    if (!uri) return null;
    try {
        const url = new URL(uri);
        return url.searchParams.get('v') || null;
    } catch {
        if (/^[a-zA-Z0-9_-]{11}$/.test(uri)) return uri;
        return null;
    }
}

/**
 * Formats a duration in milliseconds to mm:ss or hh:mm:ss.
 */
function formatDuration(ms) {
    // Failsafe for missing or undefined data (fixes NaN:NaN)
    if (ms == null || isNaN(ms)) return 'Unknown';

    // Lavalink's max-integer signature for Live Streams
    if (ms >= 9223372036854770000) return '🔴 LIVE';

    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Registers global player events on the Lavalink-Client manager.
 */
function registerPlayerEvents(client) {

    // ─── Track Start Event ───────────────────────────────────────────
    client.lavalink.on("trackStart", async (player, track, payload) => {
        const guildId = player.guildId;
        const config = configManager.get(guildId);

        // We retrieve custom metadata that we will attach to the player in stream.js
        const autoplayManager = player.get('autoplayManager');
        const videoId = extractVideoId(track.info?.uri);

        if (autoplayManager && videoId) {
            autoplayManager.addHistory(videoId);
        }

        // --- Artist History Tracking (Engine Improvement) ---
        let artistHistory = player.get('artistHistory') || [];
        if (track.info.author && !artistHistory.includes(track.info.author)) {
            artistHistory.push(track.info.author);
            const memoryLimit = Math.min(config.artist_memory || 5, 10);
            while (artistHistory.length > memoryLimit) {
                artistHistory.shift();
            }
            player.set('artistHistory', artistHistory);
        }

        const channelId = config.np_channel_id || player.textChannelId;
        const textChannel = client.channels.cache.get(channelId);

        if (textChannel) {
            const isVerbose = config.verbose_mode === 1;
            let response;

            // --- UI Component Generation ---
            if (isVerbose) {
                const embed = new EmbedBuilder()
                    .setColor(0x7C3AED)
                    .setAuthor({ name: '🎵 Now Playing' })
                    .setTitle(track.info.title)
                    .setURL(track.info.uri)
                    .addFields(
                        { name: 'Artist', value: track.info.author || 'Unknown', inline: true },
                        { name: 'Duration', value: formatDuration(track.info.length), inline: true },
                    )
                    .setTimestamp();

                if (track.info.artworkUrl) embed.setThumbnail(track.info.artworkUrl);

                if (player.queue.tracks.length > 0) {
                    embed.setFooter({ text: `${player.queue.tracks.length} track(s) remaining in queue` });
                } else if (player.get('autoplay')) {
                    embed.setFooter({ text: '♾️ Autoplay is enabled' });
                }

                // The Verbose Button
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('save_favorite')
                        .setLabel('Save')
                        .setEmoji('❤️')
                        .setStyle(ButtonStyle.Secondary)
                );

                response = { embeds: [embed], components: [row], content: null };
            } else {
                // The Compact Text
                response = { content: `🎵 Now playing: **${track.info.author} - ${track.info.title}**`, embeds: [], components: [] };
            }

            // --- Activity Status Update (Global) ---
            client.user.setActivity(`${track.info.author} - ${track.info.title}`, { type: ActivityType.Listening });

            // --- Persistent Message Logic (Delete & Resend) ---
            if (config.np_message_id) {
                try {
                    const oldMsg = await textChannel.messages.fetch(config.np_message_id);
                    if (oldMsg && oldMsg.deletable) await oldMsg.delete();
                } catch (e) { }
            }

            try {
                const newMsg = await textChannel.send(response);
                configManager.set(guildId, 'np_message_id', newMsg.id);

                // --- Compact Mode Reaction Trigger ---
                // If it's compact mode, add the heart reaction for users to click
                if (!isVerbose) {
                    await newMsg.react('❤️').catch(() => { });
                }
            } catch (error) {
                console.error('❌ Persistent NP message error:', error.message);
            }
        }
    });

    // ─── Queue End Event (The Autoplay & JIT Engine) ─────────────────
    client.lavalink.on("queueEnd", async (player, track, payload) => {
        const guildId = player.guildId;

        // 1. Check the Just-In-Time Favorites Queue first
        const favoritesQueue = player.get('favoritesQueue');

        if (favoritesQueue && favoritesQueue.length > 0) {
            // Pop the next track ID off the array and update the state
            const nextVideoId = favoritesQueue.shift();
            player.set('favoritesQueue', favoritesQueue);

            try {
                const url = `https://music.youtube.com/watch?v=${nextVideoId}`;
                const searchResult = await player.search(
                    { query: url, source: 'ytmsearch' },
                    client.user
                );

                if (searchResult.tracks && searchResult.tracks.length > 0) {
                    await player.queue.add(searchResult.tracks[0]);
                    await player.play();
                    return; // Session continues with the next favorite!
                } else {
                    // If this specific URL fails, immediately re-emit queueEnd to skip to the next one
                    client.lavalink.emit("queueEnd", player, track, payload);
                    return;
                }
            } catch (error) {
                console.error(`❌ JIT Favorites error for guild ${guildId}:`, error.message);
                client.lavalink.emit("queueEnd", player, track, payload);
                return;
            }
        }

        // 2. If no favorites are left, fall back to the standard Autoplay engine
        const isAutoplay = player.get('autoplay');
        const autoplayManager = player.get('autoplayManager');

        // If Autoplay is on, fetch the next algorithmic track
        if (isAutoplay && autoplayManager) {
            try {
                const config = configManager.get(guildId);
                if (config.autoplay_seed) {
                    autoplayManager.seedVideoId = config.autoplay_seed;
                }

                const artistHistory = player.get('artistHistory') || [];
                const nextMeta = await autoplayManager.getNextTrack(config, artistHistory);

                if (nextMeta) {
                    const searchResult = await player.search(
                        { query: `${nextMeta.title} ${nextMeta.artists}`, source: 'ytmsearch' },
                        client.user
                    );

                    if (searchResult.tracks && searchResult.tracks.length > 0) {
                        await player.queue.add(searchResult.tracks[0]);
                        await player.play();
                        return; // Session continues with algorithmic autoplay!
                    }
                }
            } catch (error) {
                console.error(`❌ Autoplay error for guild ${guildId}:`, error.message);
            }
        }

        // 3. --- Session End Logic (Runs if no favorites, no Autoplay, or if they fail) ---
        const config = configManager.get(guildId);
        if (config.np_message_id) {
            try {
                const channelId = config.np_channel_id || player.textChannelId;
                const textChannel = client.channels.cache.get(channelId);
                if (textChannel) {
                    const msg = await textChannel.messages.fetch(config.np_message_id);
                    if (msg && msg.deletable) {
                        await msg.delete();
                    }
                    await textChannel.send({
                        content: '🏁 **Queue finished!** I\'m still in the voice channel.',
                        embeds: []
                    });
                }
            } catch (e) { }
            configManager.set(guildId, 'np_message_id', null);
        }

        // Clear Activity Status
        const activePlayers = client.lavalink.players.filter(p => p.playing);
        if (activePlayers.size === 0) client.user.setActivity();

        // Cleanup memory for the next session
        if (autoplayManager) autoplayManager.playedIds.clear();
        player.set('favoritesQueue', null);
    });

    // ─── Error Handling Improvement ──────────────────────────────────
    client.lavalink.on("trackError", async (player, track, payload) => {
        console.error(`⚠️ Track error in guild ${player.guildId}:`, payload.error || payload);

        // If a track fails, don't just sit there—skip it!
        if (player.queue.tracks.length > 0 || player.get('autoplay')) {
            await player.skip();
        }
    });

    client.lavalink.on("trackStuck", async (player, track, payload) => {
        console.warn(`⚠️ Track stuck in guild ${player.guildId}. Threshold: ${payload.thresholdMs}ms`);

        // Increment a "stuck counter" in the player metadata
        let stuckCount = player.get('stuck_count') || 0;
        stuckCount++;
        player.set('stuck_count', stuckCount);

        // If it gets stuck more than twice on the same track, skip it
        if (stuckCount >= 2) {
            console.log(`⏩ Track "zombified." Skipping to next...`);
            player.set('stuck_count', 0);
            await player.skip();
        }
    });
}

module.exports = { registerPlayerEvents, extractVideoId, formatDuration };