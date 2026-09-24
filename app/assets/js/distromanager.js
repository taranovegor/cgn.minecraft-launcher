const { DistributionAPI } = require('./common')
const { SERVER_LIST } = require('./endpoints')

const ConfigManager = require('./configmanager')

exports.REMOTE_DISTRO_URL = SERVER_LIST

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

exports.DistroAPI = api
