import { NextResponse } from "next/server";
import { SITE } from "@/lib/config";

export async function GET() {
  return NextResponse.json({ paymentsEnabled: SITE.paymentsEnabled });
}
