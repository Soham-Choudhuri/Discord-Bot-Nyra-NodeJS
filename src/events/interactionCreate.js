const { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, StringSelectMenuBuilder } = require('discord.js');
const configManager = require('../services/configManager');
const { autoDelete } = require('../utils/deleteTimer');

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction, client) {
        const guildId = interaction.guildId;
        const config = configManager.get(guildId);

        // ─── Command Channel Restriction ────────────────────────────
        if (interaction.isChatInputCommand()) {
            if (config.cmd_channel && interaction.channelId !== config.cmd_channel) {
                return interaction.reply({
                    content: `❌ Commands are restricted to <#${config.cmd_channel}>.`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction, client);
                
                // --- Auto-Delete Exclusion Logic ---
                const isSettings = interaction.commandName === 'settings';
                const isEphemeral = interaction.flags?.has(MessageFlags.Ephemeral);

                if (!isSettings && !isEphemeral) {
                    autoDelete(interaction, guildId);
                }
            } catch (error) {
                console.error(`❌ Error executing /${interaction.commandName}:`, error);
                const replyData = { content: '❌ Something went wrong while executing this command.', flags: [MessageFlags.Ephemeral] };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(replyData).catch(() => {});
                } else {
                    await interaction.reply(replyData).catch(() => {});
                }
                
                // Errors are usually ephemeral, but we apply the same check for safety
                const isEphemeralError = interaction.flags?.has(MessageFlags.Ephemeral);
                if (!isEphemeralError) {
                    autoDelete(interaction, guildId);
                }
            }
            return;
        }

        // ─── Buttons (Favorites Interactive Save) ──────────────────
        if (interaction.isButton()) {
            if (interaction.customId === 'save_favorite') {
                // Extract track details from the Now Playing embed
                const embed = interaction.message.embeds[0];
                if (!embed || !embed.url) {
                    return interaction.reply({ content: '❌ Could not find track details.', flags: [MessageFlags.Ephemeral] });
                }

                // Discord limits customIds to 100 characters. 
                // We extract just the YouTube Video ID from the URL to keep the ID small.
                const videoIdMatch = embed.url.match(/[?&]v=([^&]+)/);
                const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';

                // Build the categorization dropdown
                const tagMenu = new StringSelectMenuBuilder()
                    .setCustomId(`select_tag_${videoId}`)
                    .setPlaceholder('Select a vibe for this track...')
                    .addOptions([
                        { label: 'Heavy / Metalcore', description: 'Massive drops and aggressive riffs', value: 'heavy', emoji: '🎸' },
                        { label: 'Late Night / Chill', description: 'Slower, atmospheric tracks', value: 'chill', emoji: '🌙' },
                        { label: 'High Energy', description: 'Upbeat, fast-paced anthems', value: 'energy', emoji: '🔥' },
                        { label: 'Uncategorized', description: 'Just save it to my main list', value: 'uncategorized', emoji: '📁' }
                    ]);

                const row = new ActionRowBuilder().addComponents(tagMenu);

                // Ask the user privately
                await interaction.reply({
                    content: `**${embed.title}**\nWhere should Nyra save this track?`,
                    components: [row],
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }
            return;
        }

        // ─── Select Menus (Vibe Check & Settings) ───────────────────────
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('select_tag_')) {
                const selectedTag = interaction.values[0];
                
                // We need to fetch the original track details. 
                // Because this is an ephemeral reply to a button on the main embed,
                // we can read the original message's embed!
                const originalEmbed = interaction.message.reference ? 
                    (await interaction.channel.messages.fetch(interaction.message.reference.messageId)).embeds[0] : null;

                // Fallback: If reference is lost, we still have the video ID in the customId
                const videoId = interaction.customId.split('select_tag_')[1];
                const trackUrl = originalEmbed ? originalEmbed.url : `https://youtube.com/watch?v=${videoId}`;
                const trackTitle = originalEmbed ? originalEmbed.title : 'Unknown Title';
                const trackAuthor = originalEmbed ? originalEmbed.fields.find(f => f.name === 'Artist')?.value : 'Unknown Artist';

                // Prevent duplicates
                const { db } = require('../database/schema');
                const existing = db.prepare(`SELECT id FROM user_favorites WHERE user_id = ? AND track_url = ?`).get(interaction.user.id, trackUrl);

                if (existing) {
                    // If it exists, just update the tag
                    db.prepare(`UPDATE user_favorites SET tag = ? WHERE id = ?`).run(selectedTag, existing.id);
                    await interaction.update({ 
                        content: `✅ Updated **${trackTitle}** to the **${selectedTag}** vibe!`, 
                        components: [] 
                    });
                } else {
                    // Insert brand new
                    db.prepare(`INSERT INTO user_favorites (user_id, track_title, track_author, track_url, tag) VALUES (?, ?, ?, ?, ?)`).run(
                        interaction.user.id, trackTitle, trackAuthor, trackUrl, selectedTag
                    );
                    await interaction.update({ 
                        content: `❤️ Saved **${trackTitle}** to your **${selectedTag}** vibe!`, 
                        components: [] 
                    });
                }
                return;
            }

            if (interaction.customId === 'settings_menu') {
                const setting = interaction.values[0];

                // Direct Toggle for Verbose Mode
                if (setting === 'verbose_mode') {
                    const newValue = config.verbose_mode === 1 ? 0 : 1;
                    configManager.set(guildId, 'verbose_mode', newValue);
                    
                    // Refresh the settings dashboard
                    const settingsCommand = client.commands.get('settings');
                    return settingsCommand.execute(interaction, client);
                }

                // Modals for other settings
                const modal = new ModalBuilder()
                    .setCustomId(`modal_${setting}`)
                    .setTitle('Update Nyra Configuration');

                const input = new TextInputBuilder()
                    .setCustomId('new_value')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                if (setting === 'max_queue_size') {
                    input.setLabel('New Max Queue Size (1-500)').setPlaceholder('50');
                } else if (setting === 'np_channel_id') {
                    input.setLabel('Announcement Channel ID').setPlaceholder('Channel ID or "none"').setRequired(false);
                } else if (setting === 'autoplay_seed') {
                    input.setLabel('Custom Autoplay Seed').setPlaceholder('Video ID or "none"').setRequired(false);
                } else if (setting === 'delete_timer') {
                    input.setLabel('Auto-Delete Timer (Seconds)').setPlaceholder('e.g. 10 (0 to disable)');
                } else if (setting === 'cmd_channel') {
                    input.setLabel('Restricted Command Channel ID').setPlaceholder('Channel ID or "none"').setRequired(false);
                } else if (setting === 'artist_memory') {
                    input.setLabel('Artist Memory (1-10)').setPlaceholder('e.g. 5');
                } else if (setting === 'regex_blacklist') {
                    input.setLabel('Regex Blacklist Pattern').setPlaceholder('Enter a valid JS regex string').setStyle(TextInputStyle.Paragraph);
                }

                const row = new ActionRowBuilder().addComponents(input);
                modal.addComponents(row);
                await interaction.showModal(modal);
            }
            return;
        }

        // ─── Modal Submissions ──────────────────────────────────────
        if (interaction.isModalSubmit()) {
            let value = interaction.fields.getTextInputValue('new_value');

            if (interaction.customId === 'modal_max_queue_size') {
                const num = parseInt(value);
                if (isNaN(num) || num < 1 || num > 500) {
                    return interaction.reply({ content: '❌ Enter a number between 1 and 500.', flags: [MessageFlags.Ephemeral] });
                }
                configManager.set(guildId, 'max_queue_size', num);
            } 
            else if (interaction.customId === 'modal_np_channel_id') {
                if (!value || value.toLowerCase() === 'none') value = null;
                configManager.set(guildId, 'np_channel_id', value);
            }
            else if (interaction.customId === 'modal_autoplay_seed') {
                if (!value || value.toLowerCase() === 'none') value = null;
                configManager.set(guildId, 'autoplay_seed', value);
            }
            else if (interaction.customId === 'modal_delete_timer') {
                const num = parseInt(value);
                if (isNaN(num) || num < 0) {
                    return interaction.reply({ content: '❌ Enter a valid number (0 or higher).', flags: [MessageFlags.Ephemeral] });
                }
                configManager.set(guildId, 'delete_timer', num);
            }
            else if (interaction.customId === 'modal_cmd_channel') {
                if (!value || value.toLowerCase() === 'none') value = null;
                configManager.set(guildId, 'cmd_channel', value);
            }
            else if (interaction.customId === 'modal_artist_memory') {
                const num = parseInt(value);
                if (isNaN(num) || num < 1 || num > 10) {
                    return interaction.reply({ content: '❌ Enter a number between 1 and 10.', flags: [MessageFlags.Ephemeral] });
                }
                configManager.set(guildId, 'artist_memory', num);
            }
            else if (interaction.customId === 'modal_regex_blacklist') {
                try {
                    new RegExp(value, 'i');
                    configManager.set(guildId, 'regex_blacklist', value);
                } catch (e) {
                    return interaction.reply({ content: '❌ Invalid Regex pattern. Please check your syntax.', flags: [MessageFlags.Ephemeral] });
                }
            }

            // Refresh dashboard
            const settingsCommand = client.commands.get('settings');
            await interaction.deferUpdate();
            return settingsCommand.execute(interaction, client);
        }
    },
};
