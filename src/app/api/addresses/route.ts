import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, initDB } from "@/lib/db";

const VALID_DOMAIN = "rythamo.qzz.io";
const BLOCKED_WORDS = ["admin", "root", "support", "abuse", "postmaster", "webmaster", "hostmaster", "noreply", "no-reply"];
const VALID_EXPIRY = [0, 5, 10, 30, 60, 240, 1440, 10080];

function validateLocalPart(localPart: string): { valid: boolean; error?: string } {
  if (!localPart || localPart.length < 3) {
    return { valid: false, error: "Address must be at least 3 characters" };
  }
  if (localPart.length > 64) {
    return { valid: false, error: "Address must be 64 characters or less" };
  }
  if (!/^[a-z0-9._-]+$/.test(localPart)) {
    return { valid: false, error: "Only lowercase letters, numbers, dots, hyphens, underscores allowed" };
  }
  if (localPart.startsWith(".") || localPart.endsWith(".")) {
    return { valid: false, error: "Cannot start or end with a dot" };
  }
  if (localPart.includes("..")) {
    return { valid: false, error: "Cannot contain consecutive dots" };
  }
  if (BLOCKED_WORDS.includes(localPart)) {
    return { valid: false, error: "This address is reserved" };
  }
  return { valid: true };
}

export async function GET() {
  try {
    await initDB();
    const db = getDb();

    const result = await db.execute({
      sql: `SELECT a.*, 
                   COUNT(e.id) as email_count,
                   MAX(e.created_at) as last_email_at
            FROM addresses a
            LEFT JOIN emails e ON e.address = a.local_part || '@' || a.domain
            GROUP BY a.id
            ORDER BY a.created_at DESC`,
      args: [],
    });

    const addresses = result.rows.map((row) => ({
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
      emailCount: row.email_count,
      lastEmailAt: row.last_email_at,
    }));

    return NextResponse.json({ addresses });
  } catch (error) {
    console.error("List addresses error:", error);
    return NextResponse.json({ error: "Failed to list addresses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initDB();
    const db = getDb();

    const { localPart, expiryMinutes = 10, autoDelete = true, maxEmails = 100, forwardTo = "" } = await req.json();

    if (!localPart) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const normalized = localPart.toLowerCase().trim();
    const validation = validateLocalPart(normalized);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (!VALID_EXPIRY.includes(expiryMinutes)) {
      return NextResponse.json({ error: "Invalid expiry time" }, { status: 400 });
    }

    if (maxEmails < 1 || maxEmails > 10000) {
      return NextResponse.json({ error: "Max emails must be between 1 and 10000" }, { status: 400 });
    }

    // Check if already exists
    const existing = await db.execute({
      sql: `SELECT id FROM addresses WHERE local_part = ? AND domain = ?`,
      args: [normalized, VALID_DOMAIN],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Address already taken" }, { status: 409 });
    }

    const id = nanoid(21);

    await db.execute({
      sql: `INSERT INTO addresses (id, local_part, domain, expiry_minutes, auto_delete, max_emails, forward_to)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, normalized, VALID_DOMAIN, expiryMinutes, autoDelete ? 1 : 0, maxEmails, forwardTo],
    });

    return NextResponse.json({
      success: true,
      address: {
        id,
        localPart: normalized,
        domain: VALID_DOMAIN,
        fullAddress: `${normalized}@${VALID_DOMAIN}`,
        expiryMinutes,
        autoDelete,
        maxEmails,
        forwardTo,
      },
    });
  } catch (error) {
    console.error("Create address error:", error);
    return NextResponse.json({ error: "Failed to create address" }, { status: 500 });
  }
}
