// ACID Pro Timeline implementation

class AcidTimeline {
    constructor() {
        this.trackList = document.getElementById('acid-track-list');
        this.timelineArea = document.getElementById('acid-timeline-area');
        this.currentTool = 'select';
        this.selectedEvents = [];
        this.trackFolders = [];
        this.punchIn = false;
        this.punchInPoint = 0;
        this.punchOut = false;
        this.punchOutPoint = 0;
        this.busRouting = 'master';
        this.videoScoring = false;
        this.hitPoints = false;
        this.tempoMapMode = false;
        
        this.init();
    }

    init() {
        this.wireProjectSettings();
        this.wireTools();
        this.wireAdvancedControls();
        this.renderTracks();
        this.renderTimeline();
    }

    wireProjectSettings() {
        document.getElementById('acid-tempo').addEventListener('input', (e) => {
            const tempo = parseInt(e.target.value);
            audioEngine.setBPM(tempo);
            document.getElementById('acid-tempo-val').textContent = tempo + ' BPM';
        });
        
        document.getElementById('acid-time-sig').addEventListener('change', (e) => {
            audioEngine.setTimeSignature(e.target.value);
        });
        
        document.getElementById('acid-key').addEventListener('change', (e) => {
            audioEngine.setKey(e.target.value);
        });
    }

    wireTools() {
        document.querySelectorAll('.acid-tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.target.dataset.tool;
                this.selectTool(tool);
            });
        });
    }

    selectTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.acid-tool-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tool === tool) {
                btn.classList.add('active');
            }
        });
    }

    wireAdvancedControls() {
        const addFolderBtn = document.getElementById('acid-add-folder');
        if (addFolderBtn) {
            addFolderBtn.addEventListener('click', () => {
                this.createTrackFolder();
            });
        }

        const punchInBtn = document.getElementById('acid-punch-in');
        if (punchInBtn) {
            punchInBtn.addEventListener('click', (e) => {
                this.punchIn = !this.punchIn;
                e.target.textContent = 'Punch-In: ' + (this.punchIn ? 'ON' : 'OFF');
                e.target.classList.toggle('active', this.punchIn);
            });
        }

        const punchInPoint = document.getElementById('acid-punch-in-point');
        if (punchInPoint) {
            punchInPoint.addEventListener('change', (e) => {
                this.punchInPoint = parseFloat(e.target.value);
            });
        }

        const punchOutBtn = document.getElementById('acid-punch-out');
        if (punchOutBtn) {
            punchOutBtn.addEventListener('click', (e) => {
                this.punchOut = !this.punchOut;
                e.target.textContent = 'Punch-Out: ' + (this.punchOut ? 'ON' : 'OFF');
                e.target.classList.toggle('active', this.punchOut);
            });
        }

        const punchOutPoint = document.getElementById('acid-punch-out-point');
        if (punchOutPoint) {
            punchOutPoint.addEventListener('change', (e) => {
                this.punchOutPoint = parseFloat(e.target.value);
            });
        }

        const busSelect = document.getElementById('acid-bus-output');
        if (busSelect) {
            busSelect.addEventListener('change', (e) => {
                this.busRouting = e.target.value;
            });
        }

        const videoScoreBtn = document.getElementById('acid-video-score');
        if (videoScoreBtn) {
            videoScoreBtn.addEventListener('click', (e) => {
                this.videoScoring = !this.videoScoring;
                e.target.textContent = 'Video Scoring: ' + (this.videoScoring ? 'ON' : 'OFF');
                e.target.classList.toggle('active', this.videoScoring);
            });
        }

        const hitPointsBtn = document.getElementById('acid-hit-points');
        if (hitPointsBtn) {
            hitPointsBtn.addEventListener('click', (e) => {
                this.hitPoints = !this.hitPoints;
                e.target.textContent = 'Hit Points: ' + (this.hitPoints ? 'ON' : 'OFF');
                e.target.classList.toggle('active', this.hitPoints);
            });
        }

        const tempoMapBtn = document.getElementById('acid-tempo-map');
        if (tempoMapBtn) {
            tempoMapBtn.addEventListener('click', (e) => {
                this.tempoMapMode = !this.tempoMapMode;
                e.target.textContent = 'Tempo Map: ' + (this.tempoMapMode ? 'ON' : 'OFF');
                e.target.classList.toggle('active', this.tempoMapMode);
            });
        }
    }

    createTrackFolder() {
        const folder = {
            id: Date.now().toString(),
            name: 'Folder ' + (this.trackFolders.length + 1),
            tracks: [],
            collapsed: false
        };
        this.trackFolders.push(folder);
        this.renderTracks();
    }

    renderTracks() {
        this.trackList.innerHTML = '';
        
        if (audioEngine.tracks.length === 0) {
            this.trackList.innerHTML = '<div class="empty-state">No tracks. Add loops to create tracks.</div>';
            return;
        }

        audioEngine.tracks.forEach(track => {
            const trackEl = document.createElement('div');
            trackEl.className = 'acid-track-item';
            trackEl.innerHTML = `
                <div class="track-name">${track.name}</div>
                <div class="track-controls">
                    <button class="acid-track-btn solo-btn ${track.solo ? 'active' : ''}" data-track="${track.id}">S</button>
                    <button class="acid-track-btn mute-btn ${track.muted ? 'active' : ''}" data-track="${track.id}">M</button>
                </div>
            `;
            this.trackList.appendChild(trackEl);
        });

        this.wireTrackControls();
    }

    wireTrackControls() {
        document.querySelectorAll('.acid-track-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = e.target.dataset.track;
                const action = e.target.classList.contains('solo-btn') ? 'solo' : 'mute';
                this.handleTrackAction(trackId, action, e.target);
            });
        });
    }

    handleTrackAction(trackId, action, btn) {
        switch (action) {
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
        const timelineContent = this.timelineArea.querySelector('.acid-timeline-content');
        if (!timelineContent) {
            const content = document.createElement('div');
            content.className = 'acid-timeline-content';
            this.timelineArea.appendChild(content);
            return this.renderTimeline();
        }
        
        timelineContent.innerHTML = '';
        
        if (audioEngine.tracks.length === 0) {
            timelineContent.innerHTML = '<div class="empty-state">No tracks loaded. Add tracks to see timeline.</div>';
            return;
        }
        
        audioEngine.tracks.forEach((track, idx) => {
            const trackRow = document.createElement('div');
            trackRow.className = 'acid-timeline-track';
            trackRow.style.height = '80px';
            trackRow.style.borderBottom = '1px solid var(--border-color)';
            trackRow.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)';
            trackRow.style.position = 'relative';
            
            track.clips.forEach(clip => {
                const eventEl = document.createElement('div');
                eventEl.className = 'acid-event';
                eventEl.style.left = (clip.startTime * 100) + 'px';
                eventEl.style.width = (clip.duration * 100) + 'px';
                eventEl.style.height = '60px';
                eventEl.style.top = '10px';
                eventEl.textContent = clip.name || 'Clip';
                trackRow.appendChild(eventEl);
            });
            
            timelineContent.appendChild(trackRow);
        });
    }

    addEvent(trackId, audioBuffer, startTime, duration) {
        const clip = audioEngine.createClip(audioBuffer, trackId, startTime, duration);
        this.renderTimeline();
        return clip;
    }

    removeEvent(eventId) {
        audioEngine.removeClip(eventId);
        this.renderTimeline();
    }

    refresh() {
        this.renderTracks();
        this.renderTimeline();
    }
}

// Initialize when DOM is ready
let acidTimeline;
document.addEventListener('DOMContentLoaded', () => {
    acidTimeline = new AcidTimeline();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AcidTimeline;
}
