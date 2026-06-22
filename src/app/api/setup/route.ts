import { NextResponse } from "next/server";
import { initDB } from "@/lib/db";

export async function POST() {
  try {
    await initDB();
    return NextResponse.json({ success: true, message: "Database initialized" });
  } catch (error) {
    console.error("Init error:", error);
    return NextResponse.json(
      { error: "Failed to initialize database" },
      { status: 500 }
    );
  }
}
