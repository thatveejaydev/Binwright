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

    var BIN_TYPE = (typeof ProjectItemType !== 'undefined' && typeof ProjectItemType.BIN !== 'undefined') ? ProjectItemType.BIN : 2;

    var EXT_MAP = {
        // Camera RAW
        r3d: "cameraraw", braw: "cameraraw", ari: "cameraraw", arri: "cameraraw",
        crm: "cameraraw", dng: "cameraraw",
        // Video
        mp4: "video", mov: "video", mkv: "video", avi: "video", mxf: "video",
        wmv: "video", flv: "video", webm: "video", m4v: "video", mts: "video",
        m2ts: "video", mpg: "video", mpeg: "video",
        // Audio
        wav: "audio", mp3: "audio", aac: "audio", aif: "audio", aiff: "audio",
        m4a: "audio", flac: "audio", ogg: "audio", wma: "audio",
        // Images
        png: "image", jpg: "image", jpeg: "image", tif: "image", tiff: "image",
        psd: "image", ai: "image", svg: "image", gif: "image", bmp: "image",
        exr: "image", webp: "image",
        // Graphics
        mogrt: "graphics", prfpset: "graphics", aep: "graphics",
        // Captions
        srt: "captions", ass: "captions", ttml: "captions", vtt: "captions",
        scc: "captions", mcc: "captions", xml: "captions"
    };

    function categorizeMediaPath(mediaPath) {
        if (!mediaPath) return "solids";
        var lastDot = mediaPath.lastIndexOf(".");
        if (lastDot === -1) return "video";
        var ext = mediaPath.substring(lastDot + 1).toLowerCase();
        return Object.prototype.hasOwnProperty.call(EXT_MAP, ext) ? EXT_MAP[ext] : "video";
    }

    var projectRevision = 0;
    var projectTracking;
    var hostSession = String(new Date().getTime()) + ":" + Math.random();
    var lastSnapshotToken = null;
    var lastSnapshotData = null;

    function markProjectChanged() {
        projectRevision++;
        lastSnapshotData = null;
    }

    function getProjectInfo(project) {
        if (!project || !project.rootItem) {
            return { id: "", name: "No Project", path: "", sequencesCount: 0, rootItemCount: 0 };
        }
        var projPath = "";
        var documentId = "";
        try { projPath = project.path || ""; } catch (e) {}
        try { documentId = project.documentID || ""; } catch (e) {}
        return {
            id: JSON.stringify([documentId, String(project.rootItem.nodeId)]),
            name: project.name || "Untitled Project",
            path: projPath,
            sequencesCount: project.sequences ? project.sequences.numSequences : 0,
            rootItemCount: project.rootItem.children ? project.rootItem.children.numItems : 0
        };
    }

    function snapshotToken(info) {
        return JSON.stringify([hostSession, projectRevision, info]);
    }

    // Fast signature of root-level items and direct bin sizes to detect project changes
    function buildFastSignature(project) {
        if (!project || !project.rootItem || !project.rootItem.children) return "";
        var rootChildren = project.rootItem.children;
        var count = rootChildren.numItems;
        var parts = [String(projectRevision), String(count)];
        for (var i = 0; i < count; i++) {
            var c = rootChildren[i];
            if (c) {
                parts.push(String(c.nodeId));
                if (c.type === BIN_TYPE && c.children) {
                    parts.push(String(c.children.numItems));
                }
            }
        }
        return parts.join(",");
    }

    // Recursively collect all items in the project with optimized fast-path dispatch
    function walkBin(bin, parentPath, list) {
        if (!bin) return;
        var children = bin.children;
        if (!children) return;
        var count = children.numItems;
        for (var i = 0; i < count; i++) {
            var item = children[i];
            if (!item) continue;

            var iType = 0;
            try { iType = item.type; } catch (e) {}

            var isBin = (iType === BIN_TYPE);
            var isSeq = false;
            var mediaPath = "";
            var catType = "video";

            if (isBin) {
                catType = "bin";
            } else {
                try { isSeq = item.isSequence(); } catch (e) {}
                if (isSeq) {
                    catType = "sequence";
                } else {
                    try { mediaPath = item.getMediaPath() || ""; } catch (e) {}
                    catType = categorizeMediaPath(mediaPath);
                }
            }

            var itemName = "";
            try { itemName = item.name || ""; } catch (e) {}

            list.push({
                nodeId: item.nodeId,
                name: itemName,
                type: catType,
                isBin: isBin,
                isSequence: isSeq,
                mediaPath: mediaPath,
                parentPath: parentPath || "root"
            });

            if (isBin) {
                var nextPath = parentPath ? (parentPath + "/" + itemName) : itemName;
                walkBin(item, nextPath, list);
            }
        }
    }

    $._PPP_.getProjectSnapshot = function(requestJson) {
        var request = JSON.parse(requestJson);
        if (typeof projectTracking === "undefined") {
            projectTracking = false;
            try {
                projectTracking = app.bind("onProjectChanged", markProjectChanged) === true;
                app.bind("onItemsAddedToProjectSuccess", markProjectChanged);
            } catch (e) {}
        }

        var project = app.project;
        var info = getProjectInfo(project);
        var token = snapshotToken(info);

        // Quick return if client token matches and no forced reload requested
        if (!request.force && request.token === token) {
            return JSON.stringify({ token: token });
        }

        // Fast signature verification to reuse cached serialized snapshot if project is untouched
        var currentSig = buildFastSignature(project);
        if (!request.force && lastSnapshotData && lastSnapshotToken === token && lastSnapshotData.sig === currentSig) {
            return JSON.stringify({ token: token, project: info, items: lastSnapshotData.items });
        }

        var list = [];
        if (info.id) walkBin(project.rootItem, "", list);
        var itemsJson = JSON.stringify(list);

        lastSnapshotToken = token;
        lastSnapshotData = {
            sig: currentSig,
            items: itemsJson
        };

        return JSON.stringify({ token: token, project: info, items: itemsJson });
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
                if (child && child.type === BIN_TYPE && child.name && child.name.toLowerCase() === partName.toLowerCase()) {
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
        markProjectChanged();
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
            if (sub && sub.type === BIN_TYPE) {
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
            if (!item || item.type === BIN_TYPE) continue;
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
            if (sub && sub.type === BIN_TYPE && sub !== targetBin) {
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
            if (child.type === BIN_TYPE) indexItemsByNodeId(child, nodeMap);
        }
    }

    function indexDirectChildren(bin) {
        var members = {};
        var children = bin.children;
        if (!children) return members;
        var count = children.numItems;
        for (var i = 0; i < count; i++) {
            var child = children[i];
            if (!child) continue;
            var id = child.nodeId;
            if (id !== null && id !== undefined && id !== "") {
                members["id:" + String(id)] = true;
            }
        }
        return members;
    }

    // Execute bulk moves into destination bins
    // Request contains the reviewed snapshot token and its planned moves.
    $._PPP_.moveItemsToBins = function(movesJsonStr) {
        if (!app.project || !app.project.rootItem) return JSON.stringify({ count: 0, error: "No project open" });
        var request = JSON.parse(movesJsonStr);
        if (request.token !== snapshotToken(getProjectInfo(app.project))) {
            return JSON.stringify({ count: 0, error: "The project changed. Review the updated sort plan." });
        }
        var moves = request.moves;
        if (!moves || moves.length === 0) return JSON.stringify({ count: 0 });

        var started = new Date().getTime();
        var root = app.project.rootItem;
        var binCache = {};
        var nodeMap = {};
        indexItemsByNodeId(root, nodeMap);

        var indexedAt = new Date().getTime();
        var movedCount = 0;
        var destinations = [];
        for (var m = 0; m < moves.length; m++) {
            var move = moves[m];
            var binKey = "path:" + (move.targetPath || "");
            var destination = binCache[binKey];
            var targetBin;
            if (!destination) {
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
                destination = { bin: targetBin, initialMembers: indexDirectChildren(targetBin), pending: [] };
                binCache[binKey] = destination;
                destinations.push(destination);
            }
            targetBin = destination.bin;

            var item = move.nodeId ? nodeMap["id:" + String(move.nodeId)] : null;
            if (!item) item = findItemFallback(root, move.name, move.mediaPath, targetBin);
            if (!item || item === targetBin) continue;

            var id = item.nodeId;
            var key = id === null || id === undefined || id === "" ? null : "id:" + String(id);
            if (key ? destination.initialMembers[key] : isItemDirectChildOf(item, targetBin)) continue;
            try {
                item.moveBin(targetBin);
                destination.pending.push({ key: key, item: item, name: move.name || move.nodeId, nodeId: id });
            } catch (e) {
                $.writeln("moveBin error: " + e.toString());
            }
        }

        var movedAt = new Date().getTime();
        var movedNodeIds = [];
        // Verify all moves into a bin in one pass over its children.
        for (var d = 0; d < destinations.length; d++) {
            destination = destinations[d];
            if (!destination.pending.length) continue;
            var members = indexDirectChildren(destination.bin);
            for (var i = 0; i < destination.pending.length; i++) {
                var pending = destination.pending[i];
                var arrived = pending.key ? members[pending.key] : isItemDirectChildOf(pending.item, destination.bin);
                if (arrived) {
                    movedCount++;
                    if (pending.nodeId !== null && pending.nodeId !== undefined) {
                        movedNodeIds.push(String(pending.nodeId));
                    }
                } else {
                    $.writeln("moveBin did not place item into targetBin: " + pending.name);
                }
            }
        }

        var verifiedAt = new Date().getTime();
        markProjectChanged();
        refreshProjectPanelUI();
        return JSON.stringify({
            count: movedCount,
            movedNodeIds: movedNodeIds,
            timings: {
                indexMs: indexedAt - started,
                moveMs: movedAt - indexedAt,
                verifyMs: verifiedAt - movedAt,
                redrawMs: new Date().getTime() - verifiedAt
            }
        });
    };

    // Helper to safely check if an item is a bin
    function isItemBin(item) {
        if (!item) return false;
        try {
            if (item.type === BIN_TYPE) return true;
        } catch (e) {}
        try {
            if (typeof item.isBin === 'function') {
                return item.isBin();
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
        markProjectChanged();
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
        markProjectChanged();

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
            if (actual && normalized(actual) === normalized(newFilePath)) {
                markProjectChanged();
                return "OK";
            }
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
