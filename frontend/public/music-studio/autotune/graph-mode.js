// Auto-Tune Graph Mode implementation

class AutoTuneGraphMode {
    constructor() {
        this.currentTool = 'select';
        this.selectedObjects = [];
        this.correctionObjects = [];
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.showToolbar = true;
        this.showGlobalControls = true;
        this.clutchScroll = false;
        this.preserveFormant = false;
        
        this.init();
    }

    init() {
        this.wireToolbar();
        this.wireEditingTools();
        this.wireZoomControls();
        this.wireShowHideControls();
        this.wirePerObjectControls();
        this.initCanvas();
    }

    wireToolbar() {
        document.querySelectorAll('.graph-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleToolbarAction(action);
            });
        });
    }

    wireEditingTools() {
        document.querySelectorAll('.graph-tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.target.dataset.tool;
                this.selectTool(tool);
            });
        });
    }

    wireZoomControls() {
        document.querySelectorAll('.zoom-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.zoom;
                if (action === 'in') {
                    this.zoomIn();
                } else if (action === 'out') {
                    this.zoomOut();
                } else if (action === 'fit') {
                    this.zoomFit();
                }
            });
        });
    }

    wireShowHideControls() {
        const showToolbarBtn = document.getElementById('at-show-toolbar');
        if (showToolbarBtn) {
            showToolbarBtn.addEventListener('click', (e) => {
                this.showToolbar = !this.showToolbar;
                const toolbar = document.querySelector('.graph-toolbar');
                if (toolbar) toolbar.style.display = this.showToolbar ? '' : 'none';
                e.target.textContent = this.showToolbar ? 'Hide Toolbar' : 'Show Toolbar';
            });
        }

        const showGlobalBtn = document.getElementById('at-show-global');
        if (showGlobalBtn) {
            showGlobalBtn.addEventListener('click', (e) => {
                this.showGlobalControls = !this.showGlobalControls;
                const perObject = document.querySelector('.graph-per-object');
                if (perObject) perObject.style.display = this.showGlobalControls ? '' : 'none';
                e.target.textContent = this.showGlobalControls ? 'Hide Global Controls' : 'Show Global Controls';
            });
        }
    }

    wirePerObjectControls() {
        const preserveBtn = document.getElementById('at-per-preserve-formant');
        if (preserveBtn) {
            preserveBtn.addEventListener('click', (e) => {
                this.preserveFormant = !this.preserveFormant;
                e.target.textContent = this.preserveFormant ? 'ON' : 'OFF';
                e.target.classList.toggle('active', this.preserveFormant);
            });
        }
    }

    initCanvas() {
        const graphMain = document.getElementById('graph-main');
        const graphWaveform = document.getElementById('graph-waveform');
        
        if (graphMain) {
            this.graphCanvas = document.getElementById('at-pitch-canvas');
            if (!this.graphCanvas) {
                this.graphCanvas = document.createElement('canvas');
                graphMain.appendChild(this.graphCanvas);
            }
            this.graphCtx = this.graphCanvas.getContext('2d');
        }
        
        if (graphWaveform) {
            this.waveCanvas = document.getElementById('at-waveform-canvas');
            if (!this.waveCanvas) {
                this.waveCanvas = document.createElement('canvas');
                graphWaveform.appendChild(this.waveCanvas);
            }
            this.waveCtx = this.waveCanvas.getContext('2d');
        }
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        if (this.graphCanvas) {
            const parent = this.graphCanvas.parentElement;
            this.graphCanvas.width = parent.clientWidth;
            this.graphCanvas.height = parent.clientHeight;
        }
        
        if (this.waveCanvas) {
            const parent = this.waveCanvas.parentElement;
            this.waveCanvas.width = parent.clientWidth;
            this.waveCanvas.height = parent.clientHeight;
        }
        
        this.render();
    }

    selectTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.graph-tool-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tool === tool) {
                btn.classList.add('active');
            }
        });
    }

    handleToolbarAction(action) {
        switch (action) {
            case 'undo':
                this.undo();
                break;
            case 'redo':
                this.redo();
                break;
            case 'clear':
                this.clearAll();
                break;
            case 'import':
                this.importPitch();
                break;
            case 'export':
                this.exportPitch();
                break;
        }
    }

    zoomIn() {
        this.zoom = Math.min(10, this.zoom * 1.2);
        this.render();
    }

    zoomOut() {
        this.zoom = Math.max(0.1, this.zoom / 1.2);
        this.render();
    }

    zoomFit() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.render();
    }

    undo() {
        // Implement undo
    }

    redo() {
        // Implement redo
    }

    clearAll() {
        this.correctionObjects = [];
        this.selectedObjects = [];
        this.render();
    }

    importPitch() {
        // Implement pitch import
    }

    exportPitch() {
        // Implement pitch export
    }

    createCorrectionObject(type, startTime, endTime, pitch) {
        const obj = {
            id: Date.now().toString(),
            type: type,
            startTime: startTime,
            endTime: endTime,
            pitch: pitch,
            retuneSpeed: 20,
            vibrato: 0,
            throatLength: 0
        };
        
        this.correctionObjects.push(obj);
        this.render();
        return obj;
    }

    deleteCorrectionObject(objId) {
        const index = this.correctionObjects.findIndex(o => o.id === objId);
        if (index !== -1) {
            this.correctionObjects.splice(index, 1);
            this.render();
        }
    }

    render() {
        if (!this.graphCtx || !this.waveCtx) return;
        
        this.renderGraph();
        this.renderWaveform();
    }

    renderGraph() {
        const ctx = this.graphCtx;
        const width = this.graphCanvas.width;
        const height = this.graphCanvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);
        
        const noteNames = ['C', 'B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#'];
        
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 1;
        for (let i = 0; i < 12; i++) {
            const y = (height / 12) * i;
            ctx.beginPath();
            ctx.moveTo(40, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            ctx.fillStyle = '#b0b0b0';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(noteNames[i], 35, y + 14);
        }
        
        ctx.strokeStyle = '#505050';
        ctx.lineWidth = 2;
        for (let i = 0; i <= 4; i++) {
            const x = 40 + ((width - 40) / 4) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 1;
        for (let i = 0; i < 20; i++) {
            const x = 40 + ((width - 40) / 20) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        this.correctionObjects.forEach(obj => {
            const x = 40 + obj.startTime * (width - 40);
            const y = height - (obj.pitch / 100) * height;
            const w = (obj.endTime - obj.startTime) * (width - 40);
            
            ctx.fillStyle = obj.type === 'line' ? '#007acc' : '#4caf50';
            ctx.fillRect(x, y - 5, w, 10);
            
            if (this.selectedObjects.includes(obj.id)) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y - 5, w, 10);
            }
        });
        
        if (this.correctionObjects.length === 0) {
            ctx.fillStyle = '#b0b0b0';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Track Pitch to see detected pitch curve', width / 2, height / 2);
        }
    }

    renderWaveform() {
        const ctx = this.waveCtx;
        const width = this.waveCanvas.width;
        const height = this.waveCanvas.height;
        
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = '#007acc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        for (let i = 0; i < width; i++) {
            const y = height / 2 + Math.sin(i * 0.1) * (height / 4);
            if (i === 0) {
                ctx.moveTo(i, y);
            } else {
                ctx.lineTo(i, y);
            }
        }
        
        ctx.stroke();
        
        ctx.fillStyle = '#b0b0b0';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Waveform Preview', width / 2, 24);
    }

    updatePerObjectControls() {
        if (this.selectedObjects.length === 1) {
            const obj = this.correctionObjects.find(o => o.id === this.selectedObjects[0]);
            if (obj) {
                const retuneEl = document.getElementById('at-per-retune');
                const vibratoEl = document.getElementById('at-per-vibrato');
                const formantEl = document.getElementById('at-per-formant');
                if (retuneEl) retuneEl.value = obj.retuneSpeed;
                if (vibratoEl) vibratoEl.value = obj.vibrato;
                if (formantEl) formantEl.value = obj.throatLength;
            }
        }
    }

    getSelectedObjects() {
        return this.selectedObjects;
    }
}

// Initialize when DOM is ready
let autoTuneGraphMode;
document.addEventListener('DOMContentLoaded', () => {
    autoTuneGraphMode = new AutoTuneGraphMode();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AutoTuneGraphMode;
}
