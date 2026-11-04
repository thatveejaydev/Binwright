/**
 * Binwright Premiere Pro CEP Panel - Main Controller
 */

(function() {
    'use strict';

    // Bridge interfaces
    const csInterface = new CSInterface();
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
        autoSortEnabled: false,
        autoSortTimer: null,
        lastKnownItemCount: 0,
        pendingMoves: [],
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
        chkAutoSort: document.getElementById('chkAutoSort'),

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
        scanProject();

        // Check if CEP host is active or if we're in standalone browser
        if (!window.__adobe_cep__) {
            console.log("Running in standalone preview mode (Simulating Premiere Pro)");
            setupMockProject();
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
                closeAllCustomMenus();
                elements.tabs.forEach(t => t.classList.remove('active'));
                elements.tabContents.forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                const targetId = tab.getAttribute('data-tab');
                const targetContent = document.getElementById(targetId);
                if (targetContent) targetContent.classList.add('active');

                if (targetId === 'tab-sort') {
                    updateSortTabStatus();
                } else if (targetId === 'tab-media') {
                    renderFileTree();
                } else if (targetId === 'tab-layout') {
                    renderLayoutRules();
                }
            });
        });
    }

    // --- PRESETS CONTROLLER ---
    function populatePresetDropdowns() {
        const presets = window.presetManager.presets;
        const activeId = window.presetManager.getActivePresetId();

        const buildOptions = () => {
            return presets.map(p => `<option value="${p.id}" ${p.id === activeId ? 'selected' : ''}>${p.name}</option>`).join('');
        };

        if (elements.sortPresetSelect) elements.sortPresetSelect.innerHTML = buildOptions();
        if (elements.layoutPresetSelect) elements.layoutPresetSelect.innerHTML = buildOptions();

        renderSortPresetMenu();
        renderLayoutPresetMenu();
        updatePresetUIState();
    }

    function updatePresetUIState() {
        const activePreset = window.presetManager.getActivePreset();
        if (!activePreset) return;
        if (elements.sortPresetSelect) elements.sortPresetSelect.value = activePreset.id;
        if (elements.layoutPresetSelect) elements.layoutPresetSelect.value = activePreset.id;

        const sortTitle = document.getElementById('sortPresetTriggerTitle');
        if (sortTitle) sortTitle.textContent = activePreset.name;

        const layoutTitle = document.getElementById('layoutPresetTriggerTitle');
        if (layoutTitle) layoutTitle.textContent = activePreset.name;

        ['sortPresetMenu', 'layoutPresetMenu'].forEach(menuId => {
            const m = document.getElementById(menuId);
            if (m) {
                m.querySelectorAll('.custom-type-item').forEach(el => {
                    const isMatch = el.getAttribute('data-value') === activePreset.id;
                    el.classList.toggle('is-active', isMatch);
                    el.setAttribute('aria-selected', isMatch ? 'true' : 'false');
                });
            }
        });

        const sortBadge = document.getElementById('sortPresetBadge');
        if (sortBadge && activePreset.folders) {
            const count = activePreset.folders.length;
            sortBadge.textContent = `${count} bin${count === 1 ? '' : 's'}`;
        }

        elements.btnDeletePreset.style.display = activePreset.isBuiltin ? 'none' : 'flex';
        elements.btnRenamePreset.style.display = activePreset.isBuiltin ? 'none' : '';
        elements.btnAddRule.style.display = activePreset.isBuiltin ? 'none' : 'block';
        document.getElementById('builtinLayoutHint').hidden = !activePreset.isBuiltin;

        if (typeof updateSortTabStatus === 'function') {
            updateSortTabStatus();
        }
    }

    function getParentPath(folderName) {
        const parts = folderName.split('/');
        return parts.length > 1 ? parts.slice(0, -1).join('/') : null;
    }

    function reorderFolder(preset, draggedName, targetName, position) {
        if (preset.isBuiltin) return false;
        if (!preset || !Array.isArray(preset.folders)) return false;
        if (!draggedName || !targetName || draggedName === targetName) return false;

        const draggedParent = getParentPath(draggedName);
        const targetParent = getParentPath(targetName);

        // Enforce: child bin cannot be dragged outside its level / parent
        if (draggedParent !== targetParent) {
            return false;
        }

        const folders = preset.folders;
        const draggedIdx = folders.findIndex(f => f.name === draggedName);
        if (draggedIdx === -1) return false;

        // Group together the dragged folder and all its nested sub-bins
        const draggedPrefix = draggedName + '/';
        let draggedCount = 1;
        for (let i = draggedIdx + 1; i < folders.length; i++) {
            if (folders[i].name.startsWith(draggedPrefix)) {
                draggedCount++;
            } else {
                break;
            }
        }

        // Remove the entire dragged block
        const draggedGroup = folders.splice(draggedIdx, draggedCount);

        // Find target in the remaining folders
        const targetIdx = folders.findIndex(f => f.name === targetName);
        if (targetIdx === -1) {
            folders.splice(draggedIdx, 0, ...draggedGroup);
            return false;
        }

        if (position === 'before') {
            folders.splice(targetIdx, 0, ...draggedGroup);
        } else {
            // Insert after target and all of target's nested sub-bins
            const targetPrefix = targetName + '/';
            let targetCount = 1;
            for (let i = targetIdx + 1; i < folders.length; i++) {
                if (folders[i].name.startsWith(targetPrefix)) {
                    targetCount++;
                } else {
                    break;
                }
            }
            folders.splice(targetIdx + targetCount, 0, ...draggedGroup);
        }

        window.presetManager.normalizePresetFolders(preset);
        window.presetManager.savePresets();
        return true;
    }

    function isAnyAncestorCollapsed(folderName, collapsedSet) {
        if (!collapsedSet || collapsedSet.size === 0) return false;
        const parts = folderName.split('/');
        for (let i = 1; i < parts.length; i++) {
            const ancestorPath = parts.slice(0, i).join('/');
            if (collapsedSet.has(ancestorPath)) {
                return true;
            }
        }
        return false;
    }

    // --- MATCHING RULE DEFINITIONS ---
    const MATCHING_RULE_TYPES = [
        {
            value: 'all',
            title: 'Any File Type',
            sub: '',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`
        },
        {
            value: 'video',
            title: 'Video',
            sub: '',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>`
        },
        {
            value: 'audio',
            title: 'Audio',
            sub: '',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
        },
        {
            value: 'image',
            title: 'Graphics',
            sub: '',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`
        },
        {
            value: 'sequence',
            title: 'Nests',
            sub: '',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="10" y1="4" x2="10" y2="20"/><line x1="4" y1="9" x2="8" y2="9"/><line x1="12" y1="9" x2="18" y2="9"/><line x1="12" y1="15" x2="16" y2="15"/></svg>`
        },
        {
            value: 'cameraraw',
            title: 'Camera RAW',
            sub: '',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`
        },
        {
            value: 'graphics',
            title: 'MOGRTs & Titles',
            sub: '',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`
        },
        {
            value: 'captions',
            title: 'Captions & Subtitles',
            sub: '',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M10 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2"/></svg>`
        },
        {
            value: 'solids',
            title: 'Generated Media',
            sub: '',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4.5"/><circle cx="8" cy="15" r="4.5"/><circle cx="16" cy="15" r="4.5"/></svg>`
        }
    ];

    function getMatchTypeName(typeVal) {
        if (!typeVal || typeVal === 'all') return 'Any File Type';
        const found = MATCHING_RULE_TYPES.find(t => t.value === typeVal);
        return found ? found.title : typeVal;
    }

    // --- FILENAME FILTER DEFINITIONS, SPECIFICITY SCORING & MATCHING HELPERS ---
    const FILTER_OPERATORS = [
        { value: 'contains', label: 'Contains', pillPrefix: 'contains', placeholder: 'e.g. _sfx' },
        { value: 'not_contains', label: 'Does not contain', pillPrefix: 'excludes', placeholder: 'e.g. _proxy' },
        { value: 'starts_with', label: 'Starts with', pillPrefix: 'starts with', placeholder: 'e.g. CAM_A_' },
        { value: 'ends_with', label: 'Ends with', pillPrefix: 'ends with', placeholder: 'e.g. _sfx' },
        { value: 'exact', label: 'Exact name', pillPrefix: 'exact', placeholder: 'e.g. main_edit' },
        { value: 'extension', label: 'Extension', pillPrefix: 'ext', placeholder: 'e.g. mp3, wav' }
    ];

    const FILTER_MATCH_MODES = [
        { value: 'all', label: 'Match all conditions' },
        { value: 'any', label: 'Match any condition' }
    ];

    // Automatic specificity scores (higher wins automatically regardless of folder order)
    const OPERATOR_SPECIFICITY = {
        exact: 100,
        starts_with: 80,
        ends_with: 80,
        extension: 60,
        contains: 40,
        not_contains: 30
    };
    const MEDIA_TYPE_ONLY_SCORE = 20;
    const ANY_FILE_TYPE_SCORE = 10;

    function getOperatorSpecificity(op) {
        return Object.prototype.hasOwnProperty.call(OPERATOR_SPECIFICITY, op)
            ? OPERATOR_SPECIFICITY[op]
            : 40;
    }

    function isWildcardMatchType(matchType) {
        return !matchType || matchType === 'all' || matchType === 'any';
    }

    function matchesMediaType(item, folder) {
        if (!folder || isWildcardMatchType(folder.matchType)) return true;
        if (folder.matchType === 'sequence') {
            return !!(item.isSequence || item.type === 'sequence');
        }
        if (folder.matchType === 'video') {
            return (item.type === 'video' || item.type === 'cameraraw') && !item.isSequence;
        }
        return (item.type === folder.matchType) && (!item.isSequence || folder.matchType === 'sequence');
    }

    const FILTER_FUNNEL_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`;

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getActiveConditions(folder) {
        if (!folder || !folder.filters || !Array.isArray(folder.filters.conditions)) return [];
        return folder.filters.conditions.filter(c => c && typeof c.value === 'string' && c.value.trim() !== '');
    }

    function hasActiveFilters(folder) {
        return getActiveConditions(folder).length > 0;
    }

    function formatSingleConditionBadge(cond) {
        const opObj = FILTER_OPERATORS.find(o => o.value === cond.operator) || FILTER_OPERATORS[0];
        const rawVal = cond.value.trim();
        if (opObj.value === 'extension') {
            const exts = rawVal
                .split(/[,\s]+/)
                .map(e => e.replace(/^\.+/, ''))
                .filter(Boolean)
                .map(e => `.${e}`)
                .join(', ');
            return `ext ${exts || rawVal}`;
        }
        return `${opObj.pillPrefix} ${rawVal}`;
    }

    function formatFilterSummary(folder, { includeSpecificType = false } = {}) {
        const conds = getActiveConditions(folder);
        const hasSpecificType = folder && !isWildcardMatchType(folder.matchType);
        const typeLabel = hasSpecificType ? getMatchTypeName(folder.matchType) : '';

        if (conds.length === 0) {
            return { pillHtml: '', tooltip: 'Edit matching rule' };
        }

        const isAny = folder.filters && folder.filters.matchMode === 'any';
        const isCase = !!(folder.filters && folder.filters.caseSensitive);
        const sepHtml = isAny
            ? `<span class="rule-filter-pill-sep">or</span>`
            : `<span class="rule-filter-pill-sep">•</span>`;
        const sepText = isAny ? ' or ' : ' • ';

        const formatted = conds.map(formatSingleConditionBadge);
        const visible = formatted.slice(0, 2).map(escapeHtml);
        if (formatted.length > 2) {
            visible.push(`+${formatted.length - 2}`);
        }
        let pillHtml = visible.join(` ${sepHtml} `);
        let tooltip = formatted.join(sepText);

        if (includeSpecificType && hasSpecificType) {
            pillHtml = `${escapeHtml(typeLabel)} <span class="rule-filter-pill-sep">•</span> ${pillHtml}`;
            tooltip = `${typeLabel} • ${tooltip}`;
        }

        tooltip += (isCase ? ' (Case-sensitive)' : '') + ' — Click to edit rule';
        return { pillHtml, tooltip };
    }

    /**
     * Normalize project item into { fullName, stem, extension }.
     * Filename operators (contains, starts_with, ends_with, exact, not_contains) evaluate against `stem` only.
     * Extension operator evaluates against `extension` only.
     */
    function normalizeItemFileInfo(item) {
        const rawName = String((item && item.name) || '');
        const mediaPath = String((item && item.mediaPath) || '');
        const isSeq = !!(item && (item.isSequence || item.type === 'sequence'));

        if (isSeq) {
            return {
                fullName: rawName,
                stem: rawName,
                extension: ''
            };
        }

        let extension = '';
        const nameDotIdx = rawName.lastIndexOf('.');
        const hasExtInName = nameDotIdx > 0
            && nameDotIdx < rawName.length - 1
            && /^[a-z0-9]{1,10}$/i.test(rawName.slice(nameDotIdx + 1));

        if (hasExtInName) {
            extension = rawName.slice(nameDotIdx + 1);
        } else if (mediaPath) {
            const diskFile = mediaPath.split(/[\\/]/).pop() || '';
            const diskDotIdx = diskFile.lastIndexOf('.');
            if (diskDotIdx > 0 && diskDotIdx < diskFile.length - 1 && /^[a-z0-9]{1,10}$/i.test(diskFile.slice(diskDotIdx + 1))) {
                extension = diskFile.slice(diskDotIdx + 1);
            }
        }

        const stem = hasExtInName ? rawName.slice(0, nameDotIdx) : rawName;
        const fullName = hasExtInName ? rawName : (extension ? `${rawName}.${extension}` : rawName);
        return { fullName, stem, extension };
    }

    function evaluateSingleCondition(fileInfo, cond, caseSensitive) {
        if (!cond || typeof cond.value !== 'string' || !cond.value.trim()) return true;
        const op = cond.operator || 'contains';
        const rawVal = cond.value.trim();

        const norm = (s) => caseSensitive ? s : s.toLowerCase();
        const stem = norm(fileInfo.stem);
        const val = norm(rawVal);

        switch (op) {
            case 'contains':
                return stem.includes(val);
            case 'not_contains':
                return !stem.includes(val);
            case 'starts_with':
                return stem.startsWith(val);
            case 'ends_with':
                return stem.endsWith(val);
            case 'exact':
                return stem === val;
            case 'extension': {
                if (!fileInfo.extension) return false;
                const itemExt = norm(fileInfo.extension.replace(/^\.+/, ''));
                const allowedExts = rawVal
                    .split(/[,\s]+/)
                    .map(e => norm(e.replace(/^\.+/, '')))
                    .filter(Boolean);
                return allowedExts.includes(itemExt);
            }
            default:
                return stem.includes(val);
        }
    }

    function formatMatchedConditionReason(cond, fileInfo) {
        const op = cond.operator || 'contains';
        const rawVal = cond.value.trim();
        switch (op) {
            case 'exact':
                return `filename is "${rawVal}"`;
            case 'starts_with':
                return `filename starts with "${rawVal}"`;
            case 'ends_with':
                return `filename ends with "${rawVal}"`;
            case 'extension': {
                const extDisplay = (fileInfo.extension || rawVal.replace(/^\.+/, '')).toLowerCase();
                return `extension is ".${extDisplay}"`;
            }
            case 'contains':
                return `filename contains "${rawVal}"`;
            case 'not_contains':
                return `filename does not contain "${rawVal}"`;
            default:
                return `filename contains "${rawVal}"`;
        }
    }

    /**
     * Evaluate a single unlocked leaf rule against an item and compute its specificity score & winning reason.
     */
    function evaluateLeafRule(item, fileInfo, folder, orderIndex) {
        if (!matchesMediaType(item, folder)) return null;

        let destination = folder.name;
        if (item.isSequence && folder.subBins && folder.subBins.length > 0) {
            destination += '/' + folder.subBins[0];
        }

        const hasSpecificType = !isWildcardMatchType(folder.matchType);
        const conds = getActiveConditions(folder);

        if (conds.length > 0) {
            const matchMode = (folder.filters && folder.filters.matchMode === 'any') ? 'any' : 'all';
            const caseSensitive = !!(folder.filters && folder.filters.caseSensitive);

            let matchedConds = [];
            if (matchMode === 'any') {
                matchedConds = conds.filter(c => evaluateSingleCondition(fileInfo, c, caseSensitive));
                if (matchedConds.length === 0) return null;
            } else {
                const allPassed = conds.every(c => evaluateSingleCondition(fileInfo, c, caseSensitive));
                if (!allPassed) return null;
                matchedConds = conds.slice();
            }

            const sortedMatched = matchedConds
                .slice()
                .sort((a, b) => getOperatorSpecificity(b.operator) - getOperatorSpecificity(a.operator));

            const score = getOperatorSpecificity(sortedMatched[0].operator);
            let reason = '';
            if (matchMode === 'any' || sortedMatched.length === 1) {
                reason = formatMatchedConditionReason(sortedMatched[0], fileInfo);
            } else if (sortedMatched.length === 2) {
                reason = `${formatMatchedConditionReason(sortedMatched[0], fileInfo)} & ${formatMatchedConditionReason(sortedMatched[1], fileInfo)}`;
            } else {
                reason = `${formatMatchedConditionReason(sortedMatched[0], fileInfo)} (+${sortedMatched.length - 1} more)`;
            }

            return {
                folder,
                destination,
                score,
                reason,
                hasSpecificType,
                matchedCount: matchMode === 'all' ? sortedMatched.length : 1,
                orderIndex
            };
        }

        // Unfiltered leaf destination
        if (hasSpecificType) {
            return {
                folder,
                destination,
                score: MEDIA_TYPE_ONLY_SCORE,
                reason: `type is ${getMatchTypeName(folder.matchType)}`,
                hasSpecificType: true,
                matchedCount: 0,
                orderIndex
            };
        }

        // Unfiltered Any File Type destination (catch-all)
        return {
            folder,
            destination,
            score: ANY_FILE_TYPE_SCORE,
            reason: 'accepts any file type',
            hasSpecificType: false,
            matchedCount: 0,
            orderIndex
        };
    }

    function normalizeConditionForConflict(cond) {
        if (!cond || typeof cond.value !== 'string') return '';
        const op = cond.operator || 'contains';
        const raw = cond.value.trim().toLowerCase();

        if (op === 'extension') {
            const exts = raw
                .split(/[,\s]+/)
                .map(e => e.replace(/^\.+/, '').trim())
                .filter(Boolean)
                .sort()
                .join(',');
            return `extension:${exts}`;
        }
        return `${op}:${raw.replace(/\s+/g, ' ')}`;
    }

    function getRuleConflictSignature(folder) {
        if (!folder) return null;
        const matchType = folder.matchType || 'all';
        const conds = getActiveConditions(folder);

        if (conds.length === 0) {
            const typeLabel = getMatchTypeName(matchType);
            return {
                key: `TYPE::${matchType}`,
                description: matchType === 'all' ? 'Any File Type (Catch-All)' : `type is ${typeLabel}`,
                extList: null
            };
        }

        const matchMode = (conds.length > 1 && folder.filters && folder.filters.matchMode === 'any') ? 'any' : 'all';
        const sortedConds = conds
            .map(normalizeConditionForConflict)
            .sort()
            .join(' & ');

        let extList = null;
        if (conds.length === 1 && conds[0].operator === 'extension') {
            extList = (conds[0].value || '')
                .split(/[,\s]+/)
                .map(e => e.replace(/^\.+/, '').trim().toLowerCase())
                .filter(Boolean);
        }

        const summary = formatFilterSummary(folder, { includeSpecificType: true });
        const prettyDesc = (summary && summary.tooltip)
            ? summary.tooltip.replace(/\s*-\s*Click to edit rule$/i, '')
            : (isWildcardMatchType(matchType) ? sortedConds : `${getMatchTypeName(matchType)} + ${sortedConds}`);

        return {
            key: `FILTER::${matchType}::${matchMode}::${sortedConds}`,
            description: prettyDesc,
            extList
        };
    }

    function renderLayoutRules() {
        closeFilterPopover();
        const preset = window.presetManager.getActivePreset();
        window.presetManager.normalizePresetFolders(preset);
        elements.ruleList.innerHTML = '';

        if (!state.collapsedFolders) {
            state.collapsedFolders = new Set();
        } else {
            // Prune any stale entries that no longer exist in preset.folders
            const currentNames = new Set(preset.folders.map(f => f.name));
            for (const name of Array.from(state.collapsedFolders)) {
                if (!currentNames.has(name)) {
                    state.collapsedFolders.delete(name);
                }
            }
        }

        // Precompute structural containers (any folder with child rules)
        const hasChildSet = new Set();
        preset.folders.forEach(f => {
            const parts = f.name.split('/');
            for (let i = 1; i < parts.length; i++) {
                hasChildSet.add(parts.slice(0, i).join('/'));
            }
        });

        // Detect rule conflicts & overlaps among unlocked leaf destination rules
        // Map: originalIdx -> { winnerName: string, winnerIdx: number, description: string }
        const ruleConflicts = new Map();
        const seenSignatures = new Map();
        const seenRules = [];

        preset.folders.forEach((folder, idx) => {
            // Containers and locked folders do not participate as destinations
            if (hasChildSet.has(folder.name) || folder.untouchable) return;

            // Check if ancestor is locked
            const parts = folder.name.split('/');
            for (let i = 1; i < parts.length; i++) {
                const anc = preset.folders.find(p => p.name === parts.slice(0, i).join('/'));
                if (anc && anc.untouchable) return;
            }

            const sig = getRuleConflictSignature(folder);
            if (!sig) return;

            // 1. Exact match by normalized signature
            if (seenSignatures.has(sig.key)) {
                const earlier = seenSignatures.get(sig.key);
                ruleConflicts.set(idx, {
                    winnerName: earlier.folderName,
                    winnerIdx: earlier.idx,
                    description: sig.description
                });
                return;
            }

            // 2. Extension subset shadowing check
            if (sig.extList && sig.extList.length > 0) {
                const shadowWinner = seenRules.find(r => {
                    if (r.matchType !== (folder.matchType || 'all')) return false;
                    if (!r.sig.extList || r.sig.extList.length === 0) return false;
                    const earlierSet = new Set(r.sig.extList);
                    return sig.extList.every(e => earlierSet.has(e));
                });
                if (shadowWinner) {
                    ruleConflicts.set(idx, {
                        winnerName: shadowWinner.folderName,
                        winnerIdx: shadowWinner.idx,
                        description: sig.description
                    });
                    return;
                }
            }

            seenSignatures.set(sig.key, {
                idx,
                folderName: folder.name,
                description: sig.description
            });
            seenRules.push({
                idx,
                folderName: folder.name,
                sig,
                matchType: folder.matchType || 'all'
            });
        });

        // Visible folders (excluding those whose ancestors are collapsed)
        const visibleFolders = preset.folders.filter(f => !isAnyAncestorCollapsed(f.name, state.collapsedFolders));

        visibleFolders.forEach((folder, vIdx) => {
            const originalIdx = preset.folders.findIndex(f => f.name === folder.name);
            const parts = folder.name.split('/');
            const depth = parts.length - 1;
            const parentPath = depth > 0 ? parts.slice(0, -1).join('/') : null;
            const leafName = parts[parts.length - 1];

            // Check if any ancestor folder is locked (untouchable)
            let isParentUntouchable = false;
            if (depth > 0) {
                for (let i = 1; i <= depth; i++) {
                    const ancestorName = parts.slice(0, i).join('/');
                    const ancestor = preset.folders.find(p => p.name === ancestorName);
                    if (ancestor && ancestor.untouchable) {
                        isParentUntouchable = true;
                    }
                }
            }

            const isLocked = folder.untouchable || isParentUntouchable;
            const hasChildren = hasChildSet.has(folder.name);
            const isParentCollapsed = state.collapsedFolders.has(folder.name);

            // Sibling below check among visible folders
            const hasSiblingBelow = depth > 0 && visibleFolders.slice(vIdx + 1).some(other => {
                const oParts = other.name.split('/');
                const oParent = oParts.slice(0, -1).join('/');
                return oParent === parentPath;
            });

            // Ancestor continuing lines check among visible folders
            const ancestorLines = [];
            for (let c = 0; c < depth - 1; c++) {
                const continues = visibleFolders.slice(vIdx + 1).some(other => {
                    const oParts = other.name.split('/');
                    if (c === 0) {
                        return oParts[0] === parts[0];
                    }
                    return other.name.startsWith(parts.slice(0, c + 1).join('/') + '/');
                });
                ancestorLines.push(continues);
            }

            const prevFolder = vIdx > 0 ? visibleFolders[vIdx - 1] : null;
            const connectsAbove = depth > 0 && prevFolder && (
                prevFolder.name === parentPath || 
                prevFolder.name.startsWith(parentPath + '/')
            );

            // Build Tree SVG for solid lines
            let treeGuideHtml = '';
            if (depth > 0) {
                const W = 24;
                const totalW = depth * W;
                const branchCol = depth - 1;
                const branchX = branchCol * W + 12;

                let linesSvg = '';
                // Vertical ancestor lines passing through
                ancestorLines.forEach((cont, col) => {
                    if (cont) {
                        const x = col * W + 12;
                        linesSvg += `<line x1="${x}" y1="0" x2="${x}" y2="100%" stroke="var(--border-color, #444)" stroke-width="1.5" />`;
                    }
                });

                // Vertical line coming down from top to center (y=21)
                if (connectsAbove) {
                    linesSvg += `<line x1="${branchX}" y1="0" x2="${branchX}" y2="21" stroke="var(--border-color, #444)" stroke-width="1.5" />`;
                }
                // Vertical line continuing down to next sibling
                if (hasSiblingBelow) {
                    linesSvg += `<line x1="${branchX}" y1="21" x2="${branchX}" y2="100%" stroke="var(--border-color, #444)" stroke-width="1.5" />`;
                }
                // Horizontal solid branch connecting into card
                linesSvg += `<line x1="${branchX}" y1="21" x2="${totalW}" y2="21" stroke="var(--border-color, #444)" stroke-width="1.5" />`;

                treeGuideHtml = `
                    <div class="tree-guide" style="width: ${totalW}px;">
                        <svg class="tree-line-svg" width="${totalW}" height="100%" preserveAspectRatio="none">
                            ${linesSvg}
                        </svg>
                    </div>
                `;
            }

            const row = document.createElement('div');
            row.className = 'rule-row';

            const chevronSvg = `<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
                <path d="M4.5 6l3.5 4 3.5-4z"/>
            </svg>`;

            const gripSvg = `<svg width="8" height="13" viewBox="0 0 8 13" fill="currentColor">
                <circle cx="2" cy="2" r="1.2"/>
                <circle cx="6" cy="2" r="1.2"/>
                <circle cx="2" cy="6.5" r="1.2"/>
                <circle cx="6" cy="6.5" r="1.2"/>
                <circle cx="2" cy="11" r="1.2"/>
                <circle cx="6" cy="11" r="1.2"/>
            </svg>`;

            const folderSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#eab308" stroke="none"><path d="M2 5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z"/></svg>`;

            const hasSpecificType = !isWildcardMatchType(folder.matchType);
            const specificTypeLabel = hasSpecificType ? getMatchTypeName(folder.matchType) : '';

            // Conflict / Overlap warning check
            const conflict = ruleConflicts.get(originalIdx);
            const winnerLeaf = conflict ? conflict.winnerName.split('/').pop() : '';
            const conflictTooltip = conflict
                ? `⚠️ Rule Overlap: Conflicts with "${winnerLeaf}". Both match identical rules (${conflict.description}). "${winnerLeaf}" will receive all matching files because it appears first in the list.`
                : '';
            const conflictBadgeHtml = conflict
                ? `<span class="rule-conflict-badge" title="${escapeHtml(conflictTooltip)}">⚠️ Overlap</span>`
                : '';

            // Top-level leaf card filter button (media type already shown in Holds: dropdown)
            const topSummary = formatFilterSummary(folder, { includeSpecificType: false });
            const topLeafFilterHtml = hasActiveFilters(folder) ? `
                <button type="button" class="rule-filter-pill btn-edit-filters" data-idx="${originalIdx}" title="${escapeHtml(topSummary.tooltip)}" ${isLocked ? 'disabled' : ''}>${topSummary.pillHtml}</button>
            ` : `
                <button type="button" class="rule-btn-filter btn-edit-filters" data-idx="${originalIdx}" title="Add filters" ${isLocked ? 'disabled' : ''}>
                    ${FILTER_FUNNEL_SVG}
                </button>
            `;

            // Child leaf card rule pill (summarizes Specific Type / Filename Filters / Any File Type)
            const childSummary = formatFilterSummary(folder, { includeSpecificType: true });
            const childLeafRuleHtml = hasActiveFilters(folder) ? `
                <button type="button" class="rule-filter-pill btn-edit-filters" data-idx="${originalIdx}" title="${escapeHtml(childSummary.tooltip)}" ${isLocked ? 'disabled' : ''}>${childSummary.pillHtml}</button>
            ` : (hasSpecificType ? `
                <button type="button" class="rule-filter-pill is-type-only btn-edit-filters" data-idx="${originalIdx}" title="Specific Type: ${escapeHtml(specificTypeLabel)} — Click to edit rule" ${isLocked ? 'disabled' : ''}>${escapeHtml(specificTypeLabel)}</button>
            ` : `
                <button type="button" class="rule-filter-pill is-wildcard-only btn-edit-filters" data-idx="${originalIdx}" title="Any File Type — Click to add filters or select a specific type" ${isLocked ? 'disabled' : ''}>Any File Type</button>
            `);

            // Container child rule count
            let childCountLabel = '';
            if (hasChildren) {
                const leafChildrenCount = preset.folders.filter(other => other.name.startsWith(folder.name + '/') && !hasChildSet.has(other.name)).length;
                childCountLabel = `${leafChildrenCount} child rule${leafChildrenCount === 1 ? '' : 's'}`;
            }

            row.innerHTML = `
                ${treeGuideHtml}
                <div class="rule-item ${depth > 0 ? 'is-nested' : ''} ${isLocked ? 'locked' : ''} ${conflict ? 'has-conflict' : ''}" draggable="${!preset.isBuiltin}" data-name="${folder.name}" data-idx="${originalIdx}">
                    <div class="rule-header">
                        <div class="rule-title">
                            <span class="drag-grip" title="Drag to reorder">${gripSvg}</span>
                            <button type="button" class="chevron-btn ${!hasChildren ? 'disabled' : ''} ${isParentCollapsed ? 'collapsed' : ''}" data-name="${folder.name}" title="${hasChildren ? (isParentCollapsed ? 'Expand sub-bins' : 'Collapse sub-bins') : 'No sub-bins'}">
                                ${chevronSvg}
                            </button>
                            <span class="folder-icon">${folderSvg}</span>
                            <span class="rule-name-label">${escapeHtml(leafName)}</span>
                            ${isLocked ? (hasActiveFilters(folder) ? topLeafFilterHtml : '') : (depth > 0 ? (hasChildren ? `<span class="rule-nested-container-badge">Container · ${childCountLabel}</span>` : `${childLeafRuleHtml}${conflictBadgeHtml}`) : '')}
                        </div>
                        <div class="rule-actions">
                            ${isLocked ? `
                            <span class="rule-lock-badge" title="${isParentUntouchable ? 'Locked (Inherited from parent bin)' : 'Locked: Protected from auto-sorting'}">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </svg>
                            </span>` : ''}
                            <button type="button" class="btn-rule-more" data-idx="${originalIdx}" title="Bin options" aria-haspopup="menu" aria-expanded="false">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="5" r="2"/>
                                    <circle cx="12" cy="12" r="2"/>
                                    <circle cx="12" cy="19" r="2"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    ${depth === 0 && !isLocked ? (hasChildren ? `
                    <div class="rule-desc rule-desc-container">
                        <div class="rule-desc-left">
                            <span class="rule-container-badge">Container</span>
                            <span class="rule-container-count">· ${isLocked ? '[protected]' : childCountLabel}</span>
                        </div>
                    </div>` : `
                    <div class="rule-desc">
                        <div class="rule-desc-left">
                            <span>Holds:</span>
                            ${!isLocked ? `
                            <div class="rule-type-dropdown-wrap">
                                <button type="button" class="rule-type-pill-btn" data-idx="${originalIdx}" aria-haspopup="listbox" aria-expanded="false">
                                    <span class="rule-type-pill-label">${getMatchTypeName(folder.matchType)}</span>
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                </button>
                                <div class="custom-type-menu card-type-menu" id="cardTypeMenu-${originalIdx}" role="listbox"></div>
                            </div>` : `<span style="color:var(--text-muted);">[protected]</span>`}
                            ${topLeafFilterHtml}
                            ${conflictBadgeHtml}
                        </div>
                    </div>`) : ''}
                </div>
            `;
            elements.ruleList.appendChild(row);
        });

        if (preset.isBuiltin) {
            elements.ruleList.querySelectorAll('.rule-item').forEach(row => { row.draggable = false; });
            elements.ruleList.querySelectorAll('.drag-grip, .btn-rule-more, .btn-edit-filters').forEach(control => {
                control.hidden = true;
                control.style.display = 'none';
            });
            elements.ruleList.querySelectorAll('.rule-type-pill-btn').forEach(button => { button.disabled = true; });
        }

        // Folder Rule More Options Dropdown
        elements.ruleList.querySelectorAll('.btn-rule-more').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(e.currentTarget.getAttribute('data-idx'));
                openRuleMoreMenu(e.currentTarget, index);
            });
        });

        // Drag and Drop reordering
        let draggedName = null;

        function clearDropIndicators() {
            elements.ruleList.querySelectorAll('.drop-target-above, .drop-target-below').forEach(el => {
                el.classList.remove('drop-target-above', 'drop-target-below');
            });
        }

        elements.ruleList.querySelectorAll('.rule-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                // If user interacted with controls or buttons, don't drag
                if (e.target.closest('button, select, input, .btn-edit-filters, .rule-conflict-badge, .status-dot')) {
                    e.preventDefault();
                    return;
                }
                draggedName = item.getAttribute('data-name');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedName);
                item.classList.add('is-dragging');
                const row = item.closest('.rule-row');
                if (row) row.classList.add('is-dragging');
            });

            item.addEventListener('dragend', () => {
                draggedName = null;
                item.classList.remove('is-dragging');
                const row = item.closest('.rule-row');
                if (row) row.classList.remove('is-dragging');
                clearDropIndicators();
            });

            item.addEventListener('dragover', (e) => {
                if (!draggedName) return;
                const targetName = item.getAttribute('data-name');
                if (!targetName || targetName === draggedName) return;

                const draggedParts = draggedName.split('/');
                const targetParts = targetName.split('/');
                const draggedParent = draggedParts.length > 1 ? draggedParts.slice(0, -1).join('/') : null;
                const targetParent = targetParts.length > 1 ? targetParts.slice(0, -1).join('/') : null;

                // Restrict to same level / same parent (child cannot be dragged outside its level)
                if (draggedParent !== targetParent) {
                    e.dataTransfer.dropEffect = 'none';
                    return;
                }

                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const isAbove = e.clientY < midY;

                clearDropIndicators();
                if (isAbove) {
                    item.classList.add('drop-target-above');
                } else {
                    item.classList.add('drop-target-below');
                }
            });

            item.addEventListener('dragleave', (e) => {
                if (!item.contains(e.relatedTarget)) {
                    item.classList.remove('drop-target-above', 'drop-target-below');
                }
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                if (!draggedName) return;
                const targetName = item.getAttribute('data-name');
                if (!targetName || targetName === draggedName) {
                    clearDropIndicators();
                    return;
                }

                const isAbove = item.classList.contains('drop-target-above');
                clearDropIndicators();

                const position = isAbove ? 'before' : 'after';
                if (reorderFolder(preset, draggedName, targetName, position)) {
                    state.pendingMoves = [];
                    renderLayoutRules();
                    const leafName = draggedName.split('/').pop();
                    showToast(`Reordered "${leafName}"`);
                }
            });
        });

        // Toggle collapse/expand chevron
        elements.ruleList.querySelectorAll('.chevron-btn:not(.disabled)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = e.currentTarget.getAttribute('data-name');
                if (state.collapsedFolders.has(name)) {
                    state.collapsedFolders.delete(name);
                } else {
                    state.collapsedFolders.add(name);
                }
                renderLayoutRules();
            });
        });

        // Legacy button support if present
        elements.ruleList.querySelectorAll('.btn-rename-rule').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.getAttribute('data-idx'));
                renameFolderRule(index);
            });
        });

        // Edit matching rule (media type & filename filters via filter pill or icon)
        elements.ruleList.querySelectorAll('.btn-edit-filters').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.currentTarget.disabled) return;
                const index = parseInt(e.currentTarget.getAttribute('data-idx'));
                if (!preset.folders[index]) return;
                toggleFilterPopover(index, e.currentTarget);
            });
        });

        // Legacy delete button support if present
        elements.ruleList.querySelectorAll('.btn-del-rule').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.getAttribute('data-idx'));
                deleteFolderRule(index);
            });
        });

        // Change rule media type inline with custom dropdown
        elements.ruleList.querySelectorAll('.rule-type-pill-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-idx'));
                toggleCardTypeMenu(idx, btn);
            });
        });
    }

    // --- SCAN PROJECT ---
    function scanProject(onComplete) {
        if (!window.__adobe_cep__) {
            updateUIWithState();
            if (onComplete) onComplete();
            return;
        }

        csInterface.evalScript('$._PPP_.getProjectInfo()', (res) => {
            try {
                const info = JSON.parse(res);
                if (!info.error) {
                    state.project = info;
                    elements.projectPill.textContent = info.name || "Untitled";
                    elements.projectPill.title = info.path || info.name;

                    if (info.path && !elements.relocateDestInput.value) {
                        const projDir = getDirectory(info.path);
                        elements.relocateDestInput.value = projDir;
                    }
                }
            } catch (e) {
                console.error("Error reading project info:", e);
            }

            csInterface.evalScript('$._PPP_.getAllProjectItems()', (itemsRes) => {
                try {
                    state.items = JSON.parse(itemsRes) || [];
                    state.lastKnownItemCount = state.items.length;
                    updateUIWithState();
                } catch (e) {
                    console.error("Error parsing project items:", e);
                }
                if (onComplete) onComplete();
            });
        });
    }

    function updateSortTabStatus() {
        const dot = document.getElementById('sortStatusDot');
        const text = document.getElementById('sortStatusText');
        const actionLabel = document.getElementById('sortActionLabel');
        const updateAction = (count) => {
            if (actionLabel) actionLabel.textContent = `Review & Sort ${count} item${count === 1 ? '' : 's'}`;
            elements.btnSortByType.disabled = count === 0;
        };

        if (!state.items || state.items.length === 0) {
            if (text) text.textContent = 'Project empty · import media to sort';
            if (dot) dot.className = 'sort-status-dot';
            updateAction(0);
            return;
        }

        const moves = calculateMoves();
        const count = moves.length;
        updateAction(count);

        if (dot && text) {
            if (count > 0) {
                dot.className = 'sort-status-dot has-items';
                text.textContent = `${count} item${count === 1 ? '' : 's'} ready to sort`;
            } else {
                dot.className = 'sort-status-dot all-clean';
                text.textContent = 'All items organized into clean bins';
            }
        }
    }

    function updateUIWithState() {
        calculateLooseFiles();
        renderFileTree();
        updateSortTabStatus();
    }

    const trustedFoldersKey = 'binwright_trustedAssetFolders';
    let trustedFolders = [];
    try {
        const saved = JSON.parse(localStorage.getItem(trustedFoldersKey) || '[]');
        if (Array.isArray(saved)) trustedFolders = saved.filter(folder => typeof folder === 'string' && folder.trim());
    } catch (error) {
        console.warn('Could not load trusted folders', error);
    }

    function normalizeMediaPath(value) {
        const slashed = value.replace(/\\/g, '/');
        const windows = /^[a-z]:\//i.test(slashed) || slashed.startsWith('//');
        const normalized = path && slashed ? (windows ? path.win32 : path.posix).normalize(slashed).replace(/\\/g, '/') : slashed;
        const trimmed = normalized.replace(/\/+$/, '');
        return windows ? trimmed.toLowerCase() : trimmed;
    }

    function isInMediaFolder(file, folder) {
        return file.startsWith(folder + '/');
    }

    function renderTrustedFolders() {
        document.getElementById('trustedFoldersLabel').textContent = 'Trusted Folders (' + trustedFolders.length + ')';
        const list = document.getElementById('trustedFolderList');
        list.textContent = '';
        trustedFolders.forEach((folder, index) => {
            const row = document.createElement('li');
            const label = document.createElement('span');
            label.textContent = folder;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-secondary btn-sm';
            remove.textContent = 'Remove';
            remove.setAttribute('aria-label', 'Remove trusted folder ' + folder);
            remove.addEventListener('click', () => saveTrustedFolders(trustedFolders.filter((_, i) => i !== index)));
            row.appendChild(label);
            row.appendChild(remove);
            list.appendChild(row);
        });
    }

    function saveTrustedFolders(folders) {
        try {
            localStorage.setItem(trustedFoldersKey, JSON.stringify(folders));
        } catch (error) {
            showToast('Could not save trusted folders.');
            return;
        }
        trustedFolders = folders;
        renderTrustedFolders();
        updateUIWithState();
        if (elements.previewModal.classList.contains('open')) openPreviewModal();
    }

    function calculateLooseFiles() {
        const projectPath = normalizeMediaPath(state.project.path || '');
        const projDir = getDirectory(projectPath);
        const libraries = trustedFolders.map(normalizeMediaPath);
        let looseCount = 0;
        let outsideBytes = 0;
        let trustedCount = 0;
        let inProjectCount = 0;
        let totalSize = 0;
        const locations = new Set();

        state.items.forEach(item => {
            if (item.mediaPath && !item.isBin && !item.isSequence) {
                const mPath = item.mediaPath.replace(/\\/g, '/');
                const dir = getDirectory(mPath);
                locations.add(dir);

                const file = normalizeMediaPath(mPath);
                item.isTrustedSource = libraries.some(folder => isInMediaFolder(file, folder));
                const inside = !!projectPath && isInMediaFolder(file, projDir);
                item.mediaLocation = inside ? 'project' : item.isTrustedSource ? 'trusted' : 'outside';
                item.isLoose = item.mediaLocation === 'outside';
                if (item.isLoose) looseCount++;
                else if (inside) inProjectCount++;
                else trustedCount++;

                if (!item.fileSizeBytes) {
                    item.fileSizeBytes = getEstimatedFileSize(item);
                }
                totalSize += item.fileSizeBytes;
                if (item.isLoose) outsideBytes += item.fileSizeBytes;
            }
        });

        state.totalSize = totalSize;
        state.looseCount = looseCount;
        state.locationCount = locations.size;

        const sizeFormatted = formatBytes(totalSize);
        elements.btnSelectLoose.textContent = 'Select Outside (' + looseCount + ')';
        elements.btnSelectLoose.disabled = looseCount === 0;
        elements.statsLooseSummary.parentElement.classList.toggle('has-outside', looseCount > 0);
        elements.statsSummary.textContent = `${inProjectCount + trustedCount + looseCount} files • ${sizeFormatted} • ${locations.size} locations`;
        
        if (looseCount > 0) {
            elements.statsLooseSummary.textContent = `⚠ ${looseCount} File${looseCount === 1 ? '' : 's'} Outside Project (${formatBytes(outsideBytes)})`;
            elements.statsLooseSummary.style.color = 'var(--amber)';
        } else {
            elements.statsLooseSummary.textContent = 'No untrusted files outside the project folder';
            elements.statsLooseSummary.style.color = 'var(--text-secondary)';
        }
    }

    // --- SORTING RULES ENGINE (LEAF-ONLY SPECIFICITY SCORING) ---
    function calculateMoves() {
        const preset = window.presetManager.getActivePreset();
        const moves = [];
        const lockedFolderNames = preset.folders.filter(f => f.untouchable).map(f => f.name.toLowerCase());
        const lockedFolderSet = new Set(lockedFolderNames);

        // 1. Ignore containers completely: any folder with child rules never acts as a destination
        const hasChildSet = new Set();
        preset.folders.forEach(f => {
            const parts = f.name.split('/');
            for (let i = 1; i < parts.length; i++) {
                hasChildSet.add(parts.slice(0, i).join('/'));
            }
        });

        const isFolderLocked = (folder) => {
            if (!folder || folder.untouchable) return true;
            const parts = folder.name.split('/');
            for (let i = 1; i < parts.length; i++) {
                if (lockedFolderSet.has(parts.slice(0, i).join('/').toLowerCase())) {
                    return true;
                }
            }
            return false;
        };

        // Only unlocked leaf bins participate in sorting
        const leafRules = preset.folders
            .map((folder, orderIndex) => ({ folder, orderIndex }))
            .filter(({ folder }) => !hasChildSet.has(folder.name) && !isFolderLocked(folder));

        state.items.forEach(item => {
            if (item.isBin) return;

            // Respect locked bins: items already inside a locked bin never move out
            const parentLower = (item.parentPath || "").toLowerCase();
            const isInLocked = lockedFolderNames.some(locked => parentLower === locked || parentLower.startsWith(locked + "/"));
            if (isInLocked) {
                return;
            }

            const fileInfo = normalizeItemFileInfo(item);

            // Evaluate all leaf rules and score each match
            const candidates = leafRules
                .map(({ folder, orderIndex }) => evaluateLeafRule(item, fileInfo, folder, orderIndex))
                .filter(Boolean);

            if (candidates.length === 0) {
                // Item matches no rules -> remains untouched where it is
                return;
            }

            candidates.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.hasSpecificType !== a.hasSpecificType) return (b.hasSpecificType ? 1 : 0) - (a.hasSpecificType ? 1 : 0);
                if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
                return a.orderIndex - b.orderIndex;
            });

            const winningMatch = candidates[0];
            if (!winningMatch || !winningMatch.destination) {
                return;
            }

            const targetPath = winningMatch.destination;

            // Queue move if target path differs from current parent bin
            if (item.parentPath !== targetPath && item.parentPath !== ("root/" + targetPath)) {
                moves.push({
                    nodeId: item.nodeId,
                    name: item.name,
                    mediaPath: item.mediaPath || "",
                    originPath: item.parentPath || "Project root",
                    targetPath: targetPath,
                    isLoose: !!item.isLoose,
                    type: item.type,
                    matchReason: winningMatch.reason,
                    priority: winningMatch.score
                });
            }
        });

        state.pendingMoves = moves;
        return moves;
    }

    // --- PREVIEW SORT MODAL ---
    let previewActiveFilter = 'all';

    function formatBinPath(path) {
        if (!path) return 'Project Root';
        const parts = path.split('/');
        if (parts.length === 1) {
            return `<strong class="path-leaf">${escapeHtml(parts[0])}</strong>`;
        }
        const separator = '<span class="files-path-separator" aria-hidden="true"></span>';
        const parents = parts.slice(0, -1).map(escapeHtml).join(separator);
        const leaf = `<strong class="path-leaf">${escapeHtml(parts[parts.length - 1])}</strong>`;
        return parents + separator + leaf;
    }

    function getItemIconSvg(type, name, matchReason) {
        const t = (type || '').toLowerCase();
        const r = (matchReason || '').toLowerCase();
        const n = (name || '').toLowerCase();

        // Nest / Sequence (Premiere timeline tracks with playhead)
        if (t === 'sequence' || r.includes('sequence') || r.includes('nest') || n.includes('nested sequence') || n.endsWith('.prproj')) {
            return `<span class="preview-item-icon" title="Sequence / Nest"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="10" y1="4" x2="10" y2="20"></line><line x1="4" y1="9" x2="8" y2="9"></line><line x1="12" y1="9" x2="18" y2="9"></line><line x1="12" y1="15" x2="16" y2="15"></line></svg></span>`;
        }
        // Generated Media (Adjustment Layer, Color Matte, etc. - layer stack)
        if (r.includes('generated') || n.includes('adjustment layer') || n.includes('color matte')) {
            return `<span class="preview-item-icon" title="Generated Media"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg></span>`;
        }
        // Audio (Beamed musical note)
        if (t === 'audio' || n.endsWith('.mp3') || n.endsWith('.wav') || n.endsWith('.m4a') || n.endsWith('.aac') || n.endsWith('.aif') || n.endsWith('.flac') || n.endsWith('.ogg')) {
            return `<span class="preview-item-icon" title="Audio"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg></span>`;
        }
        // Video (Video camera)
        if (t === 'video' || n.endsWith('.mp4') || n.endsWith('.mov') || n.endsWith('.mxf') || n.endsWith('.avi') || n.endsWith('.mkv') || n.endsWith('.m4v') || n.endsWith('.mts')) {
            return `<span class="preview-item-icon" title="Video"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"></path><rect x="2" y="6" width="14" height="12" rx="2"></rect></svg></span>`;
        }
        // Graphic / Image
        if (t === 'image' || t === 'graphics' || n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.svg') || n.endsWith('.psd') || n.endsWith('.ai')) {
            return `<span class="preview-item-icon" title="Graphic / Image"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></span>`;
        }
        // Default / Generic Item
        return `<span class="preview-item-icon" title="Item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></span>`;
    }

    function renderPreviewFilterBar(allMoves) {
        if (!elements.previewFilterBar) return;
        const looseCount = allMoves.filter(m => m.isLoose).length;

        let audioCount = 0;
        let videoCount = 0;
        let graphicCount = 0;
        let seqCount = 0;
        let generatedCount = 0;

        allMoves.forEach(m => {
            const t = (m.type || '').toLowerCase();
            const r = (m.matchReason || '').toLowerCase();
            const n = (m.name || '').toLowerCase();
            if (t === 'sequence' || r.includes('sequence') || r.includes('nest') || n.includes('nested sequence') || n.endsWith('.prproj')) {
                seqCount++;
            } else if (r.includes('generated') || n.includes('adjustment layer') || n.includes('color matte')) {
                generatedCount++;
            } else if (t === 'audio' || n.endsWith('.mp3') || n.endsWith('.wav') || n.endsWith('.m4a') || n.endsWith('.aac') || n.endsWith('.aif') || n.endsWith('.flac') || n.endsWith('.ogg')) {
                audioCount++;
            } else if (t === 'video' || n.endsWith('.mp4') || n.endsWith('.mov') || n.endsWith('.mxf') || n.endsWith('.avi') || n.endsWith('.mkv') || n.endsWith('.m4v') || n.endsWith('.mts')) {
                videoCount++;
            } else if (t === 'image' || t === 'graphics' || n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.svg') || n.endsWith('.psd') || n.endsWith('.ai')) {
                graphicCount++;
            }
        });

        const filters = [{ id: 'all', label: 'All', count: allMoves.length }];
        if (looseCount > 0) {
            filters.push({ id: 'outside', label: 'Outside Project', count: looseCount });
        }
        if (audioCount > 0) {
            filters.push({ id: 'audio', label: 'Audio', count: audioCount });
        }
        if (videoCount > 0) {
            filters.push({ id: 'video', label: 'Video', count: videoCount });
        }
        if (graphicCount > 0) {
            filters.push({ id: 'graphics', label: 'Graphics', count: graphicCount });
        }
        if (generatedCount > 0) {
            filters.push({ id: 'generated', label: 'Generated', count: generatedCount });
        }
        if (seqCount > 0) {
            filters.push({ id: 'sequence', label: 'Sequences', count: seqCount });
        }

        elements.previewFilterBar.innerHTML = filters.map(f => `
            <button type="button" class="preview-filter-pill ${previewActiveFilter === f.id ? 'active' : ''}" data-filter="${f.id}">
                ${escapeHtml(f.label)} <span class="filter-count">${f.count}</span>
            </button>
        `).join('');

        elements.previewFilterBar.querySelectorAll('.preview-filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                previewActiveFilter = btn.getAttribute('data-filter') || 'all';
                elements.previewFilterBar.querySelectorAll('.preview-filter-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderPreviewList();
            });
        });
    }

    function openPreviewModal() {
        const moves = calculateMoves();
        const looseCount = moves.filter(m => m.isLoose).length;

        previewActiveFilter = 'all';

        if (elements.previewTitle) {
            elements.previewTitle.textContent = "Review Sort";
        }
        if (elements.previewCountBadge) {
            elements.previewCountBadge.textContent = moves.length;
        }
        if (elements.previewSubtitle) {
            elements.previewSubtitle.textContent = looseCount
                ? `${looseCount} item${looseCount === 1 ? '' : 's'} linked to media outside project folder`
                : 'Project bins only · media files stay in place';
        }
        if (elements.previewSubtitleRow) {
            elements.previewSubtitleRow.classList.toggle('has-outside', looseCount > 0);
        }
        if (elements.btnConfirmSort) {
            elements.btnConfirmSort.textContent = `Sort ${moves.length} item${moves.length === 1 ? '' : 's'}`;
            elements.btnConfirmSort.disabled = moves.length === 0;
        }

        renderPreviewFilterBar(moves);
        renderPreviewList();
        elements.previewModal.classList.add('open');
    }

    function closePreviewModal() {
        elements.previewModal.classList.remove('open');
    }

    function renderPreviewList() {
        elements.previewList.innerHTML = '';
        const allMoves = state.pendingMoves || [];
        if (allMoves.length === 0) {
            elements.previewList.innerHTML = `<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:12px;">All items are already organized into clean bins!</div>`;
            return;
        }

        let filteredMoves = allMoves;
        if (previewActiveFilter === 'outside') {
            filteredMoves = allMoves.filter(m => m.isLoose);
        } else if (previewActiveFilter === 'audio') {
            filteredMoves = allMoves.filter(m => {
                const t = (m.type || '').toLowerCase();
                const n = (m.name || '').toLowerCase();
                return t === 'audio' || n.endsWith('.mp3') || n.endsWith('.wav') || n.endsWith('.m4a') || n.endsWith('.aac') || n.endsWith('.aif') || n.endsWith('.flac') || n.endsWith('.ogg');
            });
        } else if (previewActiveFilter === 'video') {
            filteredMoves = allMoves.filter(m => {
                const t = (m.type || '').toLowerCase();
                const n = (m.name || '').toLowerCase();
                return t === 'video' || n.endsWith('.mp4') || n.endsWith('.mov') || n.endsWith('.mxf') || n.endsWith('.avi') || n.endsWith('.mkv') || n.endsWith('.m4v') || n.endsWith('.mts');
            });
        } else if (previewActiveFilter === 'graphics') {
            filteredMoves = allMoves.filter(m => {
                const t = (m.type || '').toLowerCase();
                const n = (m.name || '').toLowerCase();
                return t === 'image' || t === 'graphics' || n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.svg') || n.endsWith('.psd') || n.endsWith('.ai');
            });
        } else if (previewActiveFilter === 'generated') {
            filteredMoves = allMoves.filter(m => {
                const r = (m.matchReason || '').toLowerCase();
                const n = (m.name || '').toLowerCase();
                return r.includes('generated') || n.includes('adjustment layer') || n.includes('color matte');
            });
        } else if (previewActiveFilter === 'sequence') {
            filteredMoves = allMoves.filter(m => {
                const t = (m.type || '').toLowerCase();
                const r = (m.matchReason || '').toLowerCase();
                const n = (m.name || '').toLowerCase();
                return t === 'sequence' || r.includes('sequence') || r.includes('nest') || n.includes('nested sequence') || n.endsWith('.prproj');
            });
        }

        if (filteredMoves.length === 0) {
            elements.previewList.innerHTML = `<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:12px;">No items match this filter.</div>`;
            return;
        }

        const groups = new Map();
        filteredMoves.forEach(m => {
            const key = m.targetPath || 'Project Root';
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(m);
        });

        groups.forEach((items, targetPath) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'preview-group';

            const headerHtml = `
                <div class="preview-group-header">
                    <div class="preview-group-header-left">
                        <svg class="preview-folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
                        </svg>
                        <span class="preview-group-path">${formatBinPath(targetPath)}</span>
                    </div>
                    <span class="preview-group-count">${items.length} ${items.length === 1 ? 'item' : 'items'}</span>
                </div>
            `;

            const cardEl = document.createElement('div');
            cardEl.className = 'preview-group-card';

            items.forEach(move => {
                const row = document.createElement('div');
                row.className = 'preview-item-row';

                const reasonText = move.matchReason || 'matching rule';
                const iconHtml = getItemIconSvg(move.type, move.name, move.matchReason);

                row.innerHTML = `
                    <div class="preview-item-left">
                        ${iconHtml}
                        <span class="preview-item-name" title="${escapeHtml(move.name)}">${escapeHtml(move.name)}</span>
                    </div>
                    <div class="preview-item-right">
                        <span class="preview-rule-pill" title="${escapeHtml(reasonText)}">${escapeHtml(reasonText)}</span>
                        ${move.isLoose ? '<span class="preview-outside-pill">Outside Project</span>' : ''}
                    </div>
                `;
                cardEl.appendChild(row);
            });

            groupEl.innerHTML = headerHtml;
            groupEl.appendChild(cardEl);
            elements.previewList.appendChild(groupEl);
        });
    }

    // --- SORT EXECUTION ---
    function executeSort(forceMoves, options) {
        const opts = options || {};
        const hasExplicitMoves = Array.isArray(forceMoves) && forceMoves.length > 0;
        let moves = hasExplicitMoves ? forceMoves : null;

        const runSort = () => {
            if (!moves) {
                state.pendingMoves = [];
                moves = calculateMoves();
            }
            state.pendingMoves = [];

            if (!moves || moves.length === 0) {
                if (!opts.silent && !opts.isAutoSort) showToast("Project already clean!");
                return;
            }

            if (window.__adobe_cep__) {
                const encoded = encodeURIComponent(JSON.stringify(moves));
                csInterface.evalScript(`$._PPP_.moveItemsToBins(decodeURIComponent("${encoded}"))`, (res) => {
                    let movedCount = 0;
                    try {
                        const result = JSON.parse(res);
                        movedCount = (typeof result.count === 'number') ? result.count : moves.length;
                    } catch (e) {
                        console.error("Error parsing moveItemsToBins result:", e, res);
                    }
                    closePreviewModal();
                    scanProject(() => {
                        if (movedCount > 0) {
                            showToast(`Sorted ${movedCount} item${movedCount === 1 ? '' : 's'}.`);
                        } else if (!opts.silent && !opts.isAutoSort) {
                            showToast("No items were moved.");
                        }
                    });
                });
            } else {
                // Simulated
                moves.forEach(m => {
                    const found = state.items.find(i => i.nodeId === m.nodeId);
                    if (found) found.parentPath = m.targetPath;
                });
                showToast(`Sorted ${moves.length} item${moves.length === 1 ? '' : 's'}.`);
                closePreviewModal();
                updateUIWithState();
            }
        };

        // When sorting directly without preview, rescan project first to ensure 100% fresh data
        if (!hasExplicitMoves) {
            scanProject(() => {
                runSort();
            });
        } else {
            runSort();
        }
    }

    // --- CREATE BINS & FLATTEN BINS ---
    function createBins() {
        const preset = window.presetManager.getActivePreset();
        state.pendingMoves = [];
        if (window.__adobe_cep__) {
            const encoded = encodeURIComponent(JSON.stringify(preset));
            csInterface.evalScript(`$._PPP_.createLayoutBins(decodeURIComponent("${encoded}"))`, () => {
                showToast("Created bin hierarchy.");
                scanProject();
            });
        } else {
            showToast("Created bin hierarchy.");
        }
    }

    function flattenEmptyBins() {
        const preset = window.presetManager.getActivePreset();
        const protectedNames = preset.folders.map(f => f.name);
        state.pendingMoves = [];

        if (window.__adobe_cep__) {
            const encoded = encodeURIComponent(JSON.stringify(protectedNames));
            csInterface.evalScript(`$._PPP_.flattenEmptyBins(decodeURIComponent("${encoded}"))`, (res) => {
                let count = 0;
                try {
                    const r = JSON.parse(res);
                    count = (typeof r.count === 'number') ? r.count : 0;
                } catch (e) {}

                if (count > 0) {
                    showToast(`Flattened ${count} empty bin${count === 1 ? '' : 's'}.`);
                } else {
                    showToast("No empty bins found.");
                }
                scanProject();
            });
        } else {
            // Standalone preview fallback
            let count = 0;
            if (Array.isArray(state.items)) {
                const occupiedPaths = new Set();
                state.items.forEach(it => {
                    if (it.parentPath && it.parentPath !== 'root') {
                        occupiedPaths.add(it.parentPath.toLowerCase());
                    }
                });
                state.items = state.items.filter(it => {
                    if (it.isBin) {
                        const isProtected = protectedNames.some(p => p.toLowerCase() === it.name.toLowerCase());
                        const hasChildren = occupiedPaths.has(it.name.toLowerCase());
                        if (!isProtected && !hasChildren) {
                            count++;
                            return false;
                        }
                    }
                    return true;
                });
            }
            if (count > 0) {
                showToast(`Flattened ${count} empty bin${count === 1 ? '' : 's'}.`);
            } else {
                showToast("No empty bins found.");
            }
            renderPreviewList();
        }
    }

    function deleteAllBins() {
        const confirmMsg = "Are you sure you want to delete all bins?\n\nAll files and sequences will be safely moved to the root level.";
        if (!confirm(confirmMsg)) {
            return;
        }

        state.pendingMoves = [];

        if (window.__adobe_cep__) {
            csInterface.evalScript('$._PPP_.deleteAllBins()', (res) => {
                let r = null;
                try {
                    r = JSON.parse(res);
                } catch (e) {}

                if (r && r.success) {
                    const binText = `${r.deletedBinsCount || 0} bin${r.deletedBinsCount === 1 ? '' : 's'}`;
                    const itemText = `${r.movedItemsCount || 0} item${r.movedItemsCount === 1 ? '' : 's'}`;
                    showToast(`Deleted ${binText} (${itemText} moved to root).`);
                } else if (r && r.error) {
                    showToast(`Error: ${r.error}`);
                } else {
                    showToast("All bins deleted.");
                }
                scanProject();
            });
        } else {
            // Standalone preview fallback
            let movedCount = 0;
            let binCount = 0;
            if (Array.isArray(state.items)) {
                state.items.forEach(it => {
                    if (!it.isBin) {
                        if (it.parentPath && it.parentPath !== 'root') {
                            it.parentPath = 'root';
                            movedCount++;
                        }
                    } else {
                        binCount++;
                    }
                });
                state.items = state.items.filter(it => !it.isBin);
            }
            showToast(`Deleted ${binCount} bins (${movedCount} items moved to root).`);
            renderPreviewList();
            renderFileTree();
        }
    }

    // --- AUTO-SORT BACKGROUND WATCHER ---
    function toggleAutoSort(enabled) {
        state.autoSortEnabled = enabled;
        if (state.autoSortTimer) {
            clearInterval(state.autoSortTimer);
            state.autoSortTimer = null;
        }
        state.isAutoSorting = false;
        state.autoSortFailCount = {};

        if (enabled) {
            showToast("Auto-sort active");
            state.autoSortTimer = setInterval(() => {
                if (state.isAutoSorting) return;
                state.isAutoSorting = true;

                scanProject(() => {
                    // Reset failure counts for items that are no longer in root
                    if (state.autoSortFailCount) {
                        Object.keys(state.autoSortFailCount).forEach(nid => {
                            const foundItem = state.items.find(i => String(i.nodeId) === String(nid));
                            if (!foundItem || (foundItem.parentPath && foundItem.parentPath !== 'root' && foundItem.parentPath !== 'Project root')) {
                                delete state.autoSortFailCount[nid];
                            }
                        });
                    }

                    const moves = calculateMoves();
                    let rootMoves = moves.filter(m => m.originPath === 'Project root' || m.originPath === 'root' || !m.originPath);

                    // Filter out items that have repeatedly failed to move (prevent infinite loop spam)
                    rootMoves = rootMoves.filter(m => (state.autoSortFailCount[m.nodeId] || 0) < 3);

                    if (rootMoves.length > 0) {
                        rootMoves.forEach(m => {
                            state.autoSortFailCount[m.nodeId] = (state.autoSortFailCount[m.nodeId] || 0) + 1;
                        });
                        executeSort(rootMoves, { isAutoSort: true });
                    }
                    state.isAutoSorting = false;
                });
            }, 3000);
        }
    }

    // --- FILES TAB: TREE & RELOCATION ---
    function updateFileSelection() {
        const items = state.items.filter(i => i.mediaPath && !i.isBin && !i.isSequence);
        const selected = items.filter(i => state.selectedNodeIds.has(i.nodeId));
        const selectedSize = formatBytes(selected.reduce((sum, item) => sum + (item.fileSizeBytes || 0), 0));
        document.getElementById('filesRelinkCount').textContent = '(' + selected.length + ' selected)';
        document.getElementById('filesSelectionSummary').textContent = selected.length + ' of ' + items.length + ' files selected (' + selectedSize + ')';
        const all = document.getElementById('filesSelectAll');
        all.checked = items.length > 0 && selected.length === items.length;
        all.indeterminate = selected.length > 0 && selected.length < items.length;
        const copy = document.querySelector('input[name="relocateMode"][value="copy"]');
        const move = document.querySelector('input[name="relocateMode"][value="move"]');
        const hasTrusted = selected.some(item => item.isTrustedSource);
        move.disabled = hasTrusted;
        if (hasTrusted) copy.checked = true;
        const mode = copy.checked ? 'copy' : 'move';
        const verb = mode === 'copy' ? 'Copy' : 'Move';
        elements.btnRelocateFiles.textContent = `${verb} & Relink ${selected.length} File${selected.length === 1 ? '' : 's'} (${selectedSize})`;
        document.getElementById('relocateModeHint').hidden = !hasTrusted;
        elements.btnRelocateFiles.disabled = selected.length === 0 || !!state.relocatingFiles;
        document.getElementById('relocateModeHint').textContent = hasTrusted
            ? 'Trusted library files can only be copied.'
            : mode === 'copy'
            ? 'Copy keeps the originals.'
            : 'Move relocates the original files and relinks selected clips.';
        elements.fileTreeContainer.querySelectorAll('.tree-item').forEach(row => {
            row.classList.toggle('is-selected', row.querySelector('.file-chk').checked);
        });
    }

    function renderFileTree() {
        elements.fileTreeContainer.innerHTML = '';
        const mediaItems = state.items.filter(i => i.mediaPath && !i.isBin && !i.isSequence);
        if (!state.collapsedFileGroups) state.collapsedFileGroups = new Set();
        const groups = new Map();
        mediaItems.forEach(item => {
            const diskPath = item.mediaPath.replace(/\\/g, '/');
            const lower = diskPath.toLowerCase();
            let group = item.parentPath || 'Project root';
            if (state.fileViewMode === 'disk') {
                if (item.mediaLocation === 'project') group = 'Project folder';
                else if (item.mediaLocation === 'trusted') group = 'Trusted library';
                else if (lower.includes('/downloads/')) group = 'Downloads';
                else if (lower.includes('/desktop/')) group = 'Desktop';
                else group = getDirectory(item.mediaPath) || 'Other locations';
            }
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group).push(item);
        });
        if (!mediaItems.length) {
            elements.fileTreeContainer.innerHTML = '<div class="files-empty">No linked media files in this project.</div>';
        }
        if (state.fileViewMode === 'disk' && groups.has('Trusted library')) {
            const trustedItems = groups.get('Trusted library');
            groups.delete('Trusted library');
            groups.set('Trusted library', trustedItems);
        }

        groups.forEach((items, name) => {
            const key = state.fileViewMode + ':' + name;
            const collapsed = state.collapsedFileGroups.has(key);
            const group = document.createElement('div');
            group.className = 'tree-group';
            const heading = document.createElement('button');
            heading.type = 'button';
            heading.className = 'files-group-toggle';
            heading.setAttribute('aria-expanded', String(!collapsed));
            heading.title = name;
            const breadcrumbs = name.split(/[\\/]+/).filter(Boolean)
                .map(escapeHtml).join('<span class="files-path-separator" aria-hidden="true"></span>');
            heading.innerHTML = `<svg class="files-chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg><span class="files-folder-icon">${FOLDER_OUTLINE_SVG}</span><span class="files-group-name">${breadcrumbs || escapeHtml(name)}</span><span class="files-group-count">(${items.length} files · ${formatBytes(items.reduce((sum, item) => sum + (item.fileSizeBytes || 0), 0))})</span>`;
            const contents = document.createElement('div');
            contents.hidden = collapsed;
            heading.addEventListener('click', () => {
                if (state.collapsedFileGroups.has(key)) state.collapsedFileGroups.delete(key);
                else state.collapsedFileGroups.add(key);
                renderFileTree();
            });
            items.forEach(item => {
                const row = document.createElement('label');
                row.className = 'tree-item';
                row.title = item.mediaPath;
                row.innerHTML = `<span class="tree-item-name"><input type="checkbox" class="file-chk" ${state.selectedNodeIds.has(item.nodeId) ? 'checked' : ''}><span class="files-type-icon">${getItemIconSvg(item.type, item.name, '')}</span><span class="files-item-label">${escapeHtml(item.name)}</span></span><span class="files-status ${item.mediaLocation === 'outside' ? 'is-outside' : ''}">${item.mediaLocation === 'trusted' ? 'Trusted' : item.mediaLocation === 'project' ? 'In Project' : 'Outside'}</span><span class="tree-item-size">${formatBytes(item.fileSizeBytes || 0)}</span>`;
                row.querySelector('input').addEventListener('change', e => {
                    if (e.target.checked) state.selectedNodeIds.add(item.nodeId);
                    else state.selectedNodeIds.delete(item.nodeId);
                    updateFileSelection();
                });
                if (state.fileViewMode === 'bin' && item.mediaLocation === 'trusted') {
                    const badge = document.createElement('span');
                    badge.className = 'files-library-badge';
                    badge.textContent = 'Trusted library';
                    row.querySelector('.tree-item-name').appendChild(badge);
                }
                contents.appendChild(row);
            });
            group.appendChild(heading);
            group.appendChild(contents);
            elements.fileTreeContainer.appendChild(group);
        });
        updateFileSelection();
    }

    function selectLooseFiles() {
        state.selectedNodeIds.clear();
        state.items.forEach(item => {
            if (item.isLoose && item.mediaPath) {
                state.selectedNodeIds.add(item.nodeId);
            }
        });
        renderFileTree();
        showToast(`Selected ${state.selectedNodeIds.size} outside files`);
    }

    function clearSelection() {
        state.selectedNodeIds.clear();
        renderFileTree();
    }

    function mediaFileSnapshot(file) {
        const stat = fs.lstatSync(file);
        if (!stat.isFile()) throw new Error('Cannot compare a non-regular file: ' + file);
        return [stat.dev, stat.ino, stat.size, stat.mtime.getTime(), stat.ctime.getTime()];
    }

    function verifyMediaSnapshots(source, target, snapshots) {
        const unchanged = [source, target].every((file, index) =>
            mediaFileSnapshot(file).every((value, field) => value === snapshots[index][field])
        );
        if (!unchanged) throw new Error('A file changed during duplicate verification.');
    }

    function hashMediaFile(file) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(file);
            stream.on('data', chunk => hash.update(chunk));
            stream.once('error', reject);
            stream.once('end', () => resolve(hash.digest('hex')));
        });
    }

    async function prepareRelocationTarget(source, target, normalizePath) {
        try {
            fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
            return { target, kind: 'copied' };
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }

        try {
            if (normalizePath(fs.realpathSync(source)) === normalizePath(fs.realpathSync(target))) {
                throw new Error('The file is already at the destination.');
            }
            const snapshots = [mediaFileSnapshot(source), mediaFileSnapshot(target)];
            if (snapshots[0][2] === snapshots[1][2]) {
                const sourceHash = await hashMediaFile(source);
                const targetHash = await hashMediaFile(target);
                verifyMediaSnapshots(source, target, snapshots);
                if (sourceHash === targetHash) return { target, kind: 'reused', snapshots };
            }
        } catch (error) {
            throw new Error('Duplicate comparison failed: ' + error.message);
        }

        const parsed = path.parse(target);
        for (let number = 2; ; number++) {
            const candidate = path.join(parsed.dir, parsed.name + ' (' + number + ')' + parsed.ext);
            try {
                fs.copyFileSync(source, candidate, fs.constants.COPYFILE_EXCL);
                return { target: candidate, kind: 'renamed' };
            } catch (error) {
                if (error.code !== 'EEXIST') throw error;
            }
        }
    }

    // Execute File Relocation
    async function relocateFiles() {
        if (state.relocatingFiles) return;
        const destDir = elements.relocateDestInput.value.trim();
        if (!destDir) {
            alert("Please specify a destination project folder.");
            return;
        }
        if (!fs || !path || !window.__adobe_cep__) {
            showToast("File relocation requires Premiere Pro.");
            return;
        }

        const selectedItems = state.items.filter(i => state.selectedNodeIds.has(i.nodeId) && i.mediaPath);
        if (!selectedItems.length) return;

        const mirrorLayout = elements.chkMirrorLayout.checked;
        const mode = document.querySelector('input[name="relocateMode"]:checked').value;
        if (mode === 'move' && selectedItems.some(item => item.isTrustedSource)) {
            showToast('Trusted library files can only be copied.');
            return;
        }
        const moves = mirrorLayout ? calculateMoves() : [];
        const normalizePath = value => {
            const normalized = path.resolve(value);
            return path.sep === '\\' ? normalized.toLowerCase() : normalized;
        };

        state.relocatingFiles = true;
        elements.btnRelocateFiles.disabled = true;
        elements.relocateProgressWrap.style.display = 'block';
        elements.relocateProgressFill.style.width = '0%';
        let linked = 0;

        try {
            for (const [index, item] of selectedItems.entries()) {
                const source = item.mediaPath;
                const fileName = getFileName(source);
                let transfer;
                let verified = false;
                let message;

                try {
                    const bin = moves.find(move => move.nodeId === item.nodeId)?.targetPath || item.parentPath || 'Media';
                    const targetDir = mirrorLayout ? path.resolve(destDir, bin) : path.resolve(destDir);
                    const relativeDir = path.relative(path.resolve(destDir), targetDir);
                    if (relativeDir === '..' || relativeDir.startsWith('..' + path.sep) || path.isAbsolute(relativeDir)) {
                        throw new Error('The bin path points outside the destination folder.');
                    }
                    const requestedTarget = path.join(targetDir, fileName);
                    if (normalizePath(source) === normalizePath(requestedTarget)) {
                        throw new Error('The file is already at the destination.');
                    }

                    ensureDirectoryExists(targetDir);
                    transfer = await prepareRelocationTarget(source, requestedTarget, normalizePath);
                    const target = transfer.target;
                    if (transfer.snapshots) verifyMediaSnapshots(source, target, transfer.snapshots);

                    const args = encodeURIComponent(JSON.stringify([String(item.nodeId), source, target]));
                    const result = await new Promise(resolve => {
                        csInterface.evalScript('$._PPP_.relinkMediaPath(decodeURIComponent("' + args + '"))', resolve);
                    });
                    if (result !== 'OK') throw new Error(result || 'Premiere returned no relink result.');

                    verified = true;
                    item.mediaPath = target;
                    linked++;
                    state.selectedNodeIds.delete(item.nodeId);
                    const outcome = transfer.kind === 'reused' ? 'Reused identical file' :
                        transfer.kind === 'renamed' ? 'Renamed to avoid a collision' : 'Relinked';
                    message = outcome + ': ' + target;

                    if (mode === 'move') {
                        const stillReferenced = state.items.some(other => other.mediaPath && normalizePath(other.mediaPath) === normalizePath(source));
                        if (trustedFolders.some(folder => isInMediaFolder(normalizeMediaPath(source), normalizeMediaPath(folder)))) {
                            message += ' (trusted original kept)';
                        } else if (stillReferenced) {
                            message += ' (original kept because another clip uses it)';
                        } else {
                            if (transfer.snapshots) {
                                verifyMediaSnapshots(source, target, transfer.snapshots);
                                if (normalizePath(fs.realpathSync(source)) === normalizePath(fs.realpathSync(target))) {
                                    throw new Error('The source and destination now point to the same path.');
                                }
                            }
                            fs.unlinkSync(source);
                        }
                    }
                } catch (error) {
                    const prefix = verified ? 'Relinked, original kept' : transfer ? 'Relink failed, original kept' : 'Transfer failed';
                    message = prefix + ': ' + error.message;
                }

                if (verified) console.info(fileName + ' — ' + message);
                else console.warn(fileName + ' — ' + message);
                elements.relocateProgressFill.style.width = Math.round((index + 1) / selectedItems.length * 100) + '%';
            }

            showToast('Relinked ' + linked + ' of ' + selectedItems.length + ' files.');
        } finally {
            elements.relocateProgressWrap.style.display = 'none';
            state.relocatingFiles = false;
            scanProject();
            renderFileTree();
        }
    }


    // --- CUSTOM MATCHING RULE DROPDOWN (matching Image 2) ---
    function setCustomTypeValue(val) {
        if (elements.newRuleType) {
            elements.newRuleType.value = val;
        }
        const itemData = MATCHING_RULE_TYPES.find(i => i.value === val) || MATCHING_RULE_TYPES[0];
        const triggerIcon = document.getElementById('customTypeTriggerIcon');
        const triggerTitle = document.getElementById('customTypeTriggerTitle');
        const triggerSub = document.getElementById('customTypeTriggerSub');

        if (triggerIcon) {
            triggerIcon.innerHTML = (val === 'all') ? `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
                    <line x1="7" y1="2" x2="7" y2="22"/>
                    <line x1="17" y1="2" x2="17" y2="22"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <line x1="2" y1="7" x2="7" y2="7"/>
                    <line x1="2" y1="17" x2="7" y2="17"/>
                    <line x1="17" y1="17" x2="22" y2="17"/>
                    <line x1="17" y1="7" x2="22" y2="7"/>
                </svg>` : itemData.icon;
        }
        if (triggerTitle) triggerTitle.textContent = itemData.title;
        if (triggerSub) triggerSub.textContent = itemData.sub || '';

        const menu = document.getElementById('customTypeMenu');
        if (menu) {
            menu.querySelectorAll('.custom-type-item').forEach(el => {
                const isMatch = el.getAttribute('data-value') === val;
                el.classList.toggle('is-active', isMatch);
                el.setAttribute('aria-selected', isMatch ? 'true' : 'false');
            });
        }
    }

    function setCustomTypeDisabled(disabled, tooltipText = '') {
        if (elements.newRuleType) {
            elements.newRuleType.disabled = disabled;
            elements.newRuleType.title = tooltipText || '';
        }
        const trigger = document.getElementById('customTypeTrigger');
        if (trigger) {
            trigger.disabled = disabled;
            trigger.title = tooltipText || '';
            if (disabled) closeCustomTypeMenu();
        }
    }

    function renderCustomTypeMenu() {
        const menu = document.getElementById('customTypeMenu');
        if (!menu) return;
        menu.innerHTML = '';
        const currentVal = elements.newRuleType ? elements.newRuleType.value : 'all';
        const checkSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

        MATCHING_RULE_TYPES.forEach(item => {
            const isActive = item.value === currentVal;
            const row = document.createElement('div');
            row.className = `custom-type-item ${isActive ? 'is-active' : ''}`;
            row.setAttribute('data-value', item.value);
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', isActive ? 'true' : 'false');

            row.innerHTML = `
                <div class="custom-type-item-left">
                    <span class="custom-type-item-icon">${item.icon}</span>
                    <span class="custom-type-item-title">${item.title}</span>
                    ${item.sub ? `<span class="custom-type-item-sub">${item.sub}</span>` : ''}
                </div>
                <span class="custom-type-item-check">${checkSvg}</span>
            `;

            row.addEventListener('click', (e) => {
                e.stopPropagation();
                setCustomTypeValue(item.value);
                closeCustomTypeMenu();
            });

            menu.appendChild(row);
        });
    }

    function toggleCustomTypeMenu() {
        const trigger = document.getElementById('customTypeTrigger');
        const menu = document.getElementById('customTypeMenu');
        if (!trigger || !menu || trigger.disabled) return;
        if (menu.classList.contains('is-open')) {
            closeCustomTypeMenu();
        } else {
            openCustomTypeMenu();
        }
    }

    function openCustomTypeMenu() {
        closeCustomParentMenu();
        closeFilterFloatingMenu();
        const trigger = document.getElementById('customTypeTrigger');
        const menu = document.getElementById('customTypeMenu');
        if (!trigger || !menu || trigger.disabled) return;
        renderCustomTypeMenu();
        menu.classList.add('is-open');
        trigger.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
    }

    function closeCustomTypeMenu() {
        const trigger = document.getElementById('customTypeTrigger');
        const menu = document.getElementById('customTypeMenu');
        if (!trigger || !menu) return;
        menu.classList.remove('is-open');
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
    }

    // --- CUSTOM PARENT BIN DROPDOWN ---
    const FOLDER_OUTLINE_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`;
    const FOLDER_FILLED_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#eab308" stroke="none"><path d="M2 5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z"/></svg>`;

    function setCustomParentValue(val) {
        if (elements.newRuleParent) {
            elements.newRuleParent.value = val || '';
        }
        const triggerTitle = document.getElementById('customParentTriggerTitle');
        const triggerIcon = document.getElementById('customParentTriggerIcon');
        if (triggerTitle) {
            triggerTitle.textContent = val ? val : 'Top Level (None)';
        }
        if (triggerIcon) {
            triggerIcon.innerHTML = val ? FOLDER_FILLED_SVG : FOLDER_OUTLINE_SVG;
        }

        const menu = document.getElementById('customParentMenu');
        if (menu) {
            menu.querySelectorAll('.custom-type-item').forEach(el => {
                const isMatch = (el.getAttribute('data-value') || '') === (val || '');
                el.classList.toggle('is-active', isMatch);
                el.setAttribute('aria-selected', isMatch ? 'true' : 'false');
            });
        }

        const activePreset = window.presetManager.getActivePreset();
        if (val && activePreset && Array.isArray(activePreset.folders)) {
            const pFolder = activePreset.folders.find(f => f.name === val);
            if (pFolder && pFolder.matchType && !isWildcardMatchType(pFolder.matchType)) {
                setCustomTypeValue(pFolder.matchType);
            }
        }
        setCustomTypeDisabled(false, '');
    }

    function renderCustomParentMenu() {
        const menu = document.getElementById('customParentMenu');
        if (!menu) return;
        menu.innerHTML = '';

        const activePreset = window.presetManager.getActivePreset();
        const currentVal = elements.newRuleParent ? elements.newRuleParent.value : '';
        const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

        // Synchronize hidden select
        if (elements.newRuleParent) {
            let opts = '<option value="">Top Level (None)</option>';
            if (activePreset && Array.isArray(activePreset.folders)) {
                activePreset.folders.forEach(f => {
                    opts += `<option value="${f.name}">${f.name}</option>`;
                });
            }
            elements.newRuleParent.innerHTML = opts;
            elements.newRuleParent.value = currentVal || '';
        }

        // 1. Top Level (None)
        const isTopActive = !currentVal;
        const topRow = document.createElement('div');
        topRow.className = `custom-type-item ${isTopActive ? 'is-active' : ''}`;
        topRow.setAttribute('data-value', '');
        topRow.setAttribute('role', 'option');
        topRow.setAttribute('aria-selected', isTopActive ? 'true' : 'false');
        topRow.innerHTML = `
            <div class="custom-type-item-left">
                <span class="custom-type-item-icon">${FOLDER_OUTLINE_SVG}</span>
                <span class="custom-type-item-title">Top Level (None)</span>
            </div>
            <span class="custom-type-item-check">${checkSvg}</span>
        `;
        topRow.addEventListener('click', (e) => {
            e.stopPropagation();
            setCustomParentValue('');
            closeCustomParentMenu();
        });
        menu.appendChild(topRow);

        // 2. Preset folders
        if (activePreset && Array.isArray(activePreset.folders)) {
            activePreset.folders.forEach(f => {
                const isActive = (f.name === currentVal);
                const row = document.createElement('div');
                row.className = `custom-type-item ${isActive ? 'is-active' : ''}`;
                row.setAttribute('data-value', f.name);
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', isActive ? 'true' : 'false');

                const depth = f.name.split('/').length - 1;
                const indentPx = depth > 0 ? (depth * 10) : 0;
                const displayName = f.name.split('/').pop();

                row.innerHTML = `
                    <div class="custom-type-item-left" style="padding-left: ${indentPx}px;">
                        <span class="custom-type-item-icon">${FOLDER_FILLED_SVG}</span>
                        <span class="custom-type-item-title" title="${f.name}">${displayName}</span>
                    </div>
                    <span class="custom-type-item-check">${checkSvg}</span>
                `;

                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setCustomParentValue(f.name);
                    closeCustomParentMenu();
                });

                menu.appendChild(row);
            });
        }
    }

    function toggleCustomParentMenu() {
        const trigger = document.getElementById('customParentTrigger');
        const menu = document.getElementById('customParentMenu');
        if (!trigger || !menu || trigger.disabled) return;
        if (menu.classList.contains('is-open')) {
            closeCustomParentMenu();
        } else {
            closeCustomTypeMenu();
            openCustomParentMenu();
        }
    }

    function openCustomParentMenu() {
        closeCustomTypeMenu();
        closeFilterFloatingMenu();
        const trigger = document.getElementById('customParentTrigger');
        const menu = document.getElementById('customParentMenu');
        if (!trigger || !menu || trigger.disabled) return;
        renderCustomParentMenu();
        menu.classList.add('is-open');
        trigger.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
    }

    function closeCustomParentMenu() {
        const trigger = document.getElementById('customParentTrigger');
        const menu = document.getElementById('customParentMenu');
        if (!trigger || !menu) return;
        menu.classList.remove('is-open');
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
    }

    let activeRuleMoreTrigger = null;

    function closeRuleMoreMenu() {
        const menu = elements.ruleMoreMenu;
        if (!menu) return;
        menu.classList.remove('is-open');
        menu.style.display = 'none';
        if (activeRuleMoreTrigger) {
            activeRuleMoreTrigger.classList.remove('is-open');
            activeRuleMoreTrigger.setAttribute('aria-expanded', 'false');
            activeRuleMoreTrigger = null;
        }
    }

    function renameFolderRule(index) {
        const preset = window.presetManager.getActivePreset();
        if (!preset || !preset.folders[index]) return;
        const currentName = preset.folders[index].name;
        const newName = prompt("Rename folder (use / for nested):", currentName);
        if (newName && newName.trim() && newName.trim() !== currentName) {
            const trimmed = newName.trim();
            if (state.collapsedFolders && state.collapsedFolders.has(currentName)) {
                state.collapsedFolders.delete(currentName);
                state.collapsedFolders.add(trimmed);
            }
            state.pendingMoves = [];
            window.presetManager.renameFolderRule(preset.id, index, trimmed);
            renderLayoutRules();
            showToast(`Renamed to ${trimmed}`);
        }
    }

    function toggleFolderRuleLock(index) {
        const preset = window.presetManager.getActivePreset();
        if (!preset || !preset.folders[index]) return;
        const folderName = preset.folders[index].name;
        const newLockedState = !preset.folders[index].untouchable;
        
        preset.folders[index].untouchable = newLockedState;

        // Cascading: all child bins under this folder become untouchable as well
        const prefix = folderName + '/';
        preset.folders.forEach(f => {
            if (f.name.startsWith(prefix)) {
                f.untouchable = newLockedState;
            }
        });

        state.pendingMoves = [];
        window.presetManager.savePresets();
        renderLayoutRules();
        showToast(newLockedState ? `Locked "${folderName.split('/').pop()}"` : `Unlocked "${folderName.split('/').pop()}"`);
    }

    function deleteFolderRule(index) {
        const preset = window.presetManager.getActivePreset();
        if (!preset || !preset.folders[index]) return;
        const folderName = preset.folders[index].name;
        const prefix = folderName + '/';
        const subBinCount = preset.folders.filter(f => f.name.startsWith(prefix)).length;

        const confirmMsg = subBinCount > 0
            ? `Remove folder "${folderName}" and all its ${subBinCount} sub-bin(s)?`
            : `Remove folder rule "${folderName}"?`;

        if (confirm(confirmMsg)) {
            state.pendingMoves = [];
            if (state.collapsedFolders) {
                for (const name of Array.from(state.collapsedFolders)) {
                    if (name === folderName || name.startsWith(prefix)) {
                        state.collapsedFolders.delete(name);
                    }
                }
            }
            window.presetManager.deleteFolderRule(preset.id, index);
            renderLayoutRules();
            showToast(subBinCount > 0 ? `Removed ${folderName} and ${subBinCount} sub-bin(s)` : `Removed ${folderName}`);
        }
    }

    function openRuleMoreMenu(triggerBtn, folderIndex) {
        const menu = elements.ruleMoreMenu;
        if (!menu || !triggerBtn) return;

        if (activeRuleMoreTrigger === triggerBtn && menu.classList.contains('is-open')) {
            closeRuleMoreMenu();
            return;
        }

        closeAllCustomMenus();

        const preset = window.presetManager.getActivePreset();
        const folder = preset.folders[folderIndex];
        if (!folder) return;

        const parts = folder.name.split('/');
        const depth = parts.length - 1;
        let isParentUntouchable = false;
        if (depth > 0) {
            for (let i = 1; i <= depth; i++) {
                const ancestorName = parts.slice(0, i).join('/');
                const ancestor = preset.folders.find(p => p.name === ancestorName);
                if (ancestor && ancestor.untouchable) {
                    isParentUntouchable = true;
                }
            }
        }
        const isLocked = folder.untouchable || isParentUntouchable;

        menu.innerHTML = `
            <button type="button" class="rule-menu-item" data-action="rename">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
                <span>Rename Folder</span>
            </button>
            <button type="button" class="rule-menu-item" data-action="toggle-lock" ${isParentUntouchable ? 'disabled title="Protected via parent bin"' : ''}>
                ${isLocked ? `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                </svg>
                <span>Unlock Folder</span>
                ` : `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span>Lock Folder (Protected)</span>
                `}
            </button>
            <div class="rule-menu-divider"></div>
            <button type="button" class="rule-menu-item is-danger" data-action="delete">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>Delete Rule</span>
            </button>
        `;

        menu.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
            e.stopPropagation();
            closeRuleMoreMenu();
            renameFolderRule(folderIndex);
        });

        const lockBtn = menu.querySelector('[data-action="toggle-lock"]');
        if (lockBtn && !isParentUntouchable) {
            lockBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeRuleMoreMenu();
                toggleFolderRuleLock(folderIndex);
            });
        }

        menu.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
            closeRuleMoreMenu();
            deleteFolderRule(folderIndex);
        });

        menu.style.display = 'flex';
        menu.style.visibility = 'hidden';
        menu.classList.add('is-open');

        const rect = triggerBtn.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const menuWidth = menuRect.width;

        let left = rect.right - menuWidth;
        if (left < 8) left = 8;
        if (left + menuWidth > window.innerWidth - 8) {
            left = window.innerWidth - menuWidth - 8;
        }

        let top = rect.bottom + 4;
        if (top + menuRect.height > window.innerHeight - 8 && rect.top - menuRect.height - 4 >= 8) {
            top = rect.top - menuRect.height - 4;
        }

        menu.style.position = 'fixed';
        menu.style.top = `${Math.round(top)}px`;
        menu.style.left = `${Math.round(left)}px`;
        menu.style.zIndex = '99999';
        menu.style.visibility = 'visible';

        triggerBtn.classList.add('is-open');
        triggerBtn.setAttribute('aria-expanded', 'true');
        activeRuleMoreTrigger = triggerBtn;
    }

    const PRESET_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`;

    function closeAllCustomMenus() {
        closeCustomTypeMenu();
        closeCustomParentMenu();
        closeSortPresetMenu();
        closeLayoutPresetMenu();
        closeAllCardTypeMenus();
        closeFilterFloatingMenu();
        closeFilterPopover();
        closeRuleMoreMenu();
    }

    // Sort Preset Dropdown
    function renderSortPresetMenu() {
        const menu = document.getElementById('sortPresetMenu');
        if (!menu) return;
        menu.innerHTML = '';
        const presets = window.presetManager.presets;
        const activeId = window.presetManager.getActivePresetId();
        const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

        presets.forEach(p => {
            const isActive = p.id === activeId;
            const row = document.createElement('div');
            row.className = `custom-type-item ${isActive ? 'is-active' : ''}`;
            row.setAttribute('data-value', p.id);
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', isActive ? 'true' : 'false');

            row.innerHTML = `
                <div class="custom-type-item-left">
                    <span class="custom-type-item-icon">${PRESET_ICON_SVG}</span>
                    <span class="custom-type-item-title">${p.name}</span>
                </div>
                <span class="custom-type-item-check">${checkSvg}</span>
            `;

            row.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllCustomMenus();
                state.pendingMoves = [];
                window.presetManager.setActivePresetId(p.id);
                updatePresetUIState();
                renderLayoutRules();
            });

            menu.appendChild(row);
        });
    }

    function toggleSortPresetMenu() {
        const trigger = document.getElementById('sortPresetTrigger');
        const menu = document.getElementById('sortPresetMenu');
        if (!trigger || !menu) return;
        if (menu.classList.contains('is-open')) {
            closeSortPresetMenu();
        } else {
            closeAllCustomMenus();
            openSortPresetMenu();
        }
    }

    function openSortPresetMenu() {
        closeAllCustomMenus();
        const trigger = document.getElementById('sortPresetTrigger');
        const menu = document.getElementById('sortPresetMenu');
        if (!trigger || !menu) return;
        renderSortPresetMenu();
        menu.classList.add('is-open');
        trigger.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
    }

    function closeSortPresetMenu() {
        const trigger = document.getElementById('sortPresetTrigger');
        const menu = document.getElementById('sortPresetMenu');
        if (!trigger || !menu) return;
        menu.classList.remove('is-open');
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
    }

    // Layout Preset Dropdown
    function renderLayoutPresetMenu() {
        const menu = document.getElementById('layoutPresetMenu');
        if (!menu) return;
        menu.innerHTML = '';
        const presets = window.presetManager.presets;
        const activeId = window.presetManager.getActivePresetId();
        const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

        presets.forEach(p => {
            const isActive = p.id === activeId;
            const row = document.createElement('div');
            row.className = `custom-type-item ${isActive ? 'is-active' : ''}`;
            row.setAttribute('data-value', p.id);
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', isActive ? 'true' : 'false');

            row.innerHTML = `
                <div class="custom-type-item-left">
                    <span class="custom-type-item-icon">${PRESET_ICON_SVG}</span>
                    <span class="custom-type-item-title">${p.name}</span>
                </div>
                <span class="custom-type-item-check">${checkSvg}</span>
            `;

            row.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllCustomMenus();
                state.pendingMoves = [];
                if (state.collapsedFolders) state.collapsedFolders.clear();
                window.presetManager.setActivePresetId(p.id);
                updatePresetUIState();
                renderLayoutRules();
            });

            menu.appendChild(row);
        });
    }

    function toggleLayoutPresetMenu() {
        const trigger = document.getElementById('layoutPresetTrigger');
        const menu = document.getElementById('layoutPresetMenu');
        if (!trigger || !menu) return;
        if (menu.classList.contains('is-open')) {
            closeLayoutPresetMenu();
        } else {
            closeAllCustomMenus();
            openLayoutPresetMenu();
        }
    }

    function openLayoutPresetMenu() {
        closeAllCustomMenus();
        const trigger = document.getElementById('layoutPresetTrigger');
        const menu = document.getElementById('layoutPresetMenu');
        if (!trigger || !menu) return;
        renderLayoutPresetMenu();
        menu.classList.add('is-open');
        trigger.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
    }

    function closeLayoutPresetMenu() {
        const trigger = document.getElementById('layoutPresetTrigger');
        const menu = document.getElementById('layoutPresetMenu');
        if (!trigger || !menu) return;
        menu.classList.remove('is-open');
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
    }

    // Card Type Dropdowns (Holds: [type])
    function closeAllCardTypeMenus() {
        document.querySelectorAll('.card-type-menu.is-open').forEach(m => m.classList.remove('is-open'));
        document.querySelectorAll('.rule-type-pill-btn.is-open').forEach(b => {
            b.classList.remove('is-open');
            b.setAttribute('aria-expanded', 'false');
        });
        document.querySelectorAll('.rule-row.has-open-dropdown').forEach(r => r.classList.remove('has-open-dropdown'));
    }

    function toggleCardTypeMenu(idx, triggerBtn) {
        const menu = document.getElementById(`cardTypeMenu-${idx}`);
        if (!menu) return;
        const isOpen = menu.classList.contains('is-open');
        closeAllCustomMenus();
        if (!isOpen) {
            renderCardTypeMenu(idx, menu);
            menu.classList.add('is-open');
            triggerBtn.classList.add('is-open');
            triggerBtn.setAttribute('aria-expanded', 'true');
            const row = triggerBtn.closest('.rule-row');
            if (row) row.classList.add('has-open-dropdown');
        }
    }

    function renderCardTypeMenu(idx, menu) {
        menu.innerHTML = '';
        const preset = window.presetManager.getActivePreset();
        if (!preset || !preset.folders[idx]) return;
        const folder = preset.folders[idx];
        const currentVal = folder.matchType || 'all';
        const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

        MATCHING_RULE_TYPES.forEach(item => {
            const isActive = item.value === currentVal;
            const row = document.createElement('div');
            row.className = `custom-type-item ${isActive ? 'is-active' : ''}`;
            row.setAttribute('data-value', item.value);
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', isActive ? 'true' : 'false');

            row.innerHTML = `
                <div class="custom-type-item-left">
                    <span class="custom-type-item-icon">${item.icon}</span>
                    <span class="custom-type-item-title">${item.title}</span>
                    ${item.sub ? `<span class="custom-type-item-sub">${item.sub}</span>` : ''}
                </div>
                <span class="custom-type-item-check">${checkSvg}</span>
            `;

            row.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllCustomMenus();
                state.pendingMoves = [];
                window.presetManager.updateFolderType(preset.id, idx, item.value);
                renderLayoutRules();
                showToast(`Set to hold ${item.title}`);
            });

            menu.appendChild(row);
        });
    }

    // --- FILENAME FILTERS BUILDER & ANCHORED POPOVER ---
    let activeFloatingTrigger = null;

    function closeFilterFloatingMenu() {
        const menu = elements.filterFloatingMenu;
        if (menu) menu.classList.remove('is-open');
        if (activeFloatingTrigger) {
            activeFloatingTrigger.classList.remove('is-open');
            activeFloatingTrigger.setAttribute('aria-expanded', 'false');
            activeFloatingTrigger = null;
        }
    }

    function openFilterFloatingMenu(triggerBtn, optionsList, currentVal, onSelect) {
        const menu = elements.filterFloatingMenu;
        if (!menu || !triggerBtn) return;

        if (activeFloatingTrigger === triggerBtn && menu.classList.contains('is-open')) {
            closeFilterFloatingMenu();
            return;
        }

        closeFilterFloatingMenu();
        closeCustomTypeMenu();
        closeCustomParentMenu();

        const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        menu.innerHTML = '';

        optionsList.forEach(opt => {
            const isActive = opt.value === currentVal;
            const row = document.createElement('div');
            row.className = `custom-type-item ${isActive ? 'is-active' : ''}`;
            row.setAttribute('data-value', opt.value);
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', isActive ? 'true' : 'false');
            row.innerHTML = `
                <div class="custom-type-item-left">
                    ${opt.iconHtml ? `<span class="custom-type-item-icon">${opt.iconHtml}</span>` : ''}
                    <span class="custom-type-item-title">${escapeHtml(opt.label)}</span>
                </div>
                <span class="custom-type-item-check">${checkSvg}</span>
            `;
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                closeFilterFloatingMenu();
                if (typeof onSelect === 'function') onSelect(opt.value);
            });
            menu.appendChild(row);
        });

        const rect = triggerBtn.getBoundingClientRect();
        menu.style.minWidth = `${Math.max(142, Math.round(rect.width))}px`;
        menu.classList.add('is-open');
        triggerBtn.classList.add('is-open');
        triggerBtn.setAttribute('aria-expanded', 'true');
        activeFloatingTrigger = triggerBtn;

        const menuRect = menu.getBoundingClientRect();
        let top = rect.bottom + 4;
        if (top + menuRect.height > window.innerHeight - 8 && rect.top - menuRect.height - 4 >= 8) {
            top = rect.top - menuRect.height - 4;
        }
        let left = rect.left;
        left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));

        menu.style.top = `${Math.round(top)}px`;
        menu.style.left = `${Math.round(left)}px`;
    }

    function createFilterBuilderController(containerEl, opts = {}) {
        if (!containerEl) {
            return {
                setData: () => {},
                getData: () => ({ matchMode: 'all', caseSensitive: false, conditions: [] }),
                focusInput: () => {}
            };
        }

        const draft = {
            matchMode: 'all',
            caseSensitive: false,
            conditions: [{ operator: 'contains', value: '' }]
        };

        const miniChevronSvg = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
        const removeRowSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        const plusSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

        containerEl.innerHTML = `
            <div class="filter-section-label">Filename conditions</div>
            <div class="filter-cond-list"></div>
            <button type="button" class="filter-btn-add">${plusSvg}<span>Add condition</span></button>
            <div class="filter-divider"></div>
            <div class="filter-options-row">
                <button type="button" class="filter-mini-trigger filter-mode-btn" aria-haspopup="listbox" aria-expanded="false">
                    <span class="filter-mode-label">Match all conditions</span>
                    ${miniChevronSvg}
                </button>
                <label class="filter-case-label">
                    <input type="checkbox" class="rule-custom-checkbox filter-case-checkbox">
                    <span>Case-sensitive</span>
                </label>
            </div>
        `;

        const condListEl = containerEl.querySelector('.filter-cond-list');
        const addBtn = containerEl.querySelector('.filter-btn-add');
        const modeBtn = containerEl.querySelector('.filter-mode-btn');
        const modeLabelEl = containerEl.querySelector('.filter-mode-label');
        const caseCheckbox = containerEl.querySelector('.filter-case-checkbox');

        function syncFooterControls() {
            const modeObj = FILTER_MATCH_MODES.find(m => m.value === draft.matchMode) || FILTER_MATCH_MODES[0];
            if (modeLabelEl) modeLabelEl.textContent = modeObj.label;
            if (caseCheckbox) caseCheckbox.checked = !!draft.caseSensitive;
        }

        function renderRows() {
            closeFilterFloatingMenu();
            condListEl.innerHTML = '';

            if (draft.conditions.length === 0) {
                const emptyNote = document.createElement('div');
                emptyNote.className = 'filter-empty-note';
                emptyNote.textContent = 'No conditions — click "+ Add condition" or save to clear filters.';
                condListEl.appendChild(emptyNote);
                return;
            }

            draft.conditions.forEach((cond, idx) => {
                const opObj = FILTER_OPERATORS.find(o => o.value === cond.operator) || FILTER_OPERATORS[0];
                const rowEl = document.createElement('div');
                rowEl.className = 'filter-cond-row';

                const opBtn = document.createElement('button');
                opBtn.type = 'button';
                opBtn.className = 'filter-mini-trigger filter-op-btn';
                opBtn.setAttribute('aria-haspopup', 'listbox');
                opBtn.setAttribute('aria-expanded', 'false');
                opBtn.innerHTML = `<span class="filter-op-label">${escapeHtml(opObj.label)}</span>${miniChevronSvg}`;

                const valInput = document.createElement('input');
                valInput.type = 'text';
                valInput.className = 'filter-val-input';
                valInput.placeholder = opObj.placeholder || 'Value...';
                valInput.value = cond.value || '';
                valInput.autocomplete = 'off';
                valInput.spellcheck = false;

                opBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openFilterFloatingMenu(opBtn, FILTER_OPERATORS, cond.operator, (selectedOp) => {
                        cond.operator = selectedOp;
                        const nextOpObj = FILTER_OPERATORS.find(o => o.value === selectedOp) || FILTER_OPERATORS[0];
                        const labelSpan = opBtn.querySelector('.filter-op-label');
                        if (labelSpan) labelSpan.textContent = nextOpObj.label;
                        valInput.placeholder = nextOpObj.placeholder || 'Value...';
                        valInput.focus();
                    });
                });

                valInput.addEventListener('input', () => {
                    cond.value = valInput.value;
                });

                valInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (typeof opts.onEnterSave === 'function') {
                            opts.onEnterSave();
                        }
                    }
                });

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'filter-cond-del';
                delBtn.title = 'Remove condition';
                delBtn.innerHTML = removeRowSvg;
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    draft.conditions.splice(idx, 1);
                    renderRows();
                    if (typeof opts.onLayoutChange === 'function') opts.onLayoutChange();
                });

                rowEl.appendChild(opBtn);
                rowEl.appendChild(valInput);
                rowEl.appendChild(delBtn);
                condListEl.appendChild(rowEl);
            });
        }

        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            draft.conditions.push({ operator: 'contains', value: '' });
            renderRows();
            if (typeof opts.onLayoutChange === 'function') opts.onLayoutChange();
            const inputs = condListEl.querySelectorAll('.filter-val-input');
            if (inputs.length > 0) {
                inputs[inputs.length - 1].focus();
            }
        });

        modeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openFilterFloatingMenu(modeBtn, FILTER_MATCH_MODES, draft.matchMode, (selectedMode) => {
                draft.matchMode = selectedMode === 'any' ? 'any' : 'all';
                syncFooterControls();
            });
        });

        caseCheckbox.addEventListener('change', () => {
            draft.caseSensitive = !!caseCheckbox.checked;
        });

        return {
            setData(filtersObj, { ensureAtLeastOneRow = true } = {}) {
                draft.matchMode = (filtersObj && filtersObj.matchMode === 'any') ? 'any' : 'all';
                draft.caseSensitive = !!(filtersObj && filtersObj.caseSensitive);
                draft.conditions = [];

                if (filtersObj && Array.isArray(filtersObj.conditions)) {
                    filtersObj.conditions.forEach(c => {
                        if (!c) return;
                        const op = FILTER_OPERATORS.some(o => o.value === c.operator) ? c.operator : 'contains';
                        const val = typeof c.value === 'string' ? c.value : '';
                        if (val.trim() !== '') {
                            draft.conditions.push({ operator: op, value: val });
                        }
                    });
                }

                if (draft.conditions.length === 0 && ensureAtLeastOneRow) {
                    draft.conditions.push({ operator: 'contains', value: '' });
                }

                syncFooterControls();
                renderRows();
            },

            getData() {
                return {
                    matchMode: draft.matchMode === 'any' ? 'any' : 'all',
                    caseSensitive: !!draft.caseSensitive,
                    conditions: draft.conditions
                        .map(c => ({
                            operator: FILTER_OPERATORS.some(o => o.value === c.operator) ? c.operator : 'contains',
                            value: typeof c.value === 'string' ? c.value.trim() : ''
                        }))
                        .filter(c => c.value !== '')
                };
            },

            focusInput(last = false) {
                const inputs = condListEl.querySelectorAll('.filter-val-input');
                if (inputs.length === 0) return;
                const target = last ? inputs[inputs.length - 1] : inputs[0];
                target.focus();
                const len = target.value.length;
                try { target.setSelectionRange(len, len); } catch (_) {}
            }
        };
    }

    const filterPopoverState = {
        folderIdx: null,
        triggerEl: null,
        matchType: 'all'
    };

    function syncPopoverMediaTypeUI() {
        const val = filterPopoverState.matchType || 'all';
        const typeObj = MATCHING_RULE_TYPES.find(t => t.value === val) || MATCHING_RULE_TYPES[0];
        if (elements.popoverMediaTypeIcon) {
            elements.popoverMediaTypeIcon.innerHTML = typeObj.icon || '';
        }
        if (elements.popoverMediaTypeLabel) {
            elements.popoverMediaTypeLabel.textContent = typeObj.title;
        }
    }

    const cardFilterBuilder = createFilterBuilderController(elements.cardFiltersBuilder, {
        onEnterSave: () => saveActiveFilterPopover(),
        onLayoutChange: () => positionFilterPopover()
    });

    const modalFilterBuilder = createFilterBuilderController(elements.modalFiltersBuilder);

    function positionAnchoredPopover(pop, arrowEl, trigger, onMissingTrigger) {
        if (!pop || !pop.classList.contains('is-open') || !trigger) return;
        if (!document.body.contains(trigger)) {
            if (typeof onMissingTrigger === 'function') onMissingTrigger();
            return;
        }

        const triggerRect = trigger.getBoundingClientRect();
        const popRect = pop.getBoundingClientRect();
        const gap = 8;
        const spaceBelow = window.innerHeight - triggerRect.bottom - 10;
        const spaceAbove = triggerRect.top - 10;
        const placeBelow = !(popRect.height + gap > spaceBelow && spaceAbove > spaceBelow);

        pop.classList.toggle('placed-below', placeBelow);
        pop.classList.toggle('placed-above', !placeBelow);

        let top = placeBelow
            ? (triggerRect.bottom + gap)
            : (triggerRect.top - popRect.height - gap);
        top = Math.max(8, Math.min(top, Math.max(8, window.innerHeight - popRect.height - 8)));

        const triggerCenterX = triggerRect.left + triggerRect.width / 2;
        let left = triggerCenterX - popRect.width / 2;
        left = Math.max(8, Math.min(left, Math.max(8, window.innerWidth - popRect.width - 8)));

        pop.style.top = `${Math.round(top)}px`;
        pop.style.left = `${Math.round(left)}px`;

        if (arrowEl) {
            const arrowLeft = Math.max(14, Math.min(popRect.width - 24, triggerCenterX - left - 5));
            arrowEl.style.left = `${Math.round(arrowLeft)}px`;
        }
    }

    function positionFilterPopover() {
        positionAnchoredPopover(
            elements.filterPopover,
            elements.filterPopoverArrow,
            filterPopoverState.triggerEl,
            closeFilterPopover
        );
    }

    function closeFilterPopover() {
        closeFilterFloatingMenu();
        if (elements.filterPopover) {
            elements.filterPopover.classList.remove('is-open', 'placed-below', 'placed-above');
        }
        document.querySelectorAll('.btn-edit-filters.is-open').forEach(el => el.classList.remove('is-open'));
        document.querySelectorAll('.rule-item.is-editing-filters').forEach(el => el.classList.remove('is-editing-filters'));
        filterPopoverState.folderIdx = null;
        filterPopoverState.triggerEl = null;
    }

    function openFilterPopover(idx, triggerBtn) {
        const preset = window.presetManager.getActivePreset();
        const folder = preset && preset.folders[idx];
        if (!folder || folder.untouchable || !elements.filterPopover) return;

        // Containers never act as destinations
        const hasChildren = preset.folders.some(other => other.name.startsWith(folder.name + '/'));
        if (hasChildren) return;

        closeAllCustomMenus();

        filterPopoverState.folderIdx = idx;
        filterPopoverState.triggerEl = triggerBtn;
        filterPopoverState.matchType = folder.matchType || 'all';
        syncPopoverMediaTypeUI();

        triggerBtn.classList.add('is-open');
        const card = triggerBtn.closest('.rule-item');
        if (card) card.classList.add('is-editing-filters');

        const parts = folder.name.split('/');
        const leafName = parts[parts.length - 1];

        if (elements.filterPopoverBinName) {
            elements.filterPopoverBinName.textContent = `• ${leafName}`;
            elements.filterPopoverBinName.title = folder.name;
        }
        if (elements.popoverMediaTypeRow) {
            elements.popoverMediaTypeRow.style.display = 'flex';
        }

        cardFilterBuilder.setData(folder.filters, { ensureAtLeastOneRow: true });
        elements.filterPopover.classList.add('is-open');
        positionFilterPopover();
        cardFilterBuilder.focusInput(false);
    }

    function toggleFilterPopover(idx, triggerBtn) {
        if (
            elements.filterPopover &&
            elements.filterPopover.classList.contains('is-open') &&
            filterPopoverState.folderIdx === idx
        ) {
            closeFilterPopover();
            return;
        }
        openFilterPopover(idx, triggerBtn);
    }

    function saveActiveFilterPopover() {
        if (filterPopoverState.folderIdx === null) return;
        const preset = window.presetManager.getActivePreset();
        const idx = filterPopoverState.folderIdx;
        const folder = preset && preset.folders[idx];
        if (!folder) {
            closeFilterPopover();
            return;
        }

        const leafName = folder.name.split('/').pop();
        state.pendingMoves = [];

        window.presetManager.updateFolderType(preset.id, idx, filterPopoverState.matchType || 'all');
        const newFilters = cardFilterBuilder.getData();
        window.presetManager.updateFolderFilters(preset.id, idx, newFilters);
        closeFilterPopover();
        renderLayoutRules();
        showToast(newFilters.conditions.length > 0 ? `Saved rule for "${leafName}"` : `Updated rule for "${leafName}"`);
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        if (window.__adobe_cep__) {
            csInterface.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, syncThemeWithPremiere);
        }
        elements.refreshBtn.addEventListener('click', () => { scanProject(() => showToast("Project rescanned")); });
        elements.btnRescanFiles.addEventListener('click', () => { scanProject(() => showToast("Project rescanned")); });
        renderTrustedFolders();
        document.getElementById('btnAddTrustedFolder').addEventListener('click', () => {
            pickDirectory(folder => {
                if (!folder || !/^(?:[a-z]:[\\/]|[\\/]{2}|\/)/i.test(folder)) {
                    showToast('Choose an absolute folder path in Premiere.');
                    return;
                }
                if (trustedFolders.some(root => normalizeMediaPath(root) === normalizeMediaPath(folder))) {
                    showToast('This folder is already trusted.');
                    return;
                }
                saveTrustedFolders(trustedFolders.concat(folder));
            });
        });
        const trustedToggle = document.getElementById('trustedFoldersToggle');
        const trustedPanel = document.getElementById('trustedFoldersPanel');
        trustedToggle.addEventListener('click', () => {
            trustedPanel.hidden = !trustedPanel.hidden;
            trustedToggle.setAttribute('aria-expanded', String(!trustedPanel.hidden));
        });

        // Sort tab
        elements.sortPresetSelect.addEventListener('change', (e) => {
            state.pendingMoves = [];
            window.presetManager.setActivePresetId(e.target.value);
            updatePresetUIState();
            renderLayoutRules();
        });

        elements.btnCreateBins.addEventListener('click', createBins);
        elements.btnSortByType.addEventListener('click', () => { scanProject(openPreviewModal); });
        elements.btnFlattenBins.addEventListener('click', flattenEmptyBins);
        if (elements.btnDeleteAllBins) {
            elements.btnDeleteAllBins.addEventListener('click', deleteAllBins);
        }
        elements.chkAutoSort.addEventListener('change', (e) => toggleAutoSort(e.target.checked));

        const btnRefreshStatus = document.getElementById('btnRefreshProjectStatus');
        if (btnRefreshStatus) {
            btnRefreshStatus.addEventListener('click', (e) => {
                e.stopPropagation();
                btnRefreshStatus.classList.add('is-spinning');
                scanProject(() => {
                    setTimeout(() => btnRefreshStatus.classList.remove('is-spinning'), 400);
                    showToast("Project rescanned");
                });
            });
        }

        // Layout tab - Presets
        elements.layoutPresetSelect.addEventListener('change', (e) => {
            state.pendingMoves = [];
            if (state.collapsedFolders) state.collapsedFolders.clear();
            window.presetManager.setActivePresetId(e.target.value);
            updatePresetUIState();
            renderLayoutRules();
        });

        // Rename Preset
        elements.btnRenamePreset.addEventListener('click', () => {
            const activePreset = window.presetManager.getActivePreset();
            const newName = prompt("Rename folder layout:", activePreset.name);
            if (newName && newName.trim() && newName.trim() !== activePreset.name) {
                window.presetManager.renamePreset(activePreset.id, newName);
                populatePresetDropdowns();
                showToast(`Renamed layout to "${newName.trim()}"`);
            }
        });

        // Duplicate Preset
        elements.btnDuplicatePreset.addEventListener('click', () => {
            const activeId = window.presetManager.getActivePresetId();
            const copy = window.presetManager.duplicatePreset(activeId);
            populatePresetDropdowns();
            renderLayoutRules();
            showToast(`Duplicated: ${copy.name}`);
        });

        // New Preset
        elements.btnNewPreset.addEventListener('click', () => {
            const name = prompt("Enter name for new layout:", "My Custom Layout");
            if (name && name.trim()) {
                const newPreset = window.presetManager.addPreset(name.trim());
                populatePresetDropdowns();
                renderLayoutRules();
                showToast(`Created ${newPreset.name}`);
            }
        });

        // Delete Preset
        elements.btnDeletePreset.addEventListener('click', () => {
            const activeId = window.presetManager.getActivePresetId();
            const activePreset = window.presetManager.getActivePreset();
            if (confirm(`Delete layout "${activePreset.name}"?`)) {
                if (window.presetManager.deletePreset(activeId)) {
                    if (state.collapsedFolders) state.collapsedFolders.clear();
                    populatePresetDropdowns();
                    renderLayoutRules();
                    showToast("Layout deleted");
                } else {
                    alert("Cannot delete the only layout.");
                }
            }
        });

        // Helper: Process imported preset JSON content
        function handleImportedPresetData(content) {
            if (!content || (typeof content === 'string' && !content.trim())) {
                showToast("Preset file is empty");
                return;
            }
            const result = window.presetManager.importPreset(content);
            if (result && result.success) {
                if (state.collapsedFolders) state.collapsedFolders.clear();
                populatePresetDropdowns();
                renderLayoutRules();
                const countText = result.count && result.count > 1 ? ` (${result.count} layouts)` : '';
                showToast(`Imported layout: ${result.preset.name}${countText}`);
            } else {
                alert(result && result.error ? result.error : "Failed to import preset: Invalid layout format.");
            }
        }

        // Export Preset
        if (elements.btnExportPreset) {
            elements.btnExportPreset.addEventListener('click', () => {
                const activePreset = window.presetManager.getActivePreset();
                if (!activePreset) {
                    showToast("No active layout to export");
                    return;
                }
                const exportData = window.presetManager.exportPreset(activePreset.id);
                if (!exportData) {
                    showToast("Failed to prepare layout preset");
                    return;
                }
                const jsonContent = JSON.stringify(exportData, null, 2);
                const safeName = (activePreset.name || 'preset').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
                const filename = `${safeName}_layout.json`;

                let handledByCep = false;
                if (window.cep && window.cep.fs && typeof window.cep.fs.showSaveDialogEx === 'function') {
                    try {
                        const saveRes = window.cep.fs.showSaveDialogEx(
                            "Export Layout Preset",
                            "",
                            ["json"],
                            filename,
                            "JSON Preset File"
                        );
                        if (saveRes && saveRes.err === 0) {
                            handledByCep = true;
                            if (saveRes.data && typeof saveRes.data === 'string' && saveRes.data.trim()) {
                                const targetPath = saveRes.data.trim();
                                let written = false;
                                if (fs && fs.writeFileSync) {
                                    try {
                                        fs.writeFileSync(targetPath, jsonContent, 'utf8');
                                        written = true;
                                    } catch (e) {
                                        console.warn("fs.writeFileSync failed, trying cep.fs.writeFile", e);
                                    }
                                }
                                if (!written && window.cep.fs.writeFile) {
                                    const enc = (window.cep.encoding && window.cep.encoding.UTF8) ? window.cep.encoding.UTF8 : 1;
                                    const writeRes = window.cep.fs.writeFile(targetPath, jsonContent, enc);
                                    written = (writeRes && writeRes.err === 0);
                                }
                                if (written) {
                                    showToast(`Exported "${activePreset.name}"`);
                                } else {
                                    showToast("Failed to write preset file");
                                }
                            }
                            return;
                        }
                    } catch (cepErr) {
                        console.warn("CEP save dialog error, falling back to browser download:", cepErr);
                    }
                }

                if (!handledByCep) {
                    try {
                        const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                        showToast(`Exported "${activePreset.name}"`);
                    } catch (e) {
                        console.error("Browser download failed:", e);
                        alert("Export failed: " + e.message);
                    }
                }
            });
        }

        // Import Preset
        if (elements.btnImportPreset) {
            elements.btnImportPreset.addEventListener('click', () => {
                let handledByCep = false;
                if (window.cep && window.cep.fs && typeof window.cep.fs.showOpenDialogEx === 'function') {
                    try {
                        const openRes = window.cep.fs.showOpenDialogEx(
                            false,
                            false,
                            "Import Layout Preset",
                            "",
                            ["json"]
                        );
                        if (openRes && openRes.err === 0) {
                            handledByCep = true;
                            if (openRes.data && openRes.data.length > 0) {
                                const targetPath = openRes.data[0];
                                let fileContent = null;
                                if (fs && fs.readFileSync) {
                                    try {
                                        fileContent = fs.readFileSync(targetPath, 'utf8');
                                    } catch (e) {
                                        console.warn("fs.readFileSync failed, trying cep.fs.readFile", e);
                                    }
                                }
                                if (fileContent === null && window.cep.fs.readFile) {
                                    const enc = (window.cep.encoding && window.cep.encoding.UTF8) ? window.cep.encoding.UTF8 : 1;
                                    const readRes = window.cep.fs.readFile(targetPath, enc);
                                    if (readRes && readRes.err === 0) {
                                        fileContent = readRes.data;
                                    }
                                }
                                if (fileContent) {
                                    handleImportedPresetData(fileContent);
                                } else {
                                    showToast("Could not read preset file");
                                }
                            }
                            return;
                        }
                    } catch (cepErr) {
                        console.warn("CEP open dialog error, falling back to file input:", cepErr);
                    }
                }

                if (!handledByCep && elements.presetFileInput) {
                    elements.presetFileInput.value = '';
                    elements.presetFileInput.click();
                }
            });
        }

        if (elements.presetFileInput) {
            elements.presetFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    handleImportedPresetData(event.target.result);
                    elements.presetFileInput.value = '';
                };
                reader.onerror = () => {
                    showToast("Failed to read preset file");
                    elements.presetFileInput.value = '';
                };
                reader.readAsText(file);
            });
        }

        // Anchored Filter Popover buttons & mode toggle
        if (elements.btnCloseFilterPopover) {
            elements.btnCloseFilterPopover.addEventListener('click', (e) => {
                e.stopPropagation();
                closeFilterPopover();
            });
        }
        if (elements.btnCancelFilterPopover) {
            elements.btnCancelFilterPopover.addEventListener('click', (e) => {
                e.stopPropagation();
                closeFilterPopover();
            });
        }
        if (elements.btnSaveFilterPopover) {
            elements.btnSaveFilterPopover.addEventListener('click', (e) => {
                e.stopPropagation();
                saveActiveFilterPopover();
            });
        }
        if (elements.popoverMediaTypeBtn) {
            elements.popoverMediaTypeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const mediaOptions = MATCHING_RULE_TYPES.map(t => ({
                    value: t.value,
                    label: t.title,
                    iconHtml: t.icon
                }));
                openFilterFloatingMenu(elements.popoverMediaTypeBtn, mediaOptions, filterPopoverState.matchType || 'all', (selectedType) => {
                    filterPopoverState.matchType = selectedType || 'all';
                    syncPopoverMediaTypeUI();
                });
            });
        }

        // Add Rule Button & Modal
        elements.btnAddRule.addEventListener('click', () => {
            closeAllCustomMenus();
            elements.newRuleName.value = '';
            setCustomTypeValue('all');
            setCustomTypeDisabled(false, '');
            elements.newRuleUntouchable.checked = false;

            // Reset filter segmented control to 'No Filters'
            if (elements.btnFilterNone) elements.btnFilterNone.classList.add('active');
            if (elements.btnFilterCustom) elements.btnFilterCustom.classList.remove('active');
            if (elements.modalFiltersBuilder) {
                elements.modalFiltersBuilder.style.display = 'none';
            }
            modalFilterBuilder.setData(null, { ensureAtLeastOneRow: true });

            // Populate parent choices and reset selections
            renderCustomParentMenu();
            setCustomParentValue('');
            setCustomTypeDisabled(false, '');

            elements.addRuleModal.classList.add('open');
            elements.newRuleName.focus();

            // Auto-select type based on folder name (only if not inherited from parent)
            elements.newRuleName.oninput = (e) => {
                if (elements.newRuleType && elements.newRuleType.disabled) return;
                const val = e.target.value.toLowerCase();
                if (val.includes('audio') || val.includes('sound') || val.includes('sfx') || val.includes('music') || val.includes('vo')) {
                    setCustomTypeValue('audio');
                } else if (val.includes('video') || val.includes('footage') || val.includes('raw') || val.includes('clip') || val.includes('meme')) {
                    setCustomTypeValue('video');
                } else if (val.includes('image') || val.includes('photo') || val.includes('pic') || val.includes('still')) {
                    setCustomTypeValue('image');
                } else if (val.includes('seq') || val.includes('cut') || val.includes('timeline') || val.includes('nest')) {
                    setCustomTypeValue('sequence');
                }
            };
        });

        // Filter Segmented Control Events inside Add Rule Modal
        if (elements.btnFilterNone) {
            elements.btnFilterNone.addEventListener('click', () => {
                closeFilterFloatingMenu();
                elements.btnFilterNone.classList.add('active');
                if (elements.btnFilterCustom) elements.btnFilterCustom.classList.remove('active');
                if (elements.modalFiltersBuilder) elements.modalFiltersBuilder.style.display = 'none';
            });
        }
        if (elements.btnFilterCustom) {
            elements.btnFilterCustom.addEventListener('click', () => {
                elements.btnFilterCustom.classList.add('active');
                if (elements.btnFilterNone) elements.btnFilterNone.classList.remove('active');
                if (elements.modalFiltersBuilder) {
                    elements.modalFiltersBuilder.style.display = 'block';
                    modalFilterBuilder.focusInput(false);
                }
            });
        }

        elements.btnCloseRuleModal.addEventListener('click', () => {
            elements.addRuleModal.classList.remove('open');
            closeCustomTypeMenu();
            closeCustomParentMenu();
            closeFilterFloatingMenu();
        });

        if (elements.btnCancelRuleModal) {
            elements.btnCancelRuleModal.addEventListener('click', () => {
                elements.addRuleModal.classList.remove('open');
                closeCustomTypeMenu();
                closeCustomParentMenu();
                closeFilterFloatingMenu();
            });
        }

        elements.addRuleModal.addEventListener('click', (e) => {
            if (e.target === elements.addRuleModal) {
                elements.addRuleModal.classList.remove('open');
                closeCustomTypeMenu();
                closeCustomParentMenu();
                closeFilterFloatingMenu();
            }
        });

        // Custom Sort Preset Dropdown
        const sortPresetTrigger = document.getElementById('sortPresetTrigger');
        if (sortPresetTrigger) {
            sortPresetTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSortPresetMenu();
            });
        }

        // Custom Layout Preset Dropdown
        const layoutPresetTrigger = document.getElementById('layoutPresetTrigger');
        if (layoutPresetTrigger) {
            layoutPresetTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleLayoutPresetMenu();
            });
        }

        // Custom Matching Rule Dropdown handlers
        const customTypeTrigger = document.getElementById('customTypeTrigger');
        if (customTypeTrigger) {
            customTypeTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleCustomTypeMenu();
            });
        }

        // Custom Parent Bin Dropdown handlers
        const customParentTrigger = document.getElementById('customParentTrigger');
        if (customParentTrigger) {
            customParentTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleCustomParentMenu();
            });
        }

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#customTypeWrap')) closeCustomTypeMenu();
            if (!e.target.closest('#customParentWrap')) closeCustomParentMenu();
            if (!e.target.closest('#sortPresetWrap')) closeSortPresetMenu();
            if (!e.target.closest('#layoutPresetWrap')) closeLayoutPresetMenu();
            if (!e.target.closest('.rule-type-dropdown-wrap')) closeAllCardTypeMenus();
            if (!e.target.closest('.btn-rule-more') && !e.target.closest('#ruleMoreMenu')) {
                closeRuleMoreMenu();
            }
            if (!e.target.closest('.filter-mini-trigger') && !e.target.closest('#filterFloatingMenu')) {
                closeFilterFloatingMenu();
            }
            if (
                elements.filterPopover &&
                elements.filterPopover.classList.contains('is-open') &&
                !e.target.closest('#filterPopover') &&
                !e.target.closest('#filterFloatingMenu') &&
                !e.target.closest('.btn-edit-filters')
            ) {
                closeFilterPopover();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (elements.ruleMoreMenu && elements.ruleMoreMenu.classList.contains('is-open')) {
                    closeRuleMoreMenu();
                    return;
                }
                if (elements.filterFloatingMenu && elements.filterFloatingMenu.classList.contains('is-open')) {
                    closeFilterFloatingMenu();
                    return;
                }
                closeAllCustomMenus();
            }
        });

        window.addEventListener('resize', () => {
            closeRuleMoreMenu();
            if (elements.filterFloatingMenu && elements.filterFloatingMenu.classList.contains('is-open')) {
                closeFilterFloatingMenu();
            }
            positionFilterPopover();
        });

        document.addEventListener('scroll', (e) => {
            if (
                elements.ruleMoreMenu &&
                elements.ruleMoreMenu.classList.contains('is-open') &&
                (!e.target || !e.target.closest || !e.target.closest('#ruleMoreMenu'))
            ) {
                closeRuleMoreMenu();
            }
            if (
                elements.filterFloatingMenu &&
                elements.filterFloatingMenu.classList.contains('is-open') &&
                (!e.target || !e.target.closest || !e.target.closest('#filterFloatingMenu'))
            ) {
                closeFilterFloatingMenu();
            }
            if (
                elements.filterPopover &&
                elements.filterPopover.classList.contains('is-open') &&
                (!e.target || !e.target.closest || !e.target.closest('#filterPopover'))
            ) {
                positionFilterPopover();
            }
        }, true);

        elements.btnSaveNewRule.addEventListener('click', () => {
            let name = elements.newRuleName.value.trim();
            if (!name) {
                alert("Please enter a folder name.");
                return;
            }

            // Combine parent bin choice if selected
            const parentChoice = elements.newRuleParent ? elements.newRuleParent.value : '';
            if (parentChoice && !name.startsWith(parentChoice + '/')) {
                name = `${parentChoice}/${name}`;
            }

            if (parentChoice && state.collapsedFolders) {
                state.collapsedFolders.delete(parentChoice); // Expand parent so new sub-bin is visible
            }

            const activePreset = window.presetManager.getActivePreset();
            const matchType = elements.newRuleType.value || 'all';
            const isUntouchable = elements.newRuleUntouchable.checked || (matchType === 'untouchable');
            const useCustomFilters = !!(elements.btnFilterCustom && elements.btnFilterCustom.classList.contains('active'));
            const filters = useCustomFilters
                ? modalFilterBuilder.getData()
                : { matchMode: 'all', caseSensitive: false, conditions: [] };

            const newRule = {
                name: name,
                filters: filters,
                untouchable: isUntouchable,
                matchType: matchType === 'untouchable' ? 'unknown' : matchType,
                subBins: []
            };
            state.pendingMoves = [];
            window.presetManager.addFolderRule(activePreset.id, newRule);
            elements.addRuleModal.classList.remove('open');
            closeCustomTypeMenu();
            closeCustomParentMenu();
            closeFilterFloatingMenu();
            renderLayoutRules();
            showToast(`Added folder rule: ${name}`);
        });

        // Files tab
        elements.btnViewByDisk.addEventListener('click', () => {
            state.fileViewMode = 'disk';
            elements.btnViewByDisk.classList.add('active');
            elements.btnViewByBin.classList.remove('active');
            renderFileTree();
        });

        elements.btnViewByBin.addEventListener('click', () => {
            state.fileViewMode = 'bin';
            elements.btnViewByBin.classList.add('active');
            elements.btnViewByDisk.classList.remove('active');
            renderFileTree();
        });

        elements.btnSelectLoose.addEventListener('click', selectLooseFiles);
        elements.btnClearSelection.addEventListener('click', clearSelection);
        document.getElementById('filesSelectAll').addEventListener('change', e => {
            state.items.filter(i => i.mediaPath && !i.isBin && !i.isSequence).forEach(i => {
                if (e.target.checked) state.selectedNodeIds.add(i.nodeId);
                else state.selectedNodeIds.delete(i.nodeId);
            });
            renderFileTree();
        });
        document.querySelectorAll('input[name="relocateMode"]').forEach(radio => {
            radio.addEventListener('change', updateFileSelection);
        });
        elements.btnRelocateFiles.addEventListener('click', relocateFiles);

        // Browse buttons
        elements.btnBrowseRelocate.addEventListener('click', () => {
            pickDirectory(dir => { if (dir) elements.relocateDestInput.value = dir; });
        });


        // Modal Preview
        elements.btnClosePreview.addEventListener('click', closePreviewModal);
        elements.btnCancelPreview.addEventListener('click', closePreviewModal);
        elements.btnConfirmSort.addEventListener('click', () => { executeSort(state.pendingMoves); });
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
    function showToast(message) {
        elements.toast.textContent = message;
        elements.toast.classList.add('show');
        setTimeout(() => { elements.toast.classList.remove('show'); }, 2400);
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

    // Run on DOM load
    window.addEventListener('DOMContentLoaded', init);

})();
