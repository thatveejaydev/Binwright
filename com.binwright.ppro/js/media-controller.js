(function (Binwright) {
    'use strict';

    Binwright.createMediaController = function ({ state, elements, fs, path, transfers, calculateMoves, scanProject, updateUIWithState, openPreviewModal, escapeHtml, getItemIconSvg, FOLDER_OUTLINE_SVG, pickDirectory, showToast, formatBytes, getDirectory, getFileName, ensureDirectoryExists, getEstimatedFileSize }) {
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
                const checkbox = row.querySelector('.file-chk');
                checkbox.checked = state.selectedNodeIds.has(row.fileNodeId);
                row.classList.toggle('is-selected', checkbox.checked);
            });
        }

        let renderedFileView;
        function renderFileTree(force = false) {
            if (!force && renderedFileView === state.fileViewMode) {
                updateFileSelection();
                return;
            }
            renderedFileView = state.fileViewMode;
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
                    const hidden = state.collapsedFileGroups.has(key);
                    contents.hidden = hidden;
                    heading.setAttribute('aria-expanded', String(!hidden));
                });
                items.forEach(item => {
                    const row = document.createElement('label');
                    row.className = 'tree-item';
                    row.fileNodeId = item.nodeId;
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
            const destinations = mirrorLayout ? new Map(calculateMoves().map(move => [move.nodeId, move.targetPath])) : null;
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
                        const bin = destinations?.get(item.nodeId) || item.parentPath || 'Media';
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
                        transfer = await transfers.prepareRelocationTarget(source, requestedTarget, normalizePath);
                        const target = transfer.target;
                        if (transfer.snapshots) await transfers.verifyMediaSnapshots(source, target, transfer.snapshots);

                        const result = await transfers.relink(item.nodeId, source, target);
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
                                    await transfers.verifyMediaSnapshots(source, target, transfer.snapshots);
                                    if (await transfers.sameMediaFile(source, target, normalizePath)) {
                                        throw new Error('The source and destination now point to the same path.');
                                    }
                                }
                                transfers.removeSource(source);
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
                const refreshed = await scanProject();
                if (!refreshed && linked) updateUIWithState();
            }
        }


        function bindEvents() {
            elements.btnRescanFiles.addEventListener('click', () => { scanProject(ok => { if (ok) showToast("Project rescanned"); }); });
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
        }

        return { bindEvents, renderFileTree, calculateLooseFiles };
    };

    
})(window.Binwright = window.Binwright || {});
