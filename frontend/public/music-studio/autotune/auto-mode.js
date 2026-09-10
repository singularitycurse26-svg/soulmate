// Auto-Tune Auto Mode implementation

class AutoTuneAutoMode {
    constructor() {
        this.enabled = false;
        this.settings = {
            inputType: 'tenor',
            key: 'C',
            scale: 'chromatic',
            transpose: 0,
            detune: 0,
            retuneSpeed: 20,
            flexTune: 0,
            humanize: 0,
            naturalVibrato: 0,
            throatLength: 0,
            formantMode: false,
            tracking: 50,
            bypassNotes: false,
            vibratoRate: 5,
            vibratoPitch: 50,
            vibratoFormant: 0,
            vibratoShape: 'sine',
            createVibrato: false,
            classicMode: false,
            lowLatency: false,
            conformToScale: false,
            bypass: false,
            inputGain: 0,
            outputGain: 0,
            stereoMode: 'stereo',
            presetCategory: 'factory',
            harmonyEnabled: false,
            harmonyVoices: 4,
            harmonyInterval: [3, 5, 7, 12],
            harmonyMix: [80, 80, 80, 80],
            harmonyPan: [-30, 30, -50, 50],
            harmonyMute: [false, false, false, false]
        };
        
        this.init();
    }

    init() {
        this.wireControls();
        this.renderKeyboard();
        this.loadSettings();
    }

    async loadSettings() {
        try {
            const settings = await FileUtils.loadSettings();
            if (settings && settings.autotune) {
                this.settings = { ...this.settings, ...settings.autotune };
                this.updateUI();
            }
        } catch (e) {
            // Use defaults
        }
    }

    updateUI() {
        document.getElementById('at-input-type').value = this.settings.inputType;
        document.getElementById('at-key').value = this.settings.key;
        document.getElementById('at-scale').value = this.settings.scale;
        document.getElementById('at-transpose').value = this.settings.transpose;
        document.getElementById('at-transpose-val').textContent = this.settings.transpose;
        document.getElementById('at-detune').value = this.settings.detune;
        document.getElementById('at-detune-val').textContent = this.settings.detune + ' cents';
        document.getElementById('at-retune-speed').value = this.settings.retuneSpeed;
        document.getElementById('at-retune-val').textContent = this.settings.retuneSpeed + ' ms';
        document.getElementById('at-flex-tune').value = this.settings.flexTune;
        document.getElementById('at-humanize').value = this.settings.humanize;
        document.getElementById('at-natural-vibrato').value = this.settings.naturalVibrato;
        document.getElementById('at-throat').value = this.settings.throatLength;
        
        const formantToggle = document.getElementById('at-formant-toggle');
        formantToggle.textContent = this.settings.formantMode ? 'ON' : 'OFF';
        formantToggle.classList.toggle('active', this.settings.formantMode);
        
        document.getElementById('at-tracking').value = this.settings.tracking;
        
        const bypassToggle = document.getElementById('at-bypass-toggle');
        bypassToggle.textContent = this.settings.bypassNotes ? 'ON' : 'OFF';
        bypassToggle.classList.toggle('active', this.settings.bypassNotes);
        
        document.getElementById('at-vibrato-rate').value = this.settings.vibratoRate;
        document.getElementById('at-vibrato-pitch').value = this.settings.vibratoPitch;
        document.getElementById('at-vibrato-formant').value = this.settings.vibratoFormant;
        document.getElementById('at-vibrato-shape').value = this.settings.vibratoShape;
        
        const createVibratoToggle = document.getElementById('at-create-vibrato');
        createVibratoToggle.textContent = this.settings.createVibrato ? 'ON' : 'OFF';
        createVibratoToggle.classList.toggle('active', this.settings.createVibrato);
    }

    wireControls() {
        // Basic controls
        document.getElementById('at-input-type').addEventListener('change', (e) => {
            this.settings.inputType = e.target.value;
        });
        
        document.getElementById('at-key').addEventListener('change', (e) => {
            this.settings.key = e.target.value;
            this.renderKeyboard();
        });
        
        document.getElementById('at-scale').addEventListener('change', (e) => {
            this.settings.scale = e.target.value;
            this.renderKeyboard();
        });
        
        document.getElementById('at-transpose').addEventListener('input', (e) => {
            this.settings.transpose = parseInt(e.target.value);
            document.getElementById('at-transpose-val').textContent = this.settings.transpose;
        });
        
        document.getElementById('at-detune').addEventListener('input', (e) => {
            this.settings.detune = parseInt(e.target.value);
            document.getElementById('at-detune-val').textContent = this.settings.detune + ' cents';
        });
        
        document.getElementById('at-retune-speed').addEventListener('input', (e) => {
            this.settings.retuneSpeed = parseInt(e.target.value);
            document.getElementById('at-retune-val').textContent = this.settings.retuneSpeed + ' ms';
        });
        
        document.getElementById('at-flex-tune').addEventListener('input', (e) => {
            this.settings.flexTune = parseInt(e.target.value);
        });
        
        document.getElementById('at-humanize').addEventListener('input', (e) => {
            this.settings.humanize = parseInt(e.target.value);
        });
        
        document.getElementById('at-natural-vibrato').addEventListener('input', (e) => {
            this.settings.naturalVibrato = parseInt(e.target.value);
        });
        
        document.getElementById('at-throat').addEventListener('input', (e) => {
            this.settings.throatLength = parseInt(e.target.value);
        });
        
        document.getElementById('at-formant-toggle').addEventListener('click', (e) => {
            this.settings.formantMode = !this.settings.formantMode;
            e.target.textContent = this.settings.formantMode ? 'ON' : 'OFF';
            e.target.classList.toggle('active', this.settings.formantMode);
        });
        
        // Advanced toggle
        document.getElementById('at-advanced-btn').addEventListener('click', (e) => {
            const advanced = document.getElementById('at-advanced');
            advanced.style.display = advanced.style.display === 'none' ? 'block' : 'none';
            e.target.textContent = advanced.style.display === 'none' ? 'Advanced View ▼' : 'Advanced View ▲';
        });
        
        // Advanced tabs
        document.querySelectorAll('.advanced-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                document.querySelectorAll('.advanced-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                document.getElementById('at-scale-controls').style.display = tab === 'scale' ? 'block' : 'none';
                document.getElementById('at-vibrato-controls').style.display = tab === 'vibrato' ? 'block' : 'none';
            });
        });
        
        // Advanced controls
        document.getElementById('at-tracking').addEventListener('input', (e) => {
            this.settings.tracking = parseInt(e.target.value);
        });
        
        document.getElementById('at-bypass-toggle').addEventListener('click', (e) => {
            this.settings.bypassNotes = !this.settings.bypassNotes;
            e.target.textContent = this.settings.bypassNotes ? 'ON' : 'OFF';
            e.target.classList.toggle('active', this.settings.bypassNotes);
        });
        
        document.getElementById('at-vibrato-rate').addEventListener('input', (e) => {
            this.settings.vibratoRate = parseInt(e.target.value);
        });
        
        document.getElementById('at-vibrato-pitch').addEventListener('input', (e) => {
            this.settings.vibratoPitch = parseInt(e.target.value);
        });
        
        document.getElementById('at-vibrato-formant').addEventListener('input', (e) => {
            this.settings.vibratoFormant = parseInt(e.target.value);
        });
        
        document.getElementById('at-vibrato-shape').addEventListener('change', (e) => {
            this.settings.vibratoShape = e.target.value;
        });
        
        document.getElementById('at-create-vibrato').addEventListener('click', (e) => {
            this.settings.createVibrato = !this.settings.createVibrato;
            e.target.textContent = this.settings.createVibrato ? 'ON' : 'OFF';
            e.target.classList.toggle('active', this.settings.createVibrato);
        });
        
        // Enable button
        document.getElementById('at-enable').addEventListener('click', (e) => {
            this.enabled = !this.enabled;
            e.target.textContent = this.enabled ? 'Disable Auto-Tune' : 'Enable Auto-Tune';
            e.target.classList.toggle('btn-primary', !this.enabled);
            e.target.classList.toggle('btn-danger', this.enabled);
        });

        // Classic Mode
        document.getElementById('at-classic-mode').addEventListener('click', (e) => {
            this.settings.classicMode = !this.settings.classicMode;
            e.target.textContent = 'Classic Mode: ' + (this.settings.classicMode ? 'ON' : 'OFF');
            e.target.classList.toggle('active', this.settings.classicMode);
        });

        // Low Latency
        document.getElementById('at-low-latency').addEventListener('click', (e) => {
            this.settings.lowLatency = !this.settings.lowLatency;
            e.target.textContent = 'Low Latency: ' + (this.settings.lowLatency ? 'ON' : 'OFF');
            e.target.classList.toggle('active', this.settings.lowLatency);
        });

        // Conform to Scale
        document.getElementById('at-conform-scale').addEventListener('click', (e) => {
            this.settings.conformToScale = !this.settings.conformToScale;
            e.target.textContent = 'Conform to Scale: ' + (this.settings.conformToScale ? 'ON' : 'OFF');
            e.target.classList.toggle('active', this.settings.conformToScale);
        });

        // Bypass
        document.getElementById('at-bypass').addEventListener('click', (e) => {
            this.settings.bypass = !this.settings.bypass;
            e.target.textContent = 'Bypass: ' + (this.settings.bypass ? 'ON' : 'OFF');
            e.target.classList.toggle('active', this.settings.bypass);
        });

        // Input Gain
        document.getElementById('at-input-gain').addEventListener('input', (e) => {
            this.settings.inputGain = parseInt(e.target.value);
            document.getElementById('at-input-gain-val').textContent = e.target.value + ' dB';
        });

        // Output Gain
        document.getElementById('at-output-gain').addEventListener('input', (e) => {
            this.settings.outputGain = parseInt(e.target.value);
            document.getElementById('at-output-gain-val').textContent = e.target.value + ' dB';
        });

        // Stereo Mode
        document.getElementById('at-stereo-mode').addEventListener('change', (e) => {
            this.settings.stereoMode = e.target.value;
        });

        // Preset Category
        document.getElementById('at-preset-category').addEventListener('change', (e) => {
            this.settings.presetCategory = e.target.value;
        });

        // Preset List
        document.getElementById('at-preset-list').addEventListener('change', (e) => {
            this.applyPreset(e.target.value);
        });

        // Harmony Player Enable
        document.getElementById('at-harmony-enable').addEventListener('click', (e) => {
            this.settings.harmonyEnabled = !this.settings.harmonyEnabled;
            e.target.textContent = 'Harmony: ' + (this.settings.harmonyEnabled ? 'ON' : 'OFF');
            e.target.classList.toggle('active', this.settings.harmonyEnabled);
        });

        // Harmony Voice controls
        document.querySelectorAll('.harmony-interval').forEach(input => {
            input.addEventListener('input', (e) => {
                const voice = parseInt(e.target.dataset.voice);
                this.settings.harmonyInterval[voice] = parseInt(e.target.value);
                e.target.nextElementSibling.textContent = e.target.value + ' st';
            });
        });

        document.querySelectorAll('.harmony-mix').forEach(input => {
            input.addEventListener('input', (e) => {
                const voice = parseInt(e.target.dataset.voice);
                this.settings.harmonyMix[voice] = parseInt(e.target.value);
                e.target.nextElementSibling.textContent = e.target.value + '%';
            });
        });

        document.querySelectorAll('.harmony-pan').forEach(input => {
            input.addEventListener('input', (e) => {
                const voice = parseInt(e.target.dataset.voice);
                this.settings.harmonyPan[voice] = parseInt(e.target.value);
            });
        });

        document.querySelectorAll('.harmony-mute-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const voice = parseInt(e.target.dataset.voice);
                this.settings.harmonyMute[voice] = !this.settings.harmonyMute[voice];
                e.target.classList.toggle('active', this.settings.harmonyMute[voice]);
            });
        });
    }

    applyPreset(presetName) {
        const presets = {
            'default': { retuneSpeed: 20, flexTune: 0, humanize: 0, classicMode: false },
            'cher': { retuneSpeed: 0, flexTune: 0, humanize: 0, classicMode: true },
            'tpain': { retuneSpeed: 0, flexTune: 0, humanize: 0, classicMode: true, harmonyEnabled: true },
            'natural': { retuneSpeed: 50, flexTune: 50, humanize: 20, classicMode: false },
            'subtle': { retuneSpeed: 80, flexTune: 80, humanize: 40, classicMode: false }
        };
        const preset = presets[presetName];
        if (preset) {
            Object.assign(this.settings, preset);
            this.updateUI();
        }
    }

    renderKeyboard() {
        const keyboard = document.getElementById('at-keyboard');
        keyboard.innerHTML = '';
        keyboard.style.position = 'relative';
        keyboard.style.display = 'flex';
        keyboard.style.height = '120px';
        keyboard.style.padding = '0';
        keyboard.style.gap = '0';

        const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        const blackNotes = [
            { note: 'C#', after: 0 },
            { note: 'D#', after: 1 },
            { note: 'F#', after: 3 },
            { note: 'G#', after: 4 },
            { note: 'A#', after: 5 }
        ];
        const scaleNotes = this.getScaleNotes();
        const octaves = 2;

        const whiteKeyWidth = 100 / (whiteNotes.length * octaves);

        for (let oct = 0; oct < octaves; oct++) {
            whiteNotes.forEach((note, i) => {
                const fullNote = note + (oct + 3);
                const key = document.createElement('div');
                key.className = 'keyboard-key';
                key.style.flex = '0 0 ' + whiteKeyWidth + '%';
                key.style.position = 'relative';
                key.style.background = scaleNotes.includes(note) ? '#007acc' : '#f0f0f0';
                key.style.color = scaleNotes.includes(note) ? 'white' : '#333';
                key.style.border = '1px solid #999';
                key.style.borderRadius = '0 0 4px 4px';
                key.style.display = 'flex';
                key.style.alignItems = 'flex-end';
                key.style.justifyContent = 'center';
                key.style.paddingBottom = '6px';
                key.style.fontSize = '11px';
                key.style.height = '100%';
                key.style.zIndex = '0';
                key.textContent = note + (oct + 3);
                key.addEventListener('click', () => this.toggleNote(note));
                keyboard.appendChild(key);
            });
        }

        for (let oct = 0; oct < octaves; oct++) {
            blackNotes.forEach(bn => {
                const note = bn.note;
                const whiteIdx = bn.after + oct * whiteNotes.length;
                const key = document.createElement('div');
                key.className = 'keyboard-key black';
                key.style.position = 'absolute';
                key.style.left = 'calc(' + ((whiteIdx + 1) * whiteKeyWidth) + '% - ' + (whiteKeyWidth * 0.3) + '%)';
                key.style.width = (whiteKeyWidth * 0.6) + '%';
                key.style.height = '65%';
                key.style.background = scaleNotes.includes(note) ? '#0099ff' : '#1a1a1a';
                key.style.color = scaleNotes.includes(note) ? 'white' : '#ccc';
                key.style.border = '1px solid #555';
                key.style.borderRadius = '0 0 4px 4px';
                key.style.zIndex = '1';
                key.style.display = 'flex';
                key.style.alignItems = 'flex-end';
                key.style.justifyContent = 'center';
                key.style.paddingBottom = '4px';
                key.style.fontSize = '9px';
                key.textContent = note;
                key.addEventListener('click', () => this.toggleNote(note));
                keyboard.appendChild(key);
            });
        }
    }

    getScaleNotes() {
        const key = this.settings.key;
        const scale = this.settings.scale;
        
        const allNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const keyIndex = allNotes.indexOf(key);
        
        if (scale === 'chromatic') {
            return allNotes;
        }
        
        const majorPattern = [0, 2, 4, 5, 7, 9, 11];
        const minorPattern = [0, 2, 3, 5, 7, 8, 10];
        const pentatonicMajorPattern = [0, 2, 4, 7, 9];
        const pentatonicMinorPattern = [0, 3, 5, 7, 10];
        const bluesPattern = [0, 3, 5, 6, 7, 10];
        
        let pattern;
        switch (scale) {
            case 'major':
                pattern = majorPattern;
                break;
            case 'minor':
            case 'harmonic-minor':
                pattern = minorPattern;
                break;
            case 'pentatonic-major':
                pattern = pentatonicMajorPattern;
                break;
            case 'pentatonic-minor':
                pattern = pentatonicMinorPattern;
                break;
            case 'blues':
                pattern = bluesPattern;
                break;
            default:
                pattern = majorPattern;
        }
        
        return pattern.map(interval => allNotes[(keyIndex + interval) % 12]);
    }

    toggleNote(note) {
        // Toggle note bypass/enable
        // Implementation would update scale settings
    }

    getSettings() {
        return this.settings;
    }
}

// Initialize when DOM is ready
let autoTuneAutoMode;
document.addEventListener('DOMContentLoaded', () => {
    autoTuneAutoMode = new AutoTuneAutoMode();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AutoTuneAutoMode;
}
