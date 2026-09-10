class SunoPianoRoll {
    constructor() {
        this.audioEngine = null;
        this.synth = null;
        this.notes = [];
        this.selectedNote = null;
        this.dragMode = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragNoteData = null;
        this.zoom = 1;
        this.scrollX = 0;
        this.scrollY = 0;
        this.pixelsPerBeat = 40;
        this.noteHeight = 12;
        this.octaveRange = 5;
        this.baseOctave = 3;
        this.quantize = '1/16';
        this.currentTool = 'draw';
        this.velocity = 100;
        this.pitchBend = [];
        this.modulation = [];
        this.canvas = null;
        this.ctx = null;
        this.activeNotes = new Map();
        this.init();
    }

    setAudioEngine(engine) {
        this.audioEngine = engine;
    }

    setSynth(synth) {
        this.synth = synth;
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.wireControls();
            this.wireCanvas();
            this.startRenderLoop();
        });
    }

    wireControls() {
        const toolBtns = document.querySelectorAll('.suno-pr-tool');
        toolBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                toolBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
            });
        });

        const quantizeSelect = document.getElementById('suno-pr-quantize');
        if (quantizeSelect) {
            quantizeSelect.addEventListener('change', (e) => {
                this.quantize = e.target.value;
            });
        }

        const velocitySlider = document.getElementById('suno-pr-velocity');
        if (velocitySlider) {
            velocitySlider.addEventListener('input', (e) => {
                this.velocity = parseInt(e.target.value);
                const display = document.getElementById('suno-pr-velocity-display');
                if (display) display.textContent = e.target.value;
            });
        }

        const clearBtn = document.getElementById('suno-pr-clear');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearNotes());

        const playBtn = document.getElementById('suno-pr-play');
        if (playBtn) playBtn.addEventListener('click', () => this.playNotes());

        const chordModeBtn = document.getElementById('suno-pr-chord-mode');
        if (chordModeBtn) {
            chordModeBtn.addEventListener('click', () => {
                chordModeBtn.classList.toggle('active');
            });
        }

        const arpBtn = document.getElementById('suno-pr-arpeggiator');
        if (arpBtn) {
            arpBtn.addEventListener('click', () => {
                arpBtn.classList.toggle('active');
            });
        }
    }

    wireCanvas() {
        this.canvas = document.getElementById('suno-piano-roll-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left + this.scrollX;
        const y = e.clientY - rect.top + this.scrollY;

        const keyWidth = 60;
        if (x < keyWidth) {
            const noteIndex = Math.floor(y / this.noteHeight);
            const midiNote = this.baseOctave * 12 + noteIndex;
            this.playNote(midiNote, this.velocity);
            return;
        }

        const gridX = x - keyWidth;
        const beat = this.snapToGrid(gridX / this.pixelsPerBeat);
        const noteIndex = Math.floor(y / this.noteHeight);
        const midiNote = this.baseOctave * 12 + noteIndex;

        if (this.currentTool === 'draw') {
            const note = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                midi: midiNote,
                start: beat,
                duration: 1,
                velocity: this.velocity
            };
            this.notes.push(note);
            this.selectedNote = note;
            this.dragMode = 'resize';
            this.dragStartX = e.clientX;
            this.dragNoteData = note;
            this.playNote(midiNote, this.velocity);
        } else if (this.currentTool === 'select') {
            const note = this.findNoteAt(beat, noteIndex);
            if (note) {
                this.selectedNote = note;
                this.dragMode = 'move';
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                this.dragNoteData = { ...note };
            }
        } else if (this.currentTool === 'erase') {
            const note = this.findNoteAt(beat, noteIndex);
            if (note) {
                this.notes = this.notes.filter(n => n.id !== note.id);
            }
        }
    }

    handleMouseMove(e) {
        if (!this.dragMode || !this.dragNoteData) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left + this.scrollX;
        const keyWidth = 60;
        const gridX = x - keyWidth;
        const beat = this.snapToGrid(gridX / this.pixelsPerBeat);

        if (this.dragMode === 'resize') {
            const note = this.notes.find(n => n.id === this.dragNoteData.id);
            if (note) {
                note.duration = Math.max(0.25, beat - note.start);
            }
        } else if (this.dragMode === 'move') {
            const note = this.notes.find(n => n.id === this.dragNoteData.id);
            if (note) {
                const dy = e.clientY - this.dragStartY;
                const noteDelta = Math.round(dy / this.noteHeight);
                note.midi = this.dragNoteData.midi + noteDelta;
                const dx = e.clientX - this.dragStartX;
                const beatDelta = Math.round(dx / this.pixelsPerBeat);
                note.start = Math.max(0, this.dragNoteData.start + beatDelta);
            }
        }
    }

    handleMouseUp(e) {
        if (this.dragNoteData) {
            this.stopNote(this.dragNoteData.midi);
        }
        this.dragMode = null;
        this.dragNoteData = null;
    }

    findNoteAt(beat, noteIndex) {
        return this.notes.find(n =>
            n.midi === noteIndex + this.baseOctave * 12 &&
            beat >= n.start && beat < n.start + n.duration
        );
    }

    snapToGrid(beat) {
        const divisions = { '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125, 'off': 0.001 };
        const snap = divisions[this.quantize] || 0.25;
        return Math.round(beat / snap) * snap;
    }

    playNote(midiNote, velocity) {
        if (this.synth) {
            this.synth.noteOn(midiNote, velocity / 127);
        }
        this.activeNotes.set(midiNote, Date.now());
    }

    stopNote(midiNote) {
        if (this.synth) {
            this.synth.noteOff(midiNote);
        }
        this.activeNotes.delete(midiNote);
    }

    playNotes() {
        if (!this.audioEngine) return;
        const sorted = [...this.notes].sort((a, b) => a.start - b.start);
        const bpm = this.audioEngine.bpm;
        const secondsPerBeat = 60 / bpm;

        sorted.forEach(note => {
            const startTime = note.start * secondsPerBeat;
            const duration = note.duration * secondsPerBeat;
            setTimeout(() => {
                this.playNote(note.midi, note.velocity);
                setTimeout(() => this.stopNote(note.midi), duration * 1000);
            }, startTime * 1000);
        });
    }

    clearNotes() {
        this.notes = [];
    }

    startRenderLoop() {
        const render = () => {
            this.render();
            requestAnimationFrame(render);
        };
        render();
    }

    render() {
        if (!this.canvas || !this.ctx) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const keyWidth = 60;
        const totalNotes = this.octaveRange * 12;
        const gridHeight = totalNotes * this.noteHeight;

        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, w, h);

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(keyWidth, 30, w - keyWidth, h - 30);
        this.ctx.clip();

        for (let octave = 0; octave < this.octaveRange; octave++) {
            for (let note = 0; note < 12; note++) {
                const y = octave * 12 * this.noteHeight + note * this.noteHeight - this.scrollY;
                if (y + this.noteHeight < 30 || y > h) continue;

                const isBlack = [1, 3, 6, 8, 10].includes(note);
                this.ctx.fillStyle = isBlack ? '#15152e' : '#1e1e3a';
                this.ctx.fillRect(keyWidth, y, w - keyWidth, this.noteHeight);

                if (note === 0) {
                    this.ctx.strokeStyle = '#444';
                    this.ctx.beginPath();
                    this.ctx.moveTo(keyWidth, y);
                    this.ctx.lineTo(w, y);
                    this.ctx.stroke();
                }
            }
        }

        const secondsPerBeat = 60 / (this.audioEngine ? this.audioEngine.bpm : 120);
        for (let beat = 0; beat < 64; beat++) {
            const x = keyWidth + beat * this.pixelsPerBeat - this.scrollX;
            if (x < keyWidth || x > w) continue;
            this.ctx.strokeStyle = beat % 4 === 0 ? '#555' : '#333';
            this.ctx.lineWidth = beat % 4 === 0 ? 1 : 0.5;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 30);
            this.ctx.lineTo(x, h);
            this.ctx.stroke();
        }

        this.notes.forEach(note => {
            const x = keyWidth + note.start * this.pixelsPerBeat - this.scrollX;
            const noteWidth = note.duration * this.pixelsPerBeat;
            const noteIndex = note.midi - this.baseOctave * 12;
            const y = noteIndex * this.noteHeight - this.scrollY;

            if (x + noteWidth < keyWidth || x > w) return;
            if (y + this.noteHeight < 30 || y > h) return;

            const alpha = note.velocity / 127;
            this.ctx.fillStyle = note === this.selectedNote ? '#ffcc00' : `rgba(78, 115, 223, ${alpha})`;
            this.ctx.fillRect(x, y, noteWidth - 1, this.noteHeight - 1);
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 0.5;
            this.ctx.strokeRect(x, y, noteWidth - 1, this.noteHeight - 1);
        });

        this.renderVelocityLane(w, h);
        this.renderPitchBendLane(w, h);
        this.renderModulationLane(w, h);

        this.ctx.restore();

        this.ctx.fillStyle = '#16213e';
        this.ctx.fillRect(0, 0, keyWidth, h);

        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        for (let octave = 0; octave < this.octaveRange; octave++) {
            for (let note = 0; note < 12; note++) {
                const y = octave * 12 * this.noteHeight + note * this.noteHeight - this.scrollY;
                if (y + this.noteHeight < 0 || y > h) continue;

                const isBlack = [1, 3, 6, 8, 10].includes(note);
                this.ctx.fillStyle = isBlack ? '#0d0d1f' : '#1a1a3a';
                this.ctx.fillRect(0, y, keyWidth, this.noteHeight);

                if (note === 0) {
                    this.ctx.fillStyle = '#888';
                    this.ctx.font = '9px sans-serif';
                    this.ctx.fillText(`C${octave + this.baseOctave}`, 4, y + this.noteHeight - 2);
                }

                this.ctx.strokeStyle = '#333';
                this.ctx.beginPath();
                this.ctx.moveTo(0, y + this.noteHeight);
                this.ctx.lineTo(keyWidth, y + this.noteHeight);
                this.ctx.stroke();
            }
        }

        this.ctx.strokeStyle = '#555';
        this.ctx.beginPath();
        this.ctx.moveTo(keyWidth, 0);
        this.ctx.lineTo(keyWidth, h);
        this.ctx.stroke();
    }

    renderVelocityLane(w, h) {
        const laneHeight = 60;
        const laneY = h - laneHeight - 40;
        if (laneY < 100) return;

        this.ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
        this.ctx.fillRect(60, laneY, w - 60, laneHeight);

        this.notes.forEach(note => {
            const x = 60 + note.start * this.pixelsPerBeat - this.scrollX;
            const barHeight = (note.velocity / 127) * laneHeight;
            this.ctx.fillStyle = '#4e73df';
            this.ctx.fillRect(x, laneY + laneHeight - barHeight, 3, barHeight);
        });
    }

    renderPitchBendLane(w, h) {
        const laneHeight = 30;
        const laneY = h - laneHeight;
        if (laneY < 100) return;

        this.ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
        this.ctx.fillRect(60, laneY, w - 60, laneHeight);

        this.ctx.strokeStyle = '#1cc88a';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        const midY = laneY + laneHeight / 2;
        this.ctx.moveTo(60, midY);
        this.pitchBend.forEach(point => {
            const x = 60 + point.time * this.pixelsPerBeat - this.scrollX;
            const y = midY - point.value * (laneHeight / 2);
            this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();
    }

    renderModulationLane(w, h) {
        const laneHeight = 30;
        const laneY = h - laneHeight - 70;
        if (laneY < 100) return;

        this.ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
        this.ctx.fillRect(60, laneY, w - 60, laneHeight);

        this.ctx.strokeStyle = '#f6c23e';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.modulation.forEach((point, i) => {
            const x = 60 + point.time * this.pixelsPerBeat - this.scrollX;
            const y = laneY + laneHeight - point.value * laneHeight;
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();
    }

    getNotes() {
        return this.notes;
    }

    setNotes(notes) {
        this.notes = notes;
    }

    importMidi(notes) {
        this.notes = notes;
    }

    exportMidi() {
        return this.notes.map(n => ({
            midi: n.midi,
            start: n.start,
            duration: n.duration,
            velocity: n.velocity
        }));
    }
}

const sunoPianoRoll = new SunoPianoRoll();
