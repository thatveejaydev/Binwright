(function (Binwright) {
    'use strict';

    Binwright.createSortController = function ({ state, elements, bridge, calculateMoves, escapeHtml, getItemIconSvg, scanProject, showToast, updatePresetUIState, renderLayoutRules, updateUIWithState }) {
        let skipReview = localStorage.getItem('binwright_skip_sort_review') === 'true';

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
            sortLoading.querySelector('.sort-loading-content span:last-child').textContent = label + '…';
            sortLoading.hidden = false;
            sortLoading.focus();

            try {
                await new Promise(resolve => {
                    const timer = setTimeout(resolve, 100);
                    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
                        clearTimeout(timer);
                        resolve();
                    }));
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

        function executeSort(moves) {
            const token = state.snapshotToken;
            return runWithSortOverlay('Sorting project', async () => {
                invalidateReview();

                const timingStatus = document.getElementById('lastSortTiming');
                timingStatus.hidden = true;
                let movedCount = 0;
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
                    if (result.timings && timingStatus) {
                        timingStatus.textContent = `Last sort · ${movedCount}/${moves.length} moved`;
                        timingStatus.title = `Index: ${timings.indexMs}ms · Move: ${timings.moveMs}ms · Verify: ${timings.verifyMs}ms · Redraw: ${timings.redrawMs}ms · Refresh: ${timings.refreshMs}ms`;
                        timingStatus.hidden = false;
                    }
                } else {
                    moves.forEach(move => {
                        const item = state.items.find(candidate => candidate.nodeId === move.nodeId);
                        if (item) {
                            item.parentPath = move.targetPath;
                            movedCount++;
                        }
                    });
                    updateUIWithState();
                    if (timingStatus) {
                        timingStatus.textContent = `Last sort · ${movedCount}/${moves.length} moved`;
                        timingStatus.title = 'Simulated sort in browser';
                        timingStatus.hidden = false;
                    }
                }

                if (movedCount > 0) {
                    showToast(`Sorted ${movedCount} item${movedCount === 1 ? '' : 's'}.`);
                } else {
                    showToast("No items were moved.");
                }
            });
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
            return runWithSortOverlay('Removing empty bins', async () => {
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
        }

        return { bindEvents, openPreviewModal, updateSortTabStatus, invalidateReview };
    };

    
})(window.Binwright = window.Binwright || {});
