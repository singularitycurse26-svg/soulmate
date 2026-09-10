// ACID Pro Chopper implementation

class AcidChopper {
    constructor() {
        this.currentAudioBuffer = null;
        this.slices = [];
        this.selectedSlice = null;
        this.playbackEnabled = false;
        this.midiPlayable = false;
        this.midiChannel = 1;
        this.selectedPad = 0;
        this.padPitches = new Array(16).fill(0);
        
        this.init();
    }

    init() {
        this.wireControls();
        this.wireOptions();
        this.wirePads();
        this.initCanvas();
    }

    wireControls() {
        document.querySelectorAll('.chopper-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleAction(action);
            });
        });
    }

    wireOptions() {
        document.getElementById('chop-sensitivity').addEventListener('input', (e) => {
            document.getElementById('chop-sensitivity-val').textContent = e.target.value;
        });
        
        document.getElementById('chop-min-length').addEventListener('input', (e) => {
            document.getElementById('chop-min-length-val').textContent = e.target.value + ' ms';
        });
        
        document.getElementById('chop-pitch-shift').addEventListener('input', (e) => {
            document.getElementById('chop-pitch-val').textContent = e.target.value + ' st';
        });
        
        document.getElementById('chop-tempo-match').addEventListener('change', (e) => {
            // Handle tempo matching toggle
        });

        const midiBtn = document.getElementById('chopper-midi');
        if (midiBtn) {
            midiBtn.addEventListener('click', (e) => {
                this.midiPlayable = !this.midiPlayable;
                e.target.textContent = this.midiPlayable ? 'ON' : 'OFF';
                e.target.classList.toggle('active', this.midiPlayable);
            });
        }

        const midiChannelInput = document.getElementById('chopper-midi-channel');
        if (midiChannelInput) {
            midiChannelInput.addEventListener('change', (e) => {
                this.midiChannel = parseInt(e.target.value);
            });
        }

        const padPitchInput = document.getElementById('pad-pitch');
        if (padPitchInput) {
            padPitchInput.addEventListener('input', (e) => {
                this.padPitches[this.selectedPad] = parseInt(e.target.value);
                document.getElementById('pad-pitch-val').textContent = e.target.value + ' st';
            });
        }

        const padExportBtn = document.getElementById('pad-export-individual');
        if (padExportBtn) {
            padExportBtn.addEventListener('click', () => {
                this.exportPad(this.selectedPad);
            });
        }
    }

    wirePads() {
        document.querySelectorAll('.slice-pad').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const padIdx = parseInt(e.target.dataset.pad);
                this.triggerPad(padIdx);
            });
        });
    }

    triggerPad(padIdx) {
        this.selectedPad = padIdx;
        document.querySelectorAll('.slice-pad').forEach(btn => {
            btn.classList.remove('selected');
            if (parseInt(btn.dataset.pad) === padIdx) {
                btn.classList.add('selected');
            }
        });

        const padPitchInput = document.getElementById('pad-pitch');
        if (padPitchInput) {
            padPitchInput.value = this.padPitches[padIdx];
            document.getElementById('pad-pitch-val').textContent = this.padPitches[padIdx] + ' st';
        }

        if (this.slices[padIdx] && this.currentAudioBuffer) {
            this.playSlice(padIdx);
        }
    }

    playSlice(idx) {
        if (!this.slices[idx] || !this.currentAudioBuffer || !audioEngine.audioContext) return;
        const slice = this.slices[idx];
        const source = audioEngine.audioContext.createBufferSource();
        const pitchRatio = Math.pow(2, this.padPitches[idx] / 12);
        source.playbackRate.value = pitchRatio;
        source.buffer = this.currentAudioBuffer;
        source.connect(audioEngine.masterGain);
        source.start(0, slice.start, slice.end - slice.start);
    }

    exportPad(padIdx) {
        if (!this.slices[padIdx] || !this.currentAudioBuffer) return;
        const slice = this.slices[padIdx];
        const length = Math.floor((slice.end - slice.start) * this.currentAudioBuffer.sampleRate);
        const offlineCtx = new OfflineAudioContext(2, length, this.currentAudioBuffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = this.currentAudioBuffer;
        source.connect(offlineCtx.destination);
        source.start(0, slice.start, slice.end - slice.start);
        offlineCtx.startRendering().then(renderedBuffer => {
            const wav = FileUtils.audioBufferToWav(renderedBuffer);
            FileUtils.downloadBlob(wav, `slice_${padIdx + 1}.wav`, 'audio/wav');
        });
    }

    initCanvas() {
        const waveform = document.getElementById('chopper-waveform');
        if (waveform) {
            this.canvas = document.getElementById('chopper-canvas');
            if (!this.canvas) {
                this.canvas = document.createElement('canvas');
                this.canvas.id = 'chopper-canvas';
                waveform.appendChild(this.canvas);
            }
            this.ctx = this.canvas.getContext('2d');
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
        }
    }

    resizeCanvas() {
        if (this.canvas) {
            const parent = this.canvas.parentElement;
            this.canvas.width = parent.clientWidth;
            this.canvas.height = parent.clientHeight;
            this.renderWaveform();
        }
    }

    async loadAudioFile(file) {
        this.currentAudioBuffer = await audioEngine.loadAudioFile(file);
        this.renderWaveform();
    }

    handleAction(action) {
        switch (action) {
            case 'load':
                this.loadAudio();
                break;
            case 'chop':
                this.chopAudio();
                break;
            case 'play':
                this.playSelected();
                break;
            case 'stop':
                this.stopPlayback();
                break;
            case 'export':
                this.exportSlices();
                break;
            case 'clear':
                this.clearSlices();
                break;
        }
    }

    loadAudio() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadAudioFile(file);
            }
        };
        input.click();
    }

    chopAudio() {
        if (!this.currentAudioBuffer) {
            alert('Please load an audio file first');
            return;
        }
        
        const sensitivity = parseInt(document.getElementById('chop-sensitivity').value);
        const minLength = parseInt(document.getElementById('chop-min-length').value) / 1000;
        
        this.slices = this.detectSlices(this.currentAudioBuffer, sensitivity, minLength);
        this.renderWaveform();
    }

    detectSlices(buffer, sensitivity, minLength) {
        const channelData = buffer.getChannelData(0);
        const sampleRate = buffer.sampleRate;
        const slices = [];
        
        const threshold = sensitivity / 100;
        const minSamples = minLength * sampleRate;
        
        let inSlice = false;
        let sliceStart = 0;
        
        for (let i = 0; i < channelData.length; i++) {
            const amplitude = Math.abs(channelData[i]);
            
            if (!inSlice && amplitude > threshold) {
                sliceStart = i;
                inSlice = true;
            } else if (inSlice && amplitude < threshold) {
                const sliceLength = i - sliceStart;
                if (sliceLength >= minSamples) {
                    slices.push({
                        start: sliceStart,
                        end: i,
                        startTime: sliceStart / sampleRate,
                        duration: sliceLength / sampleRate
                    });
                }
                inSlice = false;
            }
        }
        
        return slices;
    }

    playSelected() {
        if (!this.selectedSlice || !this.currentAudioBuffer) return;
        
        const slice = this.selectedSlice;
        const source = audioEngine.audioContext.createBufferSource();
        source.buffer = this.currentAudioBuffer;
        source.connect(audioEngine.masterGain);
        source.start(0, slice.startTime, slice.duration);
        this.playbackEnabled = true;
    }

    stopPlayback() {
        this.playbackEnabled = false;
    }

    exportSlices() {
        if (this.slices.length === 0) {
            alert('No slices to export');
            return;
        }
        
        this.slices.forEach((slice, index) => {
            const sliceBuffer = this.extractSlice(slice);
            const wavBlob = FileUtils.bufferToWav(sliceBuffer);
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `slice_${index + 1}.wav`;
            a.click();
        });
    }

    extractSlice(slice) {
        const length = slice.end - slice.start;
        const sliceBuffer = audioEngine.audioContext.createBuffer(
            this.currentAudioBuffer.numberOfChannels,
            length,
            this.currentAudioBuffer.sampleRate
        );
        
        for (let channel = 0; channel < this.currentAudioBuffer.numberOfChannels; channel++) {
            const channelData = this.currentAudioBuffer.getChannelData(channel);
            const sliceData = sliceBuffer.getChannelData(channel);
            
            for (let i = 0; i < length; i++) {
                sliceData[i] = channelData[slice.start + i];
            }
        }
        
        return sliceBuffer;
    }

    clearSlices() {
        this.slices = [];
        this.selectedSlice = null;
        this.renderWaveform();
    }

    renderWaveform() {
        if (!this.ctx) return;
        if (!this.currentAudioBuffer) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#b0b0b0';
            this.ctx.font = '16px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Load an audio file to see waveform', this.canvas.width / 2, this.canvas.height / 2);
            return;
        }
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const channelData = this.currentAudioBuffer.getChannelData(0);
        
        this.ctx.clearRect(0, 0, width, height);
        
        // Draw waveform
        this.ctx.strokeStyle = '#007acc';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        
        const step = Math.ceil(channelData.length / width);
        const amp = height / 2;
        
        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            
            for (let j = 0; j < step; j++) {
                const datum = channelData[i * step + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            
            this.ctx.moveTo(i, (1 + min) * amp);
            this.ctx.lineTo(i, (1 + max) * amp);
        }
        
        this.ctx.stroke();
        
        // Draw slice markers
        this.ctx.strokeStyle = '#4caf50';
        this.ctx.lineWidth = 2;
        
        this.slices.forEach((slice, index) => {
            const x = (slice.start / channelData.length) * width;
            const w = (slice.end - slice.start) / channelData.length * width;
            
            this.ctx.strokeRect(x, 0, w, height);
            
            if (slice === this.selectedSlice) {
                this.ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
                this.ctx.fillRect(x, 0, w, height);
            }
        });
    }

    selectSlice(index) {
        this.selectedSlice = this.slices[index];
        this.renderWaveform();
    }
}

// Initialize when DOM is ready
let acidChopper;
document.addEventListener('DOMContentLoaded', () => {
    acidChopper = new AcidChopper();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AcidChopper;
}
