import { NextResponse } from "next/server";
import spec from "../openapi.json";

/**
 * GET /api/v1/openapi
 * Returns the OpenAPI 3.0 spec for the GapSmith Agent API.
 * Free endpoint — no payment required.
 */
export function GET() {
  return NextResponse.json(spec);
}
