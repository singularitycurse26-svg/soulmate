class SunoChatBar {
    constructor() {
        this.messages = [];
        this.commandHistory = [];
        this.historyIndex = -1;
        this.audioEngine = null;
        this.timeline = null;
        this.generationPanel = null;
        this.init();
    }

    init() {
        this.wireChatBar();
    }

    setAudioEngine(engine) {
        this.audioEngine = engine;
    }

    setTimeline(timeline) {
        this.timeline = timeline;
    }

    setGenerationPanel(panel) {
        this.generationPanel = panel;
    }

    wireChatBar() {
        document.addEventListener('DOMContentLoaded', () => {
            const input = document.getElementById('suno-chat-input');
            const sendBtn = document.getElementById('suno-chat-send');
            const history = document.getElementById('suno-chat-history');

            if (!input || !sendBtn) return;

            sendBtn.addEventListener('click', () => this.sendMessage());
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateHistory(-1);
                }
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateHistory(1);
                }
            });
        });
    }

    sendMessage() {
        const input = document.getElementById('suno-chat-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        this.commandHistory.push(text);
        this.historyIndex = this.commandHistory.length;

        this.addMessage('user', text);
        input.value = '';

        const response = this.parseCommand(text);
        this.addMessage('assistant', response.message);

        if (response.action) {
            response.action();
        }
    }

    navigateHistory(direction) {
        const input = document.getElementById('suno-chat-input');
        if (!input) return;
        this.historyIndex += direction;
        if (this.historyIndex < 0) this.historyIndex = 0;
        if (this.historyIndex >= this.commandHistory.length) {
            this.historyIndex = this.commandHistory.length;
            input.value = '';
            return;
        }
        input.value = this.commandHistory[this.historyIndex] || '';
    }

    addMessage(role, text) {
        this.messages.push({ role, text, timestamp: Date.now() });
        const history = document.getElementById('suno-chat-history');
        if (!history) return;

        const msgEl = document.createElement('div');
        msgEl.className = `suno-chat-msg suno-chat-${role}`;
        msgEl.innerHTML = `<div class="suno-chat-msg-role">${role === 'user' ? 'You' : 'Studio'}</div><div class="suno-chat-msg-text">${this.escapeHtml(text)}</div>`;
        history.appendChild(msgEl);
        history.scrollTop = history.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    parseCommand(text) {
        const lower = text.toLowerCase();

        if (lower.startsWith('generate') || lower.startsWith('create')) {
            return this.handleGenerate(text);
        }
        if (lower.includes('arrange') || lower.includes('move')) {
            return this.handleArrange(text);
        }
        if (lower.includes('plugin') || lower.includes('effect')) {
            return this.handlePluginDesign(text);
        }
        if (lower.includes('rename')) {
            return this.handleRename(text);
        }
        if (lower.includes('tidy') || lower.includes('clean')) {
            return this.handleTidy();
        }
        if (lower.includes('split stems') || lower.includes('stem separation')) {
            return this.handleStemSeparation();
        }
        if (lower.includes('add track')) {
            return this.handleAddTrack(text);
        }
        if (lower.includes('tempo') || lower.includes('bpm')) {
            return this.handleTempo(text);
        }
        if (lower.includes('export')) {
            return this.handleExport(text);
        }
        if (lower.includes('help')) {
            return {
                message: 'Commands: generate [description], arrange, create plugin [description], rename [track] to [name], tidy, split stems, add track [name], tempo [bpm], export'
            };
        }

        return {
            message: `I heard "${text}". Try: generate, arrange, create plugin, rename, tidy, split stems, add track, tempo, export, or help.`
        };
    }

    handleGenerate(text) {
        const prompt = text.replace(/^(generate|create)\s+/i, '');
        if (this.generationPanel) {
            return {
                message: `Generating audio from: "${prompt}". Creating new stems on timeline...`,
                action: () => {
                    this.generationPanel.generateFromPrompt(prompt);
                }
            };
        }
        return { message: 'Generation panel not available. Open the Generation window first.' };
    }

    handleArrange(text) {
        return { message: 'Arrangement mode activated. Use the timeline to drag clips into position.' };
    }

    handlePluginDesign(text) {
        const desc = text.replace(/.*plugin\s*/i, '').replace(/.*effect\s*/i, '');
        return {
            message: `Designing custom plugin: "${desc}". The effect will appear in your Effects Rack library.`,
            action: () => {
                this.createCustomPlugin(desc);
            }
        };
    }

    createCustomPlugin(description) {
        const customPlugins = JSON.parse(localStorage.getItem('suno-custom-plugins') || '[]');
        const plugin = {
            id: Date.now().toString(),
            name: description.substring(0, 40),
            description: description,
            created: Date.now()
        };
        customPlugins.push(plugin);
        localStorage.setItem('suno-custom-plugins', JSON.stringify(customPlugins));
    }

    handleRename(text) {
        const match = text.match(/rename\s+(.+?)\s+to\s+(.+)/i);
        if (match && this.audioEngine) {
            const oldName = match[1].trim();
            const newName = match[2].trim();
            const track = this.audioEngine.tracks.find(t =>
                t.name.toLowerCase() === oldName.toLowerCase()
            );
            if (track) {
                track.name = newName;
                return { message: `Renamed "${oldName}" to "${newName}".` };
            }
        }
        return { message: 'Could not find track to rename. Usage: rename [old name] to [new name]' };
    }

    handleTidy() {
        return { message: 'Tidying session: removing empty tracks, consolidating clips, and cleaning up.' };
    }

    handleStemSeparation() {
        return {
            message: 'Opening stem separator. Drop an audio file to split into vocals, drums, bass, and more.',
            action: () => {
                const stemWindow = document.getElementById('suno-stem-separator');
                if (stemWindow) {
                    document.querySelectorAll('.program-window').forEach(w => w.classList.remove('active'));
                    stemWindow.classList.add('active');
                }
            }
        };
    }

    handleAddTrack(text) {
        const match = text.match(/add track\s+(.+)/i);
        const name = match ? match[1].trim() : `Track ${this.audioEngine ? this.audioEngine.tracks.length + 1 : 1}`;
        if (this.audioEngine) {
            this.audioEngine.createTrack(name, 'audio');
            return { message: `Added new track: "${name}".` };
        }
        return { message: 'Audio engine not available.' };
    }

    handleTempo(text) {
        const match = text.match(/(\d+)\s*bpm|tempo\s+(\d+)/i);
        const bpm = match ? parseInt(match[1] || match[2]) : null;
        if (bpm && this.audioEngine) {
            this.audioEngine.setBPM(bpm);
            return { message: `Tempo set to ${bpm} BPM.` };
        }
        return { message: 'Usage: tempo [number] or [number] bpm' };
    }

    handleExport(text) {
        return {
            message: 'Opening export panel. Select format and options.',
            action: () => {
                const exportWindow = document.getElementById('suno-export-panel');
                if (exportWindow) {
                    document.querySelectorAll('.program-window').forEach(w => w.classList.remove('active'));
                    exportWindow.classList.add('active');
                }
            }
        };
    }

    getMessageHistory() {
        return this.messages;
    }

    clearHistory() {
        this.messages = [];
        const history = document.getElementById('suno-chat-history');
        if (history) history.innerHTML = '';
    }
}

const sunoChatBar = new SunoChatBar();
