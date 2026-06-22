"use client";

import { useState, useEffect, useCallback } from "react";

const DOMAIN = "rythamo.qzz.io";
const REFRESH_INTERVAL = 5000;

function generateAddress(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getTimeLeft(expiresAt: string): string {
  const now = new Date().getTime();
  const expiry = new Date(expiresAt).getTime();
  const diff = Math.max(0, expiry - now);
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

interface Email {
  id: string;
  from: string;
  subject: string;
  body: string;
  html: string;
  createdAt: string;
  expiresAt: string;
}

export default function Home() {
  const [address, setAddress] = useState("");
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState("--:--");

  const fetchEmails = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(address)}`);
      const data = await res.json();
      setEmails(data.emails || []);
    } catch (err) {
      console.error("Failed to fetch emails:", err);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    fetchEmails();
    const interval = setInterval(fetchEmails, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [address, fetchEmails]);

  useEffect(() => {
    if (!selectedEmail?.expiresAt) return;
    const timer = setInterval(() => {
      setTimeLeft(getTimeLeft(selectedEmail.expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [selectedEmail]);

  const handleGenerate = () => {
    setLoading(true);
    const newAddr = generateAddress();
    setAddress(`${newAddr}@${DOMAIN}`);
    setEmails([]);
    setSelectedEmail(null);
    setLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            Rythamo Mail
          </h1>
          <p className="text-gray-400">Disposable email. No signup. No trace.</p>
        </header>

        <div className="bg-gray-900 rounded-2xl p-6 mb-8 border border-gray-800">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <div className="flex-1 relative">
              <input
                type="text"
                value={address}
                readOnly
                placeholder="Click generate to get an address"
                className="w-full bg-gray-800 text-green-400 font-mono text-lg px-4 py-3 rounded-xl border border-gray-700 focus:outline-none focus:border-green-500"
              />
              {address && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
                  10 min
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="bg-green-500 hover:bg-green-600 text-black font-semibold px-6 py-3 rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {loading ? "..." : "Generate"}
              </button>
              {address && (
                <button
                  onClick={handleCopy}
                  className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-xl transition-all border border-gray-700"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
          </div>
        </div>

        {address && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                <div className="p-4 border-b border-gray-800">
                  <h2 className="font-semibold text-gray-300">
                    Inbox
                    <span className="ml-2 text-sm text-gray-500">
                      ({emails.length})
                    </span>
                  </h2>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {emails.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <div className="text-4xl mb-3">📭</div>
                      <p>Waiting for emails...</p>
                      <p className="text-xs mt-1">Auto-refreshes every 5s</p>
                    </div>
                  ) : (
                    emails.map((email) => (
                      <button
                        key={email.id}
                        onClick={() => {
                          setSelectedEmail(email);
                          setTimeLeft(getTimeLeft(email.expiresAt));
                        }}
                        className={`w-full text-left p-4 border-b border-gray-800 hover:bg-gray-800 transition-colors ${
                          selectedEmail?.id === email.id ? "bg-gray-800" : ""
                        }`}
                      >
                        <div className="text-sm text-green-400 truncate">
                          {email.from}
                        </div>
                        <div className="text-sm text-gray-300 truncate mt-1">
                          {email.subject}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(email.createdAt).toLocaleTimeString()}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-gray-900 rounded-2xl border border-gray-800 min-h-96">
                {selectedEmail ? (
                  <div>
                    <div className="p-4 border-b border-gray-800">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold">
                          {selectedEmail.subject}
                        </h3>
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
                          Expires in {timeLeft}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400">
                        From:{" "}
                        <span className="text-green-400">
                          {selectedEmail.from}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        To: {address}
                      </div>
                    </div>
                    <div className="p-4">
                      {selectedEmail.html ? (
                        <div
                          className="prose prose-invert max-w-none text-gray-300"
                          dangerouslySetInnerHTML={{
                            __html: selectedEmail.html,
                          }}
                        />
                      ) : (
                        <pre className="whitespace-pre-wrap text-gray-300 font-sans">
                          {selectedEmail.body}
                        </pre>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-96 text-gray-500">
                    <div className="text-center">
                      <div className="text-5xl mb-4">📧</div>
                      <p>Select an email to read</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <footer className="text-center mt-12 text-gray-600 text-sm">
          <p>
            Emails auto-delete after 10 minutes. Do not use for important
            accounts.
          </p>
        </footer>
      </div>
    </div>
  );
}
