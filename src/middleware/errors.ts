import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../errors';
import type { Logger } from '../logger';

export interface ErrorBody {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorBody = {
    error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` },
  };
  res.status(404).json(body);
};

const isPayloadTooLarge = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large';

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  // Express identifies error handlers by their four-argument signature, so `next` must stay.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, _req, res, _next) => {
    // Malformed JSON bodies are a client error, not a server fault.
    if (err instanceof SyntaxError && 'body' in err) {
      const body: ErrorBody = {
        error: { code: 'invalid_json', message: 'Request body is not valid JSON' },
      };
      res.status(400).json(body);
      return;
    }

    // The JSON parser rejects oversized bodies before any route runs.
    if (isPayloadTooLarge(err)) {
      const body: ErrorBody = {
        error: { code: 'payload_too_large', message: 'Request body is too large' },
      };
      res.status(413).json(body);
      return;
    }

    if (err instanceof ApiError) {
      const body: ErrorBody = { error: { code: err.code, message: err.message } };
      res.status(err.status).json(body);
      return;
    }

    if (err instanceof ZodError) {
      const body: ErrorBody = {
        error: {
          code: 'validation_failed',
          message: 'Request is invalid',
          details: err.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      };
      res.status(400).json(body);
      return;
    }

    logger.error({ err }, 'unhandled error');
    const body: ErrorBody = { error: { code: 'internal', message: 'Internal server error' } };
    res.status(500).json(body);
  };
}
