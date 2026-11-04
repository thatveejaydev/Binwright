/**
 * Presets definition for Binwright CEP Extension
 */

const VALID_FILTER_OPERATORS = new Set([
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "exact",
    "extension"
]);

const DEFAULT_PRESETS = [
    {
        id: "binwright-default",
        name: "Default",
        isBuiltin: true,
        folders: [
            { name: "01 Sequences", untouchable: false, matchType: "sequence", filters: { matchMode: "all", caseSensitive: false, conditions: [] }, subBins: [] },
            { name: "02 Footage", untouchable: false, matchType: "video", filters: { matchMode: "all", caseSensitive: false, conditions: [] }, subBins: [] },
            { name: "03 Audio", untouchable: false, matchType: "audio", filters: { matchMode: "all", caseSensitive: false, conditions: [] }, subBins: [] },
            { name: "04 Graphics", untouchable: false, matchType: "graphics", filters: { matchMode: "all", caseSensitive: false, conditions: [] }, subBins: [] },
            { name: "05 Images", untouchable: false, matchType: "image", filters: { matchMode: "all", caseSensitive: false, conditions: [] }, subBins: [] }
        ]
    }
];

class PresetManager {
    constructor() {
        this.storageKey = "binwright_presets_v3";
        this.activePresetKey = "binwright_active_preset_id_v3";
        this.presets = this.loadPresets();
    }

    loadPresets() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (raw) {
                let parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    parsed = parsed.filter(p => 
                        p.id !== 'post-pro' &&
                        !p.name.toLowerCase().includes('commercial post')
                    );
                    if (parsed.length > 0) {
                        const starter = JSON.parse(JSON.stringify(DEFAULT_PRESETS[0]));
                        parsed = [starter, ...parsed.filter(p => p.id !== starter.id)];
                        parsed.forEach(p => this.normalizePresetFolders(p));
                        try {
                            localStorage.setItem(this.storageKey, JSON.stringify(parsed));
                        } catch (err) {}
                        return parsed;
                    }
                }
            }
        } catch (e) {
            console.warn("Could not load presets from storage, using defaults", e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_PRESETS));
    }

    normalizePresetFolders(preset) {
        if (!preset || !Array.isArray(preset.folders)) return;

        // Clean up orphaned sub-bins whose direct parent does not exist in preset.folders
        const existingNames = new Set(preset.folders.map(f => f.name));
        preset.folders = preset.folders.filter(f => {
            const parts = f.name.split('/');
            if (parts.length === 1) return true;
            for (let i = 1; i < parts.length; i++) {
                const ancestor = parts.slice(0, i).join('/');
                if (!existingNames.has(ancestor)) {
                    return false;
                }
            }
            return true;
        });

        // Identify structural container folders (any folder that has child rules)
        const hasChildSet = new Set();
        preset.folders.forEach(f => {
            const parts = f.name.split('/');
            for (let i = 1; i < parts.length; i++) {
                hasChildSet.add(parts.slice(0, i).join('/'));
            }
        });

        // Enforce lock inheritance & normalize filters
        // Note: Containers are structural only; leaf bins own their own matchType.
        preset.folders.forEach(f => {
            const parts = f.name.split('/');
            let ancestorUntouchable = false;
            if (parts.length > 1) {
                for (let i = parts.length - 1; i >= 1; i--) {
                    const ancestorName = parts.slice(0, i).join('/');
                    const ancestor = preset.folders.find(p => p.name === ancestorName);
                    if (ancestor && ancestor.untouchable) {
                        ancestorUntouchable = true;
                    }
                }
            }

            if (ancestorUntouchable) {
                f.untouchable = true;
            }

            if (!f.matchType) {
                f.matchType = 'all';
            }

            if (!f.filters && typeof f.nameTag === 'string' && f.nameTag.trim() !== '') {
                f.filters = {
                    matchMode: 'all',
                    caseSensitive: false,
                    conditions: [{ operator: 'contains', value: f.nameTag.trim() }]
                };
            }

            if (!f.filters || typeof f.filters !== 'object') {
                f.filters = { matchMode: 'all', caseSensitive: false, conditions: [] };
            } else {
                f.filters = {
                    matchMode: f.filters.matchMode === 'any' ? 'any' : 'all',
                    caseSensitive: !!f.filters.caseSensitive,
                    conditions: Array.isArray(f.filters.conditions)
                        ? f.filters.conditions
                            .filter(c => c && typeof c.value === 'string' && c.value.trim() !== '')
                            .map(c => ({
                                operator: VALID_FILTER_OPERATORS.has(c.operator) ? c.operator : 'contains',
                                value: c.value.trim()
                            }))
                        : []
                };
            }
            delete f.nameTag;
            delete f.isFallback;

            const isContainer = hasChildSet.has(f.name);
            if (isContainer) {
                // Containers never participate as sorting destinations and do not hold filters
                f.filters.conditions = [];
            }
        });

        const nodeMap = new Map();
        preset.folders.forEach(f => {
            nodeMap.set(f.name, { folder: f, children: [] });
        });

        const rootNodes = [];
        preset.folders.forEach(f => {
            const parts = f.name.split('/');
            if (parts.length === 1) {
                rootNodes.push(nodeMap.get(f.name));
            } else {
                const parentPath = parts.slice(0, -1).join('/');
                if (nodeMap.has(parentPath)) {
                    nodeMap.get(parentPath).children.push(nodeMap.get(f.name));
                } else {
                    rootNodes.push(nodeMap.get(f.name));
                }
            }
        });

        const result = [];
        function traverse(node) {
            if (!node || !node.folder) return;
            result.push(node.folder);
            node.children.forEach(traverse);
        }
        rootNodes.forEach(traverse);

        preset.folders = result;
    }

    savePresets() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.presets));
        } catch (e) {
            console.error("Failed to save presets to localStorage", e);
        }
    }

    getActivePresetId() {
        const id = localStorage.getItem(this.activePresetKey);
        if (id && this.presets.some(p => p.id === id)) {
            return id;
        }
        return this.presets[0].id;
    }

    setActivePresetId(id) {
        localStorage.setItem(this.activePresetKey, id);
    }

    getActivePreset() {
        const id = this.getActivePresetId();
        const active = this.presets.find(p => p.id === id) || this.presets[0];
        if (active) this.normalizePresetFolders(active);
        return active;
    }

    renamePreset(presetId, newName) {
        const preset = this.presets.find(p => p.id === presetId);
        if (preset && !preset.isBuiltin && newName && newName.trim()) {
            preset.name = newName.trim();
            this.savePresets();
            return preset;
        }
        return null;
    }

    addPreset(name, folders) {
        const newPreset = {
            id: "preset_" + Date.now(),
            name: name ? name.trim() : "Custom Layout",
            isBuiltin: false,
            folders: folders ? JSON.parse(JSON.stringify(folders)) : []
        };
        this.normalizePresetFolders(newPreset);
        this.presets.push(newPreset);
        this.savePresets();
        this.setActivePresetId(newPreset.id);
        return newPreset;
    }

    duplicatePreset(presetId) {
        const source = this.presets.find(p => p.id === presetId) || this.getActivePreset();
        const copy = {
            id: "preset_" + Date.now(),
            name: source.name + " (Copy)",
            isBuiltin: false,
            folders: JSON.parse(JSON.stringify(source.folders))
        };
        this.presets.push(copy);
        this.savePresets();
        this.setActivePresetId(copy.id);
        return copy;
    }

    deletePreset(presetId) {
        if (this.presets.length <= 1) {
            return false;
        }
        const idx = this.presets.findIndex(p => p.id === presetId);
        if (idx !== -1 && !this.presets[idx].isBuiltin) {
            this.presets.splice(idx, 1);
            this.savePresets();
            this.setActivePresetId(this.presets[0].id);
            return true;
        }
        return false;
    }

    addFolderRule(presetId, rule) {
        const preset = this.presets.find(p => p.id === presetId) || this.getActivePreset();
        if (preset && preset.isBuiltin) return false;
        if (preset) {
            const parts = rule.name.split('/');
            if (parts.length > 1) {
                const parentPath = parts.slice(0, -1).join('/');
                const parentIdx = preset.folders.findIndex(f => f.name === parentPath);
                if (parentIdx !== -1) {
                    let insertIdx = parentIdx + 1;
                    while (insertIdx < preset.folders.length && preset.folders[insertIdx].name.startsWith(parentPath + '/')) {
                        insertIdx++;
                    }
                    preset.folders.splice(insertIdx, 0, rule);
                    this.normalizePresetFolders(preset);
                    this.savePresets();
                    return true;
                }
            }
            preset.folders.push(rule);
            this.normalizePresetFolders(preset);
            this.savePresets();
            return true;
        }
        return false;
    }

    deleteFolderRule(presetId, folderIndex) {
        const preset = this.presets.find(p => p.id === presetId) || this.getActivePreset();
        if (preset && preset.isBuiltin) return false;
        if (preset && preset.folders[folderIndex]) {
            const targetName = preset.folders[folderIndex].name;
            const prefix = targetName + '/';
            // Cascading delete: delete target folder and all sub-bins under it
            preset.folders = preset.folders.filter(f => f.name !== targetName && !f.name.startsWith(prefix));
            this.normalizePresetFolders(preset);
            this.savePresets();
            return true;
        }
        return false;
    }

    renameFolderRule(presetId, folderIndex, newName) {
        const preset = this.presets.find(p => p.id === presetId) || this.getActivePreset();
        if (preset && preset.isBuiltin) return false;
        if (preset && preset.folders[folderIndex] && newName && newName.trim()) {
            const oldName = preset.folders[folderIndex].name;
            const updated = newName.trim();
            if (oldName === updated) return true;

            const oldPrefix = oldName + '/';
            const newPrefix = updated + '/';
            preset.folders[folderIndex].name = updated;

            // Also rename all sub-bins nested under this folder
            preset.folders.forEach(f => {
                if (f.name.startsWith(oldPrefix)) {
                    f.name = newPrefix + f.name.slice(oldPrefix.length);
                }
            });

            this.normalizePresetFolders(preset);
            this.savePresets();
            return true;
        }
        return false;
    }

    updateFolderFilters(presetId, folderIndex, newFilters) {
        const preset = this.presets.find(p => p.id === presetId) || this.getActivePreset();
        if (preset && preset.isBuiltin) return false;
        if (preset && preset.folders[folderIndex]) {
            const conds = (newFilters && Array.isArray(newFilters.conditions))
                ? newFilters.conditions
                    .filter(c => c && typeof c.value === 'string' && c.value.trim() !== '')
                    .map(c => ({
                        operator: VALID_FILTER_OPERATORS.has(c.operator) ? c.operator : 'contains',
                        value: c.value.trim()
                    }))
                : [];
            preset.folders[folderIndex].filters = {
                matchMode: (newFilters && newFilters.matchMode === 'any') ? 'any' : 'all',
                caseSensitive: !!(newFilters && newFilters.caseSensitive),
                conditions: conds
            };
            delete preset.folders[folderIndex].nameTag;
            delete preset.folders[folderIndex].isFallback;
            this.normalizePresetFolders(preset);
            this.savePresets();
            return true;
        }
        return false;
    }

    updateFolderTag(presetId, folderIndex, newTag) {
        const trimmed = newTag ? newTag.trim() : "";
        return this.updateFolderFilters(presetId, folderIndex, {
            matchMode: 'all',
            caseSensitive: false,
            conditions: trimmed ? [{ operator: 'contains', value: trimmed }] : []
        });
    }

    updateFolderType(presetId, folderIndex, newType) {
        const preset = this.presets.find(p => p.id === presetId) || this.getActivePreset();
        if (preset && preset.isBuiltin) return false;
        if (preset && preset.folders[folderIndex]) {
            preset.folders[folderIndex].matchType = newType || 'all';
            this.normalizePresetFolders(preset);
            this.savePresets();
            return true;
        }
        return false;
    }

    /**
     * Export a preset by ID (or active preset if omitted) as an exportable JSON object.
     * @param {string} [presetId]
     * @returns {object|null}
     */
    exportPreset(presetId) {
        const preset = presetId
            ? (this.presets.find(p => p.id === presetId) || this.getActivePreset())
            : this.getActivePreset();
        if (!preset) return null;

        this.normalizePresetFolders(preset);

        return {
            version: 1,
            type: "com.binwright.cep.preset",
            name: preset.name,
            exportedAt: new Date().toISOString(),
            folders: JSON.parse(JSON.stringify(preset.folders))
        };
    }

    /**
     * Export all saved presets as a bundle object.
     * @returns {object}
     */
    exportAllPresets() {
        return {
            version: 1,
            type: "com.binwright.cep.presets_bundle",
            exportedAt: new Date().toISOString(),
            presets: this.presets.map(p => {
                this.normalizePresetFolders(p);
                return {
                    name: p.name,
                    folders: JSON.parse(JSON.stringify(p.folders))
                };
            })
        };
    }

    /**
     * Finds a unique layout name if another preset already uses the baseName.
     * @param {string} baseName
     * @returns {string}
     */
    getUniquePresetName(baseName) {
        const cleanBase = (baseName || "Imported Layout").trim();
        const existingNames = new Set(this.presets.map(p => p.name.trim().toLowerCase()));

        if (!existingNames.has(cleanBase.toLowerCase())) {
            return cleanBase;
        }

        const candidate = `${cleanBase} (Imported)`;
        if (!existingNames.has(candidate.toLowerCase())) {
            return candidate;
        }

        let counter = 2;
        while (existingNames.has(`${cleanBase} (Imported ${counter})`.toLowerCase())) {
            counter++;
        }
        return `${cleanBase} (Imported ${counter})`;
    }

    /**
     * Imports one or more presets from a JSON string, object, or array.
     * @param {string|object|Array} data
     * @returns {{ success: boolean, preset?: object, count?: number, error?: string }}
     */
    importPreset(data) {
        try {
            let parsed = data;
            if (typeof data === 'string') {
                try {
                    parsed = JSON.parse(data);
                } catch (jsonErr) {
                    return { success: false, error: "Invalid JSON format: " + jsonErr.message };
                }
            }

            if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
                return { success: false, error: "Invalid preset file content." };
            }

            let rawPresets = [];
            if (Array.isArray(parsed)) {
                if (parsed.length > 0 && parsed[0] && Array.isArray(parsed[0].folders)) {
                    // Array of preset objects
                    rawPresets = parsed;
                } else if (parsed.length > 0 && parsed[0] && typeof parsed[0].name === 'string') {
                    // Raw folders list
                    rawPresets = [{ name: "Imported Layout", folders: parsed }];
                } else {
                    return { success: false, error: "Empty or unrecognized preset structure." };
                }
            } else if (parsed.presets && Array.isArray(parsed.presets)) {
                // Presets bundle
                rawPresets = parsed.presets;
            } else if (Array.isArray(parsed.folders)) {
                // Single preset object
                rawPresets = [parsed];
            } else {
                return { success: false, error: "Preset file must contain a 'folders' array." };
            }

            if (rawPresets.length === 0) {
                return { success: false, error: "No presets found to import." };
            }

            const importedPresets = [];

            for (const item of rawPresets) {
                if (!item || !Array.isArray(item.folders) || item.folders.length === 0) {
                    continue;
                }

                const uniqueName = this.getUniquePresetName(item.name || "Imported Layout");
                const newPreset = {
                    id: "preset_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
                    name: uniqueName,
                    isBuiltin: false,
                    folders: JSON.parse(JSON.stringify(item.folders))
                };

                this.normalizePresetFolders(newPreset);

                if (newPreset.folders.length > 0) {
                    this.presets.push(newPreset);
                    importedPresets.push(newPreset);
                }
            }

            if (importedPresets.length === 0) {
                return { success: false, error: "No valid folder rules found in preset." };
            }

            this.savePresets();

            const activeImported = importedPresets[importedPresets.length - 1];
            this.setActivePresetId(activeImported.id);

            return {
                success: true,
                count: importedPresets.length,
                preset: activeImported,
                presets: importedPresets
            };
        } catch (err) {
            console.error("Failed to import preset:", err);
            return { success: false, error: err.message || "Unknown error during preset import." };
        }
    }
}

window.presetManager = new PresetManager();
