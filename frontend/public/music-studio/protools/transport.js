// ProTools Transport implementation

class ProToolsTransport {
    constructor() {
        this.counter = document.getElementById('pt-counter');
        this.playBtn = document.getElementById('pt-play');
        this.stopBtn = document.getElementById('pt-stop');
        this.recordBtn = document.getElementById('pt-record');
        this.ffBtn = document.getElementById('pt-ff');
        this.rwBtn = document.getElementById('pt-rw');
        this.loopBtn = document.getElementById('pt-loop');
        this.halfSpeedBtn = document.querySelector('.transport-opt[data-opt="half-speed"]');
        this.dynamicBtn = document.querySelector('.transport-opt[data-opt="dynamic"]');
        this.midiMergeBtn = document.querySelector('.transport-opt[data-opt="midi-merge"]');
        this.waitForNoteBtn = document.querySelector('.transport-opt[data-opt="wait-for-note"]');
        this.bpmDisplay = document.getElementById('pt-bpm-display');
        this.bbtDisplay = document.getElementById('pt-bbt-display');
        this.preRollInput = document.getElementById('pt-pre-roll');
        this.postRollInput = document.getElementById('pt-post-roll');
        this.countoffInput = document.getElementById('pt-countoff');
        this.midiMerge = false;
        this.waitForNote = false;
        this.preRoll = 0;
        this.postRoll = 0;
        this.countoff = 0;
        
        this.init();
    }

    init() {
        this.wireControls();
        this.startCounterUpdate();
    }

    wireControls() {
        this.playBtn.addEventListener('click', () => this.play());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.recordBtn.addEventListener('click', () => this.record());
        this.ffBtn.addEventListener('click', () => this.fastForward());
        this.rwBtn.addEventListener('click', () => this.rewind());
        this.loopBtn.addEventListener('click', () => this.toggleLoop());
        this.halfSpeedBtn.addEventListener('click', () => this.toggleHalfSpeed());
        this.dynamicBtn.addEventListener('click', () => this.toggleDynamic());
        if (this.midiMergeBtn) this.midiMergeBtn.addEventListener('click', () => this.toggleMidiMerge());
        if (this.waitForNoteBtn) this.waitForNoteBtn.addEventListener('click', () => this.toggleWaitForNote());
        if (this.preRollInput) this.preRollInput.addEventListener('change', (e) => { this.preRoll = parseInt(e.target.value); });
        if (this.postRollInput) this.postRollInput.addEventListener('change', (e) => { this.postRoll = parseInt(e.target.value); });
        if (this.countoffInput) this.countoffInput.addEventListener('change', (e) => { this.countoff = parseInt(e.target.value); });
    }

    play() {
        audioEngine.play();
        this.playBtn.classList.add('active');
        this.stopBtn.classList.remove('active');
    }

    stop() {
        audioEngine.stop();
        this.playBtn.classList.remove('active');
        this.stopBtn.classList.add('active');
    }

    record() {
        if (audioEngine.isRecording) {
            audioEngine.isRecording = false;
            this.recordBtn.classList.remove('active');
        } else {
            audioEngine.isRecording = true;
            this.recordBtn.classList.add('active');
            this.play();
        }
    }

    fastForward() {
        const currentTime = audioEngine.getCurrentTime();
        audioEngine.setCurrentTime(currentTime + 5);
    }

    rewind() {
        const currentTime = audioEngine.getCurrentTime();
        audioEngine.setCurrentTime(Math.max(0, currentTime - 5));
    }

    toggleLoop() {
        audioEngine.toggleLoop();
        this.loopBtn.classList.toggle('active');
    }

    toggleHalfSpeed() {
        audioEngine.toggleHalfSpeed();
        this.halfSpeedBtn.classList.toggle('active');
    }

    toggleDynamic() {
        audioEngine.toggleDynamicTransport();
        this.dynamicBtn.classList.toggle('active');
    }

    toggleMidiMerge() {
        this.midiMerge = !this.midiMerge;
        this.midiMergeBtn.classList.toggle('active', this.midiMerge);
    }

    toggleWaitForNote() {
        this.waitForNote = !this.waitForNote;
        this.waitForNoteBtn.classList.toggle('active', this.waitForNote);
    }

    startCounterUpdate() {
        setInterval(() => {
            this.updateCounter();
        }, 50);
    }

    updateCounter() {
        const time = audioEngine.getCurrentTime();
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const frames = Math.floor((time % 1) * 30);
        
        const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
        this.counter.textContent = formatted;

        if (this.bpmDisplay) {
            this.bpmDisplay.textContent = audioEngine.bpm + ' BPM';
        }

        if (this.bbtDisplay) {
            const beatsPerBar = parseInt(audioEngine.timeSignature.split('/')[0]);
            const beatDuration = 60 / audioEngine.bpm;
            const totalBeats = Math.floor(time / beatDuration);
            const bar = Math.floor(totalBeats / beatsPerBar) + 1;
            const beat = (totalBeats % beatsPerBar) + 1;
            const ticks = Math.floor((time % beatDuration) / beatDuration * 960);
            this.bbtDisplay.textContent = `${bar}|${beat}|${ticks.toString().padStart(3, '0')}`;
        }
    }
}

// Initialize when DOM is ready
let proToolsTransport;
document.addEventListener('DOMContentLoaded', () => {
    proToolsTransport = new ProToolsTransport();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProToolsTransport;
}
