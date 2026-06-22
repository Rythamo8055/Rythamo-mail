import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, initDB, cleanupExpired } from "@/lib/db";

const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // max requests per window

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = RATE_LIMIT.get(ip);

  if (!record || now > record.resetAt) {
    RATE_LIMIT.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 500);
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    // Validate webhook secret
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

    // Sanitize address
    const address = to.replace(/["<>]/g, "").trim().toLowerCase();

    // Validate address format
    const addressRegex = /^[a-z0-9._-]+@rythamo\.qzz\.io$/;
    if (!addressRegex.test(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    // Validate subject length
    if (subject.length > 500) {
      subject = subject.slice(0, 500);
    }

    const id = nanoid(21);
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString();

    await db.execute({
      sql: `INSERT INTO emails (id, address, from_addr, subject, body, html, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, address, from, subject, body, html, expiresAt],
    });

    await cleanupExpired();

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Inbound email error:", error);
    return NextResponse.json(
      { error: "Failed to process email" },
      { status: 500 }
    );
  }
}

const EXPIRY_MINUTES = 10;
