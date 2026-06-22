export default {
  async fetch(request, env, ctx) {
    return new Response("Rythamo Mail Worker is running!", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  },

  async email(message, env, ctx) {
    const to = message.to;
    const from = message.from;
    const subject = message.headers.get("subject") || "(no subject)";

    let body = "";
    let html = "";

    const contentType = message.headers.get("content-type") || "";

    if (contentType.includes("text/plain")) {
      body = await new Response(message.raw).text();
    } else if (contentType.includes("text/html")) {
      html = await new Response(message.raw).text();
    } else {
      const rawText = await new Response(message.raw).text();
      body = rawText;
    }

    const response = await fetch(`${env.APP_URL}/api/inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject,
        text: body,
        html,
      }),
    });

    if (!response.ok) {
      console.error("Failed to forward email:", await response.text());
    }
  },
};
