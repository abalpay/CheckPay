type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  [key: string]: unknown
}

function createEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  }
}

function shouldLog(level: LogLevel): boolean {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
  const minLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'
  return levels.indexOf(level) >= levels.indexOf(minLevel)
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('debug')) console.debug(JSON.stringify(createEntry('debug', message, meta)))
  },
  info(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('info')) console.info(JSON.stringify(createEntry('info', message, meta)))
  },
  warn(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('warn')) console.warn(JSON.stringify(createEntry('warn', message, meta)))
  },
  error(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('error')) console.error(JSON.stringify(createEntry('error', message, meta)))
  },
}
