type LogLevel = 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

function write(level: LogLevel, message: string, context?: LogContext) {
  const payload = {
    level,
    message,
    ts: new Date().toISOString(),
    ...(context ?? {})
  };

  console.log(JSON.stringify(payload));
}

export const logger = {
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context)
};
