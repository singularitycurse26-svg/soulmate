class SunoMusicalTyping {
    constructor() {
        this.synth = null;
        this.enabled = true;
        this.octave = 4;
        this.velocity = 100;
        this.activeKeys = new Set();
        this.chordMode = 'none';
        this.arpMode = 'off';
        this.arpRate = 1/8;
        this.arpDirection = 'up';
        this.arpNotes = [];
        this.arpIndex = 0;
        this.arpInterval = null;
        this.keyMap = null;

        this.init();
    }

    setSynth(synth) {
        this.synth = synth;
    }

    init() {
        this.buildKeyMap();
        document.addEventListener('DOMContentLoaded', () => {
            this.wireControls();
        });
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }

    buildKeyMap() {
        this.keyMap = {
            'KeyA': 0, 'KeyW': 1, 'KeyS': 2, 'KeyE': 3, 'KeyD': 4, 'KeyF': 5,
            'KeyT': 6, 'KeyG': 7, 'KeyY': 8, 'KeyH': 9, 'KeyU': 10, 'KeyJ': 11,
            'KeyK': 12, 'KeyO': 13, 'KeyL': 14, 'KeyP': 15, 'Semicolon': 16,
            'Quote': 17,
            'KeyZ': -12, 'KeyX': -11, 'KeyC': -10, 'KeyV': -9, 'KeyB': -8,
            'KeyN': -7, 'KeyM': -6, 'Comma': -5, 'Period': -4, 'Slash': -3
        };
    }

    wireControls() {
        const toggleBtn = document.getElementById('suno-musical-typing-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.enabled = !this.enabled;
                toggleBtn.classList.toggle('active', this.enabled);
            });
        }

        const octaveDown = document.getElementById('suno-mt-octave-down');
        const octaveUp = document.getElementById('suno-mt-octave-up');
        if (octaveDown) octaveDown.addEventListener('click', () => {
            this.octave = Math.max(0, this.octave - 1);
            this.updateOctaveDisplay();
        });
        if (octaveUp) octaveUp.addEventListener('click', () => {
            this.octave = Math.min(8, this.octave + 1);
            this.updateOctaveDisplay();
        });

        const chordSelect = document.getElementById('suno-mt-chord-mode');
        if (chordSelect) {
            chordSelect.addEventListener('change', (e) => {
                this.chordMode = e.target.value;
            });
        }

        const arpSelect = document.getElementById('suno-mt-arp-mode');
        if (arpSelect) {
            arpSelect.addEventListener('change', (e) => {
                this.arpMode = e.target.value;
                if (this.arpMode === 'off') {
                    this.stopArpeggiator();
                }
            });
        }

        const arpRateSelect = document.getElementById('suno-mt-arp-rate');
        if (arpRateSelect) {
            arpRateSelect.addEventListener('change', (e) => {
                this.arpRate = 1 / parseFloat(e.target.value);
            });
        }
    }

    updateOctaveDisplay() {
        const display = document.getElementById('suno-mt-octave-display');
        if (display) display.textContent = `Octave ${this.octave}`;
    }

    handleKeyDown(e) {
        if (!this.enabled) return;
        if (e.repeat) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const code = e.code;
        if (!this.keyMap.hasOwnProperty(code)) return;

        e.preventDefault();
        if (this.activeKeys.has(code)) return;
        this.activeKeys.add(code);

        const semitone = this.keyMap[code];
        const midiNote = (this.octave + 5) * 12 + semitone;

        if (this.chordMode !== 'none') {
            this.playChord(midiNote);
        } else {
            this.playNote(midiNote);
        }

        if (this.arpMode !== 'off') {
            this.arpNotes.push(midiNote);
            if (!this.arpInterval) this.startArpeggiator();
        }

        this.highlightKey(code, true);
    }

    handleKeyUp(e) {
        if (!this.enabled) return;
        const code = e.code;
        if (!this.keyMap.hasOwnProperty(code)) return;

        this.activeKeys.delete(code);
        const semitone = this.keyMap[code];
        const midiNote = (this.octave + 5) * 12 + semitone;

        if (this.chordMode !== 'none') {
            this.stopChord(midiNote);
        } else {
            this.stopNote(midiNote);
        }

        if (this.arpMode !== 'off') {
            const idx = this.arpNotes.indexOf(midiNote);
            if (idx !== -1) this.arpNotes.splice(idx, 1);
            if (this.arpNotes.length === 0) this.stopArpeggiator();
        }

        this.highlightKey(code, false);
    }

    playNote(midiNote) {
        if (this.synth) this.synth.noteOn(midiNote, this.velocity);
    }

    stopNote(midiNote) {
        if (this.synth) this.synth.noteOff(midiNote);
    }

    playChord(rootMidi) {
        const intervals = {
            'major': [0, 4, 7],
            'minor': [0, 3, 7],
            '7th': [0, 4, 7, 10],
            'sus': [0, 5, 7],
            'dim': [0, 3, 6],
            'aug': [0, 4, 8]
        };
        const chord = intervals[this.chordMode] || [0];
        chord.forEach(interval => {
            this.playNote(rootMidi + interval);
        });
    }

    stopChord(rootMidi) {
        const intervals = {
            'major': [0, 4, 7],
            'minor': [0, 3, 7],
            '7th': [0, 4, 7, 10],
            'sus': [0, 5, 7],
            'dim': [0, 3, 6],
            'aug': [0, 4, 8]
        };
        const chord = intervals[this.chordMode] || [0];
        chord.forEach(interval => {
            this.stopNote(rootMidi + interval);
        });
    }

    startArpeggiator() {
        const intervalMs = (60 / (this.audioEngine ? this.audioEngine.bpm : 120)) * this.arpRate * 1000;
        this.arpInterval = setInterval(() => {
            if (this.arpNotes.length === 0) return;
            let note;
            if (this.arpDirection === 'up') {
                note = this.arpNotes[this.arpIndex % this.arpNotes.length];
            } else if (this.arpDirection === 'down') {
                note = this.arpNotes[this.arpNotes.length - 1 - (this.arpIndex % this.arpNotes.length)];
            } else {
                note = this.arpNotes[Math.floor(Math.random() * this.arpNotes.length)];
            }
            this.arpIndex++;
            this.playNote(note);
            setTimeout(() => this.stopNote(note), intervalMs * 0.8);
        }, intervalMs);
    }

    stopArpeggiator() {
        if (this.arpInterval) {
            clearInterval(this.arpInterval);
            this.arpInterval = null;
        }
        this.arpNotes = [];
        this.arpIndex = 0;
    }

    highlightKey(code, active) {
        const keyEl = document.querySelector(`[data-key-code="${code}"]`);
        if (keyEl) {
            keyEl.classList.toggle('active', active);
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }
}

const sunoMusicalTyping = new SunoMusicalTyping();
