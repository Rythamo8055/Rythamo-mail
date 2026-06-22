import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, initDB, cleanupExpired } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
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
      from = json.from || json.sender || "";
      to = json.to || json.recipient || "";
      subject = json.subject || "(no subject)";
      body = json.text || json.body || "";
      html = json.html || "";
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      from = (formData.get("from") as string) || "";
      to = (formData.get("to") as string) || "";
      subject = (formData.get("subject") as string) || "(no subject)";
      body = (formData.get("text") as string) || "";
      html = (formData.get("html") as string) || "";
    } else {
      const text = await req.text();
      body = text;
    }

    const address = to.replace(/["<>]/g, "").trim().toLowerCase();
    const id = nanoid(21);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

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
