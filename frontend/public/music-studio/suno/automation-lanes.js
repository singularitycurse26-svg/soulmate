class SunoAutomationLanes {
    constructor() {
        this.audioEngine = null;
        this.settings = null;
        this.automationData = new Map();
        this.recordMode = 'draw';
        this.snapToGrid = true;
        this.curveType = 'linear';
        this.selectedTrackId = null;
        this.selectedParam = 'volume';
        this.isDrawing = false;
        self.midiLearnActive = false;
        self.midiLearnParam = null;
        this.canvas = null;
        this.ctx = null;
        this.init();
    }

    setAudioEngine(engine) {
        this.audioEngine = engine;
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.loadSettings();
            this.wireControls();
            this.wireCanvas();
        });
    }

    async loadSettings() {
        this.settings = await FileUtils.loadSettings();
        if (this.settings && this.settings.suno && this.settings.suno.automation) {
            this.recordMode = this.settings.suno.automation.recordMode || 'draw';
            this.snapToGrid = this.settings.suno.automation.snapToGrid !== false;
            this.curveType = this.settings.suno.automation.curveType || 'linear';
        }
    }

    wireControls() {
        const trackSelect = document.getElementById('suno-auto-track');
        const paramSelect = document.getElementById('suno-auto-param');
        const modeSelect = document.getElementById('suno-auto-mode');
        const curveSelect = document.getElementById('suno-auto-curve');
        const midiLearnBtn = document.getElementById('suno-auto-midi-learn');
        const clearBtn = document.getElementById('suno-auto-clear');

        if (trackSelect) trackSelect.addEventListener('change', (e) => {
            this.selectedTrackId = e.target.value;
            this.renderAutomation();
        });
        if (paramSelect) paramSelect.addEventListener('change', (e) => {
            this.selectedParam = e.target.value;
            this.renderAutomation();
        });
        if (modeSelect) modeSelect.addEventListener('change', (e) => {
            this.recordMode = e.target.value;
        });
        if (curveSelect) curveSelect.addEventListener('change', (e) => {
            this.curveType = e.target.value;
            this.renderAutomation();
        });
        if (midiLearnBtn) midiLearnBtn.addEventListener('click', () => {
            this.midiLearnActive = !this.midiLearnActive;
            midiLearnBtn.classList.toggle('active', this.midiLearnActive);
            if (this.midiLearnActive) {
                midiLearnBtn.textContent = 'Move a knob...';
                this.startMidiLearn();
            } else {
                midiLearnBtn.textContent = 'MIDI Learn';
            }
        });
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAutomation());
    }

    wireCanvas() {
        this.canvas = document.getElementById('suno-automation-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    }

    handleMouseDown(e) {
        this.isDrawing = true;
        this.addPoint(e);
    }

    handleMouseMove(e) {
        if (this.isDrawing) this.addPoint(e);
    }

    handleMouseUp(e) {
        this.isDrawing = false;
    }

    addPoint(e) {
        if (!this.selectedTrackId) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const w = this.canvas.width;
        const h = this.canvas.height;

        const time = (x / w) * this.getTimelineDuration();
        let value = 1 - (y / h);
        value = Math.max(0, Math.min(1, value));

        if (this.snapToGrid) {
            const bpm = this.audioEngine ? this.audioEngine.bpm : 120;
            const secondsPerBeat = 60 / bpm;
            time = Math.round(time / secondsPerBeat) * secondsPerBeat;
        }

        const key = `${this.selectedTrackId}:${this.selectedParam}`;
        if (!this.automationData.has(key)) {
            this.automationData.set(key, []);
        }
        const points = this.automationData.get(key);
        points.push({ time, value });
        points.sort((a, b) => a.time - b.time);

        this.renderAutomation();
    }

    getTimelineDuration() {
        if (!this.audioEngine || this.audioEngine.clips.length === 0) return 30;
        return Math.max(...this.audioEngine.clips.map(c => c.startTime + c.duration));
    }

    getAutomationValue(trackId, param, time) {
        const key = `${trackId}:${param}`;
        const points = this.automationData.get(key);
        if (!points || points.length === 0) return null;
        if (time <= points[0].time) return points[0].value;
        if (time >= points[points.length - 1].time) return points[points.length - 1].value;

        for (let i = 0; i < points.length - 1; i++) {
            if (time >= points[i].time && time <= points[i + 1].time) {
                const t = (time - points[i].time) / (points[i + 1].time - points[i].time);
                if (this.curveType === 'stepped') return points[i].value;
                if (this.curveType === 'smooth') return this.smoothstep(t, points[i].value, points[i + 1].value);
                return points[i].value + t * (points[i + 1].value - points[i].value);
            }
        }
        return null;
    }

    smoothstep(t, a, b) {
        const s = t * t * (3 - 2 * t);
        return a + s * (b - a);
    }

    recordParameter(trackId, param, value) {
        if (this.recordMode !== 'live') return;
        const key = `${trackId}:${param}`;
        if (!this.automationData.has(key)) {
            this.automationData.set(key, []);
        }
        const time = this.audioEngine ? this.audioEngine.getCurrentTime() : 0;
        this.automationData.get(key).push({ time, value });
    }

    startMidiLearn() {
        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then(access => {
                access.inputs.forEach(input => {
                    input.onmidimessage = (e) => {
                        if (this.midiLearnActive && e.data[0] >= 176) {
                            const cc = e.data[1];
                            const value = e.data[2];
                            this.assignMidiCC(cc, this.selectedTrackId, this.selectedParam);
                            this.midiLearnActive = false;
                            const btn = document.getElementById('suno-auto-midi-learn');
                            if (btn) {
                                btn.classList.remove('active');
                                btn.textContent = 'MIDI Learn';
                            }
                        }
                    };
                });
            }).catch(() => {});
        }
    }

    assignMidiCC(cc, trackId, param) {
        const assignments = JSON.parse(localStorage.getItem('suno-midi-assignments') || '{}');
        assignments[cc] = { trackId, param };
        localStorage.setItem('suno-midi-assignments', JSON.stringify(assignments));
    }

    handleMidiCC(cc, value) {
        const assignments = JSON.parse(localStorage.getItem('suno-midi-assignments') || '{}');
        const assignment = assignments[cc];
        if (assignment && this.audioEngine) {
            const track = this.audioEngine.tracks.find(t => t.id === assignment.trackId);
            if (track) {
                const normalized = value / 127;
                switch (assignment.param) {
                    case 'volume':
                        this.audioEngine.setTrackVolume(assignment.trackId, normalized);
                        break;
                    case 'pan':
                        this.audioEngine.setTrackPan(assignment.trackId, normalized * 2 - 1);
                        break;
                }
                if (this.recordMode === 'live') {
                    this.recordParameter(assignment.trackId, assignment.param, normalized);
                }
            }
        }
    }

    clearAutomation() {
        if (!this.selectedTrackId) return;
        const key = `${this.selectedTrackId}:${this.selectedParam}`;
        this.automationData.delete(key);
        this.renderAutomation();
    }

    renderAutomation() {
        if (!this.canvas || !this.ctx) return;
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, w, h);

        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 0.5;
        for (let i = 1; i < 10; i++) {
            const y = (h / 10) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(w, y);
            this.ctx.stroke();
        }

        const duration = this.getTimelineDuration();
        const bpm = this.audioEngine ? this.audioEngine.bpm : 120;
        const secondsPerBeat = 60 / bpm;
        for (let beat = 0; beat < duration / secondsPerBeat; beat++) {
            const x = (beat * secondsPerBeat / duration) * w;
            this.ctx.strokeStyle = beat % 4 === 0 ? '#444' : '#222';
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
            this.ctx.stroke();
        }

        if (!this.selectedTrackId) return;
        const key = `${this.selectedTrackId}:${this.selectedParam}`;
        const points = this.automationData.get(key);
        if (!points || points.length === 0) return;

        this.ctx.strokeStyle = '#4e73df';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        if (this.curveType === 'stepped') {
            points.forEach((p, i) => {
                const x = (p.time / duration) * w;
                const y = (1 - p.value) * h;
                if (i === 0) this.ctx.moveTo(x, y);
                else {
                    this.ctx.lineTo(x, y);
                    if (i < points.length - 1) {
                        const nextX = (points[i + 1].time / duration) * w;
                        this.ctx.lineTo(nextX, y);
                    }
                }
            });
        } else {
            points.forEach((p, i) => {
                const x = (p.time / duration) * w;
                const y = (1 - p.value) * h;
                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            });
        }
        this.ctx.stroke();

        this.ctx.fillStyle = '#ffcc00';
        points.forEach(p => {
            const x = (p.time / duration) * w;
            const y = (1 - p.value) * h;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    getAutomationData() {
        const result = {};
        this.automationData.forEach((points, key) => {
            result[key] = points;
        });
        return result;
    }

    loadAutomationData(data) {
        Object.keys(data).forEach(key => {
            this.automationData.set(key, data[key]);
        });
    }
}

const sunoAutomationLanes = new SunoAutomationLanes();
