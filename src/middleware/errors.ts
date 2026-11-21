import type { ErrorRequestHandler, RequestHandler } from 'express';

export interface ErrorBody {
  error: { code: string; message: string };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorBody = {
    error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` },
  };
  res.status(404).json(body);
};

// Express identifies error handlers by their four-argument signature, so `next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Malformed JSON bodies are a client error, not a server fault.
  if (err instanceof SyntaxError && 'body' in err) {
    const body: ErrorBody = {
      error: { code: 'invalid_json', message: 'Request body is not valid JSON' },
    };
    res.status(400).json(body);
    return;
  }

  console.error(err);
  const body: ErrorBody = { error: { code: 'internal', message: 'Internal server error' } };
  res.status(500).json(body);
};
