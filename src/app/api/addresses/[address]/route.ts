import { NextRequest, NextResponse } from "next/server";
import { getDb, initDB } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    await initDB();
    const db = getDb();
    const { address } = await params;

    const result = await db.execute({
      sql: `SELECT * FROM addresses WHERE id = ?`,
      args: [address],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    const row = result.rows[0];
    return NextResponse.json({
      address: {
        id: row.id,
        localPart: row.local_part,
        domain: row.domain,
        fullAddress: `${row.local_part}@${row.domain}`,
        createdAt: row.created_at,
        isActive: row.is_active === 1,
      },
    });
  } catch (error) {
    console.error("Get address error:", error);
    return NextResponse.json({ error: "Failed to get address" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    await initDB();
    const db = getDb();
    const { address } = await params;
    const { isActive } = await req.json();

    await db.execute({
      sql: `UPDATE addresses SET is_active = ? WHERE id = ?`,
      args: [isActive ? 1 : 0, address],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update address error:", error);
    return NextResponse.json({ error: "Failed to update address" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    await initDB();
    const db = getDb();
    const { address } = await params;

    // Get address info first
    const addrResult = await db.execute({
      sql: `SELECT * FROM addresses WHERE id = ?`,
      args: [address],
    });

    if (addrResult.rows.length === 0) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    const row = addrResult.rows[0];
    const fullAddress = `${row.local_part}@${row.domain}`;

    // Delete all emails for this address
    await db.execute({
      sql: `DELETE FROM emails WHERE address = ?`,
      args: [fullAddress],
    });

    // Delete the address
    await db.execute({
      sql: `DELETE FROM addresses WHERE id = ?`,
      args: [address],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete address error:", error);
    return NextResponse.json({ error: "Failed to delete address" }, { status: 500 });
  }
}
