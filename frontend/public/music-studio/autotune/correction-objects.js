// Auto-Tune Correction Objects implementation

class CorrectionObjects {
    constructor() {
        this.objects = [];
    }

    createLine(startTime, endTime, pitch) {
        return {
            id: Date.now().toString(),
            type: 'line',
            startTime,
            endTime,
            pitch
        };
    }

    createCurve(startTime, endTime, pitchStart, pitchEnd, curveType = 'linear') {
        return {
            id: Date.now().toString(),
            type: 'curve',
            startTime,
            endTime,
            pitchStart,
            pitchEnd,
            curveType
        };
    }

    createNote(startTime, endTime, pitch, velocity = 100) {
        return {
            id: Date.now().toString(),
            type: 'note',
            startTime,
            endTime,
            pitch,
            velocity
        };
    }

    addObject(obj) {
        this.objects.push(obj);
        return obj;
    }

    removeObject(objId) {
        const index = this.objects.findIndex(o => o.id === objId);
        if (index !== -1) {
            this.objects.splice(index, 1);
        }
    }

    getObject(objId) {
        return this.objects.find(o => o.id === objId);
    }

    getObjectsAtTime(time) {
        return this.objects.filter(o => time >= o.startTime && time <= o.endTime);
    }

    clear() {
        this.objects = [];
    }

    export() {
        return JSON.stringify(this.objects, null, 2);
    }

    import(data) {
        try {
            this.objects = JSON.parse(data);
        } catch (e) {
            console.error('Failed to import correction objects:', e);
        }
    }
}

// Initialize when DOM is ready
let correctionObjects;
document.addEventListener('DOMContentLoaded', () => {
    correctionObjects = new CorrectionObjects();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CorrectionObjects;
}
