// Auto-Tune Pitch Detection implementation

class PitchDetection {
    constructor() {
        this.sampleRate = 44100;
        this.bufferSize = 2048;
    }

    detectPitch(buffer) {
        const channelData = buffer.getChannelData(0);
        return this.yinPitchDetection(channelData);
    }

    yinPitchDetection(buffer) {
        const bufferSize = buffer.length;
        const yinBuffer = new Float32Array(bufferSize / 2);
        const probability = 0.15;
        
        let sum = 0;
        
        for (let t = 0; t < bufferSize / 2; t++) {
            yinBuffer[t] = 0;
        }
        
        for (let t = 1; t < bufferSize / 2; t++) {
            sum = 0;
            for (let i = 0; i < bufferSize / 2; i++) {
                const delta = buffer[i] - buffer[i + t];
                sum += delta * delta;
            }
            yinBuffer[t] = sum;
        }
        
        sum = 0;
        yinBuffer[0] = 1;
        
        for (let t = 1; t < bufferSize / 2; t++) {
            sum += yinBuffer[t];
            yinBuffer[t] *= t / sum;
        }
        
        let tauEstimate = -1;
        
        for (let t = 2; t < bufferSize / 2; t++) {
            if (yinBuffer[t] < probability) {
                while (t + 1 < bufferSize / 2 && yinBuffer[t + 1] < yinBuffer[t]) {
                    t++;
                }
                tauEstimate = t;
                break;
            }
        }
        
        if (tauEstimate === -1) {
            return -1;
        }
        
        return this.sampleRate / tauEstimate;
    }

    frequencyToNote(frequency) {
        const noteNum = 12 * (Math.log2(frequency / 440)) + 69;
        return Math.round(noteNum);
    }

    noteToFrequency(noteNum) {
        return 440 * Math.pow(2, (noteNum - 69) / 12);
    }

    getNoteName(noteNum) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(noteNum / 12) - 1;
        const note = notes[noteNum % 12];
        return `${note}${octave}`;
    }
}

// Initialize when DOM is ready
let pitchDetection;
document.addEventListener('DOMContentLoaded', () => {
    pitchDetection = new PitchDetection();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PitchDetection;
}
