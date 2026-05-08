const fs = require('fs');
const path = require('path');

/**
 * Dynamically loads all event listeners from src/events/.
 * Each event file must export:
 *   { name: string, once?: boolean, execute: async (...args) => {} }
 */
function loadEvents(client) {
    const eventsPath = path.join(__dirname, '..', 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));

        if (!event.name || !event.execute) {
            console.warn(`⚠️  Event file ${file} is missing 'name' or 'execute'. Skipping.`);
            continue;
        }

        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    }

    console.log(`📡 Loaded ${eventFiles.length} event listeners.`);
}

module.exports = { loadEvents };
