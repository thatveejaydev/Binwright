(function (Binwright) {
    'use strict';

    Binwright.createTransferService = function ({ fs, path, crypto, bridge }) {
        function fileOperation(method, ...args) {
            return new Promise((resolve, reject) => {
                fs[method](...args, (error, result) => error ? reject(error) : resolve(result));
            });
        }

        async function sameMediaFile(source, target, normalizePath) {
            const paths = await Promise.all([fileOperation('realpath', source), fileOperation('realpath', target)]);
            return normalizePath(paths[0]) === normalizePath(paths[1]);
        }

        async function mediaFileSnapshot(file) {
            const stat = await fileOperation('lstat', file);
            if (!stat.isFile()) throw new Error('Cannot compare a non-regular file: ' + file);
            return [stat.dev, stat.ino, stat.size, stat.mtime.getTime(), stat.ctime.getTime()];
        }

        async function verifyMediaSnapshots(source, target, snapshots) {
            const current = await Promise.all([mediaFileSnapshot(source), mediaFileSnapshot(target)]);
            const unchanged = current.every((fields, index) =>
                fields.every((value, field) => value === snapshots[index][field])
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
                await fileOperation('copyFile', source, target, fs.constants.COPYFILE_EXCL);
                return { target, kind: 'copied' };
            } catch (error) {
                if (error.code !== 'EEXIST') throw error;
            }

            try {
                if (await sameMediaFile(source, target, normalizePath)) {
                    throw new Error('The file is already at the destination.');
                }
                const snapshots = await Promise.all([mediaFileSnapshot(source), mediaFileSnapshot(target)]);
                if (snapshots[0][2] === snapshots[1][2]) {
                    const sourceHash = await hashMediaFile(source);
                    const targetHash = await hashMediaFile(target);
                    await verifyMediaSnapshots(source, target, snapshots);
                    if (sourceHash === targetHash) return { target, kind: 'reused', snapshots };
                }
            } catch (error) {
                throw new Error('Duplicate comparison failed: ' + error.message);
            }

            const parsed = path.parse(target);
            for (let number = 2; ; number++) {
                const candidate = path.join(parsed.dir, parsed.name + ' (' + number + ')' + parsed.ext);
                try {
                    await fileOperation('copyFile', source, candidate, fs.constants.COPYFILE_EXCL);
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

        return { prepareRelocationTarget, verifyMediaSnapshots, sameMediaFile, relink, removeSource };
    };

    
})(window.Binwright = window.Binwright || {});
