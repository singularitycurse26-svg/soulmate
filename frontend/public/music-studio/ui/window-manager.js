// Window manager for Music Studio Pro

class WindowManager {
    constructor() {
        this.windows = new Map();
        this.activeWindow = null;
        this.zIndex = 100;
        
        this.init();
    }

    init() {
        // Initialize all program windows
        document.querySelectorAll('.program-window').forEach(window => {
            const id = window.id;
            this.windows.set(id, {
                element: window,
                minimized: false,
                maximized: false,
                position: { x: 0, y: 0 },
                size: { width: null, height: null }
            });
            
            // Window control buttons
            const minimizeBtn = window.querySelector('[data-action="minimize"]');
            const maximizeBtn = window.querySelector('[data-action="maximize"]');
            const closeBtn = window.querySelector('[data-action="close"]');
            
            if (minimizeBtn) {
                minimizeBtn.addEventListener('click', () => this.minimizeWindow(id));
            }
            if (maximizeBtn) {
                maximizeBtn.addEventListener('click', () => this.maximizeWindow(id));
            }
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeWindow(id));
            }
        });
        
        // Set initial active window
        const initialActive = document.querySelector('.program-window.active');
        if (initialActive) {
            this.activeWindow = initialActive.id;
        }
    }

    activateWindow(windowId) {
        // Deactivate all windows
        document.querySelectorAll('.program-window').forEach(w => {
            w.classList.remove('active');
        });
        
        // Activate specified window
        const window = document.getElementById(windowId);
        if (window) {
            window.classList.add('active');
            this.activeWindow = windowId;
            this.bringToFront(windowId);
        }
    }

    minimizeWindow(windowId) {
        const windowData = this.windows.get(windowId);
        if (windowData) {
            windowData.minimized = true;
            windowData.element.style.display = 'none';
        }
    }

    maximizeWindow(windowId) {
        const windowData = this.windows.get(windowId);
        if (windowData) {
            if (windowData.maximized) {
                // Restore
                windowData.maximized = false;
                windowData.element.style.position = '';
                windowData.element.style.top = '';
                windowData.element.style.left = '';
                windowData.element.style.width = '';
                windowData.element.style.height = '';
            } else {
                // Maximize
                windowData.maximized = true;
                windowData.element.style.position = 'fixed';
                windowData.element.style.top = '0';
                windowData.element.style.left = '0';
                windowData.element.style.width = '100%';
                windowData.element.style.height = '100%';
                windowData.element.style.zIndex = ++this.zIndex;
            }
        }
    }

    closeWindow(windowId) {
        const windowData = this.windows.get(windowId);
        if (windowData) {
            windowData.element.classList.remove('active');
            
            // For settings panel, just hide it
            if (windowId === 'settings-panel') {
                windowData.element.classList.remove('active');
            }
        }
    }

    bringToFront(windowId) {
        const windowData = this.windows.get(windowId);
        if (windowData) {
            windowData.element.style.zIndex = ++this.zIndex;
        }
    }

    getActiveWindow() {
        return this.activeWindow;
    }

    isWindowMinimized(windowId) {
        const windowData = this.windows.get(windowId);
        return windowData ? windowData.minimized : false;
    }

    isWindowMaximized(windowId) {
        const windowData = this.windows.get(windowId);
        return windowData ? windowData.maximized : false;
    }
}

// Initialize when DOM is ready
let windowManager;
document.addEventListener('DOMContentLoaded', () => {
    windowManager = new WindowManager();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WindowManager;
}
