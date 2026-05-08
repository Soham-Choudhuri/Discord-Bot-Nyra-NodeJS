const YTMusic = require('ytmusic-api');
const yt = new YTMusic();

async function test() {
    await yt.initialize();
    try {
        const res = await yt.constructRequest('next', {
            videoId: 'dQw4w9WgXcQ',
            playlistId: 'RDAMVMdQw4w9WgXcQ',
            isAudioOnly: true
        });
        
        const contents = res?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents;
        
        if (contents) {
            console.log('Found', contents.length, 'items');
            const sample = contents[1]?.playlistPanelVideoRenderer;
            if (sample) {
                console.log('Title:', sample.title?.runs?.[0]?.text);
                console.log('VideoType Path:', JSON.stringify(sample.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig, null, 2));
            }
        }
    } catch(e) {
        console.error(e);
    }
}
test();
