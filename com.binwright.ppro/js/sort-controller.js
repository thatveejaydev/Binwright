(function (Binwright) {
    'use strict';

    Binwright.createSortController = function ({ state, elements, bridge, path, calculateMoves, escapeHtml, getItemIconSvg, scanProject, showToast, updatePresetUIState, renderLayoutRules, updateUIWithState }) {
        let skipReview = localStorage.getItem('binwright_skip_sort_review') === 'true';
        let autoSortEnabled = localStorage.getItem('binwright_auto_sort_on_import') === 'true';
        let lastSortInverseMoves = null;
        const knownNodeIds = new Set();
        const recentlyUndoneNodeIds = new Set();
        let initialScanCompleted = false;

        function clearUndoState() {
            lastSortInverseMoves = null;
            recentlyUndoneNodeIds.clear();
            knownNodeIds.clear();
            initialScanCompleted = false;
            const timingStatus = document.getElementById('lastSortTiming');
            if (timingStatus) {
                timingStatus.hidden = true;
                timingStatus.innerHTML = '';
            }
        }

        function updateSkipReviewButtonUI() {
            const btn = elements.btnToggleSkipReview || document.getElementById('btnToggleSkipReview');
            if (btn) {
                btn.classList.toggle('is-active', skipReview);
                btn.setAttribute('aria-pressed', skipReview ? 'true' : 'false');
                btn.title = skipReview
                    ? 'Skip review: ON (sorts immediately) — click to enable review modal'
                    : 'Skip review: OFF (opens review modal) — click to sort immediately';
            }
            if (elements.chkSkipSortReview) {
                elements.chkSkipSortReview.checked = skipReview;
            }
        }

        function updateSortTabStatus() {
            const dot = document.getElementById('sortStatusDot');
            const text = document.getElementById('sortStatusText');
            const actionLabel = document.getElementById('sortActionLabel');
            const shouldSkip = skipReview;
            const updateAction = (count) => {
                const prefix = shouldSkip ? 'Sort' : 'Review & Sort';
                if (actionLabel) actionLabel.textContent = `${prefix} ${count} item${count === 1 ? '' : 's'}`;
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

        function syncAutoSortUI() {
            const chk = elements.chkAutoSort || document.getElementById('chkAutoSort');
            const badge = elements.autoSortBadge || document.getElementById('autoSortBadge');
            if (chk) chk.checked = autoSortEnabled;
            if (badge) {
                badge.style.display = autoSortEnabled ? 'inline-flex' : 'none';
            }
        }

        async function runAutoSort(operation) {
            if (state.sortInProgress || state.relocatingFiles) return;
            state.sortInProgress = true;
            const badge = elements.autoSortBadge || document.getElementById('autoSortBadge');
            if (badge) {
                badge.classList.add('is-sorting');
                const textSpan = badge.querySelector('span:not(.sort-auto-pulse-dot)');
                if (textSpan) textSpan.textContent = 'Sorting…';
            }
            try {
                await operation();
            } catch (error) {
                console.error('Auto-sort operation failed:', error);
            } finally {
                state.sortInProgress = false;
                if (badge) {
                    badge.classList.remove('is-sorting');
                    const textSpan = badge.querySelector('span:not(.sort-auto-pulse-dot)');
                    if (textSpan) textSpan.textContent = 'Listening';
                }
            }
        }

        // --- SORT EXECUTION ---
        const sortLoading = document.getElementById('sortLoading');

        function blockSortInput(event) {
            if (!state.sortInProgress) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        async function runWithSortOverlay(label, operation) {
            if (state.sortInProgress || state.relocatingFiles) return;

            const previousFocus = document.activeElement;
            state.sortInProgress = true;
            if (sortLoading) {
                const lbl = sortLoading.querySelector('.sort-loading-content span:last-child');
                if (lbl) lbl.textContent = label + '…';
                sortLoading.hidden = false;
                if (typeof sortLoading.focus === 'function') sortLoading.focus();
            }

            try {
                await new Promise(resolve => {
                    const timer = setTimeout(resolve, 80);
                    if (typeof window.requestAnimationFrame === 'function') {
                        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
                            clearTimeout(timer);
                            resolve();
                        }));
                    }
                });
                await operation();
            } catch (error) {
                console.error(label + ' failed:', error);
                showToast(label + ' failed. Rescan the project before trying again.');
            } finally {
                state.sortInProgress = false;
                sortLoading.hidden = true;
                if (previousFocus && previousFocus.isConnected) previousFocus.focus();
            }
        }

        function executeSort(moves, isUndo = false, isAutoSort = false) {
            const token = state.snapshotToken;
            const inverseMoves = (moves || []).map(m => {
                let prevPath = m.originPath || m.currentParentPath || "root";
                if (prevPath === "Project root" || prevPath === "Project Root") prevPath = "root";
                return {
                    nodeId: m.nodeId,
                    name: m.name,
                    mediaPath: m.mediaPath || "",
                    originPath: m.targetPath || "root",
                    targetPath: prevPath,
                    type: m.type
                };
            });

            const runner = isAutoSort
                ? (op) => runAutoSort(op)
                : (op) => runWithSortOverlay(isUndo ? 'Reverting sort' : 'Sorting project', op);

            return runner(async () => {
                invalidateReview();

                const timingStatus = document.getElementById('lastSortTiming');
                if (timingStatus) timingStatus.hidden = true;
                let movedCount = 0;
                let successfulInverseMoves = inverseMoves;

                if (window.__adobe_cep__) {
                    const response = await new Promise(resolve => bridge.call('moveItemsToBins', resolve, {
                        moves,
                        token
                    }));
                    const result = JSON.parse(response);
                    if (result.error) {
                        await scanProject();
                        throw new Error(result.error);
                    }
                    movedCount = typeof result.count === 'number' ? result.count : 0;
                    const refreshStarted = performance.now();
                    await scanProject();
                    const timings = {
                        planned: moves.length,
                        moved: movedCount,
                        ...result.timings,
                        refreshMs: Math.round(performance.now() - refreshStarted)
                    };
                    console.info('Binwright sort timing (ms)', timings);

                    if (result.movedNodeIds && Array.isArray(result.movedNodeIds)) {
                        const movedSet = new Set(result.movedNodeIds.map(String));
                        successfulInverseMoves = inverseMoves.filter(m => movedSet.has(String(m.nodeId)));
                    }

                    if (timingStatus) {
                        const timingTooltip = result.timings
                            ? `Index: ${timings.indexMs}ms · Move: ${timings.moveMs}ms · Verify: ${timings.verifyMs}ms · Redraw: ${timings.redrawMs}ms · Refresh: ${timings.refreshMs}ms`
                            : 'Sort completed';

                        if (!isUndo && movedCount > 0) {
                            timingStatus.innerHTML = `
                                <span class="sort-timing-label" title="${escapeHtml(timingTooltip)}">Last sort · ${movedCount}/${moves.length} moved</span>
                                <button type="button" class="sort-undo-btn" id="btnUndoSort" title="Revert last sort (restore ${movedCount} items to previous bins)">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                        <path d="M3 7v6h6"></path>
                                        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
                                    </svg>
                                    <span>Undo</span>
                                </button>
                            `;
                            timingStatus.hidden = false;
                            const btnUndo = timingStatus.querySelector('#btnUndoSort');
                            if (btnUndo) {
                                btnUndo.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    undoSort();
                                });
                            }
                        } else if (isUndo) {
                            timingStatus.innerHTML = `<span class="sort-timing-label">Sort reverted · ${movedCount} item${movedCount === 1 ? '' : 's'} restored</span>`;
                            timingStatus.hidden = false;
                        }
                    }
                } else {
                    // Browser standalone preview fallback
                    moves.forEach(move => {
                        const item = state.items.find(candidate => candidate.nodeId === move.nodeId);
                        if (item) {
                            item.parentPath = move.targetPath;
                            movedCount++;
                        }
                    });
                    updateUIWithState();

                    if (timingStatus) {
                        if (!isUndo && movedCount > 0) {
                            timingStatus.innerHTML = `
                                <span class="sort-timing-label" title="Simulated sort in browser">Last sort · ${movedCount}/${moves.length} moved</span>
                                <button type="button" class="sort-undo-btn" id="btnUndoSort" title="Revert last sort (restore ${movedCount} items to previous bins)">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                        <path d="M3 7v6h6"></path>
                                        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
                                    </svg>
                                    <span>Undo</span>
                                </button>
                            `;
                            timingStatus.hidden = false;
                            const btnUndo = timingStatus.querySelector('#btnUndoSort');
                            if (btnUndo) {
                                btnUndo.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    undoSort();
                                });
                            }
                        } else if (isUndo) {
                            timingStatus.innerHTML = `<span class="sort-timing-label">Sort reverted · ${movedCount} item${movedCount === 1 ? '' : 's'} restored</span>`;
                            timingStatus.hidden = false;
                        }
                    }
                }

                if (!isUndo) {
                    if (movedCount > 0) {
                        lastSortInverseMoves = successfulInverseMoves;
                        if (isAutoSort) {
                            showToast(`⚡ Auto-sorted ${movedCount} imported item${movedCount === 1 ? '' : 's'}.`);
                        } else {
                            showToast(`Sorted ${movedCount} item${movedCount === 1 ? '' : 's'}. (Ctrl+Z to undo)`);
                        }
                    } else {
                        lastSortInverseMoves = null;
                        if (!isAutoSort) showToast("No items were moved.");
                    }
                } else {
                    lastSortInverseMoves = null;
                    if (movedCount > 0) {
                        showToast(`Reverted sort: restored ${movedCount} item${movedCount === 1 ? '' : 's'}.`);
                    } else {
                        showToast("Sort reverted.");
                    }
                }
            });
        }

        function undoSort() {
            if (state.sortInProgress || state.relocatingFiles) return;
            if (!lastSortInverseMoves || lastSortInverseMoves.length === 0) {
                showToast("No sort action to undo.");
                return;
            }
            const movesToRevert = [...lastSortInverseMoves];
            movesToRevert.forEach(m => {
                if (m && m.nodeId !== undefined) {
                    recentlyUndoneNodeIds.add(String(m.nodeId));
                }
            });
            return executeSort(movesToRevert, true);
        }

        // --- CREATE BINS & FLATTEN BINS ---
        function createBins() {
            return runWithSortOverlay('Creating layout bins', async () => {
                const preset = window.presetManager.getActivePreset();
                invalidateReview();
                if (window.__adobe_cep__) {
                    const result = await new Promise(resolve => bridge.call('createLayoutBins', resolve, preset));
                    if (result !== 'OK') throw new Error(result || 'Premiere returned no result.');
                    if (!await scanProject()) return;
                }
                showToast("Created bin hierarchy.");
            });
        }

        function flattenEmptyBins() {
            return runWithSortOverlay('Removing empty bins', async () => {
                clearUndoState();
                const preset = window.presetManager.getActivePreset();
                const protectedNames = preset.folders.map(f => f.name);
                invalidateReview();

                if (window.__adobe_cep__) {
                    const res = await new Promise(resolve => bridge.call('flattenEmptyBins', resolve, protectedNames));
                    const result = JSON.parse(res);
                    if (result.error) throw new Error(result.error);
                    const count = result.count || 0;
                    await scanProject();
                    showToast(count > 0
                        ? `Removed ${count} empty bin${count === 1 ? '' : 's'}.`
                        : 'No empty bins found.');
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
                    updateUIWithState();
                }
            });
        }

        async function deleteAllBins() {
            if (state.sortInProgress || state.relocatingFiles) return;
            clearUndoState();
            const confirmMsg = "Are you sure you want to delete all bins?\n\nAll files and sequences will be safely moved to the root level.";
            const confirmed = await window.Binwright.dialog.confirm({
                title: "Delete All Bins",
                message: confirmMsg,
                confirmText: "Delete All Bins",
                cancelText: "Cancel",
                isDanger: true
            });
            if (!confirmed) {
                return;
            }

            return runWithSortOverlay('Deleting bins', async () => {
                invalidateReview();

                if (window.__adobe_cep__) {
                    const res = await new Promise(resolve => bridge.call('deleteAllBins', resolve));
                    const result = JSON.parse(res);
                    if (!result.success) throw new Error(result.error || 'Premiere could not delete the bins.');
                    const binText = `${result.deletedBinsCount || 0} bin${result.deletedBinsCount === 1 ? '' : 's'}`;
                    const itemText = `${result.movedItemsCount || 0} item${result.movedItemsCount === 1 ? '' : 's'}`;
                    await scanProject();
                    showToast(`Deleted ${binText} (${itemText} moved to root).`);
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
                    updateUIWithState();
                }
            });
        }

        function checkAutoSort(items) {
            if (!items || !Array.isArray(items) || items.length === 0) return;

            // Initial scan of an opened project: index existing items so we never auto-sort pre-existing media on startup
            if (!initialScanCompleted) {
                items.forEach(it => {
                    if (it && it.nodeId !== undefined && it.nodeId !== null) {
                        knownNodeIds.add(String(it.nodeId));
                    }
                });
                initialScanCompleted = true;
                return;
            }

            // If auto-sort is off or sort is running, do nothing
            if (!autoSortEnabled || state.sortInProgress || state.relocatingFiles) return;

            // Check which loose items at root have matching destinations in the active layout
            const allMoves = calculateMoves();
            if (!allMoves || allMoves.length === 0) return;

            const autoMoves = allMoves.filter(m => {
                if (!m || m.nodeId === undefined || m.nodeId === null) return false;
                const idStr = String(m.nodeId);
                if (recentlyUndoneNodeIds.has(idStr)) return false;
                if (knownNodeIds.has(idStr)) return false;
                const origin = m.originPath || "";
                return origin === "root" || origin === "" || origin === "Project root" || origin === "Project Root";
            });

            if (autoMoves.length > 0) {
                console.info(`[Binwright] Auto-sorting ${autoMoves.length} imported items...`);
                executeSort(autoMoves, false, true);
            }
        }

        async function findDuplicates() {
            let message;
            let content;
            await runWithSortOverlay('Finding duplicates', async () => {
                if (!await scanProject()) return;
                if (!state.isSimulated && !state.project.id) {
                    message = 'Open a Premiere project to look for duplicates.';
                    return;
                }

                const itemsBySource = new Map();
                for (const item of state.items) {
                    if (item.isBin || item.isSequence || !item.mediaPath) continue;
                    const source = path && path.sep === '\\'
                        ? path.normalize(item.mediaPath).toLowerCase()
                        : item.mediaPath;
                    if (!itemsBySource.has(source)) itemsBySource.set(source, []);
                    itemsBySource.get(source).push(item);
                }

                const groups = Array.from(itemsBySource.values()).filter(items => items.length > 1);
                if (!groups.length) {
                    message = 'No project items share the same source path.';
                    return;
                }

                const groupLabel = groups.length === 1 ? '1 source file has' : groups.length + ' source files have';
                content = document.createElement('div');
                content.className = 'duplicate-results';
                content.innerHTML = `
                    <p>${groupLabel} multiple entries in the Project panel.</p>
                    <div class="duplicate-instructions">
                        <span>Consolidate manually in Premiere</span>
                        <strong>Edit → Consolidate Duplicates</strong>
                        <span>Applies to the entire project.</span>
                    </div>
                `;
                const list = document.createElement('ul');
                list.className = 'duplicate-list';
                for (const items of groups) {
                    const source = items[0].mediaPath;
                    const filename = source.split(/[\\/]/).pop();
                    const locations = new Map();
                    for (const item of items) {
                        const bin = item.parentPath === 'root' ? 'Project root' : item.parentPath;
                        const label = item.name === filename ? bin : item.name + ' in ' + bin;
                        locations.set(label, (locations.get(label) || 0) + 1);
                    }
                    const group = document.createElement('li');
                    group.innerHTML = `
                        <div class="duplicate-file">
                            <strong>${escapeHtml(filename)}</strong>
                            <span>${items.length} entries</span>
                        </div>
                        <div class="duplicate-path">${escapeHtml(source)}</div>
                        <ul class="duplicate-locations"></ul>
                    `;
                    const locationList = group.querySelector('.duplicate-locations');
                    locations.forEach((count, label) => {
                        const entry = document.createElement('li');
                        entry.textContent = count > 1 ? label + ' ×' + count : label;
                        locationList.appendChild(entry);
                    });
                    list.appendChild(group);
                }
                content.appendChild(list);
            });
            if (message || content) {
                await Binwright.dialog.alert({ title: 'Duplicate Media', message, content, buttonText: 'Done' });
            }
        }

        function bindEvents() {
            ['keydown', 'keyup', 'click', 'dblclick', 'contextmenu', 'submit', 'dragstart', 'drop'].forEach(type => {
                document.addEventListener(type, blockSortInput, true);
            });
            // Sort tab
            elements.sortPresetSelect.addEventListener('change', (e) => {
                invalidateReview();
                window.presetManager.setActivePresetId(e.target.value);
                updatePresetUIState();
                renderLayoutRules();
            });

            elements.btnCreateBins.addEventListener('click', createBins);
            elements.btnFindDuplicates.addEventListener('click', findDuplicates);
            updateSkipReviewButtonUI();

            const toggleBtn = elements.btnToggleSkipReview || document.getElementById('btnToggleSkipReview');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    skipReview = !skipReview;
                    try {
                        localStorage.setItem('binwright_skip_sort_review', skipReview ? 'true' : 'false');
                    } catch (err) {}
                    updateSkipReviewButtonUI();
                    updateSortTabStatus();
                    showToast(skipReview ? "Skip review enabled (sorts immediately)" : "Review modal enabled");
                });
            }

            if (elements.chkSkipSortReview) {
                elements.chkSkipSortReview.checked = skipReview;
                elements.chkSkipSortReview.addEventListener('change', () => {
                    skipReview = elements.chkSkipSortReview.checked;
                    try {
                        localStorage.setItem('binwright_skip_sort_review', skipReview ? 'true' : 'false');
                    } catch (err) {}
                    updateSkipReviewButtonUI();
                    updateSortTabStatus();
                });
            }

            // Auto-sort on import toggle
            const chkAutoSort = elements.chkAutoSort || document.getElementById('chkAutoSort');
            if (chkAutoSort) {
                chkAutoSort.checked = autoSortEnabled;
                syncAutoSortUI();
                chkAutoSort.addEventListener('change', (e) => {
                    autoSortEnabled = !!e.target.checked;
                    try {
                        localStorage.setItem('binwright_auto_sort_on_import', String(autoSortEnabled));
                    } catch (err) {}
                    syncAutoSortUI();
                    if (autoSortEnabled) {
                        knownNodeIds.clear();
                        recentlyUndoneNodeIds.clear();
                        showToast("Auto-sort on import enabled");
                        checkAutoSort(state.items);
                    } else {
                        showToast("Auto-sort on import disabled");
                    }
                });
            }

            elements.btnSortByType.addEventListener('click', () => {
                scanProject(ok => {
                    if (!ok) return;
                    const moves = calculateMoves();
                    if (skipReview) {
                        if (moves.length > 0) {
                            executeSort(moves);
                        } else {
                            showToast("All items are already organized into clean bins.");
                        }
                    } else {
                        openPreviewModal();
                    }
                }, false);
            });
            elements.btnFlattenBins.addEventListener('click', flattenEmptyBins);
            if (elements.btnDeleteAllBins) {
                elements.btnDeleteAllBins.addEventListener('click', deleteAllBins);
            }

            if (elements.btnRescanSort) {
                elements.btnRescanSort.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (state.sortInProgress || state.relocatingFiles) return;
                    elements.btnRescanSort.classList.add('is-spinning');
                    elements.btnRescanSort.disabled = true;
                    scanProject(ok => {
                        setTimeout(() => {
                            elements.btnRescanSort.classList.remove('is-spinning');
                            elements.btnRescanSort.disabled = false;
                        }, 400);
                        if (ok) showToast("Project rescanned");
                    }, true);
                });
            }

            const btnRefreshStatus = document.getElementById('btnRefreshProjectStatus');
            if (btnRefreshStatus) {
                btnRefreshStatus.addEventListener('click', (e) => {
                    e.stopPropagation();
                    btnRefreshStatus.classList.add('is-spinning');
                    scanProject(ok => {
                        setTimeout(() => btnRefreshStatus.classList.remove('is-spinning'), 400);
                        if (ok) showToast("Project rescanned");
                    });
                });
            }

            // Modal Preview
            elements.btnClosePreview.addEventListener('click', closePreviewModal);
            elements.btnCancelPreview.addEventListener('click', closePreviewModal);
            elements.btnConfirmSort.addEventListener('click', () => { if (reviewedMoves.length) executeSort(reviewedMoves); });

            // Keyboard shortcut for Undo Sort (Ctrl+Z / Cmd+Z)
            window.addEventListener('keydown', (e) => {
                const isZ = (e.key === 'z' || e.key === 'Z');
                const isMod = (e.ctrlKey || e.metaKey);
                if (isMod && isZ && !e.shiftKey) {
                    const tag = (document.activeElement && document.activeElement.tagName) || '';
                    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
                    if (document.activeElement && document.activeElement.isContentEditable) return;

                    if (lastSortInverseMoves && lastSortInverseMoves.length > 0 && !state.sortInProgress) {
                        e.preventDefault();
                        e.stopPropagation();
                        undoSort();
                    }
                }
            });
        }

        return { bindEvents, openPreviewModal, updateSortTabStatus, invalidateReview, undoSort, clearUndoState, checkAutoSort, isAutoSortEnabled: () => autoSortEnabled };
    };

    
})(window.Binwright = window.Binwright || {});
