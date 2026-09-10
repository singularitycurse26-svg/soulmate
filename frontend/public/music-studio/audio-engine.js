class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.analyser = null;
        this.tracks = [];
        this.clips = [];
        this.isPlaying = false;
        this.isRecording = false;
        this.currentTime = 0;
        this.startTime = 0;
        this.bpm = 120;
        this.timeSignature = '4/4';
        this.key = 'C';
        this.sampleRate = 44100;
        this.bufferSize = 512;
        this.bitDepth = 16;
        this.latencyCompensation = true;
        this.loopEnabled = false;
        this.loopStart = 0;
        this.loopEnd = 0;
        this.halfSpeed = false;
        this.dynamicTransport = false;
        this.automationEnabled = false;
        this.activeSources = [];
        this.projectSettings = {
            tempo: 120,
            timeSignature: '4/4',
            key: 'C'
        };
    }

    async init() {
        if (this.audioContext) return;
        
        try {
            const settings = await FileUtils.loadSettings();
            if (settings && settings.audio) {
                this.sampleRate = settings.audio.sampleRate;
                this.bufferSize = settings.audio.bufferSize;
                this.bitDepth = settings.audio.bitDepth;
                this.latencyCompensation = settings.audio.latencyCompensation;
            }
        } catch (e) {
            // Use defaults if settings fail to load
        }
        
        try {
            this.audioContext = new AudioContext({ 
                sampleRate: this.sampleRate,
                latencyHint: this.latencyCompensation ? 'interactive' : 'playback'
            });
        } catch (e) {
            this.audioContext = new AudioContext();
        }

        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.8;
        
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
    }

    createTrack(name, type = 'audio') {
        const track = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: name || `Track ${this.tracks.length + 1}`,
            type: type,
            gain: this.audioContext.createGain(),
            panner: this.audioContext.createStereoPanner(),
            muted: false,
            solo: false,
            recordEnabled: false,
            inputMonitoring: false,
            volume: 0.8,
            pan: 0,
            clips: [],
            inserts: [],
            sends: [],
            automation: {
                volume: [],
                pan: [],
                mute: []
            },
            automationMode: 'off'
        };
        
        track.gain.connect(track.panner);
        track.panner.connect(this.masterGain);
        
        this.tracks.push(track);
        return track;
    }

    removeTrack(trackId) {
        const index = this.tracks.findIndex(t => t.id === trackId);
        if (index !== -1) {
            const track = this.tracks[index];
            track.gain.disconnect();
            track.panner.disconnect();
            this.tracks.splice(index, 1);
        }
    }

    setTrackVolume(trackId, volume, time = 0) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.volume = volume;
            const currentTime = time || this.audioContext.currentTime;
            if (track.automationMode === 'write' && this.automationEnabled) {
                track.automation.volume.push({ time: currentTime, value: volume });
            }
            track.gain.gain.setValueAtTime(track.muted ? 0 : volume, currentTime);
        }
    }

    setTrackPan(trackId, pan, time = 0) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.pan = pan;
            const currentTime = time || this.audioContext.currentTime;
            if (track.automationMode === 'write' && this.automationEnabled) {
                track.automation.pan.push({ time: currentTime, value: pan });
            }
            track.panner.pan.setValueAtTime(pan, currentTime);
        }
    }

    toggleTrackMute(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.muted = !track.muted;
            const currentTime = this.audioContext.currentTime;
            if (track.automationMode === 'write' && this.automationEnabled) {
                track.automation.mute.push({ time: currentTime, value: track.muted });
            }
            track.gain.gain.setValueAtTime(track.muted ? 0 : track.volume, currentTime);
        }
    }

    toggleTrackSolo(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.solo = !track.solo;
            this.updateSoloState();
        }
    }

    updateSoloState() {
        const anySolo = this.tracks.some(t => t.solo);
        const currentTime = this.audioContext.currentTime;
        
        this.tracks.forEach(t => {
            if (anySolo) {
                t.gain.gain.setValueAtTime(t.solo ? t.volume : 0, currentTime);
            } else {
                t.gain.gain.setValueAtTime(t.muted ? 0 : t.volume, currentTime);
            }
        });
    }

    toggleTrackRecord(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.recordEnabled = !track.recordEnabled;
        }
    }

    toggleInputMonitoring(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.inputMonitoring = !track.inputMonitoring;
        }
    }

    setAutomationMode(trackId, mode) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.automationMode = mode;
        }
    }

    async loadAudioFile(file) {
        await this.init();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        return audioBuffer;
    }

    createClip(audioBuffer, trackId, startTime = 0, duration = null) {
        const clip = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            trackId: trackId,
            audioBuffer: audioBuffer,
            startTime: startTime,
            duration: duration || audioBuffer.duration,
            offset: 0,
            name: 'Clip'
        };
        
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.clips.push(clip);
        }
        
        this.clips.push(clip);
        return clip;
    }

    removeClip(clipId) {
        const clipIndex = this.clips.findIndex(c => c.id === clipId);
        if (clipIndex !== -1) {
            const clip = this.clips[clipIndex];
            const track = this.tracks.find(t => t.id === clip.trackId);
            if (track) {
                const trackClipIndex = track.clips.findIndex(c => c.id === clipId);
                if (trackClipIndex !== -1) {
                    track.clips.splice(trackClipIndex, 1);
                }
            }
            this.clips.splice(clipIndex, 1);
        }
    }

    playBuffer(audioBuffer, trackId, startTime = 0, offset = 0) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track || !this.audioContext) return null;

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(track.gain);
        
        const playTime = this.audioContext.currentTime + startTime;
        source.start(playTime, offset);
        
        this.activeSources.push(source);
        source.onended = () => {
            const index = this.activeSources.indexOf(source);
            if (index !== -1) {
                this.activeSources.splice(index, 1);
            }
        };
        
        return source;
    }

    play() {
        if (!this.isPlaying) {
            this.init().then(() => {
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
                this.isPlaying = true;
                this.startTime = this.audioContext.currentTime - this.currentTime;
                this.playAllClips();
            });
        }
    }

    stop() {
        if (this.isPlaying && this.audioContext) {
            this.stopAllClips();
            this.currentTime = this.audioContext.currentTime - this.startTime;
            this.isPlaying = false;
        }
    }

    playAllClips() {
        this.clips.forEach(clip => {
            const track = this.tracks.find(t => t.id === clip.trackId);
            if (track && !track.muted && (!this.tracks.some(t => t.solo) || track.solo)) {
                this.playBuffer(clip.audioBuffer, clip.trackId, clip.startTime - this.currentTime, clip.offset);
            }
        });
    }

    stopAllClips() {
        this.activeSources.forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // Source already stopped
            }
        });
        this.activeSources = [];
    }

    getCurrentTime() {
        if (!this.isPlaying || !this.audioContext) return this.currentTime;
        return this.audioContext.currentTime - this.startTime;
    }

    setCurrentTime(time) {
        this.currentTime = time;
        if (this.isPlaying) {
            this.stopAllClips();
            this.startTime = this.audioContext.currentTime - time;
            this.playAllClips();
        }
    }

    setBPM(bpm) {
        this.bpm = Math.max(20, Math.min(300, bpm));
        this.projectSettings.tempo = bpm;
    }

    setTimeSignature(timeSignature) {
        this.timeSignature = timeSignature;
        this.projectSettings.timeSignature = timeSignature;
    }

    setKey(key) {
        this.key = key;
        this.projectSettings.key = key;
    }

    toggleLoop() {
        this.loopEnabled = !this.loopEnabled;
    }

    setLoopRegion(start, end) {
        this.loopStart = start;
        this.loopEnd = end;
    }

    toggleHalfSpeed() {
        this.halfSpeed = !this.halfSpeed;
        if (this.audioContext) {
            this.audioContext.playbackRate = this.halfSpeed ? 0.5 : 1.0;
        }
    }

    toggleDynamicTransport() {
        this.dynamicTransport = !this.dynamicTransport;
    }

    getAnalyserData() {
        if (!this.analyser) return new Uint8Array(0);
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(dataArray);
        return dataArray;
    }

    getFrequencyData() {
        if (!this.analyser) return new Uint8Array(0);
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        return dataArray;
    }

    async exportAudio(duration) {
        await this.init();
        
        const offlineContext = new OfflineAudioContext(
            2,
            this.audioContext.sampleRate * duration,
            this.audioContext.sampleRate
        );

        const offlineMaster = offlineContext.createGain();
        offlineMaster.gain.value = 0.8;
        offlineMaster.connect(offlineContext.destination);

        for (const track of this.tracks) {
            if (track.muted) continue;
            
            const offlineGain = offlineContext.createGain();
            offlineGain.gain.value = track.volume;
            
            const offlinePanner = offlineContext.createStereoPanner();
            offlinePanner.pan.value = track.pan;
            
            offlineGain.connect(offlinePanner);
            offlinePanner.connect(offlineMaster);
            
            // Render clips
            track.clips.forEach(clip => {
                const source = offlineContext.createBufferSource();
                source.buffer = clip.audioBuffer;
                source.connect(offlineGain);
                source.start(clip.startTime, clip.offset);
            });
        }

        const renderedBuffer = await offlineContext.startRendering();
        return renderedBuffer;
    }

    async exportProject() {
        const duration = this.clips.length > 0 
            ? Math.max(...this.clips.map(c => c.startTime + c.duration))
            : 10;
        
        const audioBuffer = await this.exportAudio(duration);
        const wavBlob = await FileUtils.exportWAV(audioBuffer, { bitDepth: this.bitDepth });
        return wavBlob;
    }

    getProjectData() {
        return {
            settings: this.projectSettings,
            tracks: this.tracks.map(track => ({
                id: track.id,
                name: track.name,
                type: track.type,
                volume: track.volume,
                pan: track.pan,
                muted: track.muted,
                solo: track.solo,
                automation: track.automation,
                automationMode: track.automationMode
            })),
            clips: this.clips.map(clip => ({
                id: clip.id,
                trackId: clip.trackId,
                startTime: clip.startTime,
                duration: clip.duration,
                offset: clip.offset,
                name: clip.name
            }))
        };
    }

    async loadProjectData(projectData) {
        this.projectSettings = projectData.settings || this.projectSettings;
        this.bpm = this.projectSettings.tempo;
        this.timeSignature = this.projectSettings.timeSignature;
        this.key = this.projectSettings.key;
        
        // Note: Audio buffers need to be loaded separately
        // This method restores the project structure only
    }

    clearProject() {
        this.stopAllClips();
        this.tracks.forEach(track => {
            track.gain.disconnect();
            track.panner.disconnect();
        });
        this.tracks = [];
        this.clips = [];
        this.currentTime = 0;
        this.isPlaying = false;
    }
}

const audioEngine = new AudioEngine();
