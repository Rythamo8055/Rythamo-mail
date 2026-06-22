import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, initDB, cleanupExpired } from "@/lib/db";

const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = RATE_LIMIT.get(ip);
  if (!record || now > record.resetAt) {
    RATE_LIMIT.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, "").trim().slice(0, 500);
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const secret = req.headers.get("x-webhook-secret");
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await initDB();
    const db = getDb();

    const contentType = req.headers.get("content-type") || "";
    let from = "";
    let to = "";
    let subject = "(no subject)";
    let body = "";
    let html = "";

    if (contentType.includes("application/json")) {
      const json = await req.json();
      from = sanitizeInput(json.from || json.sender || "");
      to = sanitizeInput(json.to || json.recipient || "");
      subject = sanitizeInput(json.subject || "(no subject)");
      body = (json.text || json.body || "").slice(0, 50000);
      html = (json.html || "").slice(0, 100000);
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      from = sanitizeInput((formData.get("from") as string) || "");
      to = sanitizeInput((formData.get("to") as string) || "");
      subject = sanitizeInput((formData.get("subject") as string) || "(no subject)");
      body = ((formData.get("text") as string) || "").slice(0, 50000);
      html = ((formData.get("html") as string) || "").slice(0, 100000);
    } else {
      const text = await req.text();
      body = text.slice(0, 50000);
    }

    const address = to.replace(/["<>]/g, "").trim().toLowerCase();
    const addressRegex = /^[a-z0-9._-]+@rythamo\.qzz\.io$/;
    if (!addressRegex.test(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const localPart = address.split("@")[0];
    const addrResult = await db.execute({
      sql: `SELECT expiry_minutes, auto_delete, max_emails, forward_to FROM addresses WHERE local_part = ? AND domain = 'rythamo.qzz.io'`,
      args: [localPart],
    });

    let expiryMinutes = 10;
    let autoDelete = true;
    let maxEmails = 100;
    let forwardTo = "";

    if (addrResult.rows.length > 0) {
      const settings = addrResult.rows[0];
      expiryMinutes = (settings.expiry_minutes as number) ?? 10;
      autoDelete = (settings.auto_delete as number) === 1;
      maxEmails = (settings.max_emails as number) ?? 100;
      forwardTo = (settings.forward_to as string) || "";
    }

    // Check max emails limit
    if (maxEmails > 0) {
      const countResult = await db.execute({
        sql: `SELECT COUNT(*) as count FROM emails WHERE address = ?`,
        args: [address],
      });
      const currentCount = (countResult.rows[0]?.count as number) || 0;
      if (currentCount >= maxEmails) {
        // Delete oldest emails to make room
        const excess = currentCount - maxEmails + 1;
        await db.execute({
          sql: `DELETE FROM emails WHERE address = ? AND id IN (SELECT id FROM emails WHERE address = ? ORDER BY created_at ASC LIMIT ?)`,
          args: [address, address, excess],
        });
      }
    }

    const id = nanoid(21);
    let expiresAt: string;

    if (!autoDelete || expiryMinutes === 0) {
      // Set expiry to far future (effectively never)
      expiresAt = "2099-12-31T23:59:59.000Z";
    } else {
      expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
    }

    if (subject.length > 500) {
      subject = subject.slice(0, 500);
    }

    await db.execute({
      sql: `INSERT INTO emails (id, address, from_addr, subject, body, html, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, address, from, subject, body, html, expiresAt],
    });

    await cleanupExpired();

    if (forwardTo) {
      try {
        await fetch(forwardTo, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, from, to: address, subject, text: body, html, receivedAt: new Date().toISOString() }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        // Forwarding failed silently
      }
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Inbound email error:", error);
    return NextResponse.json({ error: "Failed to process email" }, { status: 500 });
  }
}
