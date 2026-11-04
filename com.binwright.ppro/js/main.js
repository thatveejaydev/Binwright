/**
 * Binwright Premiere Pro CEP Panel - Main Controller
 */

(function() {
    'use strict';

    // Bridge interfaces
    const bridge = window.Binwright.createPremiereBridge(new CSInterface());
    let fs = null;
    let path = null;
    let crypto = null;

    // Check Node.js integration inside CEP
    try {
        if (typeof window.require !== 'undefined') {
            fs = window.require('fs');
            path = window.require('path');
            crypto = window.require('crypto');
        } else if (typeof require !== 'undefined') {
            fs = require('fs');
            path = require('path');
            crypto = require('crypto');
        }
    } catch (e) {
        console.warn("Node.js require not available in this context:", e);
    }

    // Application State
    const state = {
        project: {
            name: "No Project",
            path: "",
            sequencesCount: 0,
            rootItemCount: 0
        },
        items: [],
        selectedNodeIds: new Set(),
        fileViewMode: "disk", // 'disk' | 'bin'
        isSimulated: false
    };

    // DOM Elements
    const elements = {
        projectPill: document.getElementById('projectPill'),
        refreshBtn: document.getElementById('refreshBtn'),
        tabs: document.querySelectorAll('.nav-tab'),
        tabContents: document.querySelectorAll('.tab-content'),
        
        // Sort tab
        sortPresetSelect: document.getElementById('sortPresetSelect'),
        btnCreateBins: document.getElementById('btnCreateBins'),
        btnSortByType: document.getElementById('btnSortByType'),
        btnFlattenBins: document.getElementById('btnFlattenBins'),
        btnDeleteAllBins: document.getElementById('btnDeleteAllBins'),
        btnRescanSort: document.getElementById('btnRescanSort'),
        btnToggleSkipReview: document.getElementById('btnToggleSkipReview'),
        chkSkipSortReview: document.getElementById('chkSkipSortReview'),

        // Layout tab
        layoutPresetSelect: document.getElementById('layoutPresetSelect'),
        btnRenamePreset: document.getElementById('btnRenamePreset'),
        btnNewPreset: document.getElementById('btnNewPreset'),
        btnDuplicatePreset: document.getElementById('btnDuplicatePreset'),
        btnExportPreset: document.getElementById('btnExportPreset'),
        btnImportPreset: document.getElementById('btnImportPreset'),
        btnDeletePreset: document.getElementById('btnDeletePreset'),
        presetFileInput: document.getElementById('presetFileInput'),
        ruleList: document.getElementById('ruleList'),
        btnAddRule: document.getElementById('btnAddRule'),

        // Add Rule Modal
        addRuleModal: document.getElementById('addRuleModal'),
        btnCloseRuleModal: document.getElementById('btnCloseRuleModal'),
        btnCancelRuleModal: document.getElementById('btnCancelRuleModal'),
        newRuleName: document.getElementById('newRuleName'),
        newRuleParent: document.getElementById('newRuleParent'),
        newRuleType: document.getElementById('newRuleType'),
        newRuleUntouchable: document.getElementById('newRuleUntouchable'),
        btnSaveNewRule: document.getElementById('btnSaveNewRule'),
        btnFilterNone: document.getElementById('btnFilterNone'),
        btnFilterCustom: document.getElementById('btnFilterCustom'),
        modalFiltersBuilder: document.getElementById('modalFiltersBuilder'),

        // Anchored Matching Rule Popover
        filterPopover: document.getElementById('filterPopover'),
        filterPopoverArrow: document.getElementById('filterPopoverArrow'),
        filterPopoverBinName: document.getElementById('filterPopoverBinName'),
        btnCloseFilterPopover: document.getElementById('btnCloseFilterPopover'),
        popoverMediaTypeRow: document.getElementById('popoverMediaTypeRow'),
        popoverMediaTypeBtn: document.getElementById('popoverMediaTypeBtn'),
        popoverMediaTypeIcon: document.getElementById('popoverMediaTypeIcon'),
        popoverMediaTypeLabel: document.getElementById('popoverMediaTypeLabel'),
        cardFiltersBuilder: document.getElementById('cardFiltersBuilder'),
        btnCancelFilterPopover: document.getElementById('btnCancelFilterPopover'),
        btnSaveFilterPopover: document.getElementById('btnSaveFilterPopover'),
        filterFloatingMenu: document.getElementById('filterFloatingMenu'),
        ruleMoreMenu: document.getElementById('ruleMoreMenu'),

        // Files tab
        btnRescanFiles: document.getElementById('btnRescanFiles'),
        statsSummary: document.getElementById('statsSummary'),
        statsLooseSummary: document.getElementById('statsLooseSummary'),
        btnViewByDisk: document.getElementById('btnViewByDisk'),
        btnViewByBin: document.getElementById('btnViewByBin'),
        btnSelectLoose: document.getElementById('btnSelectLoose'),
        btnClearSelection: document.getElementById('btnClearSelection'),
        fileTreeContainer: document.getElementById('fileTreeContainer'),
        relocateDestInput: document.getElementById('relocateDestInput'),
        btnBrowseRelocate: document.getElementById('btnBrowseRelocate'),
        chkMirrorLayout: document.getElementById('chkMirrorLayout'),
        btnRelocateFiles: document.getElementById('btnRelocateFiles'),
        relocateProgressWrap: document.getElementById('relocateProgressWrap'),
        relocateProgressFill: document.getElementById('relocateProgressFill'),


        // Preview Modal
        previewModal: document.getElementById('previewModal'),
        previewTitle: document.getElementById('previewTitle'),
        previewSubtitle: document.getElementById('previewSubtitle'),
        previewSubtitleRow: document.getElementById('previewSubtitleRow'),
        previewCountBadge: document.getElementById('previewCountBadge'),
        previewFilterBar: document.getElementById('previewFilterBar'),
        btnClosePreview: document.getElementById('btnClosePreview'),
        btnCancelPreview: document.getElementById('btnCancelPreview'),
        previewList: document.getElementById('previewList'),
        btnConfirmSort: document.getElementById('btnConfirmSort'),

        // Toast
        toast: document.getElementById('toast'),
        folderPicker: document.getElementById('folderPicker')
    };

    // --- INITIALIZATION ---
    function init() {
        syncThemeWithPremiere();
        setupTabs();
        populatePresetDropdowns();
        renderLayoutRules();
        setCustomTypeValue('all');
        renderCustomTypeMenu();
        setCustomParentValue('');
        renderCustomParentMenu();
        setupEventListeners();
        // Check if CEP host is active or if we're in standalone browser
        if (!window.__adobe_cep__) {
            console.log("Running in standalone preview mode (Simulating Premiere Pro)");
            setupMockProject();
        } else {
            scanProject();
        }
    }

    // Sync extension colors with Premiere Pro native panel theme
    function syncThemeWithPremiere() {
        if (!window.__adobe_cep__) return;
        try {
            const hostEnv = JSON.parse(window.__adobe_cep__.getHostEnvironment());
            if (hostEnv && hostEnv.appSkinInfo && hostEnv.appSkinInfo.panelBackgroundColor) {
                const color = hostEnv.appSkinInfo.panelBackgroundColor.color;
                const r = Math.round(color.red);
                const g = Math.round(color.green);
                const b = Math.round(color.blue);

                // Set exact Premiere Pro panel background color
                document.documentElement.style.setProperty('--bg-main', `rgb(${r}, ${g}, ${b})`);

                // Header slightly darker
                const hr = Math.max(0, r - 6);
                const hg = Math.max(0, g - 6);
                const hb = Math.max(0, b - 6);
                document.documentElement.style.setProperty('--bg-header', `rgb(${hr}, ${hg}, ${hb})`);

                // Cards and surfaces slightly lighter for contrast/elevation
                const cr = Math.min(255, r + 7);
                const cg = Math.min(255, g + 7);
                const cb = Math.min(255, b + 7);
                document.documentElement.style.setProperty('--bg-surface', `rgb(${cr}, ${cg}, ${cb})`);
                document.documentElement.style.setProperty('--bg-card', `rgb(${cr}, ${cg}, ${cb})`);

                // Hover
                const hvrR = Math.min(255, r + 16);
                const hvrG = Math.min(255, g + 16);
                const hvrB = Math.min(255, b + 16);
                document.documentElement.style.setProperty('--bg-hover', `rgb(${hvrR}, ${hvrG}, ${hvrB})`);

                // Borders
                const brR = Math.min(255, r + 22);
                const brG = Math.min(255, g + 22);
                const brB = Math.min(255, b + 22);
                document.documentElement.style.setProperty('--border-color', `rgb(${brR}, ${brG}, ${brB})`);
                document.documentElement.style.setProperty('--border-subtle', `rgb(${r + 10}, ${g + 10}, ${b + 10})`);
                const bhrR = Math.min(255, r + 36);
                const bhrG = Math.min(255, g + 36);
                const bhrB = Math.min(255, b + 36);
                document.documentElement.style.setProperty('--border-hover', `rgb(${bhrR}, ${bhrG}, ${bhrB})`);
            }
        } catch (e) {
            console.warn("Could not sync theme with host environment:", e);
        }
    }

    // --- TABS CONTROLLER ---
    function setupTabs() {
        elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                layout.closeAllCustomMenus();
                elements.tabs.forEach(t => t.classList.remove('active'));
                elements.tabContents.forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                const targetId = tab.getAttribute('data-tab');
                const targetContent = document.getElementById(targetId);
                if (targetContent) targetContent.classList.add('active');

                if (targetId === 'tab-sort') {
                    updateSortTabStatus();
                    checkProjectSnapshot();
                } else if (targetId === 'tab-media') {
                    renderFileTree();
                }
            });
        });
    }

    // --- PROJECT SNAPSHOT ---
    let snapshotItems;
    let scanInFlight;
    let checkingOnly;
    let queuedRefresh;

    function checkProjectSnapshot() {
        if (!state.sortInProgress && !state.relocatingFiles) scanProject(undefined, false, true);
    }

    function scanProject(onComplete, force = true, checkOnly = false) {
        if (!window.__adobe_cep__) {
            if (onComplete) onComplete(true);
            return Promise.resolve(true);
        }

        if (scanInFlight && !force && !checkOnly && checkingOnly) {
            return scanInFlight.then(() => scanProject(onComplete, false));
        }

        if (scanInFlight && force) {
            // A mutation may have happened after the current request reached Premiere.
            if (!queuedRefresh) {
                queuedRefresh = scanInFlight.then(() => {
                    queuedRefresh = null;
                    return scanProject(undefined, true);
                });
            }
            return queuedRefresh.then(ok => { if (onComplete) onComplete(ok); return ok; });
        }

        if (!scanInFlight) {
            checkingOnly = checkOnly;
            scanInFlight = new Promise(resolve => bridge.call('getProjectSnapshot', resolve, {
                token: state.snapshotToken,
                force,
                checkOnly
            })).then(res => {
                const snapshot = JSON.parse(res);
                if (!snapshot.token) throw new Error('Premiere returned no project snapshot.');
                if (snapshot.project) applyProjectSnapshot(snapshot);
                state.snapshotToken = snapshot.token;
                return true;
            }).catch(error => {
                console.error('Could not refresh Premiere project:', error);
                showToast('Could not refresh the Premiere project.');
                return false;
            }).finally(() => { scanInFlight = null; });
        }
        return scanInFlight.then(ok => { if (onComplete) onComplete(ok); return ok; });
    }

    function applyProjectSnapshot(snapshot) {
        const info = snapshot.project;
        const projectChanged = info.id !== state.project.id;
        const itemsChanged = projectChanged || info.path !== state.project.path || snapshot.items !== snapshotItems;
        const items = itemsChanged ? JSON.parse(snapshot.items) : state.items;
        if (!Array.isArray(items)) throw new Error('Invalid project items.');

        state.project = info;
        elements.projectPill.textContent = info.name;
        elements.projectPill.title = info.path || info.name;
        if (info.path && !elements.relocateDestInput.value) {
            elements.relocateDestInput.value = getDirectory(info.path);
        }
        if (!itemsChanged) return;

        if (projectChanged) {
            state.selectedNodeIds.clear();
            if (sort && typeof sort.clearUndoState === 'function') sort.clearUndoState();
        }
        else {
            const itemIds = new Set(items.map(item => item.nodeId));
            for (const id of state.selectedNodeIds) {
                if (!itemIds.has(id)) state.selectedNodeIds.delete(id);
            }
        }
        state.items = items;
        snapshotItems = snapshot.items;
        sort.invalidateReview();
        updateUIWithState();
    }

    function updateUIWithState() {
        normalizedItems = null;
        cachedMoves = null;
        calculateLooseFiles();
        renderFileTree(true);
        updateSortTabStatus();
    }

    function setupEventListeners() {
        if (window.__adobe_cep__) {
            bridge.onThemeChange(syncThemeWithPremiere);
            window.addEventListener('focus', checkProjectSnapshot);
        }
        elements.refreshBtn.addEventListener('click', () => scanProject(ok => { if (ok) showToast("Project rescanned"); }));
        media.bindEvents();
        sort.bindEvents();
        layout.bindEvents();
    }

    // --- DIRECTORY PICKER HELPER ---
    function pickDirectory(callback) {
        if (window.cep && window.cep.fs && typeof window.cep.fs.showOpenDialogEx === 'function') {
            const result = window.cep.fs.showOpenDialogEx(false, true, "Select Directory", "", []);
            if (result && result.data && result.data[0]) {
                callback(result.data[0]);
            }
            return;
        }
        elements.folderPicker.onchange = (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const fullPath = file.path ? getDirectory(file.path) : file.webkitRelativePath;
                callback(fullPath);
            }
        };
        elements.folderPicker.click();
    }

    // --- UTILITIES ---
    let toastTimeout = null;
    function showToast(message) {
        if (!elements.toast) return;
        const msgEl = elements.toast.querySelector('.toast-text') || elements.toast;
        msgEl.textContent = message;
        elements.toast.classList.add('show');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            elements.toast.classList.remove('show');
        }, 2500);

    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function getDirectory(filePath) {
        if (!filePath) return "";
        const normalized = filePath.replace(/\\/g, '/');
        const lastSlash = normalized.lastIndexOf('/');
        return lastSlash !== -1 ? normalized.substring(0, lastSlash) : "";
    }

    function getFileName(filePath) {
        if (!filePath) return "";
        const normalized = filePath.replace(/\\/g, '/');
        const lastSlash = normalized.lastIndexOf('/');
        return lastSlash !== -1 ? normalized.substring(lastSlash + 1) : normalized;
    }

    function getExtension(filePath) {
        if (!filePath) return "";
        const dot = filePath.lastIndexOf('.');
        return dot !== -1 ? filePath.substring(dot + 1).toLowerCase() : "";
    }

    function ensureDirectoryExists(dirPath) {
        if (fs && !fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    function getEstimatedFileSize(item) {
        const ext = getExtension(item.mediaPath);
        switch (ext) {
            case 'r3d': case 'braw': return 4.2 * 1024 * 1024 * 1024;
            case 'mov': return 850 * 1024 * 1024;
            case 'mp4': return 320 * 1024 * 1024;
            case 'wav': return 58 * 1024 * 1024;
            case 'mp3': return 8 * 1024 * 1024;
            case 'png': return 4 * 1024 * 1024;
            case 'jpg': return 3 * 1024 * 1024;
            default: return 15 * 1024 * 1024;
        }
    }

    // Simulated project dataset matching user project when opened in browser preview
    function setupMockProject() {
        state.isSimulated = true;
        state.project = {
            name: "Main.prproj",
            path: "D:/Projects/Main.prproj",
            sequencesCount: 1,
            rootItemCount: 9
        };
        elements.projectPill.textContent = state.project.name;
        elements.relocateDestInput.value = "D:/Projects";

        state.items = [
            { nodeId: "1", name: "01_VIDEOS", type: "bin", isBin: true, parentPath: "root" },
            { nodeId: "2", name: "bald head slap_meme.mp4", type: "video", mediaPath: "D:/Projects/bald head slap_meme.mp4", parentPath: "01_VIDEOS" },
            { nodeId: "3", name: "best cry_meme.mp4", type: "video", mediaPath: "D:/Projects/best cry_meme.mp4", parentPath: "01_VIDEOS" },
            { nodeId: "4", name: "black kid laughing in car_meme.mp4", type: "video", mediaPath: "D:/Projects/black kid laughing in car_meme.mp4", parentPath: "01_VIDEOS" },
            { nodeId: "5", name: "H009L044_260113JA.MP4", type: "video", mediaPath: "D:/Projects/H009L044_260113JA.MP4", parentPath: "01_VIDEOS" },
            { nodeId: "6", name: "H009L045_260113VB.MP4", type: "video", mediaPath: "D:/Projects/H009L045_260113VB.MP4", parentPath: "01_VIDEOS" },
            { nodeId: "7", name: "H009L046_260113SA.MP4", type: "video", mediaPath: "D:/Projects/H009L046_260113SA.MP4", parentPath: "01_VIDEOS" },
            { nodeId: "8", name: "Memes", type: "bin", isBin: true, parentPath: "01_VIDEOS" },
            { nodeId: "9", name: "Raw", type: "bin", isBin: true, parentPath: "01_VIDEOS" },
            { nodeId: "10", name: "02_AUDIO", type: "bin", isBin: true, parentPath: "root" },
            { nodeId: "11", name: "achievement_sfx.mp3", type: "audio", mediaPath: "D:/Projects/achievement_sfx.mp3", parentPath: "02_AUDIO" },
            { nodeId: "12", name: "anime wow_sfx.mp3", type: "audio", mediaPath: "D:/Projects/anime wow_sfx.mp3", parentPath: "02_AUDIO" },
            { nodeId: "13", name: "SFX", type: "bin", isBin: true, parentPath: "02_AUDIO" },
            { nodeId: "14", name: "main", type: "sequence", isSequence: true, parentPath: "root" }
        ];

        updateUIWithState();
    }

    const { escapeHtml, compilePreset, normalizeProjectItems, planMoves, FOLDER_OUTLINE_SVG, getItemIconSvg } = window.Binwright.rules;
    let normalizedItems;
    let cachedMoves;
    let compiledPreset;
    let compiledPresetId;
    let compiledPresetRevision;

    function calculateMoves() {
        const manager = window.presetManager;
        const presetId = manager.getActivePresetId();
        if (compiledPresetId !== presetId || compiledPresetRevision !== manager.revision) {
            compiledPreset = compilePreset(manager.getActivePreset());
            compiledPresetId = presetId;
            compiledPresetRevision = manager.revision;
            cachedMoves = null;
        }
        if (!normalizedItems) normalizedItems = normalizeProjectItems(state.items);
        if (!cachedMoves) cachedMoves = planMoves(normalizedItems, compiledPreset);
        return cachedMoves;
    }
    const transfers = window.Binwright.createTransferService({ fs, path, crypto, bridge });
    const layout = window.Binwright.createLayoutController({
        state, elements, fs, rules: window.Binwright.rules, showToast,
        updateSortTabStatus: () => sort.updateSortTabStatus(),
        invalidateReview: () => sort.invalidateReview()
    });
    const {
        populatePresetDropdowns, updatePresetUIState, renderLayoutRules, setCustomTypeValue,
        renderCustomTypeMenu, setCustomParentValue, renderCustomParentMenu
    } = layout;
    const sort = window.Binwright.createSortController({
        state, elements, bridge, calculateMoves, escapeHtml, getItemIconSvg, scanProject, showToast,
        updatePresetUIState, renderLayoutRules, updateUIWithState
    });
    const { openPreviewModal, updateSortTabStatus } = sort;
    const media = window.Binwright.createMediaController({
        state, elements, fs, path, transfers, calculateMoves, scanProject, updateUIWithState,
        openPreviewModal, escapeHtml, getItemIconSvg, FOLDER_OUTLINE_SVG, pickDirectory, showToast,
        formatBytes, getDirectory, getFileName, ensureDirectoryExists, getEstimatedFileSize
    });
    const { renderFileTree, calculateLooseFiles } = media;

    // Run on DOM load
    window.addEventListener('DOMContentLoaded', init);

})();
