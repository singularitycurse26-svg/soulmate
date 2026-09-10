class SunoGenerationPanel {
    constructor() {
        this.settings = null;
        this.audioEngine = null;
        this.styleTags = [];
        this.lyrics = '';
        this.isGenerating = false;
        this.inspoPlaylist = [null, null, null, null];
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
        if (this.settings && this.settings.suno) {
            this.styleTags = [...(this.settings.suno.generation.styleTags || [])];
            this.lyrics = '';
        }
    }

    wireControls() {
        const promptInput = document.getElementById('suno-gen-prompt');
        const generateBtn = document.getElementById('suno-gen-generate');
        const styleInput = document.getElementById('suno-gen-style-input');
        const styleAddBtn = document.getElementById('suno-gen-style-add');
        const lyricsEditor = document.getElementById('suno-gen-lyrics');
        const modelSelect = document.getElementById('suno-gen-model');
        const tempSlider = document.getElementById('suno-gen-temperature');
        const seedInput = document.getElementById('suno-gen-seed');
        const personaSelect = document.getElementById('suno-gen-persona');
        const inspoSlots = document.querySelectorAll('.suno-inspo-slot');

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generate());
        }

        if (styleAddBtn && styleInput) {
            styleAddBtn.addEventListener('click', () => {
                const tag = styleInput.value.trim();
                if (tag && !this.styleTags.includes(tag)) {
                    this.styleTags.push(tag);
                    styleInput.value = '';
                    this.renderStyleTags();
                }
            });
            styleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    styleAddBtn.click();
                }
            });
        }

        if (tempSlider) {
            const tempDisplay = document.getElementById('suno-gen-temperature-display');
            tempSlider.addEventListener('input', (e) => {
                if (tempDisplay) tempDisplay.textContent = e.target.value;
            });
        }

        inspoSlots.forEach((slot, i) => {
            slot.addEventListener('click', () => this.playInspoSlot(i));
        });
    }

    renderStyleTags() {
        const container = document.getElementById('suno-gen-style-tags');
        if (!container) return;
        container.innerHTML = '';
        this.styleTags.forEach((tag, i) => {
            const chip = document.createElement('div');
            chip.className = 'suno-style-chip';
            chip.innerHTML = `<span>${tag}</span><button class="suno-chip-remove" data-index="${i}">x</button>`;
            chip.querySelector('.suno-chip-remove').addEventListener('click', () => {
                this.styleTags.splice(i, 1);
                this.renderStyleTags();
            });
            container.appendChild(chip);
        });
    }

    generate() {
        const promptInput = document.getElementById('suno-gen-prompt');
        const prompt = promptInput ? promptInput.value.trim() : '';
        if (!prompt && !this.lyrics) {
            this.showStatus('Enter a prompt or lyrics to generate.');
            return;
        }

        this.isGenerating = true;
        this.showGeneratingState(true);
        this.showStatus('Generating...');

        const modelSelect = document.getElementById('suno-gen-model');
        const model = modelSelect ? modelSelect.value : 'v6';
        const tempSlider = document.getElementById('suno-gen-temperature');
        const temperature = tempSlider ? parseFloat(tempSlider.value) : 0.7;
        const seedInput = document.getElementById('suno-gen-seed');
        const seed = seedInput ? parseInt(seedInput.value) : -1;

        const params = {
            prompt,
            styleTags: this.styleTags,
            lyrics: this.lyrics,
            model,
            temperature,
            seed
        };

        setTimeout(() => {
            this.simulateGeneration(params);
        }, 2000);
    }

    generateFromPrompt(prompt) {
        const promptInput = document.getElementById('suno-gen-prompt');
        if (promptInput) promptInput.value = prompt;
        this.generate();
    }

    simulateGeneration(params) {
        const stemNames = ['Vocals', 'Drums', 'Bass', 'Keys', 'Lead', 'FX'];
        const bpm = this.audioEngine ? this.audioEngine.bpm : 120;
        const sampleRate = this.audioEngine ? this.audioEngine.sampleRate : 44100;
        const duration = 8;
        const samples = Math.floor(sampleRate * duration);

        if (this.audioEngine) {
            stemNames.forEach((name, i) => {
                const track = this.audioEngine.createTrack(`${name} - ${params.prompt.substring(0, 20)}`, 'audio');
                const buffer = this.audioEngine.audioContext.createBuffer(2, samples, sampleRate);
                for (let ch = 0; ch < 2; ch++) {
                    const data = buffer.getChannelData(ch);
                    for (let s = 0; s < samples; s++) {
                        const t = s / sampleRate;
                        const freq = 110 * Math.pow(2, (i * 3) / 12);
                        data[s] = Math.sin(2 * Math.PI * freq * t) * 0.3 * Math.exp(-t * 0.1);
                    }
                }
                this.audioEngine.createClip(buffer, track.id, 0, duration);
            });
        }

        this.isGenerating = false;
        this.showGeneratingState(false);
        this.showStatus('Generation complete! 6 stems added to timeline.');

        if (this.audioEngine) {
            const timeline = document.getElementById('suno-timeline');
            if (timeline) {
                document.querySelectorAll('.program-window').forEach(w => w.classList.remove('active'));
                timeline.classList.add('active');
            }
        }
    }

    showGeneratingState(generating) {
        const generateBtn = document.getElementById('suno-gen-generate');
        if (generateBtn) {
            generateBtn.disabled = generating;
            generateBtn.textContent = generating ? 'Generating...' : 'Generate';
        }
    }

    showStatus(message) {
        const status = document.getElementById('suno-gen-status');
        if (status) {
            status.textContent = message;
            status.style.display = 'block';
            setTimeout(() => { status.style.display = 'none'; }, 5000);
        }
    }

    playInspoSlot(index) {
        const slot = document.querySelectorAll('.suno-inspo-slot')[index];
        if (!slot) return;
        slot.classList.add('playing');
        setTimeout(() => slot.classList.remove('playing'), 1000);
    }

    getSettings() {
        return {
            styleTags: this.styleTags,
            lyrics: this.lyrics
        };
    }
}

const sunoGenerationPanel = new SunoGenerationPanel();
