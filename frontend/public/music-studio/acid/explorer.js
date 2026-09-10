// ACID Pro Explorer implementation

class AcidExplorer {
    constructor() {
        this.loops = [];
        this.selectedLoop = null;
        this.autoPreview = false;
        this.genreFilter = 'all';
        this.tempoFilter = 'all';
        
        this.init();
    }

    init() {
        this.wireControls();
        this.renderLoops();
    }

    wireControls() {
        const autoPreviewBtn = document.getElementById('explorer-auto-preview');
        if (autoPreviewBtn) {
            autoPreviewBtn.addEventListener('click', (e) => {
                this.autoPreview = !this.autoPreview;
                e.target.textContent = this.autoPreview ? 'Auto Preview: ON' : 'Auto Preview: OFF';
                e.target.classList.toggle('active', this.autoPreview);
            });
        }

        const searchInput = document.getElementById('explorer-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterLoops(e.target.value);
            });
        }

        const genreFilter = document.getElementById('explorer-genre-filter');
        if (genreFilter) {
            genreFilter.addEventListener('change', (e) => {
                this.genreFilter = e.target.value;
                this.applyFilters();
            });
        }

        const tempoFilter = document.getElementById('explorer-tempo-filter');
        if (tempoFilter) {
            tempoFilter.addEventListener('change', (e) => {
                this.tempoFilter = e.target.value;
                this.applyFilters();
            });
        }
    }

    addLoop(buffer, metadata = {}) {
        const beats = Math.round(buffer.duration * (metadata.tempo || 120) / 60);
        const loop = {
            id: Date.now().toString(),
            buffer: buffer,
            name: metadata.name || 'Loop ' + (this.loops.length + 1),
            tempo: metadata.tempo || 120,
            key: metadata.key || 'C',
            length: buffer.duration,
            beats: beats,
            rootNote: metadata.key || 'C',
            originalTempo: metadata.originalTempo || metadata.tempo || 120,
            genre: metadata.genre || 'electronic',
            metadata: metadata
        };
        
        this.loops.push(loop);
        this.renderLoops();
        return loop;
    }

    selectLoop(loopId) {
        this.selectedLoop = this.loops.find(l => l.id === loopId);
        this.updateLoopInfo();
        
        if (this.autoPreview && this.selectedLoop) {
            this.previewLoop(this.selectedLoop);
        }
    }

    previewLoop(loop) {
        const source = audioEngine.audioContext.createBufferSource();
        source.buffer = loop.buffer;
        source.connect(audioEngine.masterGain);
        source.start();
    }

    renderLoops() {
        const browser = document.getElementById('explorer-browser');
        if (!browser) return;
        
        browser.innerHTML = '';
        
        if (this.loops.length === 0) {
            browser.innerHTML = '<div class="empty-state">No loops loaded. Import audio files to browse.</div>';
            return;
        }

        this.loops.forEach(loop => {
            const loopEl = document.createElement('div');
            loopEl.className = 'loop-item';
            loopEl.style.padding = '10px';
            loopEl.style.borderBottom = '1px solid var(--border-color)';
            loopEl.style.cursor = 'pointer';
            loopEl.innerHTML = `
                <div class="loop-name">${loop.name}</div>
                <div class="loop-meta">
                    <span>${loop.tempo} BPM</span>
                    <span>${loop.key}</span>
                    <span>${loop.length.toFixed(2)}s</span>
                </div>
            `;
            
            loopEl.addEventListener('click', () => {
                this.selectLoop(loop.id);
            });
            
            browser.appendChild(loopEl);
        });
    }

    filterLoops(query) {
        this.searchQuery = query;
        this.applyFilters();
    }

    applyFilters() {
        const browser = document.getElementById('explorer-browser');
        if (!browser) return;
        
        let filtered = this.loops;
        
        if (this.searchQuery) {
            filtered = filtered.filter(loop => 
                loop.name.toLowerCase().includes(this.searchQuery.toLowerCase())
            );
        }
        
        if (this.genreFilter !== 'all') {
            filtered = filtered.filter(loop => loop.genre === this.genreFilter);
        }
        
        if (this.tempoFilter !== 'all') {
            filtered = filtered.filter(loop => {
                const t = loop.tempo;
                if (this.tempoFilter === '60-90') return t >= 60 && t < 90;
                if (this.tempoFilter === '90-120') return t >= 90 && t < 120;
                if (this.tempoFilter === '120-140') return t >= 120 && t < 140;
                if (this.tempoFilter === '140+') return t >= 140;
                return true;
            });
        }
        
        browser.innerHTML = '';
        
        if (filtered.length === 0) {
            browser.innerHTML = '<div class="empty-state">No matching loops found.</div>';
            return;
        }

        filtered.forEach(loop => {
            const loopEl = document.createElement('div');
            loopEl.className = 'loop-item';
            loopEl.style.padding = '10px';
            loopEl.style.borderBottom = '1px solid var(--border-color)';
            loopEl.style.cursor = 'pointer';
            loopEl.innerHTML = `
                <div class="loop-name">${loop.name}</div>
                <div class="loop-meta">
                    <span>${loop.tempo} BPM</span>
                    <span>${loop.key}</span>
                    <span>${loop.length.toFixed(2)}s</span>
                    <span>${loop.beats} beats</span>
                </div>
            `;
            
            loopEl.addEventListener('click', () => {
                this.selectLoop(loop.id);
            });
            
            browser.appendChild(loopEl);
        });
    }

    updateLoopInfo() {
        if (!this.selectedLoop) {
            const ids = ['loop-tempo', 'loop-key', 'loop-length', 'loop-beats', 'loop-root', 'loop-original-tempo'];
            ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '--'; });
            return;
        }

        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setText('loop-tempo', this.selectedLoop.tempo + ' BPM');
        setText('loop-key', this.selectedLoop.key);
        setText('loop-length', this.selectedLoop.length.toFixed(2) + 's');
        setText('loop-beats', this.selectedLoop.beats);
        setText('loop-root', this.selectedLoop.rootNote);
        setText('loop-original-tempo', this.selectedLoop.originalTempo + ' BPM');
    }

    getSelectedLoop() {
        return this.selectedLoop;
    }
}

// Initialize when DOM is ready
let acidExplorer;
document.addEventListener('DOMContentLoaded', () => {
    acidExplorer = new AcidExplorer();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AcidExplorer;
}
