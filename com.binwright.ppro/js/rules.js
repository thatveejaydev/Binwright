(function (Binwright) {
    'use strict';

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

    function compileCondition(cond, caseSensitive) {
        const op = cond.operator || 'contains';
        const rawVal = cond.value.trim();
        const val = caseSensitive ? rawVal : rawVal.toLowerCase();
        const extensions = op === 'extension'
            ? new Set(val.split(/[,\s]+/).map(ext => ext.replace(/^\.+/, '')).filter(Boolean))
            : null;
        return {
            condition: cond,
            score: getOperatorSpecificity(cond.operator),
            matches(fileInfo) {
                const stem = caseSensitive ? fileInfo.stem : fileInfo.lowerStem;
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
                    case 'extension':
                        return extensions.has(caseSensitive ? fileInfo.extension : fileInfo.lowerExtension);
                    default:
                        return stem.includes(val);
                }
            }
        };
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

    function compileLeafRule(folder, orderIndex) {
        const hasSpecificType = !isWildcardMatchType(folder.matchType);
        const conditions = getActiveConditions(folder)
            .map(cond => compileCondition(cond, !!folder.filters.caseSensitive))
            .sort((a, b) => b.score - a.score);
        return {
            folder,
            orderIndex,
            hasSpecificType,
            conditions,
            matchAny: folder.filters && folder.filters.matchMode === 'any',
            score: hasSpecificType ? MEDIA_TYPE_ONLY_SCORE : ANY_FILE_TYPE_SCORE
        };
    }

    function evaluateLeafRule(rule, fileInfo) {
        const { conditions, matchAny } = rule;
        if (!conditions.length) return { rule, score: rule.score, matchedCount: 0 };
        const best = matchAny
            ? conditions.find(condition => condition.matches(fileInfo))
            : conditions.every(condition => condition.matches(fileInfo)) && conditions[0];
        return best && { rule, best, score: best.score, matchedCount: matchAny ? 1 : conditions.length };
    }

    function describeMatch(match, fileInfo) {
        if (!match.best) {
            return match.rule.hasSpecificType
                ? 'type is ' + getMatchTypeName(match.rule.folder.matchType)
                : 'accepts any file type';
        }
        const reason = formatMatchedConditionReason(match.best.condition, fileInfo);
        if (match.matchedCount === 1) return reason;
        if (match.matchedCount === 2) {
            return reason + ' & ' + formatMatchedConditionReason(match.rule.conditions[1].condition, fileInfo);
        }
        return reason + ' (+' + (match.matchedCount - 1) + ' more)';
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

    const FOLDER_OUTLINE_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`;
    const FOLDER_FILLED_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#eab308" stroke="none"><path d="M2 5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z"/></svg>`;

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

    // --- SORTING RULES ENGINE (LEAF-ONLY SPECIFICITY SCORING) ---
    function compilePreset(preset) {
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
            .filter(({ folder }) => !hasChildSet.has(folder.name) && !isFolderLocked(folder))
            .map(({ folder, orderIndex }) => compileLeafRule(folder, orderIndex));
        const rulesByType = new Map();

        function rulesForItem(item) {
            const key = item.type + ':' + !!item.isSequence;
            if (!rulesByType.has(key)) {
                rulesByType.set(key, leafRules.filter(rule => matchesMediaType(item, rule.folder)));
            }
            return rulesByType.get(key);
        }

        return { lockedFolderNames, rulesForItem };
    }

    function normalizeProjectItems(items) {
        return items.filter(item => !item.isBin).map(item => {
            const fileInfo = normalizeItemFileInfo(item);
            fileInfo.lowerStem = fileInfo.stem.toLowerCase();
            fileInfo.lowerExtension = fileInfo.extension.toLowerCase();
            return { item, fileInfo, parentLower: (item.parentPath || '').toLowerCase() };
        });
    }

    function compareMatches(a, b) {
        return b.score - a.score
            || Number(b.rule.hasSpecificType) - Number(a.rule.hasSpecificType)
            || b.matchedCount - a.matchedCount
            || a.rule.orderIndex - b.rule.orderIndex;
    }

    function planMoves(items, preset) {
        const moves = [];
        const { lockedFolderNames, rulesForItem } = preset;
        items.forEach(({ item, fileInfo, parentLower }) => {
            if (lockedFolderNames.some(locked => parentLower === locked || parentLower.startsWith(locked + '/'))) return;

            let winningMatch = null;
            for (const rule of rulesForItem(item)) {
                const match = evaluateLeafRule(rule, fileInfo);
                if (match && (!winningMatch || compareMatches(match, winningMatch) < 0)) {
                    winningMatch = match;
                }
            }
            if (!winningMatch) return;

            const folder = winningMatch.rule.folder;
            let targetPath = folder.name;
            if (item.isSequence && folder.subBins && folder.subBins.length > 0) {
                targetPath += '/' + folder.subBins[0];
            }
            if (!targetPath) return;

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
                    matchReason: describeMatch(winningMatch, fileInfo),
                    priority: winningMatch.score
                });
            }
        });

        return moves;
    }

    Binwright.rules = { MATCHING_RULE_TYPES, getMatchTypeName, FILTER_OPERATORS, FILTER_MATCH_MODES, isWildcardMatchType, FILTER_FUNNEL_SVG, escapeHtml, hasActiveFilters, formatFilterSummary, getRuleConflictSignature, FOLDER_OUTLINE_SVG, FOLDER_FILLED_SVG, getItemIconSvg, compilePreset, normalizeProjectItems, planMoves };
})(window.Binwright = window.Binwright || {});
