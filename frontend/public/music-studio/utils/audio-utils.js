// Audio utility functions for Music Studio Pro

class AudioUtils {
    static dbToLinear(db) {
        return Math.pow(10, db / 20);
    }

    static linearToDb(linear) {
        return 20 * Math.log10(Math.max(linear, 0.00001));
    }

    static midiToFreq(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    static freqToMidi(freq) {
        return 69 + 12 * Math.log2(freq / 440);
    }

    static noteToFreq(note, octave) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const noteIndex = notes.indexOf(note);
        const midiNote = noteIndex + (octave + 1) * 12;
        return this.midiToFreq(midiNote);
    }

    static freqToNote(freq) {
        const midiNote = this.freqToMidi(freq);
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const noteIndex = midiNote % 12;
        const octave = Math.floor(midiNote / 12) - 1;
        return { note: notes[noteIndex], octave };
    }

    static centsToRatio(cents) {
        return Math.pow(2, cents / 1200);
    }

    static ratioToCents(ratio) {
        return 1200 * Math.log2(ratio);
    }

    static semitonesToRatio(semitones) {
        return Math.pow(2, semitones / 12);
    }

    static ratioToSemitones(ratio) {
        return 12 * Math.log2(ratio);
    }

    static calculateRMS(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }

    static calculatePeak(buffer) {
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
            peak = Math.max(peak, Math.abs(buffer[i]));
        }
        return peak;
    }

    static normalize(buffer, targetLevel = 0.9) {
        const peak = this.calculatePeak(buffer);
        if (peak === 0) return buffer;
        const scale = targetLevel / peak;
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] *= scale;
        }
        return buffer;
    }

    static applyGain(buffer, gain) {
        const result = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            result[i] = buffer[i] * gain;
        }
        return result;
    }

    static mixBuffers(buffer1, buffer2, mix1 = 1, mix2 = 1) {
        const length = Math.max(buffer1.length, buffer2.length);
        const result = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            const val1 = i < buffer1.length ? buffer1[i] * mix1 : 0;
            const val2 = i < buffer2.length ? buffer2[i] * mix2 : 0;
            result[i] = val1 + val2;
        }
        return result;
    }

    static fadeIn(buffer, duration, sampleRate) {
        const fadeLength = Math.min(duration * sampleRate, buffer.length);
        for (let i = 0; i < fadeLength; i++) {
            const gain = i / fadeLength;
            buffer[i] *= gain;
        }
        return buffer;
    }

    static fadeOut(buffer, duration, sampleRate) {
        const fadeLength = Math.min(duration * sampleRate, buffer.length);
        const startIndex = buffer.length - fadeLength;
        for (let i = 0; i < fadeLength; i++) {
            const gain = 1 - (i / fadeLength);
            buffer[startIndex + i] *= gain;
        }
        return buffer;
    }

    static crossfade(buffer1, buffer2, duration, sampleRate) {
        const fadeLength = Math.min(duration * sampleRate, buffer1.length, buffer2.length);
        const result = new Float32Array(buffer1.length);
        for (let i = 0; i < buffer1.length; i++) {
            if (i < fadeLength) {
                const gain1 = 1 - (i / fadeLength);
                const gain2 = i / fadeLength;
                result[i] = buffer1[i] * gain1 + (buffer2[i] || 0) * gain2;
            } else {
                result[i] = buffer1[i];
            }
        }
        return result;
    }

    static silence(duration, sampleRate) {
        const length = Math.floor(duration * sampleRate);
        return new Float32Array(length);
    }

    static generateNoise(duration, sampleRate, type = 'white') {
        const length = Math.floor(duration * sampleRate);
        const buffer = new Float32Array(length);
        
        if (type === 'white') {
            for (let i = 0; i < length; i++) {
                buffer[i] = Math.random() * 2 - 1;
            }
        } else if (type === 'pink') {
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < length; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                buffer[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
                b6 = white * 0.115926;
            }
        }
        
        return this.normalize(buffer);
    }

    static detectSilence(buffer, threshold = 0.01, minDuration = 0.1, sampleRate) {
        const minSamples = minDuration * sampleRate;
        let silenceStart = -1;
        let silenceRegions = [];
        
        for (let i = 0; i < buffer.length; i++) {
            if (Math.abs(buffer[i]) < threshold) {
                if (silenceStart === -1) {
                    silenceStart = i;
                }
            } else {
                if (silenceStart !== -1 && (i - silenceStart) >= minSamples) {
                    silenceRegions.push({ start: silenceStart, end: i });
                }
                silenceStart = -1;
            }
        }
        
        if (silenceStart !== -1 && (buffer.length - silenceStart) >= minSamples) {
            silenceRegions.push({ start: silenceStart, end: buffer.length });
        }
        
        return silenceRegions;
    }

    static removeSilence(buffer, threshold = 0.01, minDuration = 0.1, sampleRate) {
        const regions = this.detectSilence(buffer, threshold, minDuration, sampleRate);
        if (regions.length === 0) return buffer;
        
        // Keep non-silent regions
        let result = [];
        let lastEnd = 0;
        
        for (const region of regions) {
            if (region.start > lastEnd) {
                result.push(buffer.slice(lastEnd, region.start));
            }
            lastEnd = region.end;
        }
        
        if (lastEnd < buffer.length) {
            result.push(buffer.slice(lastEnd));
        }
        
        // Concatenate all non-silent regions
        const totalLength = result.reduce((sum, arr) => sum + arr.length, 0);
        const finalBuffer = new Float32Array(totalLength);
        let offset = 0;
        
        for (const arr of result) {
            finalBuffer.set(arr, offset);
            offset += arr.length;
        }
        
        return finalBuffer;
    }

    static reverse(buffer) {
        const result = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            result[i] = buffer[buffer.length - 1 - i];
        }
        return result;
    }

    static invertPhase(buffer) {
        const result = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            result[i] = -buffer[i];
        }
        return result;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioUtils;
}
