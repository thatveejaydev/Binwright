(function (Binwright) {
    'use strict';

    Binwright.createSortController = function ({ state, elements, bridge, calculateMoves, escapeHtml, getItemIconSvg, scanProject, showToast, updatePresetUIState, renderLayoutRules, updateUIWithState, renderFileTree }) {
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

        // --- PREVIEW SORT MODAL ---
        let reviewedMoves = [];
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
            reviewedMoves = moves;
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

        function invalidateReview() {
            reviewedMoves = [];
            closePreviewModal();
        }

        function closePreviewModal() {
            elements.previewModal.classList.remove('open');
        }

        function renderPreviewList() {
            elements.previewList.innerHTML = '';
            const allMoves = reviewedMoves;
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
                    invalidateReview();
                    moves = calculateMoves();
                }
                if (!opts.isAutoSort) invalidateReview();

                if (!moves || moves.length === 0) {
                    if (!opts.silent && !opts.isAutoSort) showToast("Project already clean!");
                    return;
                }

                if (window.__adobe_cep__) {
                    bridge.call('moveItemsToBins', (res) => {
                        let movedCount = 0;
                        try {
                            const result = JSON.parse(res);
                            movedCount = (typeof result.count === 'number') ? result.count : moves.length;
                        } catch (e) {
                            console.error("Error parsing moveItemsToBins result:", e, res);
                        }
                        if (!opts.isAutoSort) closePreviewModal();
                        scanProject(() => {
                            if (movedCount > 0) {
                                showToast(`Sorted ${movedCount} item${movedCount === 1 ? '' : 's'}.`);
                            } else if (!opts.silent && !opts.isAutoSort) {
                                showToast("No items were moved.");
                            }
                        });
                    }, moves);
                } else {
                    // Simulated
                    moves.forEach(m => {
                        const found = state.items.find(i => i.nodeId === m.nodeId);
                        if (found) found.parentPath = m.targetPath;
                    });
                    showToast(`Sorted ${moves.length} item${moves.length === 1 ? '' : 's'}.`);
                    if (!opts.isAutoSort) closePreviewModal();
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
            invalidateReview();
            if (window.__adobe_cep__) {
                bridge.call('createLayoutBins', () => {
                    showToast("Created bin hierarchy.");
                    scanProject();
                }, preset);
            } else {
                showToast("Created bin hierarchy.");
            }
        }

        function flattenEmptyBins() {
            const preset = window.presetManager.getActivePreset();
            const protectedNames = preset.folders.map(f => f.name);
            invalidateReview();

            if (window.__adobe_cep__) {
                bridge.call('flattenEmptyBins', (res) => {
                    let count = 0;
                    try {
                        const r = JSON.parse(res);
                        count = (typeof r.count === 'number') ? r.count : 0;
                    } catch (e) {}

                    if (count > 0) {
                        showToast(`Removed ${count} empty bin${count === 1 ? '' : 's'}.`);
                    } else {
                        showToast("No empty bins found.");
                    }
                    scanProject();
                }, protectedNames);
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
                    showToast(`Removed ${count} empty bin${count === 1 ? '' : 's'}.`);
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

            invalidateReview();

            if (window.__adobe_cep__) {
                bridge.call('deleteAllBins', (res) => {
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

        function bindEvents() {
            // Sort tab
            elements.sortPresetSelect.addEventListener('change', (e) => {
                invalidateReview();
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

            // Modal Preview
            elements.btnClosePreview.addEventListener('click', closePreviewModal);
            elements.btnCancelPreview.addEventListener('click', closePreviewModal);
            elements.btnConfirmSort.addEventListener('click', () => { if (reviewedMoves.length) executeSort(reviewedMoves); });
        }

        return { bindEvents, openPreviewModal, updateSortTabStatus, invalidateReview };
    };

    
})(window.Binwright = window.Binwright || {});
