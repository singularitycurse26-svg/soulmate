class AcidMorphPads {
    constructor() {
        this.pads = [];
        this.selectedPad = 0;
        this.xyX = 0.5;
        this.xyY = 0.5;
        this.canvas = null;
        this.ctx = null;
        this.isDragging = false;

        for (let i = 0; i < 8; i++) {
            this.pads.push({
                id: i,
                target: 'none',
                modulation: 50,
                active: false
            });
        }

        this.init();
    }

    init() {
        this.wirePads();
        this.wireControls();
        this.initCanvas();
    }

    wirePads() {
        document.querySelectorAll('.morph-pad').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const padIdx = parseInt(e.target.dataset.pad);
                this.selectPad(padIdx);
            });
        });
    }

    selectPad(idx) {
        this.selectedPad = idx;
        document.querySelectorAll('.morph-pad').forEach(btn => {
            btn.classList.remove('selected');
            if (parseInt(btn.dataset.pad) === idx) {
                btn.classList.add('selected');
            }
        });
        const pad = this.pads[idx];
        const targetSelect = document.getElementById('morph-target');
        const modInput = document.getElementById('morph-modulation');
        if (targetSelect) targetSelect.value = pad.target;
        if (modInput) modInput.value = pad.modulation;
    }

    wireControls() {
        const targetSelect = document.getElementById('morph-target');
        if (targetSelect) {
            targetSelect.addEventListener('change', (e) => {
                this.pads[this.selectedPad].target = e.target.value;
            });
        }

        const modInput = document.getElementById('morph-modulation');
        if (modInput) {
            modInput.addEventListener('input', (e) => {
                this.pads[this.selectedPad].modulation = parseInt(e.target.value);
                const modVal = document.getElementById('morph-mod-val');
                if (modVal) modVal.textContent = e.target.value + '%';
            });
        }
    }

    initCanvas() {
        this.canvas = document.getElementById('morph-xy-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.renderXYPad();

        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.updateXY(e);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) this.updateXY(e);
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
        });
    }

    updateXY(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.xyX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.xyY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        this.renderXYPad();
    }

    renderXYPad() {
        if (!this.ctx) return;
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, w, h);

        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo((w / 4) * i, 0);
            this.ctx.lineTo((w / 4) * i, h);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(0, (h / 4) * i);
            this.ctx.lineTo(w, (h / 4) * i);
            this.ctx.stroke();
        }

        const px = this.xyX * w;
        const py = this.xyY * h;

        this.ctx.strokeStyle = '#007acc';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(px, 0);
        this.ctx.lineTo(px, h);
        this.ctx.moveTo(0, py);
        this.ctx.lineTo(w, py);
        this.ctx.stroke();

        this.ctx.fillStyle = '#007acc';
        this.ctx.beginPath();
        this.ctx.arc(px, py, 8, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = '#fff';
        this.ctx.font = '10px sans-serif';
        this.ctx.fillText(`X: ${Math.round(this.xyX * 100)}%`, 8, h - 8);
        this.ctx.fillText(`Y: ${Math.round(this.xyY * 100)}%`, 8, 16);
    }
}

let acidMorphPads;
document.addEventListener('DOMContentLoaded', () => {
    acidMorphPads = new AcidMorphPads();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AcidMorphPads;
}
