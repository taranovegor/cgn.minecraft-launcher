const { inspect } = require('util')

const LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6
}

const COLORS = {
    error: '\x1b[31m',
    warn: '\x1b[33m',
    info: '\x1b[32m',
    http: '\x1b[32m',
    verbose: '\x1b[36m',
    debug: '\x1b[34m',
    silly: '\x1b[37m'
}

const RESET = '\x1b[39m'

function timestamp() {
    const now = new Date()
    const pad = (value) => String(value).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function formatMessage(args) {
    const [first, ...rest] = args
    if (first instanceof Error) {
        return first.stack ?? first.message
    }
    let message = first != null ? String(first) : ''
    if (rest.length === 1 && rest[0] instanceof Error) {
        const error = rest[0]
        if (message.length > error.message.length && message.endsWith(error.message)) {
            message = message.substring(0, message.length - error.message.length)
        }
        if (error.stack != null) {
            message += `\n${error.stack}`
        }
    } else if (rest.length > 0) {
        message += ' ' + rest.map((it) => {
            if (typeof it === 'object' && it != null) {
                return inspect(it, false, null, true)
            }
            return it
        }).join(' ')
    }
    return message
}

class Logger {

    constructor(label, threshold) {
        this.label = label
        this.threshold = threshold
    }

    write(level, args) {
        if (LEVELS[level] > this.threshold) {
            return
        }
        process.stdout.write(`[${timestamp()}] [${COLORS[level]}${level}${RESET}] [${this.label}]: ${formatMessage(args)}\n`)
    }

    error(...args) {
        this.write('error', args)
    }

    warn(...args) {
        this.write('warn', args)
    }

    info(...args) {
        this.write('info', args)
    }

    http(...args) {
        this.write('http', args)
    }

    verbose(...args) {
        this.write('verbose', args)
    }

    debug(...args) {
        this.write('debug', args)
    }

    silly(...args) {
        this.write('silly', args)
    }

}

class LoggerUtil {

    static getLogger(label) {
        const threshold = process.env.NODE_ENV === 'test' ? -1 : LEVELS.debug
        return new Logger(label, threshold)
    }

}

module.exports = { LoggerUtil }
