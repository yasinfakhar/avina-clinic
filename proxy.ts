import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const expected = process.env.AUDIOLOGY_DESKTOP_TOKEN;
  if (!expected) return NextResponse.next();
  const supplied = request.cookies.get("audiology-desktop-token")?.value || request.headers.get("x-audiology-desktop-token");
  if (supplied !== expected) return new NextResponse("Desktop authorization required", { status: 401 });
  return NextResponse.next();
}

export const config = { matcher: ["/", "/api/:path*"] };
