/**
 * Premiere Pro ExtendScript Host Script for Binwright CEP Panel
 */

if (typeof $._PPP_ === "undefined") {
    $._PPP_ = {};
}

// JSON Polyfill for ExtendScript if not present
if (typeof JSON === "undefined") {
    JSON = {
        parse: function(sJSON) {
            return eval("(" + sJSON + ")");
        },
        stringify: (function() {
            var toString = Object.prototype.toString;
            var isArray = Array.isArray || function(a) { return toString.call(a) === '[object Array]'; };
            var escMap = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
            var escFunc = function(m) { return escMap[m] || '\\u' + (m.charCodeAt(0) + 0x10000).toString(16).substring(1); };
            var escRE = /[\\"\u0000-\u001F\u2028\u2029]/g;
            return function stringify(value) {
                if (value == null) return 'null';
                if (typeof value === 'number') return isFinite(value) ? String(value) : 'null';
                if (typeof value === 'boolean') return String(value);
                if (typeof value === 'object') {
                    if (typeof value.toJSON === 'function') return stringify(value.toJSON());
                    if (isArray(value)) {
                        var res = '[';
                        for (var i = 0; i < value.length; i++) {
                            res += (i ? ', ' : '') + stringify(value[i]);
                        }
                        return res + ']';
                    }
                    if (toString.call(value) === '[object Object]') {
                        var tmp = [];
                        for (var k in value) {
                            if (value.hasOwnProperty(k)) {
                                tmp.push(stringify(k) + ': ' + stringify(value[k]));
                            }
                        }
                        return '{' + tmp.join(', ') + '}';
                    }
                }
                return '"' + String(value).replace(escRE, escFunc) + '"';
            };
        })()
    };
}

(function() {

    // Helper: Determine file type from extension and properties
    function categorizeItem(item) {
        if (!item) return "unknown";
        if (item.isSequence()) return "sequence";
        if (item.type === ProjectItemType.BIN) return "bin";

        var mediaPath = "";
        try {
            mediaPath = item.getMediaPath();
        } catch (e) {}

        if (!mediaPath || mediaPath === "") {
            // Likely a synthetic item: Color matte, adjustment layer, transparent video, bars
            return "solids";
        }

        var ext = "";
        var lastDot = mediaPath.lastIndexOf(".");
        if (lastDot !== -1) {
            ext = mediaPath.substring(lastDot + 1).toLowerCase();
        }

        var rawExts = ["r3d", "braw", "ari", "arri", "crm", "dng"];
        var videoExts = ["mp4", "mov", "mkv", "avi", "mxf", "wmv", "flv", "webm", "m4v", "mts", "m2ts", "mpg", "mpeg"];
        var audioExts = ["wav", "mp3", "aac", "aif", "aiff", "m4a", "flac", "ogg", "wma"];
        var imageExts = ["png", "jpg", "jpeg", "tif", "tiff", "psd", "ai", "svg", "gif", "bmp", "exr", "webp"];
        var gfxExts = ["mogrt", "prfpset", "aep"];
        var captionExts = ["srt", "ass", "ttml", "vtt", "scc", "mcc", "xml"];

        for (var i = 0; i < rawExts.length; i++) {
            if (ext === rawExts[i]) return "cameraraw";
        }
        for (var v = 0; v < videoExts.length; v++) {
            if (ext === videoExts[v]) return "video";
        }
        for (var a = 0; a < audioExts.length; a++) {
            if (ext === audioExts[a]) return "audio";
        }
        for (var im = 0; im < imageExts.length; im++) {
            if (ext === imageExts[im]) return "image";
        }
        for (var g = 0; g < gfxExts.length; g++) {
            if (ext === gfxExts[g]) return "graphics";
        }
        for (var c = 0; c < captionExts.length; c++) {
            if (ext === captionExts[c]) return "captions";
        }

        return "video"; // fallback default for media
    }

    // Get current project details
    $._PPP_.getProjectInfo = function() {
        if (!app.project) {
            return JSON.stringify({ error: "No active project open in Premiere Pro." });
        }
        var projPath = "";
        try {
            projPath = app.project.path;
        } catch (e) {}

        var sequencesCount = app.project.sequences ? app.project.sequences.numSequences : 0;
        var rootItemCount = app.project.rootItem ? app.project.rootItem.children.numItems : 0;

        return JSON.stringify({
            name: app.project.name || "Untitled Project",
            path: projPath,
            sequencesCount: sequencesCount,
            rootItemCount: rootItemCount
        });
    };

    // Recursively collect all items in the project
    function walkBin(bin, parentPath, list) {
        if (!bin || !bin.children) return;
        var count = bin.children.numItems;
        for (var i = 0; i < count; i++) {
            var item = bin.children[i];
            if (!item) continue;

            var mediaPath = "";
            try {
                mediaPath = item.getMediaPath();
            } catch (e) {}

            var isSeq = false;
            try {
                isSeq = item.isSequence();
            } catch (e) {}

            var isOff = false;
            try {
                isOff = item.isOffline();
            } catch (e) {}

            var itemType = categorizeItem(item);
            var currentPath = parentPath ? (parentPath + "/" + item.name) : item.name;

            var itemData = {
                nodeId: item.nodeId,
                name: item.name,
                type: itemType,
                isBin: (item.type === ProjectItemType.BIN),
                isSequence: isSeq,
                isOffline: isOff,
                mediaPath: mediaPath,
                parentPath: parentPath || "root",
                currentPath: currentPath
            };

            list.push(itemData);

            if (item.type === ProjectItemType.BIN) {
                walkBin(item, currentPath, list);
            }
        }
    }

    $._PPP_.getAllProjectItems = function() {
        if (!app.project || !app.project.rootItem) {
            return JSON.stringify([]);
        }
        var list = [];
        walkBin(app.project.rootItem, "", list);
        return JSON.stringify(list);
    };

    // Find or create nested bin path starting from rootItem
    // e.g. "Video/Camera RAW/A Cam" or "Audio/Music"
    function findOrCreateBinByPath(pathStr, requireFullPath) {
        if (!pathStr || pathStr === "" || pathStr === "root") {
            return app.project.rootItem;
        }
        var parts = pathStr.split("/");
        var currentBin = app.project.rootItem;

        for (var p = 0; p < parts.length; p++) {
            var partName = parts[p];
            if (!partName || partName === "" || partName === "root") continue;

            var found = null;
            for (var c = 0; c < currentBin.children.numItems; c++) {
                var child = currentBin.children[c];
                if (child && child.type === ProjectItemType.BIN && child.name && child.name.toLowerCase() === partName.toLowerCase()) {
                    found = child;
                    break;
                }
            }
            if (!found) {
                found = currentBin.createBin(partName);
            }
            if (!found) {
                if (requireFullPath) return null;
                break;
            }
            currentBin = found;
        }
        return currentBin;
    }

    // Force Premiere Pro Project Panel to redraw and acknowledge bin/item updates
    function refreshProjectPanelUI() {
        try {
            var viewIDs = app.getProjectViewIDs();
            if (viewIDs && viewIDs.length > 0) {
                for (var v = 0; v < viewIDs.length; v++) {
                    var sel = app.getProjectViewSelection(viewIDs[v]);
                    app.setProjectViewSelection(sel || [], viewIDs[v]);
                }
            }
        } catch (e) {}
    }

    // Create the full bin structure from a layout preset
    $._PPP_.createLayoutBins = function(layoutJsonStr) {
        if (!app.project || !app.project.rootItem) return "No project open";
        var layout = JSON.parse(layoutJsonStr);
        if (!layout || !layout.folders) return "Invalid layout data";

        for (var i = 0; i < layout.folders.length; i++) {
            var f = layout.folders[i];
            var mainBin = findOrCreateBinByPath(f.name);
            if (f.subBins && f.subBins.length > 0) {
                for (var s = 0; s < f.subBins.length; s++) {
                    findOrCreateBinByPath(f.name + "/" + f.subBins[s]);
                }
            }
        }
        refreshProjectPanelUI();
        return "OK";
    };

    // Check if an item is already a direct child of a given bin
    function isItemDirectChildOf(item, bin) {
        if (!item || !bin || !bin.children) return false;
        var num = bin.children.numItems;
        for (var i = 0; i < num; i++) {
            var child = bin.children[i];
            if (child && (child === item || (item.nodeId && child.nodeId && String(child.nodeId) == String(item.nodeId)))) {
                return true;
            }
        }
        return false;
    }

    // Strictly find item by its unique nodeId
    function findItemByNodeId(bin, targetNodeId) {
        if (!bin || !bin.children || !targetNodeId) return null;
        var count = bin.children.numItems;
        // Direct children first (fast for newly imported root items)
        for (var i = 0; i < count; i++) {
            var item = bin.children[i];
            if (item && String(item.nodeId) == String(targetNodeId)) {
                return item;
            }
        }
        // Then recurse into sub-bins
        for (var j = 0; j < count; j++) {
            var sub = bin.children[j];
            if (sub && sub.type === ProjectItemType.BIN) {
                var found = findItemByNodeId(sub, targetNodeId);
                if (found) return found;
            }
        }
        return null;
    }

    // Fallback: only used if targetNodeId is omitted or not found anywhere.
    // Crucially: never matches an item that is already inside targetBin!
    function findItemFallback(bin, targetName, targetMediaPath, targetBin) {
        if (!bin || !bin.children) return null;
        var count = bin.children.numItems;
        for (var i = 0; i < count; i++) {
            var item = bin.children[i];
            if (!item || item.type === ProjectItemType.BIN) continue;
            if (targetBin && isItemDirectChildOf(item, targetBin)) continue;

            if (targetMediaPath) {
                try {
                    var mPath = item.getMediaPath();
                    if (mPath && (mPath === targetMediaPath || mPath.replace(/\\/g, '/') === targetMediaPath.replace(/\\/g, '/'))) {
                        return item;
                    }
                } catch (e) {}
            }
            if (targetName && item.name === targetName) {
                return item;
            }
        }
        for (var j = 0; j < count; j++) {
            var sub = bin.children[j];
            if (sub && sub.type === ProjectItemType.BIN && sub !== targetBin) {
                var found = findItemFallback(sub, targetName, targetMediaPath, targetBin);
                if (found) return found;
            }
        }
        return null;
    }

    // Robust item finder by unique nodeId, with safe fallback that avoids already-sorted items
    function findItemInHierarchy(bin, targetNodeId, targetName, targetMediaPath, targetBin) {
        if (targetNodeId) {
            var byId = findItemByNodeId(bin, targetNodeId);
            if (byId) return byId;
        }
        return findItemFallback(bin, targetName, targetMediaPath, targetBin);
    }

    function indexItemsByNodeId(bin, nodeMap) {
        if (!bin || !bin.children) return;
        var children = bin.children;
        var count = children.numItems;
        for (var i = 0; i < count; i++) {
            var child = children[i];
            if (!child) continue;
            var nodeId = child.nodeId;
            if (nodeId !== null && nodeId !== undefined && nodeId !== "") {
                nodeMap["id:" + String(nodeId)] = child;
            }
            if (child.type === ProjectItemType.BIN) indexItemsByNodeId(child, nodeMap);
        }
    }

    // Execute bulk moves into destination bins
    // moves: [{ nodeId: string, targetPath: string, name?: string, mediaPath?: string }, ...]
    $._PPP_.moveItemsToBins = function(movesJsonStr) {
        if (!app.project || !app.project.rootItem) return JSON.stringify({ count: 0, error: "No project open" });
        var moves = JSON.parse(movesJsonStr);
        if (!moves || moves.length === 0) return JSON.stringify({ count: 0 });

        var root = app.project.rootItem;
        var binCache = {};
        var nodeMap = null;
        if (moves.length >= 16) {
            nodeMap = {};
            indexItemsByNodeId(root, nodeMap);
        }

        var movedCount = 0;
        for (var m = 0; m < moves.length; m++) {
            var move = moves[m];
            var binKey = "path:" + (move.targetPath || "");
            var targetBin = binCache[binKey];
            if (!targetBin) {
                try {
                    targetBin = findOrCreateBinByPath(move.targetPath, true);
                } catch (error) {
                    $.writeln("Could not resolve destination bin " + move.targetPath + ": " + error.toString());
                    continue;
                }
                if (!targetBin) {
                    $.writeln("Could not resolve destination bin: " + move.targetPath);
                    continue;
                }
                binCache[binKey] = targetBin;
            }

            var item;
            if (nodeMap) {
                item = move.nodeId ? nodeMap["id:" + String(move.nodeId)] : null;
                if (!item) item = findItemFallback(root, move.name, move.mediaPath, targetBin);
            } else {
                item = findItemInHierarchy(root, move.nodeId, move.name, move.mediaPath, targetBin);
            }
            if (item && targetBin && item !== targetBin) {
                // If item is ALREADY inside targetBin, do not move and do not increment movedCount
                if (isItemDirectChildOf(item, targetBin)) {
                    continue;
                }
                try {
                    item.moveBin(targetBin);
                    // Verify the item was actually moved into targetBin
                    if (isItemDirectChildOf(item, targetBin)) {
                        movedCount++;
                    } else {
                        $.writeln("moveBin did not place item into targetBin: " + (move.name || move.nodeId));
                    }
                } catch (e) {
                    $.writeln("moveBin error: " + e.toString());
                }
            }
        }

        refreshProjectPanelUI();
        return JSON.stringify({ count: movedCount });
    };

    // Helper to safely check if an item is a bin
    function isItemBin(item) {
        if (!item) return false;
        try {
            if (typeof item.isBin === 'function') {
                return item.isBin();
            }
        } catch (e) {}
        try {
            if (typeof ProjectItemType !== 'undefined' && typeof ProjectItemType.BIN !== 'undefined') {
                if (item.type === ProjectItemType.BIN) return true;
            }
        } catch (e) {}
        if (item.type === 1 || item.type === 2) {
            if (item.children && typeof item.children.numItems === 'number') return true;
        }
        return false;
    }

    // Helper to check if a bin name or path is protected by the active layout preset
    function isBinNameProtected(name, currentPath, protectedNames) {
        if (!name || !protectedNames || protectedNames.length === 0) return false;
        var nLower = name.toLowerCase();
        var pLower = currentPath ? currentPath.toLowerCase() : nLower;
        for (var p = 0; p < protectedNames.length; p++) {
            var prot = protectedNames[p];
            if (!prot) continue;
            var protLower = prot.toLowerCase();
            if (nLower === protLower || pLower === protLower) return true;
            var parts = protLower.split('/');
            if (parts[parts.length - 1] === nLower) return true;
        }
        return false;
    }

    // Helper to safely delete a bin item in Premiere Pro ExtendScript
    function deleteBinItem(binItem) {
        if (!binItem) return false;
        try {
            if (typeof binItem.deleteBin === 'function') {
                var res = binItem.deleteBin();
                return (res === 0 || res === true || res === undefined);
            }
        } catch (e) {
            $.writeln("deleteBin error: " + e.toString());
        }
        try {
            if (typeof binItem.deleteItem === 'function') {
                binItem.deleteItem();
                return true;
            }
        } catch (e) {}
        try {
            if (typeof binItem.delete === 'function') {
                binItem.delete();
                return true;
            }
        } catch (e) {}
        return false;
    }

    // Recursively delete empty bins (excluding protected names)
    function cleanEmptyBins(bin, currentPath, protectedNames) {
        if (!bin || !bin.children) return 0;
        var deletedCount = 0;

        // Traverse backwards to safely delete
        for (var i = bin.children.numItems - 1; i >= 0; i--) {
            var child = bin.children[i];
            if (child && isItemBin(child)) {
                var childPath = currentPath ? (currentPath + "/" + child.name) : child.name;

                // First recurse into subfolders bottom-up
                deletedCount += cleanEmptyBins(child, childPath, protectedNames);

                // Check if this bin is now empty
                if (child.children && child.children.numItems === 0) {
                    if (!isBinNameProtected(child.name, childPath, protectedNames)) {
                        if (deleteBinItem(child)) {
                            deletedCount++;
                        }
                    }
                }
            }
        }
        return deletedCount;
    }

    $._PPP_.flattenEmptyBins = function(protectedNamesJsonStr) {
        if (!app.project || !app.project.rootItem) return JSON.stringify({ count: 0 });
        var protectedNames = [];
        try {
            protectedNames = JSON.parse(protectedNamesJsonStr) || [];
        } catch (e) {}

        var totalDeleted = 0;
        var maxPasses = 10;
        for (var pass = 0; pass < maxPasses; pass++) {
            var count = cleanEmptyBins(app.project.rootItem, "", protectedNames);
            totalDeleted += count;
            if (count === 0) break;
        }

        refreshProjectPanelUI();
        return JSON.stringify({ count: totalDeleted });
    };

    // Helper to check if a bin (or any nested sub-bin) contains any non-bin item
    function binContainsNonBinItems(bin) {
        if (!bin || !bin.children) return false;
        var count = bin.children.numItems;
        for (var i = 0; i < count; i++) {
            var child = bin.children[i];
            if (!child) continue;
            if (!isItemBin(child)) {
                return true;
            }
            if (binContainsNonBinItems(child)) {
                return true;
            }
        }
        return false;
    }

    // Helper to collect all non-bin items inside bins into an array
    function collectAllNonBinItemsFromBin(bin, list) {
        if (!bin || !bin.children) return;
        var count = bin.children.numItems;
        for (var i = 0; i < count; i++) {
            var child = bin.children[i];
            if (!child) continue;
            if (isItemBin(child)) {
                collectAllNonBinItemsFromBin(child, list);
            } else {
                list.push(child);
            }
        }
    }

    // Delete all bins in project, safely moving all non-bin items to rootItem first
    $._PPP_.deleteAllBins = function() {
        if (!app.project || !app.project.rootItem) {
            return JSON.stringify({ success: false, error: "No project open" });
        }

        var root = app.project.rootItem;
        var nonBinItems = [];

        // 1. Collect all non-bin items that are currently inside bins
        for (var i = 0; i < root.children.numItems; i++) {
            var topChild = root.children[i];
            if (topChild && isItemBin(topChild)) {
                collectAllNonBinItemsFromBin(topChild, nonBinItems);
            }
        }

        // 2. Move all collected non-bin items directly into rootItem
        var movedCount = 0;
        for (var j = 0; j < nonBinItems.length; j++) {
            var item = nonBinItems[j];
            try {
                item.moveBin(root);
                movedCount++;
            } catch (e) {
                $.writeln("deleteAllBins: moveBin error for item: " + e.toString());
            }
        }

        // 3. Now that all files are safely in root, clean all empty bins with no protected names
        var deletedBinsCount = 0;
        var maxPasses = 10;
        for (var pass = 0; pass < maxPasses; pass++) {
            var count = cleanEmptyBins(root, "", []);
            deletedBinsCount += count;
            if (count === 0) break;
        }

        refreshProjectPanelUI();

        return JSON.stringify({
            success: true,
            movedItemsCount: movedCount,
            deletedBinsCount: deletedBinsCount
        });
    };

    // Relink a specific item to a new media file path
    $._PPP_.relinkMediaPath = function(argsJson) {
        var args = JSON.parse(argsJson);
        var nodeId = args[0];
        var oldFilePath = args[1];
        var newFilePath = args[2];
        if (!app.project || !app.project.rootItem) return "No project open";
        var item = findItemInHierarchy(app.project.rootItem, nodeId);
        if (!item) return "Item not found";
        try {
            var target = new File(newFilePath);
            if (!target.exists) return "Premiere cannot find the destination file.";
            var current = item.getMediaPath();
            if (!current) return "The clip has no media path.";
            var windows = File.fs === "Windows";
            function normalized(filePath) {
                var nativePath = new File(filePath).fsName;
                return windows ? nativePath.toLowerCase() : nativePath;
            }
            if (normalized(current) !== normalized(oldFilePath)) {
                return "The clip's source changed. Rescan the project and try again.";
            }
            if (item.canChangeMediaPath && !item.canChangeMediaPath()) {
                return "Premiere does not allow changing this clip's media path.";
            }
            var result = item.changeMediaPath(target.fsName);
            var actual = item.getMediaPath();
            if (actual && normalized(actual) === normalized(newFilePath)) return "OK";
            return "Premiere did not adopt the destination path (result: " + result + ").";
        } catch (e) {
            return "Error: " + e.toString();
        }
    };

    // Save project
    $._PPP_.saveProject = function() {
        if (!app.project) return "No project";
        try {
            app.project.save();
            return "OK";
        } catch (e) {
            return e.toString();
        }
    };


})();
