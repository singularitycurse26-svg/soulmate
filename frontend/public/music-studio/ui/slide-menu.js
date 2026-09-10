// Slide-out menu system for Music Studio Pro

class SlideMenu {
    constructor() {
        this.menu = document.getElementById('slideMenu');
        this.menuToggleBtn = document.getElementById('menuToggleBtn');
        this.closeMenuBtn = document.getElementById('closeMenuBtn');
        this.mainContent = document.getElementById('mainContent');
        this.isOpen = false;
        this.currentMode = 'protools';
        this.currentWindow = 'edit';
        this.currentAutoTuneMode = 'auto';
        this.currentAcidTool = 'timeline';
        this.currentSunoWindow = 'generation';
        
        this.init();
    }

    init() {
        this.menuToggleBtn.addEventListener('click', () => this.toggle());
        this.closeMenuBtn.addEventListener('click', () => this.close());
        
        // Mode buttons
        document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.switchMode(mode);
            });
        });
        
        // ProTools window buttons
        document.querySelectorAll('.menu-btn[data-window]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const window = e.target.dataset.window;
                this.switchProToolsWindow(window);
            });
        });
        
        // Auto-Tune mode buttons
        document.querySelectorAll('.menu-btn[data-autotune-mode]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.autotuneMode;
                this.switchAutoTuneMode(mode);
            });
        });
        
        // ACID tool buttons
        document.querySelectorAll('.menu-btn[data-acid-tool]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.target.dataset.acidTool;
                this.switchAcidTool(tool);
            });
        });
        
        // Suno window buttons
        document.querySelectorAll('.menu-btn[data-suno-window]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const window = e.target.dataset.sunoWindow;
                this.switchSunoWindow(window);
            });
        });
        
        // Settings button
        document.getElementById('openSettingsBtn').addEventListener('click', () => {
            this.openSettings();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
            if (e.ctrlKey && e.key === ',') {
                e.preventDefault();
                this.openSettings();
            }
        });
        
        // Click outside to close
        document.addEventListener('click', (e) => {
            if (this.isOpen && 
                !this.menu.contains(e.target) && 
                !this.menuToggleBtn.contains(e.target)) {
                this.close();
            }
        });
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.menu.classList.add('open');
        this.mainContent.classList.add('menu-open');
        this.isOpen = true;
    }

    close() {
        this.menu.classList.remove('open');
        this.mainContent.classList.remove('menu-open');
        this.isOpen = false;
    }

    switchMode(mode) {
        this.currentMode = mode;
        
        // Update active state
        document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            }
        });
        
        // Show appropriate window
        this.hideAllWindows();
        
        switch (mode) {
            case 'protools':
                this.showWindow('protools-edit-window');
                break;
            case 'autotune':
                this.showWindow('autotune-auto-mode');
                break;
            case 'acid':
                this.showWindow('acid-timeline');
                break;
            case 'suno':
                this.showWindow('suno-generation');
                break;
        }
        
        this.updateStatus(`Switched to ${mode.toUpperCase()} mode`);
    }

    switchProToolsWindow(window) {
        this.currentWindow = window;
        this.currentMode = 'protools';
        
        // Update mode button
        document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === 'protools') {
                btn.classList.add('active');
            }
        });
        
        // Update window button
        document.querySelectorAll('.menu-btn[data-window]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.window === window) {
                btn.classList.add('active');
            }
        });
        
        this.hideAllWindows();
        
        switch (window) {
            case 'edit':
                this.showWindow('protools-edit-window');
                break;
            case 'mix':
                this.showWindow('protools-mix-window');
                break;
            case 'transport':
                this.showWindow('protools-transport');
                break;
        }
        
        this.updateStatus(`ProTools: ${window.charAt(0).toUpperCase() + window.slice(1)} Window`);
    }

    switchAutoTuneMode(mode) {
        this.currentAutoTuneMode = mode;
        this.currentMode = 'autotune';
        
        // Update mode button
        document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === 'autotune') {
                btn.classList.add('active');
            }
        });
        
        // Update mode button
        document.querySelectorAll('.menu-btn[data-autotune-mode]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.autotuneMode === mode) {
                btn.classList.add('active');
            }
        });
        
        this.hideAllWindows();
        
        switch (mode) {
            case 'auto':
                this.showWindow('autotune-auto-mode');
                break;
            case 'graph':
                this.showWindow('autotune-graph-mode');
                break;
        }
        
        this.updateStatus(`Auto-Tune: ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode`);
    }

    switchAcidTool(tool) {
        this.currentAcidTool = tool;
        this.currentMode = 'acid';
        
        // Update mode button
        document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === 'acid') {
                btn.classList.add('active');
            }
        });
        
        // Update tool button
        document.querySelectorAll('.menu-btn[data-acid-tool]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.acidTool === tool) {
                btn.classList.add('active');
            }
        });
        
        this.hideAllWindows();
        
        switch (tool) {
            case 'timeline':
                this.showWindow('acid-timeline');
                break;
            case 'chopper':
                this.showWindow('acid-chopper');
                break;
            case 'explorer':
                this.showWindow('acid-explorer');
                break;
            case 'morph-pads':
                this.showWindow('acid-morph-pads');
                break;
            case 'mixing':
                this.showWindow('acid-mixing');
                break;
        }
        
        this.updateStatus(`ACID Pro: ${tool.charAt(0).toUpperCase() + tool.slice(1)}`);
    }

    switchSunoWindow(window) {
        this.currentSunoWindow = window;
        this.currentMode = 'suno';
        
        // Update mode button
        document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === 'suno') {
                btn.classList.add('active');
            }
        });
        
        // Update window button
        document.querySelectorAll('.menu-btn[data-suno-window]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.sunoWindow === window) {
                btn.classList.add('active');
            }
        });
        
        this.hideAllWindows();
        
        const windowMap = {
            'generation': 'suno-generation',
            'timeline': 'suno-timeline',
            'piano-roll': 'suno-piano-roll',
            'synth': 'suno-synth',
            'effects': 'suno-effects',
            'automation': 'suno-automation',
            'stems': 'suno-stem-separator',
            'export': 'suno-export-panel'
        };
        
        const windowId = windowMap[window];
        if (windowId) {
            this.showWindow(windowId);
        }
        
        this.updateStatus(`Suno Studio: ${window.charAt(0).toUpperCase() + window.slice(1)}`);
    }

    hideAllWindows() {
        document.querySelectorAll('.program-window').forEach(window => {
            window.classList.remove('active');
        });
        
        // Hide transport window separately (it's floating)
        document.getElementById('protools-transport').classList.remove('active');
    }

    showWindow(windowId) {
        const window = document.getElementById(windowId);
        if (window) {
            window.classList.add('active');
        }
        
        // Show transport for ProTools
        if (this.currentMode === 'protools') {
            document.getElementById('protools-transport').classList.add('active');
        }
    }

    openSettings() {
        const settingsPanel = document.getElementById('settings-panel');
        settingsPanel.classList.add('active');
        this.close();
        this.updateStatus('Settings opened');
    }

    updateStatus(message) {
        const statusText = document.getElementById('statusText');
        if (statusText) {
            statusText.textContent = message;
        }
    }

    getCurrentMode() {
        return this.currentMode;
    }

    getCurrentWindow() {
        return this.currentWindow;
    }

    getCurrentAutoTuneMode() {
        return this.currentAutoTuneMode;
    }

    getCurrentAcidTool() {
        return this.currentAcidTool;
    }

    getCurrentSunoWindow() {
        return this.currentSunoWindow;
    }
}

// Initialize when DOM is ready
let slideMenu;
document.addEventListener('DOMContentLoaded', () => {
    slideMenu = new SlideMenu();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SlideMenu;
}
