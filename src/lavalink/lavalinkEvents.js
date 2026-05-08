/**
 * Registers Lavalink-Client node lifecycle events.
 * These log connection state changes for the NodeLink server.
 */
function registerLavalinkEvents(manager) {
    // Shoukaku's 'ready' becomes 'connect' on the nodeManager
    manager.nodeManager.on('connect', (node) => {
        console.log(`🟢 Lavalink node "${node.id}" is ready. (Fresh connection)`);
    });

    // Shoukaku's 'error' maps cleanly, but we pull the ID from the node object
    manager.nodeManager.on('error', (node, error) => {
        console.error(`🔴 Lavalink node "${node.id}" encountered an error:`, error.message);
    });

    // Shoukaku's 'close' and 'disconnect' are merged into a single event here
    manager.nodeManager.on('disconnect', (node, reason) => {
        const reasonText = reason ? (reason.reason || reason.code || reason) : 'None';
        console.warn(`🟡 Lavalink node "${node.id}" disconnected. | Reason: ${reasonText}`);
    });

    // Native reconnection tracking
    manager.nodeManager.on('reconnecting', (node) => {
        console.log(`🔄 Lavalink node "${node.id}" is attempting to reconnect...`);
    });

    // Uncomment for verbose debugging:
    /*
    manager.nodeManager.on('debug', (node, info) => {
         console.debug(`🐛 [${node.id}] ${info}`);
    });
    */
}

module.exports = { registerLavalinkEvents };