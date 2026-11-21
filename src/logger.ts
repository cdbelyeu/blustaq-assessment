import pino from 'pino';

export type Logger = pino.Logger;

// The single place logging is configured. Output is structured JSON on stdout, so a log shipper
// or insights tool can be attached here without touching call sites.
export function createLogger(level: string, destination?: pino.DestinationStream): Logger {
  return pino({ level }, destination);
}
