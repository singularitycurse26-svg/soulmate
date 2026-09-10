// ProTools Mix Window implementation

class ProToolsMixWindow {
    constructor() {
        this.channelStrips = document.getElementById('protools-channel-strips');
        
        this.init();
    }

    init() {
        this.renderChannelStrips();
    }

    renderChannelStrips() {
        this.channelStrips.innerHTML = '';
        
        if (audioEngine.tracks.length === 0) {
            this.channelStrips.innerHTML = '<div class="empty-state">No tracks. Add tracks to see channel strips.</div>';
            return;
        }

        audioEngine.tracks.forEach(track => {
            const strip = document.createElement('div');
            strip.className = 'channel-strip';
            strip.innerHTML = `
                <div class="channel-strip-header">${track.name}</div>
                <div class="insert-slots">
                    ${this.renderInsertSlots(track)}
                </div>
                <div class="sends-section">
                    ${this.renderSendSlots(track)}
                </div>
                <div class="io-section">
                    <div class="io-label">I/O</div>
                </div>
                <div class="pan-section">
                    <input type="range" class="pan-knob" min="-1" max="1" step="0.01" value="${track.pan}" data-track="${track.id}">
                    <span class="pan-value">${track.pan.toFixed(2)}</span>
                </div>
                <div class="fader-container">
                    <div class="fader">
                        <div class="fader-handle" style="bottom: ${track.volume * 100}%;" data-track="${track.id}"></div>
                    </div>
                    <div class="meter">
                        <div class="meter-fill" style="height: 0%;"></div>
                    </div>
                </div>
                <div class="channel-controls">
                    <button class="channel-btn solo-btn ${track.solo ? 'active' : ''}" data-track="${track.id}">S</button>
                    <button class="channel-btn mute-btn ${track.muted ? 'active' : ''}" data-track="${track.id}">M</button>
                    <button class="channel-btn record-btn ${track.recordEnabled ? 'active' : ''}" data-track="${track.id}">●</button>
                </div>
                <div class="automation-mode">
                    <select class="automation-select" data-track="${track.id}">
                        <option value="off" ${track.automationMode === 'off' ? 'selected' : ''}>OFF</option>
                        <option value="read" ${track.automationMode === 'read' ? 'selected' : ''}>READ</option>
                        <option value="write" ${track.automationMode === 'write' ? 'selected' : ''}>WRITE</option>
                        <option value="touch" ${track.automationMode === 'touch' ? 'selected' : ''}>TOUCH</option>
                        <option value="latch" ${track.automationMode === 'latch' ? 'selected' : ''}>LATCH</option>
                    </select>
                </div>
            `;
            this.channelStrips.appendChild(strip);
        });

        this.wireChannelControls();
    }

    renderInsertSlots(track) {
        let html = '';
        for (let i = 0; i < 5; i++) {
            const insert = track.inserts[i];
            html += `<div class="insert-slot" data-track="${track.id}" data-slot="${i}">${insert ? insert.name : 'Insert ' + (i + 1)}</div>`;
        }
        return html;
    }

    renderSendSlots(track) {
        let html = '';
        for (let i = 0; i < 4; i++) {
            const send = track.sends[i];
            html += `<div class="send-slot" data-track="${track.id}" data-send="${i}">${send ? send.name : 'Send ' + (i + 1)}</div>`;
        }
        return html;
    }

    wireChannelControls() {
        // Fader handles
        document.querySelectorAll('.fader-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                this.startFaderDrag(e, handle);
            });
        });

        // Pan knobs
        document.querySelectorAll('.pan-knob').forEach(knob => {
            knob.addEventListener('input', (e) => {
                const trackId = e.target.dataset.track;
                const pan = parseFloat(e.target.value);
                audioEngine.setTrackPan(trackId, pan);
                e.target.nextElementSibling.textContent = pan.toFixed(2);
            });
        });

        // Channel buttons
        document.querySelectorAll('.channel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = e.target.dataset.track;
                const action = e.target.classList.contains('solo-btn') ? 'solo' :
                               e.target.classList.contains('mute-btn') ? 'mute' : 'record';
                this.handleChannelAction(trackId, action, e.target);
            });
        });

        // Automation mode selects
        document.querySelectorAll('.automation-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const trackId = e.target.dataset.track;
                const mode = e.target.value;
                audioEngine.setAutomationMode(trackId, mode);
            });
        });
    }

    startFaderDrag(e, handle) {
        const trackId = handle.dataset.track;
        const fader = handle.parentElement;
        const rect = fader.getBoundingClientRect();
        
        const onMouseMove = (e) => {
            const y = e.clientY - rect.top;
            const height = rect.height;
            const percentage = Math.max(0, Math.min(100, (height - y) / height * 100));
            const volume = percentage / 100;
            
            handle.style.bottom = `${percentage}%`;
            audioEngine.setTrackVolume(trackId, volume);
        };
        
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    handleChannelAction(trackId, action, btn) {
        switch (action) {
            case 'solo':
                audioEngine.toggleTrackSolo(trackId);
                this.renderChannelStrips();
                break;
            case 'mute':
                audioEngine.toggleTrackMute(trackId);
                this.renderChannelStrips();
                break;
            case 'record':
                audioEngine.toggleTrackRecord(trackId);
                btn.classList.toggle('active');
                break;
        }
    }

    updateMeters() {
        document.querySelectorAll('.meter-fill').forEach(meter => {
            const level = Math.random() * 100;
            meter.style.height = `${level}%`;
        });
    }

    refresh() {
        this.renderChannelStrips();
    }
}

// Initialize when DOM is ready
let proToolsMixWindow;
document.addEventListener('DOMContentLoaded', () => {
    proToolsMixWindow = new ProToolsMixWindow();
    
    // Update meters periodically
    setInterval(() => {
        if (audioEngine.isPlaying) {
            proToolsMixWindow.updateMeters();
        }
    }, 100);
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProToolsMixWindow;
}
