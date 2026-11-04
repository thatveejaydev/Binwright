(function (Binwright) {
    'use strict';

    Binwright.createLayoutController = function ({ state, elements, fs, rules, showToast, updateSortTabStatus, invalidateReview }) {
        const { MATCHING_RULE_TYPES, getMatchTypeName, FILTER_OPERATORS, FILTER_MATCH_MODES, isWildcardMatchType, FILTER_FUNNEL_SVG, escapeHtml, hasActiveFilters, formatFilterSummary, getRuleConflictSignature, FOLDER_OUTLINE_SVG, FOLDER_FILLED_SVG } = rules;

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
                        invalidateReview();
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
                invalidateReview();
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

            invalidateReview();
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
                invalidateReview();
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
                    invalidateReview();
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
                    invalidateReview();
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
                    invalidateReview();
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
            invalidateReview();

            window.presetManager.updateFolderType(preset.id, idx, filterPopoverState.matchType || 'all');
            const newFilters = cardFilterBuilder.getData();
            window.presetManager.updateFolderFilters(preset.id, idx, newFilters);
            closeFilterPopover();
            renderLayoutRules();
            showToast(newFilters.conditions.length > 0 ? `Saved rule for "${leafName}"` : `Updated rule for "${leafName}"`);
        }

        function bindEvents() {
            // Layout tab - Presets
            elements.layoutPresetSelect.addEventListener('change', (e) => {
                invalidateReview();
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
                invalidateReview();
                window.presetManager.addFolderRule(activePreset.id, newRule);
                elements.addRuleModal.classList.remove('open');
                closeCustomTypeMenu();
                closeCustomParentMenu();
                closeFilterFloatingMenu();
                renderLayoutRules();
                showToast(`Added folder rule: ${name}`);
            });
        }

        return { bindEvents, closeAllCustomMenus, populatePresetDropdowns, updatePresetUIState, renderLayoutRules, setCustomTypeValue, renderCustomTypeMenu, setCustomParentValue, renderCustomParentMenu };
    };

    
})(window.Binwright = window.Binwright || {});
