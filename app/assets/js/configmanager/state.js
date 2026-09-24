const path = require('path')
const { LoggerUtil } = require('../util/LoggerUtil')
const { dataPath } = require('./paths')
const DEFAULT_CONFIG = require('./defaults')

const logger = LoggerUtil.getLogger('ConfigManager')

const launcherDir = require('@electron/remote').app.getPath('userData')
const configPath = path.join(launcherDir, 'config.json')
const configPathLEGACY = path.join(dataPath, 'config.json')

let config = null

module.exports = {
    logger,
    DEFAULT_CONFIG,
    launcherDir,
    dataPath,
    configPath,
    configPathLEGACY,
    get config() {
        return config
    },
    set config(value) {
        config = value
    }
}
