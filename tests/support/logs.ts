import { createLogger, type Logger } from '../../src/logger';

export const silentLogger = (): Logger => createLogger('silent');

// A real logger writing to memory, so tests can assert on what was actually logged.
export function capturingLogger(): { logger: Logger; entries: () => Record<string, unknown>[] } {
  const lines: string[] = [];
  const logger = createLogger('info', { write: (line: string) => void lines.push(line) });
  return {
    logger,
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}
