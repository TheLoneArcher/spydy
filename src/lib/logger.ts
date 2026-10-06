type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function sanitize(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(sanitize);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password') ||
      lowerKey.includes('key') ||
      lowerKey.includes('authorization')
    ) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function logMessage(level: LogLevel, message: string, meta?: unknown) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(sanitize(meta))}` : '';

  if (level === 'error') {
    console.error(`[${timestamp}] [ERROR] ${message}${metaStr}`);
  } else if (level === 'warn') {
    console.warn(`[${timestamp}] [WARN] ${message}${metaStr}`);
  } else if (process.env.NODE_ENV !== 'production' || level === 'info') {
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => logMessage('debug', message, meta),
  info: (message: string, meta?: unknown) => logMessage('info', message, meta),
  warn: (message: string, meta?: unknown) => logMessage('warn', message, meta),
  error: (message: string, meta?: unknown) => logMessage('error', message, meta),
};
