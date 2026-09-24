// Shared renderer dependencies.
// This script must be loaded before any other renderer script so that
// `$` and `LoggerUtil` are available on the window global.
window.$ = require('jquery')
window.LoggerUtil = require('./assets/js/util/LoggerUtil').LoggerUtil
