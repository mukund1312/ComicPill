// Deployment entry for the reading-intent endpoint. NOT part of the mobile
// bundle: nothing under app/ or src/ imports this file, and it is the only
// place the Anthropic SDK is imported at runtime.
//
// It is a plain `(Request) => Response` handler, so it drops into a Vercel /
// Next route, a Supabase Edge Function, or a Cloudflare Worker with a
// one-line adapter. Set ANTHROPIC_API_KEY in the host's environment (the SDK
// reads it) — never in the app, and never in EXPO_PUBLIC_* variables, which
// are inlined into the shipped JS.
//
// Access control is FAIL-CLOSED: with INTENT_BEARER_TOKEN unset every request
// is rejected. A static bearer token is only a stopgap (a token shipped in
// the app is not secret); once the app has real sign-in, replace `authorize`
// with a verification of the user's session token, and add per-user rate
// limiting at the host — this endpoint bills per call.
import Anthropic from '@anthropic-ai/sdk';
import { handleIntentRequest } from '../src/lib/intent/server';

const client = new Anthropic();

function authorize(req: Request): boolean {
  const expected = process.env.INTENT_BEARER_TOKEN;
  if (!expected) return false;
  return req.headers.get('authorization') === `Bearer ${expected}`;
}

export default function handler(req: Request): Promise<Response> {
  return handleIntentRequest(req, { client, authorize });
}
