// File utility functions for Music Studio Pro

class FileUtils {
    static async loadAudioFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    resolve(audioBuffer);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    static audioBufferToFloat32(audioBuffer) {
        const channels = [];
        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            channels.push(audioBuffer.getChannelData(i));
        }
        return channels;
    }

    static float32ToAudioBuffer(channels, sampleRate) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const length = channels[0].length;
        const audioBuffer = audioContext.createBuffer(channels.length, length, sampleRate);
        
        for (let i = 0; i < channels.length; i++) {
            audioBuffer.getChannelData(i).set(channels[i]);
        }
        
        return audioBuffer;
    }

    static async exportWAV(audioBuffer, options = {}) {
        const { bitDepth = 16, float = false } = options;
        const numberOfChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const format = float ? 3 : 1; // 3 = IEEE float, 1 = PCM
        const bitsPerSample = float ? 32 : bitDepth;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numberOfChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = audioBuffer.length * blockAlign;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numberOfChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        // Write audio data
        const channels = [];
        for (let i = 0; i < numberOfChannels; i++) {
            channels.push(audioBuffer.getChannelData(i));
        }

        let offset = 44;
        if (float) {
            for (let i = 0; i < audioBuffer.length; i++) {
                for (let ch = 0; ch < numberOfChannels; ch++) {
                    view.setFloat32(offset, channels[ch][i], true);
                    offset += 4;
                }
            }
        } else {
            const scale = bitDepth === 8 ? 128 : 32768;
            const offsetVal = bitDepth === 8 ? 128 : 0;
            
            for (let i = 0; i < audioBuffer.length; i++) {
                for (let ch = 0; ch < numberOfChannels; ch++) {
                    let sample = channels[ch][i] * scale + offsetVal;
                    sample = Math.max(-1, Math.min(1, sample));
                    
                    if (bitDepth === 8) {
                        view.setUint8(offset, sample + 128);
                        offset += 1;
                    } else if (bitDepth === 16) {
                        view.setInt16(offset, sample, true);
                        offset += 2;
                    } else if (bitDepth === 24) {
                        const int24 = sample * 8388608;
                        view.setUint8(offset, int24 & 0xFF);
                        view.setUint8(offset + 1, (int24 >> 8) & 0xFF);
                        view.setUint8(offset + 2, (int24 >> 16) & 0xFF);
                        offset += 3;
                    } else if (bitDepth === 32) {
                        view.setInt32(offset, sample * 2147483648, true);
                        offset += 4;
                    }
                }
            }
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }

    static downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    static async importProject(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const project = JSON.parse(e.target.result);
                    resolve(project);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    static exportProject(project, filename = 'project.json') {
        const json = JSON.stringify(project, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        this.downloadBlob(blob, filename);
    }

    static async loadProjectFromStorage(key = 'music-studio-project') {
        try {
            const data = localStorage.getItem(key);
            if (data) {
                return JSON.parse(data);
            }
            return null;
        } catch (error) {
            console.error('Failed to load project from storage:', error);
            return null;
        }
    }

    static saveProjectToStorage(project, key = 'music-studio-project') {
        try {
            const json = JSON.stringify(project);
            localStorage.setItem(key, json);
            return true;
        } catch (error) {
            console.error('Failed to save project to storage:', error);
            return false;
        }
    }

    static async loadSettings(key = 'music-studio-settings') {
        try {
            const data = localStorage.getItem(key);
            if (data) {
                return JSON.parse(data);
            }
            return this.getDefaultSettings();
        } catch (error) {
            console.error('Failed to load settings:', error);
            return this.getDefaultSettings();
        }
    }

    static saveSettings(settings, key = 'music-studio-settings') {
        try {
            const json = JSON.stringify(settings);
            localStorage.setItem(key, json);
            return true;
        } catch (error) {
            console.error('Failed to save settings:', error);
            return false;
        }
    }

    static getDefaultSettings() {
        return {
            audio: {
                sampleRate: 44100,
                bufferSize: 512,
                bitDepth: 16,
                latencyCompensation: true
            },
            protools: {
                editMode: 'slip',
                gridValue: 1,
                linkTimeline: true,
                linkTrack: true,
                tabToTransient: false,
                elasticAudio: 'polyphonic',
                trackColorCoding: true,
                midiDelayCompensation: true,
                inputQuantize: false,
                midiInputMonitoring: false,
                preRoll: 0,
                postRoll: 0,
                countoff: 0,
                bounceMode: 'offline',
                bounceSource: 'mainPlaylist',
                araAutoAnalyze: true,
                wasapiSharedMode: false,
                keyboardShortcutsPreset: 'default',
                showTracksWithClipsOnly: false,
                showLanesWithAutomation: false,
                detachableClipList: false,
                markerLineDisplay: true,
                colorInIOMenus: true,
                dolbyAtmosBinaural: false,
                dolbyAtmosMonitoring: '2.0',
                dolbyAtmosGroup: 'none'
            },
            autotune: {
                inputType: 'tenor',
                key: 'C',
                scale: 'chromatic',
                retuneSpeed: 20,
                flexTune: 0,
                humanize: 0,
                naturalVibrato: 0,
                throatLength: 0,
                formantMode: false,
                classicMode: false,
                lowLatency: false,
                conformToScale: false,
                bypass: false,
                harmonyEnabled: false,
                harmonyVoices: 4,
                harmonyInterval: [3, 5, 7, 12],
                harmonyMix: [80, 80, 80, 80],
                harmonyPan: [-30, 30, -50, 50],
                harmonyMute: [false, false, false, false],
                presetCategory: 'factory',
                graphZoomAfterTracking: 'fit',
                graphShowToolbar: true,
                graphShowGlobalControls: true,
                graphClutchScroll: false,
                inputGain: 0,
                outputGain: 0,
                stereoMode: 'stereo'
            },
            acid: {
                tempo: 120,
                timeSignature: '4/4',
                key: 'C',
                stretchMethod: 'classic',
                preservePitch: true,
                transientSensitivity: 50,
                timingTightness: 50,
                midiPlayableChopper: false,
                chopperMidiChannel: 1,
                morphPadEnabled: false,
                morphPadTargets: [],
                trackFolders: true,
                clusterEditing: true,
                grooveExtract: false,
                grooveTemplate: 'default',
                loopAudition: true,
                loopAuditionAutoPlay: false,
                punchIn: false,
                punchInPoint: 0,
                punchOut: false,
                punchOutPoint: 0,
                trackFreeze: false,
                keyframeAutomation: true,
                vstScanPath: '',
                vstCache: true,
                busRouting: true,
                submixFolders: true,
                audioPainting: false,
                videoScoring: false,
                hitPointMarkers: false,
                tempoMapMode: false,
                masteringTool: 'none'
            },
            project: {
                autoSaveInterval: 300,
                undoHistoryLimit: 50,
                defaultLocation: null
            },
            ui: {
                theme: 'dark',
                colorScheme: 'default',
                fontSize: 14,
                displayScaling: 1,
                highDPI: true
            },
            export: {
                format: 'wav',
                sampleRate: 44100,
                bitDepth: 16,
                quality: 'high',
                dithering: false
            },
            midi: {
                inputDevices: [],
                outputDevices: [],
                clockSync: false,
                controllerAssignments: {}
            },
            performance: {
                cpuLimit: 80,
                diskOptimization: true,
                memoryManagement: true,
                gpuAcceleration: true,
                multicoreProcessing: true
            },
            suno: {
                generation: {
                    modelVersion: 'v6',
                    styleTags: [],
                    lyricsMode: 'auto',
                    promptTemperature: 0.7,
                    seed: -1,
                    persona: 'none'
                },
                midi: {
                    inputDevice: 'none',
                    channel: 1,
                    quantize: '1/16',
                    latencyCompensation: 0,
                    musicalTypingEnabled: true
                },
                synth: {
                    preset: 'init',
                    osc1Type: 'sawtooth',
                    osc1WavetablePos: 0,
                    osc1Detune: 0,
                    osc1Mix: 0.5,
                    osc2Type: 'square',
                    osc2WavetablePos: 0,
                    osc2Detune: 7,
                    osc2Mix: 0.5,
                    unison: 1,
                    filterType: 'lowpass',
                    filterCutoff: 1000,
                    filterResonance: 1,
                    filterDrive: 0,
                    envAttack: 0.01,
                    envDecay: 0.2,
                    envSustain: 0.7,
                    envRelease: 0.3,
                    lfoRate: 4,
                    lfoDepth: 0,
                    lfoTarget: 'pitch',
                    lfoSync: true,
                    modMatrix: [
                        { source: 'lfo', target: 'pitch', amount: 0 },
                        { source: 'lfo', target: 'filter', amount: 0 },
                        { source: 'lfo', target: 'amp', amount: 0 },
                        { source: 'env', target: 'pitch', amount: 0 },
                        { source: 'env', target: 'filter', amount: 0 },
                        { source: 'env', target: 'amp', amount: 0 },
                        { source: 'velocity', target: 'filter', amount: 0 },
                        { source: 'velocity', target: 'amp', amount: 0 }
                    ]
                },
                effects: {
                    chain: ['eq', 'compressor', 'reverb', 'delay'],
                    bypass: { eq: false, compressor: false, reverb: false, delay: false, distortion: false, gate: false },
                    compressor: { threshold: -20, ratio: 4, attack: 0.003, release: 0.25, makeupGain: 0, sidechain: false, sidechainSource: 'none' },
                    reverb: { ir: 'hall', wetDry: 30, preDelay: 0, roomSize: 0.5 },
                    delay: { time: 0.25, feedback: 0.3, wetDry: 20, sync: true, filter: 0 },
                    distortion: { drive: 0, tone: 50, mix: 0 },
                    eq: { bands: [
                        { freq: 60, gain: 0, q: 1 },
                        { freq: 250, gain: 0, q: 1 },
                        { freq: 1000, gain: 0, q: 1 },
                        { freq: 4000, gain: 0, q: 1 },
                        { freq: 8000, gain: 0, q: 1 },
                        { freq: 16000, gain: 0, q: 1 }
                    ]},
                    gate: { threshold: -50, attack: 0.001, hold: 0.05, release: 0.1 }
                },
                automation: {
                    recordMode: 'draw',
                    snapToGrid: true,
                    curveSmoothing: true,
                    curveType: 'linear'
                },
                stems: {
                    separationType: 'auto',
                    stemCount: 6,
                    categories: ['vocals', 'drums', 'bass', 'guitar', 'keys', 'other']
                },
                export: {
                    bitDepth: 32,
                    sampleRate: 48000,
                    format: 'wav',
                    includeMIDI: false,
                    multitrack: false,
                    stems: false,
                    range: false
                },
                takeLanes: {
                    alternatesPerClip: 2,
                    autoAudition: false
                },
                timeline: {
                    followPlayhead: true,
                    metronome: false,
                    warpMarkers: true
                }
            }
        };
    }

    static getFileInfo(file) {
        return {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified
        };
    }

    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    static formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileUtils;
}
