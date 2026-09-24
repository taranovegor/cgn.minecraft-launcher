const { createLogger, format, transports } = require('winston')
const { SPLAT } = require('triple-beam')
const { DateTime } = require('luxon')
const { inspect } = require('util')

class LoggerUtil {

    static getLogger(label) {
        return createLogger({
            format: format.combine(format.label(), format.colorize(), format.label({ label }), format.printf(info => {
                if (info[SPLAT]) {
                    if (info[SPLAT].length === 1 && info[SPLAT][0] instanceof Error) {
                        const err = info[SPLAT][0]
                        if (info.message.length > err.message.length && info.message.endsWith(err.message)) {
                            info.message = info.message.substring(0, info.message.length - err.message.length)
                        }
                    } else if (info[SPLAT].length > 0) {
                        info.message += ' ' + info[SPLAT].map((it) => {
                            if (typeof it === 'object' && it != null) {
                                return inspect(it, false, null, true)
                            }
                            return it
                        }).join(' ')
                    }
                }
                return `[${DateTime.local().toFormat('yyyy-MM-dd TT').trim()}] [${info.level}] [${info.label}]: ${info.message}${info.stack ? `\n${info.stack}` : ''}`
            })),
            level: process.env.NODE_ENV === 'test' ? 'emerg' : 'debug',
            transports: [
                new transports.Console()
            ]
        })
    }

}

module.exports = { LoggerUtil }
