import { NextResponse, type NextRequest } from "next/server";

import { isResponse, requireEmployee } from "../../../http/guard";

export async function GET(request: NextRequest) {
  const access = await requireEmployee(request);
  if (isResponse(access)) {
    return access;
  }
  return NextResponse.json({ employee: access.employee });
}
