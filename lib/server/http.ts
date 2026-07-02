import { NextResponse } from 'next/server';

// Error that carries an HTTP status + a `detail` message, mirroring the
// shape the former Express backend returned: { detail: string }.
export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// Query-string params (replaces Express req.query). Returns a plain object of
// string values; use .get on the URLSearchParams for repeated keys if needed.
export function query(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}

export function errorResponse(detail: string, status = 500) {
  return NextResponse.json({ detail }, { status });
}

// Wrap a route handler so thrown ApiErrors become { detail } responses with
// the right status, and any other error becomes a 500. This replaces the
// per-route try/catch blocks the Express version used.
type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

export function handle<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return errorResponse(err.message, err.status);
      }
      const message = err instanceof Error ? err.message : 'Internal server error';
      const stack = err instanceof Error ? err.stack : String(err);
      console.error('Unhandled API error:', message);
      try {
        require('fs').appendFileSync(require('path').join(process.cwd(), 'scratch', 'api_errors.log'), `[${req.url}] ${stack}\n\n`);
      } catch (e) {}
      return errorResponse(message || 'Internal server error', 500);
    }
  };
}

// Safely parse a JSON body, returning {} when absent/invalid (Express used
// express.json() which left req.body as {} for empty bodies). Defaults to a
// permissive type to mirror Express's untyped req.body and keep route code clean.
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function readBody<T = any>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

// Parse a body that may be JSON or application/x-www-form-urlencoded
// (PayU posts form-encoded callbacks). Mirrors Express's combined
// express.json() + express.urlencoded() body parsing.
export async function readForm<T = any>(req: Request): Promise<T> {
  const contentType = req.headers.get('content-type') || '';
  const text = await req.text();
  if (!text) return {} as T;
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }
  // urlencoded (or unknown) — parse as form data
  return Object.fromEntries(new URLSearchParams(text).entries()) as T;
}
