"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import DOMPurify from "dompurify";

const DOMAIN = "rythamo.qzz.io";
const REFRESH_INTERVAL = 5000;
const EXPIRY_MINUTES = 10;

function generateAddress(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const array = new Uint8Array(10);
  crypto.getRandomValues(array);
  for (let i = 0; i < 10; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

function getTimeLeft(expiresAt: string): { minutes: number; seconds: number; display: string; percent: number } {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diff = Math.max(0, expiry - now);
  const totalMs = EXPIRY_MINUTES * 60 * 1000;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const percent = (diff / totalMs) * 100;
  return { minutes, seconds, display: `${minutes}:${seconds.toString().padStart(2, "0")}`, percent };
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "b", "i", "u", "em", "strong", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre", "img", "table", "tr", "td", "th", "thead", "tbody", "div", "span"],
    ALLOWED_ATTR: ["href", "src", "alt", "class", "style", "target", "rel"],
  });
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
  const [timeInfo, setTimeInfo] = useState({ minutes: 0, seconds: 0, display: "--:--", percent: 100 });
  const [emailCount, setEmailCount] = useState(0);
  const inboxRef = useRef<HTMLDivElement>(null);

  const fetchEmails = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const newEmails = data.emails || [];
      setEmails(newEmails);
      setEmailCount(newEmails.length);
    } catch {
      // Silent fail - will retry on next interval
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
      setTimeInfo(getTimeLeft(selectedEmail.expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [selectedEmail]);

  const handleGenerate = () => {
    setLoading(true);
    const newAddr = generateAddress();
    setAddress(`${newAddr}@${DOMAIN}`);
    setEmails([]);
    setSelectedEmail(null);
    setEmailCount(0);
    setLoading(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = address;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-black font-bold text-lg">
              R
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold">
              <span className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                Rythamo Mail
              </span>
            </h1>
          </div>
          <p className="text-gray-400 text-sm sm:text-base">
            Disposable email. No signup. No trace. Auto-expires in {EXPIRY_MINUTES} min.
          </p>
        </header>

        {/* Address Generator */}
        <div className="bg-gray-900/50 backdrop-blur rounded-2xl p-5 sm:p-6 mb-8 border border-gray-800/50">
          <label htmlFor="email-address" className="sr-only">Email address</label>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <div className="flex-1 relative">
              <input
                id="email-address"
                type="text"
                value={address}
                readOnly
                placeholder="Click generate to get an address"
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-gray-800/80 text-green-400 font-mono text-base sm:text-lg px-4 py-3 rounded-xl border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all"
                aria-label="Generated email address"
              />
              {address && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 bg-gray-700/80 px-2 py-1 rounded-lg">
                  {EXPIRY_MINUTES} min
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                onKeyDown={(e) => handleKeyDown(e, handleGenerate)}
                disabled={loading}
                className="bg-green-500 hover:bg-green-400 active:bg-green-600 text-black font-semibold px-6 py-3 rounded-xl transition-all duration-150 disabled:opacity-50 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                aria-label="Generate new email address"
              >
                {loading ? (
                  <span aria-live="polite">Generating…</span>
                ) : (
                  "Generate"
                )}
              </button>
              {address && (
                <button
                  onClick={handleCopy}
                  onKeyDown={(e) => handleKeyDown(e, handleCopy)}
                  className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white px-4 py-3 rounded-xl transition-all duration-150 border border-gray-700/50 focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  aria-label={copied ? "Copied to clipboard" : "Copy email address"}
                >
                  {copied ? (
                    <span aria-live="polite" className="text-green-400">Copied!</span>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Status bar */}
          {address && (
            <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" aria-hidden="true"></span>
                  <span aria-live="polite">Live</span>
                </span>
                <span>{emailCount} email{emailCount !== 1 ? "s" : ""}</span>
              </div>
              <span>Auto-refreshes every 5s</span>
            </div>
          )}
        </div>

        {/* Inbox */}
        {address && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Email List */}
            <div className="lg:col-span-1" ref={inboxRef}>
              <div className="bg-gray-900/50 backdrop-blur rounded-2xl border border-gray-800/50 overflow-hidden">
                <div className="p-4 border-b border-gray-800/50">
                  <h2 className="font-semibold text-gray-300 flex items-center justify-between">
                    <span>Inbox</span>
                    <span className="text-sm text-gray-500 bg-gray-800/80 px-2 py-0.5 rounded-full" aria-label={`${emailCount} emails`}>
                      {emailCount}
                    </span>
                  </h2>
                </div>
                <div className="max-h-[500px] overflow-y-auto" role="listbox" aria-label="Email inbox">
                  {emails.length === 0 ? (
                    <div className="p-10 text-center text-gray-500">
                      <div className="text-5xl mb-3 opacity-50" aria-hidden="true">📭</div>
                      <p className="text-sm">Waiting for emails…</p>
                      <p className="text-xs mt-1 text-gray-600">Send an email to this address</p>
                    </div>
                  ) : (
                    emails.map((email) => (
                      <button
                        key={email.id}
                        onClick={() => {
                          setSelectedEmail(email);
                          setTimeInfo(getTimeLeft(email.expiresAt));
                        }}
                        onKeyDown={(e) => handleKeyDown(e, () => {
                          setSelectedEmail(email);
                          setTimeInfo(getTimeLeft(email.expiresAt));
                        })}
                        role="option"
                        aria-selected={selectedEmail?.id === email.id}
                        className={`w-full text-left p-4 border-b border-gray-800/30 hover:bg-gray-800/50 active:bg-gray-800 transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-500/50 ${
                          selectedEmail?.id === email.id ? "bg-gray-800/60 border-l-2 border-l-green-500" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-green-400 truncate font-medium">
                            {email.from}
                          </span>
                          <span className="text-[10px] text-gray-600 shrink-0">
                            {new Date(email.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="text-sm text-gray-300 truncate mt-1">
                          {email.subject}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Email Viewer */}
            <div className="lg:col-span-2">
              <div className="bg-gray-900/50 backdrop-blur rounded-2xl border border-gray-800/50 min-h-[400px]">
                {selectedEmail ? (
                  <div>
                    {/* Header */}
                    <div className="p-4 sm:p-5 border-b border-gray-800/50">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <h3 className="text-lg font-semibold leading-tight">
                          {selectedEmail.subject}
                        </h3>
                        <div className="shrink-0 flex items-center gap-2">
                          <div
                            className="h-1.5 w-24 bg-gray-800 rounded-full overflow-hidden"
                            role="progressbar"
                            aria-valuenow={timeInfo.percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label="Time until expiry"
                          >
                            <div
                              className={`h-full rounded-full transition-all duration-1000 ${
                                timeInfo.percent > 50 ? "bg-green-500" :
                                timeInfo.percent > 20 ? "bg-yellow-500" : "bg-red-500"
                              }`}
                              style={{ width: `${timeInfo.percent}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 tabular-nums" aria-live="polite">
                            {timeInfo.display}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-gray-400">
                        <span>
                          From: <span className="text-green-400 font-medium">{selectedEmail.from}</span>
                        </span>
                        <span className="text-gray-700 hidden sm:inline">·</span>
                        <span>To: <span className="text-gray-300">{address}</span></span>
                      </div>
                      <div className="text-xs text-gray-600 mt-2">
                        Received {new Date(selectedEmail.createdAt).toLocaleString([], {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                        })}
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-4 sm:p-5">
                      {selectedEmail.html ? (
                        <div
                          className="prose prose-invert prose-sm max-w-none text-gray-300 break-words"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(selectedEmail.html),
                          }}
                        />
                      ) : (
                        <pre className="whitespace-pre-wrap text-gray-300 font-sans break-words text-sm leading-relaxed">
                          {selectedEmail.body}
                        </pre>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-gray-500">
                    <div className="text-center">
                      <div className="text-6xl mb-4 opacity-30" aria-hidden="true">📧</div>
                      <p className="text-sm">Select an email to read</p>
                      <p className="text-xs mt-1 text-gray-600">Or send one to this address</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center mt-12 text-gray-600 text-xs space-y-1">
          <p>Emails auto-delete after {EXPIRY_MINUTES} minutes. Do not use for important accounts.</p>
          <p className="text-gray-700">Powered by Cloudflare Workers + Turso</p>
        </footer>
      </div>
    </div>
  );
}
