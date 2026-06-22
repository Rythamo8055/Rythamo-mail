import { NextRequest, NextResponse } from "next/server";
import { getDb, initDB, cleanupExpired } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    await initDB();
    await cleanupExpired();

    const db = getDb();
    const { address } = await params;

    // Get address info
    const addrResult = await db.execute({
      sql: `SELECT * FROM addresses WHERE id = ?`,
      args: [address],
    });

    if (addrResult.rows.length === 0) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    const addr = addrResult.rows[0];
    const fullAddress = `${addr.local_part}@${addr.domain}`;

    // Get emails for this address
    const result = await db.execute({
      sql: `SELECT id, from_addr, subject, body, html, created_at, expires_at
            FROM emails
            WHERE address = ?
            ORDER BY created_at DESC`,
      args: [fullAddress],
    });

    const emails = result.rows.map((row) => ({
      id: row.id,
      from: row.from_addr,
      subject: row.subject,
      body: row.body,
      html: row.html,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      isRead: true,
    }));

    return NextResponse.json({ emails, address: fullAddress });
  } catch (error) {
    console.error("Fetch emails error:", error);
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }
}
