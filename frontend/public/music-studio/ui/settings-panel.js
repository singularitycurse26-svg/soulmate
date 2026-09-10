// Settings panel for Music Studio Pro

class SettingsPanel {
    constructor() {
        this.panel = document.getElementById('settings-panel');
        this.settings = null;
        this.currentTab = 'audio';
        
        this.init();
    }

    async init() {
        // Load settings from storage
        this.settings = await FileUtils.loadSettings();
        
        // Tab buttons
        document.querySelectorAll('.settings-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });
        
        // Save button
        document.getElementById('settings-save').addEventListener('click', () => {
            this.saveSettings();
        });
        
        // Reset button
        document.getElementById('settings-reset').addEventListener('click', () => {
            this.resetSettings();
        });
        
        // Load initial tab
        this.switchTab('audio');
    }

    switchTab(tab) {
        this.currentTab = tab;
        
        // Update tab buttons
        document.querySelectorAll('.settings-tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
            }
        });
        
        // Render tab content
        this.renderTabContent(tab);
    }

    renderTabContent(tab) {
        const content = document.getElementById('settings-content');
        
        switch (tab) {
            case 'audio':
                content.innerHTML = this.renderAudioSettings();
                break;
            case 'protools':
                content.innerHTML = this.renderProToolsSettings();
                break;
            case 'autotune':
                content.innerHTML = this.renderAutoTuneSettings();
                break;
            case 'acid':
                content.innerHTML = this.renderAcidSettings();
                break;
            case 'suno':
                content.innerHTML = this.renderSunoSettings();
                break;
            case 'project':
                content.innerHTML = this.renderProjectSettings();
                break;
            case 'ui':
                content.innerHTML = this.renderUISettings();
                break;
            case 'export':
                content.innerHTML = this.renderExportSettings();
                break;
            case 'midi':
                content.innerHTML = this.renderMidiSettings();
                break;
            case 'performance':
                content.innerHTML = this.renderPerformanceSettings();
                break;
        }
        
        // Wire up controls
        this.wireControls(tab);
    }

    renderAudioSettings() {
        const audio = this.settings.audio;
        return `
            <div class="settings-section">
                <h4>Audio Device</h4>
                <div class="settings-group">
                    <label>Sample Rate</label>
                    <select id="setting-audio-sampleRate">
                        <option value="44100" ${audio.sampleRate === 44100 ? 'selected' : ''}>44100 Hz</option>
                        <option value="48000" ${audio.sampleRate === 48000 ? 'selected' : ''}>48000 Hz</option>
                        <option value="96000" ${audio.sampleRate === 96000 ? 'selected' : ''}>96000 Hz</option>
                        <option value="192000" ${audio.sampleRate === 192000 ? 'selected' : ''}>192000 Hz</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Buffer Size</label>
                    <select id="setting-audio-bufferSize">
                        <option value="64" ${audio.bufferSize === 64 ? 'selected' : ''}>64 samples</option>
                        <option value="128" ${audio.bufferSize === 128 ? 'selected' : ''}>128 samples</option>
                        <option value="256" ${audio.bufferSize === 256 ? 'selected' : ''}>256 samples</option>
                        <option value="512" ${audio.bufferSize === 512 ? 'selected' : ''}>512 samples</option>
                        <option value="1024" ${audio.bufferSize === 1024 ? 'selected' : ''}>1024 samples</option>
                        <option value="2048" ${audio.bufferSize === 2048 ? 'selected' : ''}>2048 samples</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Bit Depth</label>
                    <select id="setting-audio-bitDepth">
                        <option value="16" ${audio.bitDepth === 16 ? 'selected' : ''}>16-bit</option>
                        <option value="24" ${audio.bitDepth === 24 ? 'selected' : ''}>24-bit</option>
                        <option value="32" ${audio.bitDepth === 32 ? 'selected' : ''}>32-bit float</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Latency Compensation</label>
                    <select id="setting-audio-latencyCompensation">
                        <option value="true" ${audio.latencyCompensation ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!audio.latencyCompensation ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
        `;
    }

    renderProToolsSettings() {
        const pt = this.settings.protools;
        return `
            <div class="settings-section">
                <h4>Edit Window</h4>
                <div class="settings-group">
                    <label>Edit Mode</label>
                    <select id="setting-pt-editMode">
                        <option value="shuffle" ${pt.editMode === 'shuffle' ? 'selected' : ''}>Shuffle</option>
                        <option value="slip" ${pt.editMode === 'slip' ? 'selected' : ''}>Slip</option>
                        <option value="spot" ${pt.editMode === 'spot' ? 'selected' : ''}>Spot</option>
                        <option value="grid" ${pt.editMode === 'grid' ? 'selected' : ''}>Grid</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Grid Value</label>
                    <select id="setting-pt-gridValue">
                        <option value="1" ${pt.gridValue === 1 ? 'selected' : ''}>1 Bar</option>
                        <option value="0.5" ${pt.gridValue === 0.5 ? 'selected' : ''}>1/2 Bar</option>
                        <option value="0.25" ${pt.gridValue === 0.25 ? 'selected' : ''}>1/4 Bar</option>
                        <option value="0.125" ${pt.gridValue === 0.125 ? 'selected' : ''}>1/8 Bar</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Link Timeline and Edit Selection</label>
                    <select id="setting-pt-linkTimeline">
                        <option value="true" ${pt.linkTimeline ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.linkTimeline ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Link Track and Edit Selection</label>
                    <select id="setting-pt-linkTrack">
                        <option value="true" ${pt.linkTrack ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.linkTrack ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Tab to Transient</label>
                    <select id="setting-pt-tabToTransient">
                        <option value="true" ${pt.tabToTransient ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.tabToTransient ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Elastic Audio</h4>
                <div class="settings-group">
                    <label>Default Algorithm</label>
                    <select id="setting-pt-elasticAudio">
                        <option value="off" ${pt.elasticAudio === 'off' ? 'selected' : ''}>Off</option>
                        <option value="polyphonic" ${pt.elasticAudio === 'polyphonic' ? 'selected' : ''}>Polyphonic</option>
                        <option value="rhythmic" ${pt.elasticAudio === 'rhythmic' ? 'selected' : ''}>Rhythmic</option>
                        <option value="monophonic" ${pt.elasticAudio === 'monophonic' ? 'selected' : ''}>Monophonic</option>
                        <option value="varispeed" ${pt.elasticAudio === 'varispeed' ? 'selected' : ''}>Varispeed</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>ARA Auto-Analyze</label>
                    <select id="setting-pt-araAutoAnalyze">
                        <option value="true" ${pt.araAutoAnalyze ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.araAutoAnalyze ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>MIDI</h4>
                <div class="settings-group">
                    <label>MIDI Delay Compensation</label>
                    <select id="setting-pt-midiDelayCompensation">
                        <option value="true" ${pt.midiDelayCompensation ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.midiDelayCompensation ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Input Quantize</label>
                    <select id="setting-pt-inputQuantize">
                        <option value="true" ${pt.inputQuantize ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.inputQuantize ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Input Monitoring on Instrument Tracks</label>
                    <select id="setting-pt-midiInputMonitoring">
                        <option value="true" ${pt.midiInputMonitoring ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.midiInputMonitoring ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Transport</h4>
                <div class="settings-group">
                    <label>Pre-Roll (bars)</label>
                    <input type="number" id="setting-pt-preRoll" value="${pt.preRoll}" min="0" max="16">
                </div>
                <div class="settings-group">
                    <label>Post-Roll (bars)</label>
                    <input type="number" id="setting-pt-postRoll" value="${pt.postRoll}" min="0" max="16">
                </div>
                <div class="settings-group">
                    <label>Countoff (bars)</label>
                    <input type="number" id="setting-pt-countoff" value="${pt.countoff}" min="0" max="8">
                </div>
            </div>
            <div class="settings-section">
                <h4>Bounce / Export</h4>
                <div class="settings-group">
                    <label>Bounce Mode</label>
                    <select id="setting-pt-bounceMode">
                        <option value="offline" ${pt.bounceMode === 'offline' ? 'selected' : ''}>Offline (faster)</option>
                        <option value="online" ${pt.bounceMode === 'online' ? 'selected' : ''}>Online (real-time)</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Bounce Source</label>
                    <select id="setting-pt-bounceSource">
                        <option value="mainPlaylist" ${pt.bounceSource === 'mainPlaylist' ? 'selected' : ''}>Main Playlist</option>
                        <option value="allPlaylists" ${pt.bounceSource === 'allPlaylists' ? 'selected' : ''}>All Playlists</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Display</h4>
                <div class="settings-group">
                    <label>Track Color Coding</label>
                    <select id="setting-pt-trackColorCoding">
                        <option value="true" ${pt.trackColorCoding ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.trackColorCoding ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Show Tracks with Clips Only</label>
                    <select id="setting-pt-showTracksWithClipsOnly">
                        <option value="true" ${pt.showTracksWithClipsOnly ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.showTracksWithClipsOnly ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Show Lanes with Automation</label>
                    <select id="setting-pt-showLanesWithAutomation">
                        <option value="true" ${pt.showLanesWithAutomation ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.showLanesWithAutomation ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Detachable Clip List</label>
                    <select id="setting-pt-detachableClipList">
                        <option value="true" ${pt.detachableClipList ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.detachableClipList ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Marker Line Display</label>
                    <select id="setting-pt-markerLineDisplay">
                        <option value="true" ${pt.markerLineDisplay ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.markerLineDisplay ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Color in I/O Menus</label>
                    <select id="setting-pt-colorInIOMenus">
                        <option value="true" ${pt.colorInIOMenus ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.colorInIOMenus ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Audio</h4>
                <div class="settings-group">
                    <label>WASAPI Shared Mode</label>
                    <select id="setting-pt-wasapiSharedMode">
                        <option value="true" ${pt.wasapiSharedMode ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.wasapiSharedMode ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Keyboard Shortcuts Preset</label>
                    <select id="setting-pt-keyboardShortcutsPreset">
                        <option value="default" ${pt.keyboardShortcutsPreset === 'default' ? 'selected' : ''}>Default (Pro Tools)</option>
                        <option value="nuendo" ${pt.keyboardShortcutsPreset === 'nuendo' ? 'selected' : ''}>Nuendo</option>
                        <option value="cubase" ${pt.keyboardShortcutsPreset === 'cubase' ? 'selected' : ''}>Cubase</option>
                        <option value="logic" ${pt.keyboardShortcutsPreset === 'logic' ? 'selected' : ''}>Logic</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Dolby Atmos</h4>
                <div class="settings-group">
                    <label>Binaural Mode</label>
                    <select id="setting-pt-dolbyAtmosBinaural">
                        <option value="true" ${pt.dolbyAtmosBinaural ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!pt.dolbyAtmosBinaural ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Monitoring Format</label>
                    <select id="setting-pt-dolbyAtmosMonitoring">
                        <option value="2.0" ${pt.dolbyAtmosMonitoring === '2.0' ? 'selected' : ''}>2.0</option>
                        <option value="5.1" ${pt.dolbyAtmosMonitoring === '5.1' ? 'selected' : ''}>5.1</option>
                        <option value="7.1" ${pt.dolbyAtmosMonitoring === '7.1' ? 'selected' : ''}>7.1</option>
                        <option value="7.1.2" ${pt.dolbyAtmosMonitoring === '7.1.2' ? 'selected' : ''}>7.1.2</option>
                        <option value="9.1.4" ${pt.dolbyAtmosMonitoring === '9.1.4' ? 'selected' : ''}>9.1.4</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Atmos Group</label>
                    <select id="setting-pt-dolbyAtmosGroup">
                        <option value="none" ${pt.dolbyAtmosGroup === 'none' ? 'selected' : ''}>None</option>
                        <option value="music" ${pt.dolbyAtmosGroup === 'music' ? 'selected' : ''}>Music</option>
                        <option value="dialog" ${pt.dolbyAtmosGroup === 'dialog' ? 'selected' : ''}>Dialog</option>
                        <option value="effects" ${pt.dolbyAtmosGroup === 'effects' ? 'selected' : ''}>Effects</option>
                    </select>
                </div>
            </div>
        `;
    }

    renderAutoTuneSettings() {
        const at = this.settings.autotune;
        return `
            <div class="settings-section">
                <h4>Default Settings</h4>
                <div class="settings-group">
                    <label>Default Input Type</label>
                    <select id="setting-at-inputType">
                        <option value="tenor" ${at.inputType === 'tenor' ? 'selected' : ''}>Tenor</option>
                        <option value="alto" ${at.inputType === 'alto' ? 'selected' : ''}>Alto</option>
                        <option value="soprano" ${at.inputType === 'soprano' ? 'selected' : ''}>Soprano</option>
                        <option value="bass" ${at.inputType === 'bass' ? 'selected' : ''}>Bass</option>
                        <option value="instrument" ${at.inputType === 'instrument' ? 'selected' : ''}>Instrument</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Default Key</label>
                    <select id="setting-at-key">
                        ${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(note => 
                            `<option value="${note}" ${at.key === note ? 'selected' : ''}>${note}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="settings-group">
                    <label>Default Scale</label>
                    <select id="setting-at-scale">
                        <option value="chromatic" ${at.scale === 'chromatic' ? 'selected' : ''}>Chromatic</option>
                        <option value="major" ${at.scale === 'major' ? 'selected' : ''}>Major</option>
                        <option value="minor" ${at.scale === 'minor' ? 'selected' : ''}>Minor</option>
                        <option value="harmonic-minor" ${at.scale === 'harmonic-minor' ? 'selected' : ''}>Harmonic Minor</option>
                        <option value="pentatonic-major" ${at.scale === 'pentatonic-major' ? 'selected' : ''}>Pentatonic Major</option>
                        <option value="pentatonic-minor" ${at.scale === 'pentatonic-minor' ? 'selected' : ''}>Pentatonic Minor</option>
                        <option value="blues" ${at.scale === 'blues' ? 'selected' : ''}>Blues</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Default Retune Speed (ms)</label>
                    <input type="range" id="setting-at-retuneSpeed" min="0" max="100" value="${at.retuneSpeed}">
                    <span>${at.retuneSpeed} ms</span>
                </div>
                <div class="settings-group">
                    <label>Default Flex-Tune</label>
                    <input type="range" id="setting-at-flexTune" min="0" max="100" value="${at.flexTune}">
                    <span>${at.flexTune}</span>
                </div>
                <div class="settings-group">
                    <label>Default Humanize</label>
                    <input type="range" id="setting-at-humanize" min="0" max="100" value="${at.humanize}">
                    <span>${at.humanize}</span>
                </div>
            </div>
            <div class="settings-section">
                <h4>Mode Settings</h4>
                <div class="settings-group">
                    <label>Classic Mode</label>
                    <select id="setting-at-classicMode">
                        <option value="true" ${at.classicMode ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!at.classicMode ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Low Latency</label>
                    <select id="setting-at-lowLatency">
                        <option value="true" ${at.lowLatency ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!at.lowLatency ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Conform to Scale</label>
                    <select id="setting-at-conformToScale">
                        <option value="true" ${at.conformToScale ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!at.conformToScale ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Bypass</label>
                    <select id="setting-at-bypass">
                        <option value="true" ${at.bypass ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!at.bypass ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Harmony Player</h4>
                <div class="settings-group">
                    <label>Harmony Enabled</label>
                    <select id="setting-at-harmonyEnabled">
                        <option value="true" ${at.harmonyEnabled ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!at.harmonyEnabled ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Number of Voices</label>
                    <select id="setting-at-harmonyVoices">
                        <option value="1" ${at.harmonyVoices === 1 ? 'selected' : ''}>1 Voice</option>
                        <option value="2" ${at.harmonyVoices === 2 ? 'selected' : ''}>2 Voices</option>
                        <option value="3" ${at.harmonyVoices === 3 ? 'selected' : ''}>3 Voices</option>
                        <option value="4" ${at.harmonyVoices === 4 ? 'selected' : ''}>4 Voices</option>
                    </select>
                </div>
                ${at.harmonyInterval.map((interval, i) => `
                <div class="settings-group">
                    <label>Voice ${i + 1} Interval (semitones)</label>
                    <input type="range" id="setting-at-harmonyInterval-${i}" min="-24" max="24" value="${interval}">
                    <span>${interval} st</span>
                </div>
                <div class="settings-group">
                    <label>Voice ${i + 1} Mix</label>
                    <input type="range" id="setting-at-harmonyMix-${i}" min="0" max="100" value="${at.harmonyMix[i]}">
                    <span>${at.harmonyMix[i]}%</span>
                </div>
                <div class="settings-group">
                    <label>Voice ${i + 1} Pan</label>
                    <input type="range" id="setting-at-harmonyPan-${i}" min="-50" max="50" value="${at.harmonyPan[i]}">
                    <span>${at.harmonyPan[i]}</span>
                </div>
                `).join('')}
            </div>
            <div class="settings-section">
                <h4>I/O</h4>
                <div class="settings-group">
                    <label>Input Gain (dB)</label>
                    <input type="range" id="setting-at-inputGain" min="-24" max="24" value="${at.inputGain}">
                    <span>${at.inputGain} dB</span>
                </div>
                <div class="settings-group">
                    <label>Output Gain (dB)</label>
                    <input type="range" id="setting-at-outputGain" min="-24" max="24" value="${at.outputGain}">
                    <span>${at.outputGain} dB</span>
                </div>
                <div class="settings-group">
                    <label>Stereo Mode</label>
                    <select id="setting-at-stereoMode">
                        <option value="stereo" ${at.stereoMode === 'stereo' ? 'selected' : ''}>Stereo</option>
                        <option value="mono" ${at.stereoMode === 'mono' ? 'selected' : ''}>Mono</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Presets</h4>
                <div class="settings-group">
                    <label>Preset Category</label>
                    <select id="setting-at-presetCategory">
                        <option value="factory" ${at.presetCategory === 'factory' ? 'selected' : ''}>Factory</option>
                        <option value="artist" ${at.presetCategory === 'artist' ? 'selected' : ''}>Artist</option>
                        <option value="user" ${at.presetCategory === 'user' ? 'selected' : ''}>User</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Graph Mode</h4>
                <div class="settings-group">
                    <label>Zoom After Tracking</label>
                    <select id="setting-at-graphZoomAfterTracking">
                        <option value="fit" ${at.graphZoomAfterTracking === 'fit' ? 'selected' : ''}>Fit</option>
                        <option value="last" ${at.graphZoomAfterTracking === 'last' ? 'selected' : ''}>Last Used</option>
                        <option value="100" ${at.graphZoomAfterTracking === '100' ? 'selected' : ''}>100%</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Show Graph Toolbar</label>
                    <select id="setting-at-graphShowToolbar">
                        <option value="true" ${at.graphShowToolbar ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!at.graphShowToolbar ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Show Global Controls</label>
                    <select id="setting-at-graphShowGlobalControls">
                        <option value="true" ${at.graphShowGlobalControls ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!at.graphShowGlobalControls ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Clutch Scrolling</label>
                    <select id="setting-at-graphClutchScroll">
                        <option value="true" ${at.graphClutchScroll ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!at.graphClutchScroll ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
        `;
    }

    renderAcidSettings() {
        const acid = this.settings.acid;
        return `
            <div class="settings-section">
                <h4>Project Defaults</h4>
                <div class="settings-group">
                    <label>Default Tempo (BPM)</label>
                    <input type="number" id="setting-acid-tempo" value="${acid.tempo}" min="60" max="200">
                </div>
                <div class="settings-group">
                    <label>Default Time Signature</label>
                    <select id="setting-acid-timeSignature">
                        <option value="4/4" ${acid.timeSignature === '4/4' ? 'selected' : ''}>4/4</option>
                        <option value="3/4" ${acid.timeSignature === '3/4' ? 'selected' : ''}>3/4</option>
                        <option value="6/8" ${acid.timeSignature === '6/8' ? 'selected' : ''}>6/8</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Default Key</label>
                    <select id="setting-acid-key">
                        ${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(note => 
                            `<option value="${note}" ${acid.key === note ? 'selected' : ''}>${note}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Beatmapping</h4>
                <div class="settings-group">
                    <label>Stretch Method</label>
                    <select id="setting-acid-stretchMethod">
                        <option value="classic" ${acid.stretchMethod === 'classic' ? 'selected' : ''}>Classic</option>
                        <option value="elastique" ${acid.stretchMethod === 'elastique' ? 'selected' : ''}>Élastique</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Preserve Pitch When Stretching</label>
                    <select id="setting-acid-preservePitch">
                        <option value="true" ${acid.preservePitch ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.preservePitch ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Transient Sensitivity</label>
                    <input type="range" id="setting-acid-transientSensitivity" min="0" max="100" value="${acid.transientSensitivity}">
                    <span>${acid.transientSensitivity}</span>
                </div>
                <div class="settings-group">
                    <label>Timing Tightness</label>
                    <input type="range" id="setting-acid-timingTightness" min="0" max="100" value="${acid.timingTightness}">
                    <span>${acid.timingTightness}</span>
                </div>
            </div>
            <div class="settings-section">
                <h4>Chopper</h4>
                <div class="settings-group">
                    <label>MIDI Playable Chopper</label>
                    <select id="setting-acid-midiPlayableChopper">
                        <option value="true" ${acid.midiPlayableChopper ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.midiPlayableChopper ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>MIDI Channel</label>
                    <input type="number" id="setting-acid-chopperMidiChannel" value="${acid.chopperMidiChannel}" min="1" max="16">
                </div>
            </div>
            <div class="settings-section">
                <h4>Morph Pads</h4>
                <div class="settings-group">
                    <label>Morph Pads Enabled</label>
                    <select id="setting-acid-morphPadEnabled">
                        <option value="true" ${acid.morphPadEnabled ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.morphPadEnabled ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Editing</h4>
                <div class="settings-group">
                    <label>Track Folders</label>
                    <select id="setting-acid-trackFolders">
                        <option value="true" ${acid.trackFolders ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.trackFolders ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Cluster Editing</label>
                    <select id="setting-acid-clusterEditing">
                        <option value="true" ${acid.clusterEditing ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.clusterEditing ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Audio Painting</label>
                    <select id="setting-acid-audioPainting">
                        <option value="true" ${acid.audioPainting ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.audioPainting ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Keyframe Automation</label>
                    <select id="setting-acid-keyframeAutomation">
                        <option value="true" ${acid.keyframeAutomation ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.keyframeAutomation ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Recording</h4>
                <div class="settings-group">
                    <label>Punch-In</label>
                    <select id="setting-acid-punchIn">
                        <option value="true" ${acid.punchIn ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.punchIn ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Punch-In Point (seconds)</label>
                    <input type="number" id="setting-acid-punchInPoint" value="${acid.punchInPoint}" min="0" step="0.1">
                </div>
                <div class="settings-group">
                    <label>Punch-Out</label>
                    <select id="setting-acid-punchOut">
                        <option value="true" ${acid.punchOut ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.punchOut ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Punch-Out Point (seconds)</label>
                    <input type="number" id="setting-acid-punchOutPoint" value="${acid.punchOutPoint}" min="0" step="0.1">
                </div>
                <div class="settings-group">
                    <label>Track Freeze</label>
                    <select id="setting-acid-trackFreeze">
                        <option value="true" ${acid.trackFreeze ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.trackFreeze ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Groove</h4>
                <div class="settings-group">
                    <label>Groove Extract</label>
                    <select id="setting-acid-grooveExtract">
                        <option value="true" ${acid.grooveExtract ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.grooveExtract ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Groove Template</label>
                    <select id="setting-acid-grooveTemplate">
                        <option value="default" ${acid.grooveTemplate === 'default' ? 'selected' : ''}>Default</option>
                        <option value="swing" ${acid.grooveTemplate === 'swing' ? 'selected' : ''}>Swing</option>
                        <option value="straight" ${acid.grooveTemplate === 'straight' ? 'selected' : ''}>Straight</option>
                        <option value="custom" ${acid.grooveTemplate === 'custom' ? 'selected' : ''}>Custom</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Loop</h4>
                <div class="settings-group">
                    <label>Loop Audition</label>
                    <select id="setting-acid-loopAudition">
                        <option value="true" ${acid.loopAudition ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.loopAudition ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Auto-Play on Select</label>
                    <select id="setting-acid-loopAuditionAutoPlay">
                        <option value="true" ${acid.loopAuditionAutoPlay ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.loopAuditionAutoPlay ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>VST</h4>
                <div class="settings-group">
                    <label>VST Scan Path</label>
                    <input type="text" id="setting-acid-vstScanPath" value="${acid.vstScanPath || ''}" placeholder="Default system path">
                </div>
                <div class="settings-group">
                    <label>VST Cache</label>
                    <select id="setting-acid-vstCache">
                        <option value="true" ${acid.vstCache ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.vstCache ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Routing</h4>
                <div class="settings-group">
                    <label>Bus Routing</label>
                    <select id="setting-acid-busRouting">
                        <option value="true" ${acid.busRouting ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.busRouting ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Submix Folders</label>
                    <select id="setting-acid-submixFolders">
                        <option value="true" ${acid.submixFolders ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.submixFolders ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Video Scoring</h4>
                <div class="settings-group">
                    <label>Video Scoring</label>
                    <select id="setting-acid-videoScoring">
                        <option value="true" ${acid.videoScoring ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.videoScoring ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Hit Point Markers</label>
                    <select id="setting-acid-hitPointMarkers">
                        <option value="true" ${acid.hitPointMarkers ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.hitPointMarkers ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Tempo Map Mode</label>
                    <select id="setting-acid-tempoMapMode">
                        <option value="true" ${acid.tempoMapMode ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!acid.tempoMapMode ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Mastering</h4>
                <div class="settings-group">
                    <label>Mastering Tool</label>
                    <select id="setting-acid-masteringTool">
                        <option value="none" ${acid.masteringTool === 'none' ? 'selected' : ''}>None</option>
                        <option value="ozone" ${acid.masteringTool === 'ozone' ? 'selected' : ''}>iZotope Ozone 11 Elements</option>
                        <option value="melodyne" ${acid.masteringTool === 'melodyne' ? 'selected' : ''}>Celemony Melodyne</option>
                    </select>
                </div>
            </div>
        `;
    }

    renderSunoSettings() {
        const suno = this.settings.suno || {};
        const gen = suno.generation || {};
        const midi = suno.midi || {};
        const synth = suno.synth || {};
        const automation = suno.automation || {};
        const stems = suno.stems || {};
        const exp = suno.export || {};
        const takeLanes = suno.takeLanes || {};
        const timeline = suno.timeline || {};

        return `
            <div class="settings-section">
                <h4>Generation</h4>
                <div class="settings-group">
                    <label>Model Version</label>
                    <select id="setting-suno-generation-modelVersion">
                        <option value="v6" ${gen.modelVersion === 'v6' ? 'selected' : ''}>Suno v6</option>
                        <option value="v5" ${gen.modelVersion === 'v5' ? 'selected' : ''}>Suno v5</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Lyrics Mode</label>
                    <select id="setting-suno-generation-lyricsMode">
                        <option value="auto" ${gen.lyricsMode === 'auto' ? 'selected' : ''}>Auto</option>
                        <option value="custom" ${gen.lyricsMode === 'custom' ? 'selected' : ''}>Custom</option>
                        <option value="instrumental" ${gen.lyricsMode === 'instrumental' ? 'selected' : ''}>Instrumental</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Prompt Temperature</label>
                    <input type="range" id="setting-suno-generation-promptTemperature" min="0" max="1" step="0.1" value="${gen.promptTemperature || 0.7}">
                    <span>${gen.promptTemperature || 0.7}</span>
                </div>
                <div class="settings-group">
                    <label>Default Seed (-1 = random)</label>
                    <input type="number" id="setting-suno-generation-seed" value="${gen.seed || -1}">
                </div>
            </div>
            <div class="settings-section">
                <h4>MIDI</h4>
                <div class="settings-group">
                    <label>Input Device</label>
                    <input type="text" id="setting-suno-midi-inputDevice" value="${midi.inputDevice || 'none'}" placeholder="none">
                </div>
                <div class="settings-group">
                    <label>MIDI Channel</label>
                    <input type="number" id="setting-suno-midi-channel" value="${midi.channel || 1}" min="1" max="16">
                </div>
                <div class="settings-group">
                    <label>Default Quantize</label>
                    <select id="setting-suno-midi-quantize">
                        <option value="1/4" ${midi.quantize === '1/4' ? 'selected' : ''}>1/4</option>
                        <option value="1/8" ${midi.quantize === '1/8' ? 'selected' : ''}>1/8</option>
                        <option value="1/16" ${midi.quantize === '1/16' ? 'selected' : ''}>1/16</option>
                        <option value="1/32" ${midi.quantize === '1/32' ? 'selected' : ''}>1/32</option>
                        <option value="off" ${midi.quantize === 'off' ? 'selected' : ''}>Off</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Latency Compensation (ms)</label>
                    <input type="number" id="setting-suno-midi-latencyCompensation" value="${midi.latencyCompensation || 0}" min="0" step="0.5">
                </div>
                <div class="settings-group">
                    <label>Musical Typing</label>
                    <select id="setting-suno-midi-musicalTypingEnabled">
                        <option value="true" ${midi.musicalTypingEnabled ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!midi.musicalTypingEnabled ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Synth Defaults</h4>
                <div class="settings-group">
                    <label>Default Filter Type</label>
                    <select id="setting-suno-synth-filterType">
                        <option value="lowpass" ${synth.filterType === 'lowpass' ? 'selected' : ''}>Lowpass</option>
                        <option value="highpass" ${synth.filterType === 'highpass' ? 'selected' : ''}>Highpass</option>
                        <option value="bandpass" ${synth.filterType === 'bandpass' ? 'selected' : ''}>Bandpass</option>
                        <option value="notch" ${synth.filterType === 'notch' ? 'selected' : ''}>Notch</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Default Filter Cutoff (Hz)</label>
                    <input type="number" id="setting-suno-synth-filterCutoff" value="${synth.filterCutoff || 2000}" min="20" max="20000">
                </div>
                <div class="settings-group">
                    <label>Default LFO Rate (Hz)</label>
                    <input type="range" id="setting-suno-synth-lfoRate" min="0" max="20" step="0.1" value="${synth.lfoRate || 4}">
                    <span>${synth.lfoRate || 4} Hz</span>
                </div>
            </div>
            <div class="settings-section">
                <h4>Automation</h4>
                <div class="settings-group">
                    <label>Record Mode</label>
                    <select id="setting-suno-automation-recordMode">
                        <option value="draw" ${automation.recordMode === 'draw' ? 'selected' : ''}>Draw</option>
                        <option value="live" ${automation.recordMode === 'live' ? 'selected' : ''}>Live Record</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Snap to Grid</label>
                    <select id="setting-suno-automation-snapToGrid">
                        <option value="true" ${automation.snapToGrid ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!automation.snapToGrid ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Curve Smoothing</label>
                    <select id="setting-suno-automation-curveSmoothing">
                        <option value="true" ${automation.curveSmoothing ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!automation.curveSmoothing ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Default Curve Type</label>
                    <select id="setting-suno-automation-curveType">
                        <option value="linear" ${automation.curveType === 'linear' ? 'selected' : ''}>Linear</option>
                        <option value="smooth" ${automation.curveType === 'smooth' ? 'selected' : ''}>Smooth</option>
                        <option value="stepped" ${automation.curveType === 'stepped' ? 'selected' : ''}>Stepped</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Stem Separation</h4>
                <div class="settings-group">
                    <label>Default Separation Type</label>
                    <select id="setting-suno-stems-separationType">
                        <option value="auto" ${stems.separationType === 'auto' ? 'selected' : ''}>Auto (Quick)</option>
                        <option value="mix" ${stems.separationType === 'mix' ? 'selected' : ''}>Split from Mix</option>
                        <option value="advanced" ${stems.separationType === 'advanced' ? 'selected' : ''}>Advanced Split</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Stem Count</label>
                    <input type="number" id="setting-suno-stems-stemCount" value="${stems.stemCount || 6}" min="2" max="12">
                </div>
            </div>
            <div class="settings-section">
                <h4>Export</h4>
                <div class="settings-group">
                    <label>Default Format</label>
                    <select id="setting-suno-export-format">
                        <option value="wav" ${exp.format === 'wav' ? 'selected' : ''}>WAV</option>
                        <option value="mp3" ${exp.format === 'mp3' ? 'selected' : ''}>MP3</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Default Bit Depth</label>
                    <select id="setting-suno-export-bitDepth">
                        <option value="16" ${exp.bitDepth === 16 ? 'selected' : ''}>16-bit</option>
                        <option value="24" ${exp.bitDepth === 24 ? 'selected' : ''}>24-bit</option>
                        <option value="32" ${exp.bitDepth === 32 ? 'selected' : ''}>32-bit float</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Default Sample Rate</label>
                    <select id="setting-suno-export-sampleRate">
                        <option value="44100" ${exp.sampleRate === 44100 ? 'selected' : ''}>44100 Hz</option>
                        <option value="48000" ${exp.sampleRate === 48000 ? 'selected' : ''}>48000 Hz</option>
                        <option value="96000" ${exp.sampleRate === 96000 ? 'selected' : ''}>96000 Hz</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Include MIDI by Default</label>
                    <select id="setting-suno-export-includeMIDI">
                        <option value="true" ${exp.includeMIDI ? 'selected' : ''}>Yes</option>
                        <option value="false" ${!exp.includeMIDI ? 'selected' : ''}>No</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Take Lanes</h4>
                <div class="settings-group">
                    <label>Alternates Per Clip</label>
                    <input type="number" id="setting-suno-takeLanes-alternatesPerClip" value="${takeLanes.alternatesPerClip || 2}" min="1" max="8">
                </div>
                <div class="settings-group">
                    <label>Auto-Audition</label>
                    <select id="setting-suno-takeLanes-autoAudition">
                        <option value="true" ${takeLanes.autoAudition ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!takeLanes.autoAudition ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Timeline</h4>
                <div class="settings-group">
                    <label>Follow Playhead</label>
                    <select id="setting-suno-timeline-followPlayhead">
                        <option value="true" ${timeline.followPlayhead ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!timeline.followPlayhead ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Metronome</label>
                    <select id="setting-suno-timeline-metronome">
                        <option value="true" ${timeline.metronome ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!timeline.metronome ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Warp Markers</label>
                    <select id="setting-suno-timeline-warpMarkers">
                        <option value="true" ${timeline.warpMarkers ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!timeline.warpMarkers ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
        `;
    }

    renderProjectSettings() {
        const project = this.settings.project;
        return `
            <div class="settings-section">
                <h4>Auto-Save</h4>
                <div class="settings-group">
                    <label>Auto-Save Interval (seconds)</label>
                    <input type="number" id="setting-project-autoSaveInterval" value="${project.autoSaveInterval}" min="30" max="3600">
                </div>
            </div>
            <div class="settings-section">
                <h4>History</h4>
                <div class="settings-group">
                    <label>Undo History Limit</label>
                    <input type="number" id="setting-project-undoHistoryLimit" value="${project.undoHistoryLimit}" min="10" max="200">
                </div>
            </div>
            <div class="settings-section">
                <h4>Project Location</h4>
                <div class="settings-group">
                    <label>Default Project Location</label>
                    <input type="text" id="setting-project-defaultLocation" value="${project.defaultLocation || ''}" placeholder="Not set">
                </div>
            </div>
        `;
    }

    renderUISettings() {
        const ui = this.settings.ui;
        return `
            <div class="settings-section">
                <h4>Appearance</h4>
                <div class="settings-group">
                    <label>Theme</label>
                    <select id="setting-ui-theme">
                        <option value="dark" ${ui.theme === 'dark' ? 'selected' : ''}>Dark</option>
                        <option value="light" ${ui.theme === 'light' ? 'selected' : ''}>Light</option>
                        <option value="custom" ${ui.theme === 'custom' ? 'selected' : ''}>Custom</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Color Scheme</label>
                    <select id="setting-ui-colorScheme">
                        <option value="default" ${ui.colorScheme === 'default' ? 'selected' : ''}>Default</option>
                        <option value="blue" ${ui.colorScheme === 'blue' ? 'selected' : ''}>Blue</option>
                        <option value="green" ${ui.colorScheme === 'green' ? 'selected' : ''}>Green</option>
                        <option value="purple" ${ui.colorScheme === 'purple' ? 'selected' : ''}>Purple</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Font Size (px)</label>
                    <input type="number" id="setting-ui-fontSize" value="${ui.fontSize}" min="10" max="24">
                </div>
            </div>
            <div class="settings-section">
                <h4>Display</h4>
                <div class="settings-group">
                    <label>Display Scaling</label>
                    <input type="range" id="setting-ui-displayScaling" min="0.5" max="2" step="0.1" value="${ui.displayScaling}">
                    <span>${ui.displayScaling}x</span>
                </div>
                <div class="settings-group">
                    <label>High DPI Support</label>
                    <select id="setting-ui-highDPI">
                        <option value="true" ${ui.highDPI ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!ui.highDPI ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
        `;
    }

    renderExportSettings() {
        const export_ = this.settings.export;
        return `
            <div class="settings-section">
                <h4>Format</h4>
                <div class="settings-group">
                    <label>Export Format</label>
                    <select id="setting-export-format">
                        <option value="wav" ${export_.format === 'wav' ? 'selected' : ''}>WAV</option>
                        <option value="mp3" ${export_.format === 'mp3' ? 'selected' : ''}>MP3</option>
                        <option value="flac" ${export_.format === 'flac' ? 'selected' : ''}>FLAC</option>
                        <option value="ogg" ${export_.format === 'ogg' ? 'selected' : ''}>OGG</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Sample Rate</label>
                    <select id="setting-export-sampleRate">
                        <option value="44100" ${export_.sampleRate === 44100 ? 'selected' : ''}>44100 Hz</option>
                        <option value="48000" ${export_.sampleRate === 48000 ? 'selected' : ''}>48000 Hz</option>
                        <option value="96000" ${export_.sampleRate === 96000 ? 'selected' : ''}>96000 Hz</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Bit Depth</label>
                    <select id="setting-export-bitDepth">
                        <option value="16" ${export_.bitDepth === 16 ? 'selected' : ''}>16-bit</option>
                        <option value="24" ${export_.bitDepth === 24 ? 'selected' : ''}>24-bit</option>
                        <option value="32" ${export_.bitDepth === 32 ? 'selected' : ''}>32-bit</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Quality</h4>
                <div class="settings-group">
                    <label>Quality</label>
                    <select id="setting-export-quality">
                        <option value="low" ${export_.quality === 'low' ? 'selected' : ''}>Low</option>
                        <option value="medium" ${export_.quality === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="high" ${export_.quality === 'high' ? 'selected' : ''}>High</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Dithering</label>
                    <select id="setting-export-dithering">
                        <option value="true" ${export_.dithering ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!export_.dithering ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
        `;
    }

    renderMidiSettings() {
        const midi = this.settings.midi;
        return `
            <div class="settings-section">
                <h4>MIDI Clock</h4>
                <div class="settings-group">
                    <label>MIDI Clock Sync</label>
                    <select id="setting-midi-clockSync">
                        <option value="true" ${midi.clockSync ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!midi.clockSync ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Input Devices</h4>
                <div class="settings-group">
                    <label>Available MIDI Input Devices</label>
                    <select id="setting-midi-inputDevices" multiple>
                        <option>No devices detected</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h4>Output Devices</h4>
                <div class="settings-group">
                    <label>Available MIDI Output Devices</label>
                    <select id="setting-midi-outputDevices" multiple>
                        <option>No devices detected</option>
                    </select>
                </div>
            </div>
        `;
    }

    renderPerformanceSettings() {
        const perf = this.settings.performance;
        return `
            <div class="settings-section">
                <h4>CPU</h4>
                <div class="settings-group">
                    <label>CPU Usage Limit (%)</label>
                    <input type="range" id="setting-perf-cpuLimit" min="50" max="100" value="${perf.cpuLimit}">
                    <span>${perf.cpuLimit}%</span>
                </div>
            </div>
            <div class="settings-section">
                <h4>Optimization</h4>
                <div class="settings-group">
                    <label>Disk Optimization</label>
                    <select id="setting-perf-diskOptimization">
                        <option value="true" ${perf.diskOptimization ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!perf.diskOptimization ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Memory Management</label>
                    <select id="setting-perf-memoryManagement">
                        <option value="true" ${perf.memoryManagement ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!perf.memoryManagement ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>GPU Acceleration</label>
                    <select id="setting-perf-gpuAcceleration">
                        <option value="true" ${perf.gpuAcceleration ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!perf.gpuAcceleration ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label>Multicore Processing</label>
                    <select id="setting-perf-multicoreProcessing">
                        <option value="true" ${perf.multicoreProcessing ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!perf.multicoreProcessing ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            </div>
        `;
    }

    wireControls(tab) {
        const inputs = document.querySelectorAll(`#settings-content input, #settings-content select`);
        inputs.forEach(input => {
            const evt = input.type === 'range' ? 'input' : 'change';
            input.addEventListener(evt, (e) => {
                this.updateSettingFromInput(e.target);
                const span = e.target.nextElementSibling;
                if (span && span.tagName === 'SPAN') {
                    if (input.type === 'range') {
                        if (input.id.includes('harmonyInterval')) span.textContent = input.value + ' st';
                        else if (input.id.includes('harmonyMix')) span.textContent = input.value + '%';
                        else if (input.id.includes('Gain')) span.textContent = input.value + ' dB';
                        else span.textContent = input.value;
                    }
                }
            });
        });
    }

    updateSettingFromInput(input) {
        const id = input.id;
        const value = input.type === 'checkbox' ? input.checked : input.value;
        
        const arrayMatch = id.match(/^setting-(\w+)-(harmonyInterval|harmonyMix|harmonyPan)-(\d+)$/);
        if (arrayMatch) {
            const category = arrayMatch[1];
            const key = arrayMatch[2];
            const idx = parseInt(arrayMatch[3]);
            if (this.settings[category] && this.settings[category][key]) {
                this.settings[category][key][idx] = parseFloat(value);
            }
            return;
        }
        
        const nestedMatch = id.match(/^setting-suno-(\w+)-(\w+)$/);
        if (nestedMatch) {
            const subCategory = nestedMatch[1];
            const key = nestedMatch[2];
            if (this.settings.suno && this.settings.suno[subCategory]) {
                if (input.type === 'number' || input.type === 'range') {
                    this.settings.suno[subCategory][key] = parseFloat(value);
                } else if (input.type === 'checkbox' || value === 'true' || value === 'false') {
                    this.settings.suno[subCategory][key] = value === 'true';
                } else {
                    this.settings.suno[subCategory][key] = value;
                }
            }
            return;
        }

        const match = id.match(/^setting-(\w+)-(\w+)$/);
        if (match) {
            const category = match[1];
            const key = match[2];
            
            if (this.settings[category]) {
                if (input.type === 'number' || input.type === 'range') {
                    this.settings[category][key] = parseFloat(value);
                } else if (input.type === 'checkbox' || value === 'true' || value === 'false') {
                    this.settings[category][key] = value === 'true';
                } else {
                    this.settings[category][key] = value;
                }
            }
        }
    }

    saveSettings() {
        // Collect all current values from inputs
        const inputs = document.querySelectorAll(`#settings-content input, #settings-content select`);
        inputs.forEach(input => {
            this.updateSettingFromInput(input);
        });
        
        // Save to storage
        FileUtils.saveSettings(this.settings);
        
        // Update status
        document.getElementById('statusText').textContent = 'Settings saved';
        
        // Close panel
        this.panel.classList.remove('active');
    }

    resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            this.settings = FileUtils.getDefaultSettings();
            this.renderTabContent(this.currentTab);
            document.getElementById('statusText').textContent = 'Settings reset to defaults';
        }
    }

    getSettings() {
        return this.settings;
    }
}

// Initialize when DOM is ready
let settingsPanel;
document.addEventListener('DOMContentLoaded', () => {
    settingsPanel = new SettingsPanel();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsPanel;
}
