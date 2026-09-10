// ProTools Edit Window implementation

class ProToolsEditWindow {
    constructor() {
        this.trackList = document.getElementById('protools-track-list');
        this.timeline = document.getElementById('protools-timeline');
        this.clipsList = document.getElementById('protools-clips-list');
        this.currentTool = 'selector';
        this.currentMode = 'slip';
        this.selectedClips = [];
        this.clipSearchQuery = '';
        this.showClipsOnly = false;
        this.showAutomationOnly = false;
        this.trackColors = ['#007acc', '#cc4400', '#00aa44', '#aa00cc', '#ccaa00', '#00aaaa'];
        
        this.init();
    }

    init() {
        this.wireEditTools();
        this.wireEditModes();
        this.wireEditOptions();
        this.wireAddTrack();
        this.wireFilters();
        this.renderTracks();
        this.renderRuler();
    }

    wireEditTools() {
        document.querySelectorAll('.edit-tools .tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.target.dataset.tool;
                this.selectTool(tool);
            });
        });
    }

    wireEditModes() {
        document.querySelectorAll('.edit-modes .mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.selectMode(mode);
            });
        });
    }

    wireEditOptions() {
        document.querySelectorAll('.edit-options .option-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const option = e.target.dataset.option;
                this.toggleOption(option);
            });
        });
    }

    wireFilters() {
        const searchInput = document.getElementById('pt-clip-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.clipSearchQuery = e.target.value.toLowerCase();
                this.renderClipsList();
            });
        }

        const clipsOnlyBtn = document.querySelector('.option-btn[data-option="show-clips-only"]');
        if (clipsOnlyBtn) {
            clipsOnlyBtn.addEventListener('click', (e) => {
                this.showClipsOnly = !this.showClipsOnly;
                e.target.classList.toggle('active');
                this.renderTracks();
                this.renderTimeline();
            });
        }

        const automationOnlyBtn = document.querySelector('.option-btn[data-option="show-automation-only"]');
        if (automationOnlyBtn) {
            automationOnlyBtn.addEventListener('click', (e) => {
                this.showAutomationOnly = !this.showAutomationOnly;
                e.target.classList.toggle('active');
                this.renderTracks();
                this.renderTimeline();
            });
        }
    }

    selectTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.edit-tools .tool-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tool === tool) {
                btn.classList.add('active');
            }
        });
    }

    selectMode(mode) {
        this.currentMode = mode;
        document.querySelectorAll('.edit-modes .mode-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            }
        });
    }

    toggleOption(option) {
        const btn = document.querySelector(`.option-btn[data-option="${option}"]`);
        btn.classList.toggle('active');
    }

    wireAddTrack() {
        const addBtn = document.getElementById('pt-add-track');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const typeSelect = document.getElementById('pt-add-track-type');
                const trackType = typeSelect ? typeSelect.value : 'audio';
                const typeNames = {
                    audio: 'Audio',
                    midi: 'MIDI',
                    instrument: 'Instrument',
                    aux: 'Aux',
                    master: 'Master'
                };
                audioEngine.init().then(() => {
                    const track = audioEngine.createTrack(typeNames[trackType] + ' Track ' + (audioEngine.tracks.length + 1), trackType);
                    track.trackType = trackType;
                    track.color = this.trackColors[audioEngine.tracks.length % this.trackColors.length];
                    this.refresh();
                    if (proToolsMixWindow) proToolsMixWindow.refresh();
                    if (acidTimeline) acidTimeline.refresh();
                });
            });
        }
    }

    renderRuler() {
        const ruler = document.querySelector('.ruler-bars-beats');
        if (ruler) {
            let bars = '';
            for (let i = 1; i <= 32; i++) {
                bars += `<span style="margin-right:100px;display:inline-block;">${i}</span>`;
            }
            ruler.innerHTML = bars;
        }
    }

    renderTracks() {
        this.trackList.innerHTML = '';
        
        const visibleTracks = this.showClipsOnly 
            ? audioEngine.tracks.filter(t => t.clips.length > 0)
            : audioEngine.tracks;
        
        if (visibleTracks.length === 0) {
            this.trackList.innerHTML = '<div class="empty-state">No tracks. Add tracks to begin.</div>';
            return;
        }

        visibleTracks.forEach(track => {
            const trackEl = document.createElement('div');
            trackEl.className = 'track-item';
            const trackType = track.trackType || 'audio';
            const color = track.color || '#007acc';
            const hasAutomation = track.automation.volume.length > 0 || track.automation.pan.length > 0;
            
            if (this.showAutomationOnly && !hasAutomation) {
                trackEl.style.display = 'none';
            }
            
            trackEl.innerHTML = `
                <div class="track-header">
                    <span class="track-color-swatch" style="background:${color};"></span>
                    <span class="track-type-badge track-type-${trackType}">${trackType.toUpperCase()}</span>
                    <span class="track-name">${track.name}</span>
                    <div class="track-controls">
                        <button class="track-btn record-btn ${track.recordEnabled ? 'active' : ''}" data-track="${track.id}">●</button>
                        <button class="track-btn monitor-btn ${track.inputMonitoring ? 'active' : ''}" data-track="${track.id}">I</button>
                        <button class="track-btn solo-btn ${track.solo ? 'active' : ''}" data-track="${track.id}">S</button>
                        <button class="track-btn mute-btn ${track.muted ? 'active' : ''}" data-track="${track.id}">M</button>
                    </div>
                </div>
                <div class="track-automation">
                    <span class="automation-mode">${track.automationMode.toUpperCase()}</span>
                    ${hasAutomation ? '<span class="automation-indicator">⚡</span>' : ''}
                </div>
            `;
            this.trackList.appendChild(trackEl);
        });

        this.wireTrackControls();
    }

    wireTrackControls() {
        document.querySelectorAll('.track-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = e.target.dataset.track;
                const action = e.target.classList.contains('record-btn') ? 'record' :
                               e.target.classList.contains('monitor-btn') ? 'monitor' :
                               e.target.classList.contains('solo-btn') ? 'solo' : 'mute';
                this.handleTrackAction(trackId, action, e.target);
            });
        });
    }

    handleTrackAction(trackId, action, btn) {
        switch (action) {
            case 'record':
                audioEngine.toggleTrackRecord(trackId);
                btn.classList.toggle('active');
                break;
            case 'monitor':
                audioEngine.toggleInputMonitoring(trackId);
                btn.classList.toggle('active');
                break;
            case 'solo':
                audioEngine.toggleTrackSolo(trackId);
                this.renderTracks();
                break;
            case 'mute':
                audioEngine.toggleTrackMute(trackId);
                this.renderTracks();
                break;
        }
    }

    renderTimeline() {
        const timelineContent = this.timeline.querySelector('.timeline-content');
        timelineContent.innerHTML = '';
        
        if (audioEngine.tracks.length === 0) {
            timelineContent.innerHTML = '<div class="empty-state">No tracks loaded.</div>';
            return;
        }
        
        audioEngine.tracks.forEach((track, idx) => {
            const trackRow = document.createElement('div');
            trackRow.className = 'timeline-track';
            trackRow.style.height = '80px';
            trackRow.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)';
            
            track.clips.forEach(clip => {
                const clipEl = document.createElement('div');
                clipEl.className = 'timeline-clip';
                clipEl.style.left = (clip.startTime * 100) + 'px';
                clipEl.style.width = (clip.duration * 100) + 'px';
                clipEl.style.height = '70px';
                clipEl.style.top = '5px';
                clipEl.textContent = clip.name || 'Clip';
                trackRow.appendChild(clipEl);
            });
            
            timelineContent.appendChild(trackRow);
        });
    }

    renderClipsList() {
        this.clipsList.innerHTML = '';
        
        let clips = audioEngine.clips;
        if (this.clipSearchQuery) {
            clips = clips.filter(c => (c.name || 'Clip').toLowerCase().includes(this.clipSearchQuery));
        }
        
        if (clips.length === 0) {
            this.clipsList.innerHTML = '<div class="empty-state">No clips</div>';
            return;
        }

        clips.forEach(clip => {
            const clipEl = document.createElement('div');
            clipEl.className = 'clip-item';
            clipEl.textContent = clip.name || 'Clip';
            clipEl.addEventListener('click', () => {
                this.selectClip(clip.id);
            });
            this.clipsList.appendChild(clipEl);
        });
    }

    selectClip(clipId) {
        this.selectedClips = [clipId];
        document.querySelectorAll('.timeline-clip').forEach(el => {
            el.style.background = 'var(--waveform-color)';
        });
    }

    refresh() {
        this.renderTracks();
        this.renderTimeline();
        this.renderClipsList();
    }
}

// Initialize when DOM is ready
let proToolsEditWindow;
document.addEventListener('DOMContentLoaded', () => {
    proToolsEditWindow = new ProToolsEditWindow();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProToolsEditWindow;
}
