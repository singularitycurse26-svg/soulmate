class SunoStemSeparator {
    constructor() {
        this.audioEngine = null;
        this.settings = null;
        this.isProcessing = false;
        this.progress = 0;
        this.sourceClip = null;
        this.separationType = 'auto';
        this.stemCategories = ['vocals', 'drums', 'bass', 'guitar', 'keys', 'other'];
        this.separatedStems = [];
        this.init();
    }

    setAudioEngine(engine) {
        this.audioEngine = engine;
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.loadSettings();
            this.wireControls();
            this.wireDropZone();
        });
    }

    async loadSettings() {
        this.settings = await FileUtils.loadSettings();
        if (this.settings && this.settings.suno && this.settings.suno.stems) {
            this.separationType = this.settings.suno.stems.separationType || 'auto';
            this.stemCategories = this.settings.suno.stems.categories || this.stemCategories;
        }
    }

    wireControls() {
        const typeSelect = document.getElementById('suno-stem-type');
        const processBtn = document.getElementById('suno-stem-process');
        const fileInput = document.getElementById('suno-stem-file-input');

        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                this.separationType = e.target.value;
            });
            typeSelect.value = this.separationType;
        }

        if (processBtn) {
            processBtn.addEventListener('click', () => this.processStems());
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
    }

    wireDropZone() {
        const dropZone = document.getElementById('suno-stem-dropzone');
        if (!dropZone) return;

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('audio/')) {
                this.loadAudioFile(file);
            }
        });
        dropZone.addEventListener('click', () => {
            const fileInput = document.getElementById('suno-stem-file-input');
            if (fileInput) fileInput.click();
        });
    }

    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            await this.loadAudioFile(file);
        }
    }

    async loadAudioFile(file) {
        if (!this.audioEngine) return;
        await this.audioEngine.init();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.audioEngine.audioContext.decodeAudioData(arrayBuffer);
        this.sourceClip = audioBuffer;

        const info = document.getElementById('suno-stem-source-info');
        if (info) {
            info.textContent = `${file.name} (${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.numberOfChannels}ch)`;
            info.style.display = 'block';
        }

        const processBtn = document.getElementById('suno-stem-process');
        if (processBtn) processBtn.disabled = false;
    }

    async processStems() {
        if (!this.sourceClip || this.isProcessing) return;

        this.isProcessing = true;
        this.progress = 0;
        this.updateProgress(0);

        const processBtn = document.getElementById('suno-stem-process');
        if (processBtn) {
            processBtn.disabled = true;
            processBtn.textContent = 'Processing...';
        }

        const steps = 20;
        for (let i = 0; i <= steps; i++) {
            await this.delay(100);
            this.progress = (i / steps) * 100;
            this.updateProgress(this.progress);
        }

        this.separatedStems = this.simulateSeparation();
        this.renderStemList();

        this.isProcessing = false;
        if (processBtn) {
            processBtn.disabled = false;
            processBtn.textContent = 'Process Stems';
        }
        this.updateProgress(100, 'Complete!');
    }

    simulateSeparation() {
        if (!this.sourceClip || !this.audioEngine) return [];
        const ctx = this.audioEngine.audioContext;
        const buffer = this.sourceClip;
        const stems = [];

        const filterMap = {
            'vocals': { type: 'bandpass', freq: 1500, q: 1 },
            'drums': { type: 'highpass', freq: 2000, q: 0.7 },
            'bass': { type: 'lowpass', freq: 250, q: 0.7 },
            'guitar': { type: 'bandpass', freq: 800, q: 1 },
            'keys': { type: 'bandpass', freq: 4000, q: 1 },
            'other': { type: 'allpass', freq: 1000, q: 1 }
        };

        this.stemCategories.forEach(category => {
            const stemBuffer = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
            const filter = filterMap[category] || filterMap['other'];

            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                const data = buffer.getChannelData(ch);
                const out = stemBuffer.getChannelData(ch);

                if (filter.type === 'allpass') {
                    out.set(data);
                } else if (filter.type === 'lowpass') {
                    this.applyLowpass(data, out, filter.freq, buffer.sampleRate);
                } else if (filter.type === 'highpass') {
                    this.applyHighpass(data, out, filter.freq, buffer.sampleRate);
                } else if (filter.type === 'bandpass') {
                    this.applyBandpass(data, out, filter.freq, filter.q, buffer.sampleRate);
                }
            }

            stems.push({ name: category, buffer: stemBuffer, muted: false, solo: false });
        });

        return stems;
    }

    applyLowpass(input, output, cutoff, sampleRate) {
        const dt = 1 / sampleRate;
        const rc = 1 / (2 * Math.PI * cutoff);
        const alpha = dt / (rc + dt);
        let last = 0;
        for (let i = 0; i < input.length; i++) {
            last = last + alpha * (input[i] - last);
            output[i] = last;
        }
    }

    applyHighpass(input, output, cutoff, sampleRate) {
        const dt = 1 / sampleRate;
        const rc = 1 / (2 * Math.PI * cutoff);
        const alpha = rc / (rc + dt);
        let lastIn = 0, lastOut = 0;
        for (let i = 0; i < input.length; i++) {
            lastOut = alpha * (lastOut + input[i] - lastIn);
            lastIn = input[i];
            output[i] = lastOut;
        }
    }

    applyBandpass(input, output, freq, q, sampleRate) {
        const w0 = 2 * Math.PI * freq / sampleRate;
        const cosW = Math.cos(w0);
        const sinW = Math.sin(w0);
        const alpha = sinW / (2 * q);
        const b0 = alpha;
        const b1 = 0;
        const b2 = -alpha;
        const a0 = 1 + alpha;
        const a1 = -2 * cosW;
        const a2 = 1 - alpha;

        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < input.length; i++) {
            const x0 = input[i];
            const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
            output[i] = y0;
            x2 = x1; x1 = x0;
            y2 = y1; y1 = y0;
        }
    }

    renderStemList() {
        const container = document.getElementById('suno-stem-list');
        if (!container) return;
        container.innerHTML = '';

        this.separatedStems.forEach((stem, i) => {
            const el = document.createElement('div');
            el.className = 'suno-stem-item';
            el.innerHTML = `
                <span class="suno-stem-name">${stem.name.charAt(0).toUpperCase() + stem.name.slice(1)}</span>
                <button class="suno-stem-mute" data-index="${i}">M</button>
                <button class="suno-stem-solo" data-index="${i}">S</button>
                <button class="suno-stem-play" data-index="${i}">Play</button>
                <button class="suno-stem-remove-fx" data-index="${i}">Remove FX</button>
            `;
            container.appendChild(el);

            el.querySelector('.suno-stem-mute').addEventListener('click', () => {
                stem.muted = !stem.muted;
                el.classList.toggle('muted', stem.muted);
            });
            el.querySelector('.suno-stem-solo').addEventListener('click', () => {
                stem.solo = !stem.solo;
                el.classList.toggle('soloed', stem.solo);
            });
            el.querySelector('.suno-stem-play').addEventListener('click', () => {
                this.playStem(stem);
            });
            el.querySelector('.suno-stem-remove-fx').addEventListener('click', () => {
                this.removeStemFX(stem);
            });
        });

        const addToTimelineBtn = document.getElementById('suno-stem-add-timeline');
        if (addToTimelineBtn) {
            addToTimelineBtn.disabled = false;
            addToTimelineBtn.onclick = () => this.addStemsToTimeline();
        }
    }

    playStem(stem) {
        if (!this.audioEngine || !this.audioEngine.audioContext) return;
        const source = this.audioEngine.audioContext.createBufferSource();
        source.buffer = stem.buffer;
        source.connect(this.audioEngine.masterGain);
        source.start();
    }

    removeStemFX(stem) {
        if (!stem.buffer || !this.audioEngine) return;
        const ctx = this.audioEngine.audioContext;
        for (let ch = 0; ch < stem.buffer.numberOfChannels; ch++) {
            const data = stem.buffer.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
                data[i] *= 0.9;
            }
        }
    }

    addStemsToTimeline() {
        if (!this.audioEngine) return;
        this.separatedStems.forEach(stem => {
            const track = this.audioEngine.createTrack(`Stem: ${stem.name}`, 'audio');
            this.audioEngine.createClip(stem.buffer, track.id, 0, stem.buffer.duration);
        });

        const status = document.getElementById('suno-stem-status');
        if (status) {
            status.textContent = `${this.separatedStems.length} stems added to timeline`;
            status.style.display = 'block';
        }
    }

    updateProgress(percent, message) {
        const bar = document.getElementById('suno-stem-progress-bar');
        const text = document.getElementById('suno-stem-progress-text');
        if (bar) bar.style.width = percent + '%';
        if (text) text.textContent = message || `${Math.round(percent)}%`;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

const sunoStemSeparator = new SunoStemSeparator();
