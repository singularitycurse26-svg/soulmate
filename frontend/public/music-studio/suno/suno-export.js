class SunoExport {
    constructor() {
        this.audioEngine = null;
        this.settings = null;
        this.isExporting = false;
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
        if (this.settings && this.settings.suno && this.settings.suno.export) {
            this.updateUI(this.settings.suno.export);
        }
    }

    updateUI(exportSettings) {
        const formatSelect = document.getElementById('suno-export-format');
        const bitDepthSelect = document.getElementById('suno-export-bitdepth');
        const sampleRateSelect = document.getElementById('suno-export-samplerate');
        const midiCheckbox = document.getElementById('suno-export-midi');
        const multitrackCheckbox = document.getElementById('suno-export-multitrack');
        const stemsCheckbox = document.getElementById('suno-export-stems');
        const rangeCheckbox = document.getElementById('suno-export-range');

        if (formatSelect) formatSelect.value = exportSettings.format || 'wav';
        if (bitDepthSelect) bitDepthSelect.value = exportSettings.bitDepth || 32;
        if (sampleRateSelect) sampleRateSelect.value = exportSettings.sampleRate || 48000;
        if (midiCheckbox) midiCheckbox.checked = exportSettings.includeMIDI || false;
        if (multitrackCheckbox) multitrackCheckbox.checked = exportSettings.multitrack || false;
        if (stemsCheckbox) stemsCheckbox.checked = exportSettings.stems || false;
        if (rangeCheckbox) rangeCheckbox.checked = exportSettings.range || false;
    }

    wireControls() {
        const exportBtn = document.getElementById('suno-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.export());
        }

        const formatSelect = document.getElementById('suno-export-format');
        if (formatSelect) {
            formatSelect.addEventListener('change', (e) => {
                const bitDepthSelect = document.getElementById('suno-export-bitdepth');
                if (bitDepthSelect) {
                    if (e.target.value === 'mp3') {
                        bitDepthSelect.disabled = true;
                    } else {
                        bitDepthSelect.disabled = false;
                    }
                }
            });
        }
    }

    async export() {
        if (!this.audioEngine || this.isExporting) return;

        this.isExporting = true;
        this.updateProgress(0, 'Preparing...');

        const formatSelect = document.getElementById('suno-export-format');
        const bitDepthSelect = document.getElementById('suno-export-bitdepth');
        const sampleRateSelect = document.getElementById('suno-export-samplerate');
        const midiCheckbox = document.getElementById('suno-export-midi');
        const multitrackCheckbox = document.getElementById('suno-export-multitrack');
        const stemsCheckbox = document.getElementById('suno-export-stems');
        const rangeCheckbox = document.getElementById('suno-export-range');

        const format = formatSelect ? formatSelect.value : 'wav';
        const bitDepth = bitDepthSelect ? parseInt(bitDepthSelect.value) : 32;
        const sampleRate = sampleRateSelect ? parseInt(sampleRateSelect.value) : 48000;
        const includeMIDI = midiCheckbox ? midiCheckbox.checked : false;
        const multitrack = multitrackCheckbox ? multitrackCheckbox.checked : false;
        const exportStems = stemsCheckbox ? stemsCheckbox.checked : false;

        const exportBtn = document.getElementById('suno-export-btn');
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.textContent = 'Exporting...';
        }

        try {
            if (multitrack) {
                await this.exportMultitrack(format, bitDepth, sampleRate);
            } else if (exportStems) {
                await this.exportStems(format, bitDepth, sampleRate);
            } else {
                await this.exportFullMix(format, bitDepth, sampleRate);
            }

            if (includeMIDI) {
                this.exportMIDI();
            }

            this.updateProgress(100, 'Export complete!');
        } catch (e) {
            this.updateProgress(0, 'Export failed: ' + e.message);
        }

        this.isExporting = false;
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = 'Export';
        }
    }

    async exportFullMix(format, bitDepth, sampleRate) {
        if (!this.audioEngine) return;
        const duration = this.audioEngine.clips.length > 0
            ? Math.max(...this.audioEngine.clips.map(c => c.startTime + c.duration))
            : 10;

        this.updateProgress(20, 'Rendering audio...');
        const audioBuffer = await this.audioEngine.exportAudio(duration);

        this.updateProgress(60, 'Encoding...');

        if (format === 'wav') {
            const blob = await FileUtils.exportWAV(audioBuffer, {
                bitDepth,
                float: bitDepth === 32
            });
            FileUtils.downloadBlob(blob, `suno-export-${Date.now()}.wav`);
        } else if (format === 'mp3') {
            const blob = await FileUtils.exportWAV(audioBuffer, { bitDepth: 16 });
            FileUtils.downloadBlob(blob, `suno-export-${Date.now()}.wav`);
        }

        this.updateProgress(90, 'Finishing...');
    }

    async exportMultitrack(format, bitDepth, sampleRate) {
        if (!this.audioEngine) return;
        const duration = this.audioEngine.clips.length > 0
            ? Math.max(...this.audioEngine.clips.map(c => c.startTime + c.duration))
            : 10;

        const totalTracks = this.audioEngine.tracks.length;
        for (let i = 0; i < totalTracks; i++) {
            const track = this.audioEngine.tracks[i];
            const progress = (i / totalTracks) * 80 + 10;
            this.updateProgress(progress, `Exporting track ${i + 1}/${totalTracks}: ${track.name}`);

            const offlineContext = new OfflineAudioContext(
                2,
                Math.ceil(sampleRate * duration),
                sampleRate
            );

            const gain = offlineContext.createGain();
            gain.gain.value = track.muted ? 0 : track.volume;
            const panner = offlineContext.createStereoPanner();
            panner.pan.value = track.pan;
            gain.connect(panner);
            panner.connect(offlineContext.destination);

            track.clips.forEach(clip => {
                if (clip.audioBuffer) {
                    const source = offlineContext.createBufferSource();
                    source.buffer = clip.audioBuffer;
                    source.connect(gain);
                    source.start(clip.startTime, clip.offset);
                }
            });

            const renderedBuffer = await offlineContext.startRendering();
            const blob = await FileUtils.exportWAV(renderedBuffer, {
                bitDepth,
                float: bitDepth === 32
            });

            const safeName = track.name.replace(/[^a-zA-Z0-9]/g, '_');
            FileUtils.downloadBlob(blob, `suno-track-${i + 1}-${safeName}.wav`);

            await this.delay(100);
        }

        this.updateProgress(90, 'Finishing multitrack export...');
    }

    async exportStems(format, bitDepth, sampleRate) {
        if (!this.audioEngine) return;
        const stemSeparator = sunoStemSeparator;
        if (!stemSeparator.separatedStems || stemSeparator.separatedStems.length === 0) {
            this.updateProgress(0, 'No stems available. Process stems first.');
            return;
        }

        const totalStems = stemSeparator.separatedStems.length;
        for (let i = 0; i < totalStems; i++) {
            const stem = stemSeparator.separatedStems[i];
            const progress = (i / totalStems) * 80 + 10;
            this.updateProgress(progress, `Exporting stem ${i + 1}/${totalStems}: ${stem.name}`);

            const blob = await FileUtils.exportWAV(stem.buffer, {
                bitDepth,
                float: bitDepth === 32
            });

            FileUtils.downloadBlob(blob, `suno-stem-${stem.name}.wav`);
            await this.delay(100);
        }

        this.updateProgress(90, 'Finishing stem export...');
    }

    exportMIDI() {
        if (typeof sunoPianoRoll === 'undefined') return;
        const notes = sunoPianoRoll.getNotes();
        if (notes.length === 0) return;

        const midiData = this.generateMidiFile(notes);
        const blob = new Blob([midiData], { type: 'audio/midi' });
        FileUtils.downloadBlob(blob, `suno-midi-${Date.now()}.mid`);
    }

    generateMidiFile(notes) {
        const bpm = this.audioEngine ? this.audioEngine.bpm : 120;
        const ticksPerBeat = 480;
        const usPerQuarter = Math.floor(60000000 / bpm);

        const header = [
            0x4D, 0x54, 0x68, 0x64,
            0x00, 0x00, 0x00, 0x06,
            0x00, 0x00,
            0x00, 0x01,
            (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF
        ];

        const trackEvents = [];
        trackEvents.push(0x00, 0xFF, 0x51, 0x03,
            (usPerQuarter >> 16) & 0xFF,
            (usPerQuarter >> 8) & 0xFF,
            usPerQuarter & 0xFF);

        const sorted = [...notes].sort((a, b) => a.start - b.start);
        sorted.forEach(note => {
            const startTick = Math.round(note.start * ticksPerBeat);
            const durationTicks = Math.round(note.duration * ticksPerBeat);
            const velocity = Math.round(note.velocity);

            trackEvents.push(...this.writeVarLen(0));
            trackEvents.push(0x90, note.midi & 0x7F, velocity & 0x7F);
            trackEvents.push(...this.writeVarLen(durationTicks));
            trackEvents.push(0x80, note.midi & 0x7F, 0x00);
        });

        trackEvents.push(0x00, 0xFF, 0x2F, 0x00);

        const trackHeader = [
            0x4D, 0x54, 0x72, 0x6B,
            (trackEvents.length >> 24) & 0xFF,
            (trackEvents.length >> 16) & 0xFF,
            (trackEvents.length >> 8) & 0xFF,
            trackEvents.length & 0xFF
        ];

        return new Uint8Array([...header, ...trackHeader, ...trackEvents]);
    }

    writeVarLen(value) {
        const bytes = [];
        let buffer = value & 0x7F;
        while ((value >>= 7)) {
            buffer <<= 8;
            buffer |= ((value & 0x7F) | 0x80);
        }
        while (true) {
            bytes.push(buffer & 0xFF);
            if (buffer & 0x80) buffer >>= 8;
            else break;
        }
        return bytes;
    }

    updateProgress(percent, message) {
        const bar = document.getElementById('suno-export-progress-bar');
        const text = document.getElementById('suno-export-progress-text');
        if (bar) bar.style.width = percent + '%';
        if (text) text.textContent = message || `${Math.round(percent)}%`;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

const sunoExport = new SunoExport();
