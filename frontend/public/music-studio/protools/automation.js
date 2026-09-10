// ProTools Automation implementation

class ProToolsAutomation {
    constructor() {
        this.automationData = new Map();
        this.writeMode = false;
        this.touchMode = false;
        this.latchMode = false;
        
        this.init();
    }

    init() {
        // Initialize automation system
    }

    enableWriteMode(trackId) {
        this.writeMode = true;
        this.touchMode = false;
        this.latchMode = false;
    }

    enableTouchMode(trackId) {
        this.touchMode = true;
        this.writeMode = false;
        this.latchMode = false;
    }

    enableLatchMode(trackId) {
        this.latchMode = true;
        this.writeMode = false;
        this.touchMode = false;
    }

    disableAutomation(trackId) {
        this.writeMode = false;
        this.touchMode = false;
        this.latchMode = false;
    }

    addAutomationPoint(trackId, parameter, time, value) {
        if (!this.automationData.has(trackId)) {
            this.automationData.set(trackId, {});
        }
        
        const trackData = this.automationData.get(trackId);
        if (!trackData[parameter]) {
            trackData[parameter] = [];
        }
        
        trackData[parameter].push({ time, value });
        trackData[parameter].sort((a, b) => a.time - b.time);
    }

    getAutomationValue(trackId, parameter, time) {
        const trackData = this.automationData.get(trackId);
        if (!trackData || !trackData[parameter]) {
            return null;
        }
        
        const points = trackData[parameter];
        if (points.length === 0) return null;
        
        // Find the point at or before the given time
        let prevPoint = null;
        let nextPoint = null;
        
        for (let i = 0; i < points.length; i++) {
            if (points[i].time <= time) {
                prevPoint = points[i];
            } else {
                nextPoint = points[i];
                break;
            }
        }
        
        if (!prevPoint) return points[0].value;
        if (!nextPoint) return prevPoint.value;
        
        // Linear interpolation
        const t = (time - prevPoint.time) / (nextPoint.time - prevPoint.time);
        return prevPoint.value + t * (nextPoint.value - prevPoint.value);
    }

    clearAutomation(trackId, parameter) {
        const trackData = this.automationData.get(trackId);
        if (trackData && trackData[parameter]) {
            trackData[parameter] = [];
        }
    }
}

// Initialize when DOM is ready
let proToolsAutomation;
document.addEventListener('DOMContentLoaded', () => {
    proToolsAutomation = new ProToolsAutomation();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProToolsAutomation;
}
