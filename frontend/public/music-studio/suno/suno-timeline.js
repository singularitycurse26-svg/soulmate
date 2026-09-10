class SunoTimeline {
    constructor() {
        this.audioEngine = null;
        this.tracks = [];
        this.clips = [];
        this.playhead = 0;
        this.isPlaying = false;
        this.followPlayhead = true;
        this.metronomeOn = false;
        this.warpMarkers = [];
        this.zoom = 1;
        this.scrollX = 0;
        this.pixelsPerSecond = 50;
        this.trackHeight = 80;
        this.headerWidth = 200;
        this.selectedClip = null;
        this.contextMenuClip = null;
        this.canvas = null;
        this.ctx = null;
        this.init();
    }

    setAudioEngine(engine) {
        this.audioEngine = engine;
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.wireTransport();
            this.wireCanvas();
            this.wireContextMenu();
            this.startRenderLoop();
        });
    }

    wireTransport() {
        const playBtn = document.getElementById('suno-transport-play');
        const pauseBtn = document.getElementById('suno-transport-pause');
        const stopBtn = document.getElementById('suno-transport-stop');
        const loopBtn = document.getElementById('suno-transport-loop');
        const followBtn = document.getElementById('suno-transport-follow');
        const metronomeBtn = document.getElementById('suno-transport-metronome');
        const tempoInput = document.getElementById('suno-transport-tempo');
        const timeSigSelect = document.getElementById('suno-transport-timesig');

        if (playBtn) playBtn.addEventListener('click', () => this.play());
        if (pauseBtn) pauseBtn.addEventListener('click', () => this.pause());
        if (stopBtn) stopBtn.addEventListener('click', () => this.stop());
        if (loopBtn) loopBtn.addEventListener('click', () => {
            loopBtn.classList.toggle('active');
            if (this.audioEngine) this.audioEngine.toggleLoop();
        });
        if (followBtn) followBtn.addEventListener('click', () => {
            followBtn.classList.toggle('active');
            this.followPlayhead = followBtn.classList.contains('active');
        });
        if (metronomeBtn) metronomeBtn.addEventListener('click', () => {
            metronomeBtn.classList.toggle('active');
            this.metronomeOn = metronomeBtn.classList.contains('active');
        });
        if (tempoInput) tempoInput.addEventListener('change', (e) => {
            const bpm = parseInt(e.target.value);
            if (this.audioEngine) this.audioEngine.setBPM(bpm);
        });
        if (timeSigSelect) timeSigSelect.addEventListener('change', (e) => {
            if (this.audioEngine) this.audioEngine.setTimeSignature(e.target.value);
        });
    }

    wireCanvas() {
        this.canvas = document.getElementById('suno-timeline-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleContextMenu(e);
        });
    }

    wireContextMenu() {
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('suno-clip-context-menu');
            if (menu && !menu.contains(e.target)) {
                menu.style.display = 'none';
            }
        });

        document.addEventListener('DOMContentLoaded', () => {
            const splitAuto = document.getElementById('suno-ctx-split-auto');
            const splitMix = document.getElementById('suno-ctx-split-mix');
            const splitAdvanced = document.getElementById('suno-ctx-split-advanced');
            const removeFx = document.getElementById('suno-ctx-remove-fx');
            const commit = document.getElementById('suno-ctx-commit');
            const dismiss = document.getElementById('suno-ctx-dismiss');
            const generateAlt = document.getElementById('suno-ctx-generate-alt');

            if (splitAuto) splitAuto.addEventListener('click', () => this.splitStems('auto'));
            if (splitMix) splitMix.addEventListener('click', () => this.splitStems('mix'));
            if (splitAdvanced) splitAdvanced.addEventListener('click', () => this.splitStems('advanced'));
            if (removeFx) removeFx.addEventListener('click', () => this.removeFX());
            if (commit) commit.addEventListener('click', () => this.commitClip());
            if (dismiss) dismiss.addEventListener('click', () => this.dismissClip());
            if (generateAlt) generateAlt.addEventListener('click', () => this.generateAlternate());
        });
    }

    play() {
        if (this.audioEngine) this.audioEngine.play();
        this.isPlaying = true;
    }

    pause() {
        if (this.audioEngine) this.audioEngine.stop();
        this.isPlaying = false;
    }

    stop() {
        if (this.audioEngine) {
            this.audioEngine.stop();
            this.audioEngine.setCurrentTime(0);
        }
        this.isPlaying = false;
        this.playhead = 0;
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x < this.headerWidth) {
            const trackIndex = Math.floor(y / this.trackHeight);
            this.selectTrack(trackIndex);
            return;
        }

        const timelineX = x - this.headerWidth + this.scrollX;
        const time = timelineX / this.pixelsPerSecond;
        this.playhead = time;
        if (this.audioEngine) this.audioEngine.setCurrentTime(time);
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const time = (x - this.headerWidth + this.scrollX) / this.pixelsPerSecond;
        const timeDisplay = document.getElementById('suno-transport-time');
        if (timeDisplay) {
            const mins = Math.floor(time / 60);
            const secs = Math.floor(time % 60);
            const ms = Math.floor((time % 1) * 100);
            timeDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
        }
    }

    handleMouseUp(e) {
    }

    handleDoubleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < this.headerWidth) return;
        const timelineX = x - this.headerWidth + this.scrollX;
        const time = timelineX / this.pixelsPerSecond;
        this.addWarpMarker(time);
    }

    handleContextMenu(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const trackIndex = Math.floor(y / this.trackHeight);
        const timelineX = x - this.headerWidth + this.scrollX;
        const time = timelineX / this.pixelsPerSecond;

        if (this.audioEngine && trackIndex < this.audioEngine.tracks.length) {
            const track = this.audioEngine.tracks[trackIndex];
            const clip = track.clips.find(c => time >= c.startTime && time < c.startTime + c.duration);
            if (clip) {
                this.contextMenuClip = clip;
                const menu = document.getElementById('suno-clip-context-menu');
                if (menu) {
                    menu.style.display = 'block';
                    menu.style.left = e.clientX + 'px';
                    menu.style.top = e.clientY + 'px';
                }
            }
        }
    }

    addWarpMarker(time) {
        this.warpMarkers.push({ time, position: this.warpMarkers.length });
        this.warpMarkers.sort((a, b) => a.time - b.time);
    }

    selectTrack(index) {
        if (this.audioEngine && index < this.audioEngine.tracks.length) {
            const track = this.audioEngine.tracks[index];
            const volumeSlider = document.getElementById('suno-track-volume');
            if (volumeSlider) volumeSlider.value = track.volume * 100;
        }
    }

    splitStems(type) {
        if (!this.contextMenuClip || !this.audioEngine) return;
        const clip = this.contextMenuClip;
        const stemNames = ['Vocals', 'Drums', 'Bass', 'Other'];
        const track = this.audioEngine.tracks.find(t => t.id === clip.trackId);
        if (!track) return;

        stemNames.forEach(name => {
            const newTrack = this.audioEngine.createTrack(`${name} (stem)`, 'audio');
            if (clip.audioBuffer) {
                const buffer = this.audioEngine.audioContext.createBuffer(
                    clip.audioBuffer.numberOfChannels,
                    clip.audioBuffer.length,
                    clip.audioBuffer.sampleRate
                );
                for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                    buffer.getChannelData(ch).set(clip.audioBuffer.getChannelData(ch));
                }
                this.audioEngine.createClip(buffer, newTrack.id, clip.startTime, clip.duration);
            }
        });

        track.muted = true;
        this.hideContextMenu();
    }

    removeFX() {
        this.hideContextMenu();
    }

    commitClip() {
        this.hideContextMenu();
    }

    dismissClip() {
        if (this.contextMenuClip && this.audioEngine) {
            this.audioEngine.removeClip(this.contextMenuClip.id);
        }
        this.hideContextMenu();
    }

    generateAlternate() {
        this.hideContextMenu();
    }

    hideContextMenu() {
        const menu = document.getElementById('suno-clip-context-menu');
        if (menu) menu.style.display = 'none';
    }

    startRenderLoop() {
        const render = () => {
            this.render();
            requestAnimationFrame(render);
        };
        render();
    }

    render() {
        if (!this.canvas || !this.ctx) return;
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, w, h);

        this.renderRuler(w);
        this.renderTracks(w);
        this.renderClips(w);
        this.renderPlayhead(w);
        this.renderWarpMarkers(w);
    }

    renderRuler(w) {
        const rulerHeight = 30;
        this.ctx.fillStyle = '#16213e';
        this.ctx.fillRect(0, 0, w, rulerHeight);

        this.ctx.strokeStyle = '#333';
        this.ctx.fillStyle = '#888';
        this.ctx.font = '10px sans-serif';
        this.ctx.lineWidth = 1;

        const secondsPerBeat = 60 / (this.audioEngine ? this.audioEngine.bpm : 120);
        const beatPx = secondsPerBeat * this.pixelsPerSecond;
        const startBeat = Math.floor(this.scrollX / beatPx);
        const endBeat = Math.ceil((this.scrollX + w) / beatPx);

        for (let beat = startBeat; beat <= endBeat; beat++) {
            const x = this.headerWidth + beat * beatPx - this.scrollX;
            if (x < this.headerWidth) continue;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, rulerHeight);
            this.ctx.stroke();
            if (beat % 4 === 0) {
                this.ctx.fillStyle = '#aaa';
                this.ctx.fillText(`${beat / 4 + 1}`, x + 2, 20);
            }
        }
    }

    renderTracks(w) {
        if (!this.audioEngine) return;
        const rulerHeight = 30;
        this.audioEngine.tracks.forEach((track, i) => {
            const y = rulerHeight + i * this.trackHeight;

            if (i % 2 === 0) {
                this.ctx.fillStyle = '#1a1a2e';
            } else {
                this.ctx.fillStyle = '#1e1e3a';
            }
            this.ctx.fillRect(0, y, w, this.trackHeight);

            this.ctx.fillStyle = '#16213e';
            this.ctx.fillRect(0, y, this.headerWidth, this.trackHeight);

            this.ctx.strokeStyle = '#333';
            this.ctx.beginPath();
            this.ctx.moveTo(0, y + this.trackHeight);
            this.ctx.lineTo(w, y + this.trackHeight);
            this.ctx.stroke();

            this.ctx.fillStyle = track.muted ? '#555' : '#e0e0e0';
            this.ctx.font = '12px sans-serif';
            this.ctx.fillText(track.name.substring(0, 22), 8, y + 20);

            if (track.solo) {
                this.ctx.fillStyle = '#ffcc00';
                this.ctx.fillText('S', this.headerWidth - 30, y + 20);
            }
            if (track.muted) {
                this.ctx.fillStyle = '#ff4444';
                this.ctx.fillText('M', this.headerWidth - 15, y + 20);
            }

            this.ctx.fillStyle = '#444';
            this.ctx.fillRect(this.headerWidth - 4, y, 2, this.trackHeight);
        });
    }

    renderClips(w) {
        if (!this.audioEngine) return;
        const rulerHeight = 30;
        this.audioEngine.tracks.forEach((track, i) => {
            const y = rulerHeight + i * this.trackHeight;
            track.clips.forEach(clip => {
                const x = this.headerWidth + clip.startTime * this.pixelsPerSecond - this.scrollX;
                const clipWidth = clip.duration * this.pixelsPerSecond;
                if (x + clipWidth < this.headerWidth || x > w) return;

                const clipY = y + 4;
                const clipH = this.trackHeight - 8;

                const colors = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#858796'];
                const color = colors[i % colors.length];

                this.ctx.fillStyle = color;
                this.ctx.globalAlpha = track.muted ? 0.3 : 0.7;
                this.ctx.fillRect(x, clipY, clipWidth, clipH);
                this.ctx.globalAlpha = 1;

                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(x, clipY, clipWidth, clipH);

                this.ctx.fillStyle = '#fff';
                this.ctx.font = '10px sans-serif';
                this.ctx.fillText(clip.name || 'Clip', x + 4, clipY + 14);

                if (clip.audioBuffer) {
                    this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                    this.ctx.beginPath();
                    const data = clip.audioBuffer.getChannelData(0);
                    const step = Math.max(1, Math.floor(data.length / clipWidth));
                    for (let px = 0; px < clipWidth; px++) {
                        const sampleIdx = px * step;
                        const sample = Math.abs(data[sampleIdx] || 0);
                        const amp = sample * (clipH / 2);
                        this.ctx.moveTo(x + px, clipY + clipH / 2 - amp);
                        this.ctx.lineTo(x + px, clipY + clipH / 2 + amp);
                    }
                    this.ctx.stroke();
                }

                const arrowY = clipY + clipH - 12;
                this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
                this.ctx.fillText('\u25B2\u25BC', x + clipWidth - 16, arrowY);
            });
        });
    }

    renderPlayhead(w) {
        if (this.audioEngine && this.isPlaying) {
            this.playhead = this.audioEngine.getCurrentTime();
        }
        const x = this.headerWidth + this.playhead * this.pixelsPerSecond - this.scrollX;
        if (x < this.headerWidth || x > w) {
            if (this.followPlayhead) {
                this.scrollX = this.playhead * this.pixelsPerSecond - (w - this.headerWidth) / 2;
                if (this.scrollX < 0) this.scrollX = 0;
            }
            return;
        }

        this.ctx.strokeStyle = '#ff4444';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, this.canvas.height);
        this.ctx.stroke();

        this.ctx.fillStyle = '#ff4444';
        this.ctx.beginPath();
        this.ctx.moveTo(x - 5, 0);
        this.ctx.lineTo(x + 5, 0);
        this.ctx.lineTo(x, 10);
        this.ctx.fill();
    }

    renderWarpMarkers(w) {
        this.warpMarkers.forEach(marker => {
            const x = this.headerWidth + marker.time * this.pixelsPerSecond - this.scrollX;
            if (x < this.headerWidth || x > w) return;

            this.ctx.fillStyle = '#ffcc00';
            this.ctx.beginPath();
            this.ctx.moveTo(x, 30);
            this.ctx.lineTo(x - 4, 22);
            this.ctx.lineTo(x + 4, 22);
            this.ctx.fill();
        });
    }
}

const sunoTimeline = new SunoTimeline();
