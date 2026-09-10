// Main application entry point for Music Studio Pro

document.addEventListener('DOMContentLoaded', () => {
    audioEngine.init().then(() => {
        console.log('Audio engine initialized');
        createDemoContent();
    }).catch(err => {
        console.error('Failed to initialize audio engine:', err);
        createDemoContent();
    });

    function createDemoContent() {
        const trackNames = ['Kick Drum', 'Snare', 'Bass Synth'];
        trackNames.forEach(name => {
            audioEngine.createTrack(name);
        });

        audioEngine.setBPM(120);
        audioEngine.setKey('C');
        audioEngine.setTimeSignature('4/4');

        setTimeout(() => {
            if (proToolsEditWindow) proToolsEditWindow.refresh();
            if (proToolsMixWindow) proToolsMixWindow.refresh();
            if (acidTimeline) acidTimeline.refresh();
        }, 100);

        const statusText = document.getElementById('statusText');
        if (statusText) {
            statusText.textContent = 'Ready — 3 tracks loaded | 120 BPM | Key: C';
        }
    }

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('audio/')) {
            audioEngine.loadAudioFile(files[0]).then(buffer => {
                if (audioEngine.tracks.length > 0) {
                    audioEngine.createClip(buffer, audioEngine.tracks[0].id, 0);
                    if (proToolsEditWindow) proToolsEditWindow.refresh();
                    if (acidTimeline) acidTimeline.refresh();
                    const statusText = document.getElementById('statusText');
                    if (statusText) statusText.textContent = 'Audio file loaded';
                }
            });
        }
    });
});
