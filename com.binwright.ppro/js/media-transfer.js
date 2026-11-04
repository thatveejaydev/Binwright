(function (Binwright) {
    'use strict';

    Binwright.createTransferService = function ({ fs, path, crypto, bridge }) {
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

        function relink(nodeId, source, target) {
            return new Promise(resolve => bridge.call('relinkMediaPath', resolve, [String(nodeId), source, target]));
        }

        function removeSource(source) {
            fs.unlinkSync(source);
        }

        return { prepareRelocationTarget, verifyMediaSnapshots, relink, removeSource };
    };

    
})(window.Binwright = window.Binwright || {});
