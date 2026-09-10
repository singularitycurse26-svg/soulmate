class SunoEffectsRack {
    constructor() {
        this.audioEngine = null;
        this.settings = null;
        this.trackChains = new Map();
        this.effectTypes = ['eq', 'compressor', 'reverb', 'delay', 'distortion', 'gate'];
        this.init();
    }

    setAudioEngine(engine) {
        this.audioEngine = engine;
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.loadSettings();
            this.wireControls();
        });
    }

    async loadSettings() {
        this.settings = await FileUtils.loadSettings();
    }

    wireControls() {
        const addEffectBtn = document.getElementById('suno-fx-add');
        if (addEffectBtn) {
            addEffectBtn.addEventListener('click', () => this.addEffectToSelectedTrack());
        }

        const effectSelect = document.getElementById('suno-fx-type');
        if (effectSelect) {
            this.effectTypes.forEach(type => {
                const opt = document.createElement('option');
                opt.value = type;
                opt.textContent = type.charAt(0).toUpperCase() + type.slice(1);
                effectSelect.appendChild(opt);
            });
        }

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('suno-fx-bypass')) {
                this.toggleBypass(e.target);
            }
            if (e.target.classList.contains('suno-fx-remove')) {
                this.removeEffect(e.target);
            }
            if (e.target.classList.contains('suno-fx-drag')) {
                this.startDrag(e.target);
            }
        });

        const paramInputs = document.querySelectorAll('[id^="suno-fx-param-"]');
        paramInputs.forEach(input => {
            const event = input.type === 'range' ? 'input' : 'change';
            input.addEventListener(event, (e) => this.handleParamChange(e.target));
        });
    }

    createEffectChain(trackId) {
        if (!this.audioEngine || !this.audioEngine.audioContext) return null;
        const ctx = this.audioEngine.audioContext;
        const track = this.audioEngine.tracks.find(t => t.id === trackId);
        if (!track) return null;

        const chain = {
            input: ctx.createGain(),
            output: ctx.createGain(),
            effects: [],
            nodes: []
        };

        chain.input.connect(chain.output);
        chain.output.connect(track.gain);

        this.trackChains.set(trackId, chain);
        return chain;
    }

    addEffect(trackId, effectType) {
        let chain = this.trackChains.get(trackId);
        if (!chain) {
            chain = this.createEffectChain(trackId);
            if (!chain) return;
        }

        if (!this.audioEngine || !this.audioEngine.audioContext) return;
        const ctx = this.audioEngine.audioContext;
        const effect = this.createEffectNode(ctx, effectType);

        if (chain.effects.length > 0) {
            const lastNode = chain.nodes[chain.nodes.length - 1];
            lastNode.disconnect();
            lastNode.connect(effect.input);
        } else {
            chain.input.disconnect();
            chain.input.connect(effect.input);
        }

        effect.output.connect(chain.output);
        chain.effects.push({ type: effectType, bypass: false, params: effect.defaultParams });
        chain.nodes.push(effect.input);

        this.renderEffectList(trackId);
    }

    createEffectNode(ctx, type) {
        switch (type) {
            case 'compressor':
                return this.createCompressor(ctx);
            case 'reverb':
                return this.createReverb(ctx);
            case 'delay':
                return this.createDelay(ctx);
            case 'distortion':
                return this.createDistortion(ctx);
            case 'eq':
                return this.createEQ(ctx);
            case 'gate':
                return this.createGate(ctx);
            default:
                return { input: ctx.createGain(), output: ctx.createGain(), defaultParams: {} };
        }
    }

    createCompressor(ctx) {
        const comp = ctx.createDynamicsCompressor();
        const input = ctx.createGain();
        const output = ctx.createGain();
        input.connect(comp);
        comp.connect(output);
        comp.threshold.value = -20;
        comp.ratio.value = 4;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        return { input, output, node: comp, defaultParams: { threshold: -20, ratio: 4, attack: 0.003, release: 0.25 } };
    }

    createReverb(ctx) {
        const convolver = ctx.createConvolver();
        const input = ctx.createGain();
        const wet = ctx.createGain();
        const dry = ctx.createGain();
        const output = ctx.createGain();

        const ir = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = ir.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
            }
        }
        convolver.buffer = ir;

        input.connect(dry);
        input.connect(convolver);
        convolver.connect(wet);
        dry.connect(output);
        wet.connect(output);

        wet.gain.value = 0.3;
        dry.gain.value = 0.7;

        return { input, output, node: convolver, defaultParams: { wetDry: 30, preDelay: 0, roomSize: 0.5 } };
    }

    createDelay(ctx) {
        const delay = ctx.createDelay(5);
        const feedback = ctx.createGain();
        const input = ctx.createGain();
        const wet = ctx.createGain();
        const dry = ctx.createGain();
        const output = ctx.createGain();

        delay.delayTime.value = 0.25;
        feedback.gain.value = 0.3;
        wet.gain.value = 0.2;
        dry.gain.value = 0.8;

        input.connect(dry);
        input.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        dry.connect(output);
        wet.connect(output);

        return { input, output, node: delay, defaultParams: { time: 0.25, feedback: 0.3, wetDry: 20 } };
    }

    createDistortion(ctx) {
        const shaper = ctx.createWaveShaper();
        const input = ctx.createGain();
        const output = ctx.createGain();

        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const x = (i / 128) - 1;
            curve[i] = Math.tanh(x * 3);
        }
        shaper.curve = curve;

        input.connect(shaper);
        shaper.connect(output);

        return { input, output, node: shaper, defaultParams: { drive: 0.5, tone: 50, mix: 0 } };
    }

    createEQ(ctx) {
        const bands = [];
        const freqs = [60, 250, 1000, 4000, 8000, 16000];
        const input = ctx.createGain();
        let prev = input;

        freqs.forEach(freq => {
            const filter = ctx.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.gain.value = 0;
            filter.Q.value = 1;
            prev.connect(filter);
            prev = filter;
            bands.push(filter);
        });

        const output = ctx.createGain();
        prev.connect(output);

        return { input, output, node: bands[0], bands, defaultParams: { bands: freqs.map(f => ({ freq: f, gain: 0, q: 1 })) } };
    }

    createGate(ctx) {
        const gate = ctx.createDynamicsCompressor();
        gate.threshold.value = -50;
        gate.ratio.value = 20;
        gate.attack.value = 0.001;
        gate.release.value = 0.1;

        const input = ctx.createGain();
        const output = ctx.createGain();
        input.connect(gate);
        gate.connect(output);

        return { input, output, node: gate, defaultParams: { threshold: -50, attack: 0.001, hold: 0.05, release: 0.1 } };
    }

    toggleBypass(btn) {
        const effectIndex = parseInt(btn.dataset.index);
        const trackId = btn.dataset.trackId;
        const chain = this.trackChains.get(trackId);
        if (chain && chain.effects[effectIndex]) {
            chain.effects[effectIndex].bypass = !chain.effects[effectIndex].bypass;
            btn.classList.toggle('bypassed', chain.effects[effectIndex].bypass);
        }
    }

    removeEffect(btn) {
        const effectIndex = parseInt(btn.dataset.index);
        const trackId = btn.dataset.trackId;
        const chain = this.trackChains.get(trackId);
        if (!chain) return;

        chain.effects.splice(effectIndex, 1);
        chain.nodes.splice(effectIndex, 1);
        this.rebuildChain(trackId);
        this.renderEffectList(trackId);
    }

    rebuildChain(trackId) {
        const chain = this.trackChains.get(trackId);
        if (!chain) return;

        chain.input.disconnect();
        if (chain.nodes.length === 0) {
            chain.input.connect(chain.output);
        } else {
            chain.input.connect(chain.nodes[0]);
            for (let i = 0; i < chain.nodes.length - 1; i++) {
                chain.nodes[i].connect(chain.nodes[i + 1]);
            }
            chain.nodes[chain.nodes.length - 1].connect(chain.output);
        }
    }

    handleParamChange(input) {
        const paramName = input.dataset.param;
        const effectIndex = parseInt(input.dataset.effectIndex);
        const trackId = input.dataset.trackId;
        const value = parseFloat(input.value);

        const chain = this.trackChains.get(trackId);
        if (!chain || !chain.effects[effectIndex]) return;

        chain.effects[effectIndex].params[paramName] = value;

        const display = input.nextElementSibling;
        if (display && display.tagName === 'SPAN') {
            display.textContent = input.value;
        }
    }

    addEffectToSelectedTrack() {
        const trackSelect = document.getElementById('suno-fx-track');
        const effectSelect = document.getElementById('suno-fx-type');
        if (!trackSelect || !effectSelect) return;
        const trackId = trackSelect.value;
        const effectType = effectSelect.value;
        this.addEffect(trackId, effectType);
    }

    renderEffectList(trackId) {
        const container = document.getElementById('suno-fx-chain');
        if (!container) return;
        const chain = this.trackChains.get(trackId);
        if (!chain) {
            container.innerHTML = '<p class="suno-fx-empty">No effects on this track</p>';
            return;
        }

        container.innerHTML = '';
        chain.effects.forEach((effect, i) => {
            const el = document.createElement('div');
            el.className = 'suno-fx-slot';
            el.innerHTML = `
                <div class="suno-fx-slot-header">
                    <span class="suno-fx-drag" data-index="${i}">::</span>
                    <span class="suno-fx-name">${effect.type.charAt(0).toUpperCase() + effect.type.slice(1)}</span>
                    <button class="suno-fx-bypass" data-index="${i}" data-track-id="${trackId}">Bypass</button>
                    <button class="suno-fx-remove" data-index="${i}" data-track-id="${trackId}">Remove</button>
                </div>
                <div class="suno-fx-params">
                    ${Object.keys(effect.params).map(key => `
                        <div class="suno-fx-param">
                            <label>${key}</label>
                            <input type="range" min="0" max="100" value="${effect.params[key]}"
                                data-param="${key}" data-effect-index="${i}" data-track-id="${trackId}"
                                id="suno-fx-param-${key}-${i}">
                            <span>${effect.params[key]}</span>
                        </div>
                    `).join('')}
                </div>
            `;
            container.appendChild(el);
        });
    }

    getChainForTrack(trackId) {
        return this.trackChains.get(trackId);
    }
}

const sunoEffectsRack = new SunoEffectsRack();
