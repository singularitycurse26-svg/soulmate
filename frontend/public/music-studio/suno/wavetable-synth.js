class SunoWavetableSynth {
    constructor() {
        this.audioContext = null;
        this.settings = null;
        this.activeVoices = new Map();
        this.osc1 = null;
        this.osc2 = null;
        this.filter = null;
        this.ampEnv = null;
        this.lfo = null;
        this.lfoGain = null;
        this.modMatrix = [];
        this.currentPreset = 'init';
        this.presets = this.getFactoryPresets();
        this.customPresets = [];
        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.loadSettings();
            this.wireControls();
            this.loadCustomPresets();
        });
    }

    async loadSettings() {
        this.settings = await FileUtils.loadSettings();
        if (this.settings && this.settings.suno && this.settings.suno.synth) {
            this.applySettings(this.settings.suno.synth);
        }
    }

    setAudioContext(ctx) {
        this.audioContext = ctx;
    }

    getFactoryPresets() {
        return [
            { name: 'Init', category: 'basic', osc1Type: 'sawtooth', osc2Type: 'square', filterCutoff: 2000, envAttack: 0.01, envDecay: 0.2, envSustain: 0.7, envRelease: 0.3 },
            { name: 'Warm Pad', category: 'pad', osc1Type: 'sawtooth', osc2Type: 'sawtooth', osc2Detune: 12, filterCutoff: 800, envAttack: 0.5, envDecay: 0.3, envSustain: 0.8, envRelease: 1.2, lfoRate: 2, lfoDepth: 0.1, lfoTarget: 'filter' },
            { name: 'Bright Lead', category: 'lead', osc1Type: 'sawtooth', osc2Type: 'square', osc2Detune: 7, filterCutoff: 4000, filterResonance: 3, envAttack: 0.005, envDecay: 0.1, envSustain: 0.6, envRelease: 0.2 },
            { name: 'Deep Bass', category: 'bass', osc1Type: 'sawtooth', osc2Type: 'sine', filterCutoff: 400, filterResonance: 5, envAttack: 0.005, envDecay: 0.15, envSustain: 0.5, envRelease: 0.1 },
            { name: 'Pluck', category: 'pluck', osc1Type: 'triangle', osc2Type: 'sine', filterCutoff: 3000, envAttack: 0.001, envDecay: 0.3, envSustain: 0.0, envRelease: 0.1 },
            { name: 'Keys', category: 'keys', osc1Type: 'triangle', osc2Type: 'sine', osc2Detune: 3, filterCutoff: 2500, envAttack: 0.005, envDecay: 0.4, envSustain: 0.6, envRelease: 0.5 },
            { name: 'Sub Bass', category: 'bass', osc1Type: 'sine', osc2Type: 'sine', osc2Octave: -1, filterCutoff: 200, envAttack: 0.01, envDecay: 0.1, envSustain: 0.9, envRelease: 0.2 },
            { name: 'Stab', category: 'lead', osc1Type: 'sawtooth', osc2Type: 'sawtooth', osc2Detune: -7, filterCutoff: 3000, filterResonance: 4, envAttack: 0.001, envDecay: 0.1, envSustain: 0.0, envRelease: 0.05 },
            { name: 'Lush Pad', category: 'pad', osc1Type: 'sawtooth', osc2Type: 'triangle', osc2Detune: 7, unison: 3, filterCutoff: 1200, envAttack: 0.8, envDecay: 0.5, envSustain: 0.9, envRelease: 2.0, lfoRate: 1, lfoDepth: 0.15, lfoTarget: 'filter' },
            { name: 'Acid', category: 'bass', osc1Type: 'sawtooth', osc2Type: 'square', filterCutoff: 800, filterResonance: 8, envAttack: 0.001, envDecay: 0.2, envSustain: 0.2, envRelease: 0.1, lfoRate: 8, lfoDepth: 0.3, lfoTarget: 'filter' },
            { name: 'Bell', category: 'keys', osc1Type: 'sine', osc2Type: 'sine', osc2Detune: 19, filterCutoff: 5000, envAttack: 0.001, envDecay: 1.5, envSustain: 0.0, envRelease: 1.0 },
            { name: 'Wobble', category: 'bass', osc1Type: 'sawtooth', osc2Type: 'square', filterCutoff: 1000, filterResonance: 6, envAttack: 0.01, envDecay: 0.2, envSustain: 0.7, envRelease: 0.3, lfoRate: 4, lfoDepth: 0.5, lfoTarget: 'filter' },
            { name: 'Airy Pad', category: 'pad', osc1Type: 'triangle', osc2Type: 'sine', osc2Detune: 12, filterCutoff: 2000, envAttack: 1.0, envDecay: 0.3, envSustain: 0.8, envRelease: 1.5 },
            { name: 'Sharp Lead', category: 'lead', osc1Type: 'square', osc2Type: 'sawtooth', osc2Detune: -5, filterCutoff: 5000, filterResonance: 2, envAttack: 0.001, envDecay: 0.05, envSustain: 0.8, envRelease: 0.1 },
            { name: 'Soft Keys', category: 'keys', osc1Type: 'sine', osc2Type: 'triangle', osc2Detune: 0, filterCutoff: 1800, envAttack: 0.01, envDecay: 0.3, envSustain: 0.7, envRelease: 0.4 },
            { name: 'Aggressive', category: 'lead', osc1Type: 'sawtooth', osc2Type: 'sawtooth', osc2Detune: 12, filterCutoff: 3500, filterResonance: 7, filterDrive: 0.3, envAttack: 0.001, envDecay: 0.1, envSustain: 0.5, envRelease: 0.15 }
        ];
    }

    loadCustomPresets() {
        try {
            const stored = localStorage.getItem('suno-synth-presets');
            this.customPresets = stored ? JSON.parse(stored) : [];
        } catch (e) {
            this.customPresets = [];
        }
    }

    saveCustomPreset(name, settings) {
        const preset = { name, category: 'user', ...settings };
        this.customPresets.push(preset);
        localStorage.setItem('suno-synth-presets', JSON.stringify(this.customPresets));
    }

    wireControls() {
        const presetSelect = document.getElementById('suno-synth-preset');
        if (presetSelect) {
            this.populatePresets(presetSelect);
            presetSelect.addEventListener('change', (e) => this.loadPreset(e.target.value));
        }

        const controls = document.querySelectorAll('[id^="suno-synth-"]');
        controls.forEach(ctrl => {
            const event = ctrl.type === 'range' ? 'input' : 'change';
            ctrl.addEventListener(event, (e) => this.handleControlChange(e.target));
        });

        const saveBtn = document.getElementById('suno-synth-save-preset');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const name = prompt('Preset name:');
                if (name) this.saveCustomPreset(name, this.getCurrentSettings());
            });
        }
    }

    populatePresets(select) {
        const categories = {};
        [...this.presets, ...this.customPresets].forEach((preset, i) => {
            if (!categories[preset.category]) categories[preset.category] = [];
            categories[preset.category].push({ ...preset, index: i });
        });

        Object.keys(categories).forEach(cat => {
            const group = document.createElement('optgroup');
            group.label = cat.charAt(0).toUpperCase() + cat.slice(1);
            categories[cat].forEach(preset => {
                const opt = document.createElement('option');
                opt.value = preset.index;
                opt.textContent = preset.name;
                group.appendChild(opt);
            });
            select.appendChild(group);
        });
    }

    loadPreset(index) {
        const allPresets = [...this.presets, ...this.customPresets];
        const preset = allPresets[parseInt(index)];
        if (!preset) return;
        this.applySettings(preset);
        this.updateUI(preset);
    }

    applySettings(settings) {
        this.settings = { ...this.settings, ...settings };
        this.updateUI(this.settings);
    }

    updateUI(settings) {
        const map = {
            'suno-synth-osc1-type': settings.osc1Type,
            'suno-synth-osc1-wavetable': settings.osc1WavetablePos,
            'suno-synth-osc1-detune': settings.osc1Detune,
            'suno-synth-osc1-mix': settings.osc1Mix,
            'suno-synth-osc2-type': settings.osc2Type,
            'suno-synth-osc2-wavetable': settings.osc2WavetablePos,
            'suno-synth-osc2-detune': settings.osc2Detune,
            'suno-synth-osc2-mix': settings.osc2Mix,
            'suno-synth-unison': settings.unison,
            'suno-synth-filter-type': settings.filterType,
            'suno-synth-filter-cutoff': settings.filterCutoff,
            'suno-synth-filter-resonance': settings.filterResonance,
            'suno-synth-filter-drive': settings.filterDrive,
            'suno-synth-env-attack': settings.envAttack,
            'suno-synth-env-decay': settings.envDecay,
            'suno-synth-env-sustain': settings.envSustain,
            'suno-synth-env-release': settings.envRelease,
            'suno-synth-lfo-rate': settings.lfoRate,
            'suno-synth-lfo-depth': settings.lfoDepth,
            'suno-synth-lfo-target': settings.lfoTarget
        };
        Object.keys(map).forEach(id => {
            const el = document.getElementById(id);
            if (el && map[id] !== undefined) {
                if (el.tagName === 'SELECT') el.value = map[id];
                else el.value = map[id];
            }
        });
    }

    handleControlChange(input) {
        const key = input.id.replace('suno-synth-', '').replace(/-/g, '');
        const value = input.type === 'range' || input.type === 'number' ? parseFloat(input.value) : input.value;
        if (this.settings) {
            const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            this.settings[camelKey] = value;
        }
        const display = input.nextElementSibling;
        if (display && display.tagName === 'SPAN' && input.type === 'range') {
            display.textContent = input.value;
        }
    }

    getCurrentSettings() {
        return {
            osc1Type: this.settings?.osc1Type || 'sawtooth',
            osc2Type: this.settings?.osc2Type || 'square',
            osc2Detune: this.settings?.osc2Detune || 0,
            filterCutoff: this.settings?.filterCutoff || 2000,
            filterResonance: this.settings?.filterResonance || 1,
            envAttack: this.settings?.envAttack || 0.01,
            envDecay: this.settings?.envDecay || 0.2,
            envSustain: this.settings?.envSustain || 0.7,
            envRelease: this.settings?.envRelease || 0.3,
            lfoRate: this.settings?.lfoRate || 4,
            lfoDepth: this.settings?.lfoDepth || 0,
            lfoTarget: this.settings?.lfoTarget || 'pitch'
        };
    }

    noteOn(midiNote, velocity = 0.8) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        this.noteOff(midiNote);

        const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
        const voice = this.createVoice(freq, velocity);
        this.activeVoices.set(midiNote, voice);
    }

    createVoice(freq, velocity) {
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const s = this.settings || {};

        const osc1 = ctx.createOscillator();
        osc1.type = s.osc1Type || 'sawtooth';
        osc1.frequency.value = freq;

        const osc2 = ctx.createOscillator();
        osc2.type = s.osc2Type || 'square';
        osc2.frequency.value = freq * Math.pow(2, (s.osc2Detune || 0) / 1200);

        const osc1Gain = ctx.createGain();
        osc1Gain.gain.value = s.osc1Mix !== undefined ? s.osc1Mix : 0.5;
        const osc2Gain = ctx.createGain();
        osc2Gain.gain.value = s.osc2Mix !== undefined ? s.osc2Mix : 0.5;

        osc1.connect(osc1Gain);
        osc2.connect(osc2Gain);

        const mixGain = ctx.createGain();
        osc1Gain.connect(mixGain);
        osc2Gain.connect(mixGain);

        const filter = ctx.createBiquadFilter();
        filter.type = s.filterType || 'lowpass';
        filter.frequency.value = s.filterCutoff || 2000;
        filter.Q.value = s.filterResonance || 1;

        mixGain.connect(filter);

        const ampEnv = ctx.createGain();
        ampEnv.gain.value = 0;
        filter.connect(ampEnv);

        const output = ctx.createGain();
        output.gain.value = velocity;
        ampEnv.connect(output);

        if (this._masterOutput) {
            output.connect(this._masterOutput);
        } else {
            output.connect(ctx.destination);
        }

        const attack = s.envAttack || 0.01;
        const decay = s.envDecay || 0.2;
        const sustain = s.envSustain !== undefined ? s.envSustain : 0.7;
        const release = s.envRelease || 0.3;

        ampEnv.gain.cancelScheduledValues(now);
        ampEnv.gain.setValueAtTime(0, now);
        ampEnv.gain.linearRampToValueAtTime(1, now + attack);
        ampEnv.gain.linearRampToValueAtTime(sustain, now + attack + decay);

        if (s.lfoDepth && s.lfoDepth > 0) {
            const lfo = ctx.createOscillator();
            lfo.frequency.value = s.lfoRate || 4;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = s.lfoDepth;

            const target = s.lfoTarget || 'pitch';
            if (target === 'pitch') {
                lfoGain.connect(osc1.frequency);
                lfoGain.connect(osc2.frequency);
            } else if (target === 'filter') {
                lfoGain.connect(filter.frequency);
            } else if (target === 'amp') {
                lfoGain.connect(ampEnv.gain);
            }

            lfo.start(now);
        }

        osc1.start(now);
        osc2.start(now);

        return { osc1, osc2, filter, ampEnv, output, startTime: now };
    }

    noteOff(midiNote) {
        const voice = this.activeVoices.get(midiNote);
        if (!voice) return;

        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const release = this.settings?.envRelease || 0.3;

        voice.ampEnv.gain.cancelScheduledValues(now);
        voice.ampEnv.gain.setValueAtTime(voice.ampEnv.gain.value, now);
        voice.ampEnv.gain.linearRampToValueAtTime(0, now + release);

        setTimeout(() => {
            try {
                voice.osc1.stop();
                voice.osc2.stop();
            } catch (e) {}
        }, release * 1000 + 100);

        this.activeVoices.delete(midiNote);
    }

    allNotesOff() {
        this.activeVoices.forEach((_, midi) => this.noteOff(midi));
    }

    setMasterOutput(node) {
        this._masterOutput = node;
    }
}

const sunoWavetableSynth = new SunoWavetableSynth();
