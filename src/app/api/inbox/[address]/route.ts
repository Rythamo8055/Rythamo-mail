import { NextRequest, NextResponse } from "next/server";
import { getDb, initDB, cleanupExpired } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    await initDB();
    await cleanupExpired();

    const { address } = await params;
    const decodedAddress = decodeURIComponent(address).toLowerCase();
    const db = getDb();

    const result = await db.execute({
      sql: `SELECT id, from_addr, subject, body, html, created_at, expires_at
            FROM emails
            WHERE address = ?
            ORDER BY created_at DESC`,
      args: [decodedAddress],
    });

    const emails = result.rows.map((row) => ({
      id: row.id,
      from: row.from_addr,
      subject: row.subject,
      body: row.body,
      html: row.html,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));

    return NextResponse.json({ emails });
  } catch (error) {
    console.error("Fetch inbox error:", error);
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }
}
