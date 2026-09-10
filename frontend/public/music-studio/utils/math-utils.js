// Math utility functions for Music Studio Pro

class MathUtils {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static lerp(a, b, t) {
        return a + (b - a) * t;
    }

    static map(value, inMin, inMax, outMin, outMax) {
        return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
    }

    static normalize(value, min, max) {
        return (value - min) / (max - min);
    }

    static denormalize(value, min, max) {
        return value * (max - min) + min;
    }

    static linearToExponential(value, min, max) {
        const logMin = Math.log(min);
        const logMax = Math.log(max);
        return Math.exp(this.lerp(logMin, logMax, value));
    }

    static exponentialToLinear(value, min, max) {
        const logMin = Math.log(min);
        const logMax = Math.log(max);
        return this.normalize(Math.log(value), logMin, logMax);
    }

    static smoothstep(edge0, edge1, x) {
        const t = this.clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    static easeInQuad(t) {
        return t * t;
    }

    static easeOutQuad(t) {
        return t * (2 - t);
    }

    static easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    static easeInCubic(t) {
        return t * t * t;
    }

    static easeOutCubic(t) {
        return (--t) * t * t + 1;
    }

    static easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }

    static easeInElastic(t) {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    }

    static easeOutElastic(t) {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }

    static easeInOutElastic(t) {
        const c5 = (2 * Math.PI) / 4.5;
        return t === 0 ? 0 : t === 1 ? 1 : t < 0.5
            ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
            : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
    }

    static easeInBounce(t) {
        return 1 - this.easeOutBounce(1 - t);
    }

    static easeOutBounce(t) {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) {
            return n1 * t * t;
        } else if (t < 2 / d1) {
            return n1 * (t -= 1.5 / d1) * t + 0.75;
        } else if (t < 2.5 / d1) {
            return n1 * (t -= 2.25 / d1) * t + 0.9375;
        } else {
            return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
    }

    static easeInOutBounce(t) {
        return t < 0.5
            ? (1 - this.easeOutBounce(1 - 2 * t)) / 2
            : (1 + this.easeOutBounce(2 * t - 1)) / 2;
    }

    static sinc(x) {
        if (x === 0) return 1;
        return Math.sin(Math.PI * x) / (Math.PI * x);
    }

    static blackmanWindow(n, N) {
        const a0 = 0.42;
        const a1 = 0.5;
        const a2 = 0.08;
        return a0 - a1 * Math.cos(2 * Math.PI * n / (N - 1)) + a2 * Math.cos(4 * Math.PI * n / (N - 1));
    }

    static hanningWindow(n, N) {
        return 0.5 * (1 - Math.cos(2 * Math.PI * n / (N - 1)));
    }

    static hammingWindow(n, N) {
        return 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (N - 1));
    }

    static fft(input) {
        const n = input.length;
        if (n <= 1) return input;
        
        // Ensure n is a power of 2
        const paddedLength = Math.pow(2, Math.ceil(Math.log2(n)));
        const padded = new Float32Array(paddedLength);
        for (let i = 0; i < n; i++) {
            padded[i] = input[i];
        }
        
        const real = new Float32Array(paddedLength);
        const imag = new Float32Array(paddedLength);
        for (let i = 0; i < paddedLength; i++) {
            real[i] = padded[i];
        }
        
        this.fftRecursive(real, imag, paddedLength);
        
        // Convert to magnitude
        const magnitude = new Float32Array(paddedLength / 2);
        for (let i = 0; i < paddedLength / 2; i++) {
            magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        }
        
        return magnitude;
    }

    static fftRecursive(real, imag, n) {
        if (n <= 1) return;
        
        const half = n / 2;
        const realEven = new Float32Array(half);
        const imagEven = new Float32Array(half);
        const realOdd = new Float32Array(half);
        const imagOdd = new Float32Array(half);
        
        for (let i = 0; i < half; i++) {
            realEven[i] = real[2 * i];
            imagEven[i] = imag[2 * i];
            realOdd[i] = real[2 * i + 1];
            imagOdd[i] = imag[2 * i + 1];
        }
        
        this.fftRecursive(realEven, imagEven, half);
        this.fftRecursive(realOdd, imagOdd, half);
        
        for (let k = 0; k < half; k++) {
            const tReal = realOdd[k] * Math.cos(-2 * Math.PI * k / n) - imagOdd[k] * Math.sin(-2 * Math.PI * k / n);
            const tImag = realOdd[k] * Math.sin(-2 * Math.PI * k / n) + imagOdd[k] * Math.cos(-2 * Math.PI * k / n);
            
            real[k] = realEven[k] + tReal;
            imag[k] = imagEven[k] + tImag;
            real[k + half] = realEven[k] - tReal;
            imag[k + half] = imagEven[k] - tImag;
        }
    }

    static autocorrelation(buffer, sampleRate) {
        const n = buffer.length;
        const correlation = new Float32Array(n);
        
        for (let lag = 0; lag < n; lag++) {
            let sum = 0;
            for (let i = 0; i < n - lag; i++) {
                sum += buffer[i] * buffer[i + lag];
            }
            correlation[lag] = sum;
        }
        
        return correlation;
    }

    static findPitchAutocorrelation(buffer, sampleRate, minFreq = 80, maxFreq = 1200) {
        const correlation = this.autocorrelation(buffer, sampleRate);
        const minLag = Math.floor(sampleRate / maxFreq);
        const maxLag = Math.floor(sampleRate / minFreq);
        
        let maxCorrelation = 0;
        let bestLag = minLag;
        
        for (let lag = minLag; lag < maxLag; lag++) {
            if (correlation[lag] > maxCorrelation) {
                maxCorrelation = correlation[lag];
                bestLag = lag;
            }
        }
        
        if (maxCorrelation < 0.01) return null;
        
        const pitch = sampleRate / bestLag;
        return pitch;
    }

    static yinPitchDetection(buffer, sampleRate, threshold = 0.1) {
        const yinBuffer = new Float32Array(Math.floor(buffer.length / 2));
        const probability = new Float32Array(Math.floor(buffer.length / 2));
        
        let runningSum = 0;
        
        yinBuffer[0] = 1;
        
        for (let tau = 1; tau < yinBuffer.length; tau++) {
            let sum = 0;
            for (let i = 0; i < yinBuffer.length; i++) {
                const delta = buffer[i] - buffer[i + tau];
                sum += delta * delta;
            }
            
            yinBuffer[tau] = sum;
            runningSum += yinBuffer[tau];
            yinBuffer[tau] *= tau / runningSum;
        }
        
        for (let tau = 1; tau < yinBuffer.length; tau++) {
            if (yinBuffer[tau] < threshold) {
                while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) {
                    tau++;
                }
                
                const tau0 = tau;
                const tau1 = tau + 1;
                const betterTau = tau0 + (yinBuffer[tau1] - yinBuffer[tau0]) / (yinBuffer[tau1] - yinBuffer[tau0]) * (tau1 - tau0);
                
                return sampleRate / betterTau;
            }
        }
        
        return null;
    }

    static movingAverage(data, windowSize) {
        const result = new Float32Array(data.length);
        const halfWindow = Math.floor(windowSize / 2);
        
        for (let i = 0; i < data.length; i++) {
            let sum = 0;
            let count = 0;
            
            for (let j = Math.max(0, i - halfWindow); j < Math.min(data.length, i + halfWindow + 1); j++) {
                sum += data[j];
                count++;
            }
            
            result[i] = sum / count;
        }
        
        return result;
    }

    static medianFilter(data, windowSize) {
        const result = new Float32Array(data.length);
        const halfWindow = Math.floor(windowSize / 2);
        
        for (let i = 0; i < data.length; i++) {
            const window = [];
            
            for (let j = Math.max(0, i - halfWindow); j < Math.min(data.length, i + halfWindow + 1); j++) {
                window.push(data[j]);
            }
            
            window.sort((a, b) => a - b);
            result[i] = window[Math.floor(window.length / 2)];
        }
        
        return result;
    }

    static peakDetection(data, threshold = 0.5, minDistance = 10) {
        const peaks = [];
        let lastPeakIndex = -minDistance;
        
        for (let i = 1; i < data.length - 1; i++) {
            if (data[i] > threshold && 
                data[i] > data[i - 1] && 
                data[i] > data[i + 1] &&
                i - lastPeakIndex >= minDistance) {
                peaks.push({ index: i, value: data[i] });
                lastPeakIndex = i;
            }
        }
        
        return peaks;
    }

    static zeroCrossingRate(buffer) {
        let crossings = 0;
        for (let i = 1; i < buffer.length; i++) {
            if ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0)) {
                crossings++;
            }
        }
        return crossings / buffer.length;
    }

    static spectralCentroid(magnitude, sampleRate, fftSize) {
        let weightedSum = 0;
        let sum = 0;
        
        for (let i = 0; i < magnitude.length; i++) {
            const freq = (i * sampleRate) / fftSize;
            weightedSum += freq * magnitude[i];
            sum += magnitude[i];
        }
        
        return sum > 0 ? weightedSum / sum : 0;
    }

    static spectralRolloff(magnitude, sampleRate, fftSize, threshold = 0.85) {
        const totalEnergy = magnitude.reduce((sum, val) => sum + val, 0);
        const targetEnergy = totalEnergy * threshold;
        let cumulativeEnergy = 0;
        
        for (let i = 0; i < magnitude.length; i++) {
            cumulativeEnergy += magnitude[i];
            if (cumulativeEnergy >= targetEnergy) {
                return (i * sampleRate) / fftSize;
            }
        }
        
        return sampleRate / 2;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathUtils;
}
