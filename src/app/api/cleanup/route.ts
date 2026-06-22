import { NextResponse } from "next/server";
import { initDB, cleanupExpired } from "@/lib/db";

export async function POST() {
  try {
    await initDB();
    await cleanupExpired();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
