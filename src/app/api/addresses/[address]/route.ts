import { NextRequest, NextResponse } from "next/server";
import { getDb, initDB } from "@/lib/db";

const VALID_EXPIRY = [0, 5, 10, 30, 60, 240, 1440, 10080];

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
        expiryMinutes: row.expiry_minutes,
        autoDelete: row.auto_delete === 1,
        maxEmails: row.max_emails,
        forwardTo: row.forward_to || "",
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
    const body = await req.json();

    const updates: string[] = [];
    const args: (string | number)[] = [];

    if (body.isActive !== undefined) {
      updates.push("is_active = ?");
      args.push(body.isActive ? 1 : 0);
    }

    if (body.expiryMinutes !== undefined) {
      if (!VALID_EXPIRY.includes(body.expiryMinutes)) {
        return NextResponse.json({ error: "Invalid expiry time" }, { status: 400 });
      }
      updates.push("expiry_minutes = ?");
      args.push(body.expiryMinutes);
    }

    if (body.autoDelete !== undefined) {
      updates.push("auto_delete = ?");
      args.push(body.autoDelete ? 1 : 0);
    }

    if (body.maxEmails !== undefined) {
      if (body.maxEmails < 1 || body.maxEmails > 10000) {
        return NextResponse.json({ error: "Max emails must be between 1 and 10000" }, { status: 400 });
      }
      updates.push("max_emails = ?");
      args.push(body.maxEmails);
    }

    if (body.forwardTo !== undefined) {
      const sanitized = body.forwardTo.trim().slice(0, 500);
      updates.push("forward_to = ?");
      args.push(sanitized);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    args.push(address);
    await db.execute({
      sql: `UPDATE addresses SET ${updates.join(", ")} WHERE id = ?`,
      args,
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

    const addrResult = await db.execute({
      sql: `SELECT * FROM addresses WHERE id = ?`,
      args: [address],
    });

    if (addrResult.rows.length === 0) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    const row = addrResult.rows[0];
    const fullAddress = `${row.local_part}@${row.domain}`;

    await db.execute({
      sql: `DELETE FROM emails WHERE address = ?`,
      args: [fullAddress],
    });

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
