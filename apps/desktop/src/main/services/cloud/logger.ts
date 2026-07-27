/**
 * Structured logger for cloud sync observability
 */

function formatMessage(level: string, module: string, message: string, metadata?: any): string {
  const timestamp = new Date().toISOString();
  let logLine = `[${timestamp}] [${level}] [${module}] ${message}`;
  if (metadata) {
    if (metadata instanceof Error) {
      logLine += `\n${metadata.stack || metadata.message}`;
    } else {
      try {
        logLine += `\n${JSON.stringify(metadata)}`;
      } catch (e) {
        logLine += `\n[Unserializable metadata]`;
      }
    }
  }
  return logLine;
}

export const logger = {
  info: (module: string, message: string, metadata?: any) => {
    console.log(formatMessage("INFO", module, message, metadata));
  },
  warn: (module: string, message: string, metadata?: any) => {
    console.warn(formatMessage("WARN", module, message, metadata));
  },
  error: (module: string, message: string, metadata?: any) => {
    console.error(formatMessage("ERROR", module, message, metadata));
  }
};
