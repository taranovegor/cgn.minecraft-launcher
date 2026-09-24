const { createHash } = require('crypto')
const { join, dirname } = require('path')
const fs = require('fs-extra')
const StreamZip = require('node-stream-zip')
const { createGunzip } = require('zlib')
const tar = require('tar-fs')
const { LoggerUtil } = require('../../util/LoggerUtil')

const log = LoggerUtil.getLogger('FileUtils')

function calculateHashByBuffer(buf, algo) {
    return createHash(algo).update(buf).digest('hex')
}

function calculateHash(path, algo) {
    return new Promise((resolve, reject) => {
        const hash = createHash(algo)
        const input = fs.createReadStream(path)
        input.on('error', reject)
        input.on('data', chunk => hash.update(chunk))
        input.on('close', () => resolve(hash.digest('hex')))
    })
}

async function validateLocalFile(path, algo, hash) {
    if (await fs.pathExists(path)) {
        if (hash == null) {
            return true
        }
        try {
            return (await calculateHash(path, algo)) === hash
        } catch (err) {
            log.error('Failed to calculate hash.', err)
        }
    }
    return false
}

function getVersionExtPath(commonDir, version, ext) {
    return join(commonDir, 'versions', version, `${version}.${ext}`)
}

function getVersionJsonPath(commonDir, version) {
    return getVersionExtPath(commonDir, version, 'json')
}

function getVersionJarPath(commonDir, version) {
    return getVersionExtPath(commonDir, version, 'jar')
}

function getLibraryDir(commonDir) {
    return join(commonDir, 'libraries')
}

async function extractZip(zipPath, peek) {
    const zip = new StreamZip.async({
        file: zipPath,
        storeEntries: true
    })
    if (peek) {
        await peek(zip)
    }
    try {
        log.info(`Extracting ${zipPath}`)
        await zip.extract(null, dirname(zipPath))
        log.info(`Removing ${zipPath}`)
        await fs.remove(zipPath)
        log.info('Zip extraction complete.')
    } catch (err) {
        log.error('Zip extraction failed', err)
    } finally {
        await zip.close()
    }
}

async function extractTarGz(tarGzPath, peek) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(tarGzPath)
            .on('error', err => log.error(err))
            .pipe(createGunzip())
            .on('error', err => log.error(err))
            .pipe(tar.extract(dirname(tarGzPath), {
                map: (header) => {
                    if (peek) {
                        peek(header)
                    }
                    return header
                }
            }))
            .on('error', err => {
                log.error(err)
                reject(err)
            })
            .on('finish', () => {
                fs.unlink(tarGzPath, err => {
                    if (err) {
                        log.error(err)
                        reject()
                    } else {
                        resolve()
                    }
                })
            })
    })
}

module.exports = {
    calculateHashByBuffer,
    calculateHash,
    validateLocalFile,
    getVersionJsonPath,
    getVersionJarPath,
    getLibraryDir,
    extractZip,
    extractTarGz
}
