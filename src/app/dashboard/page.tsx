"use client";

import { useState, useEffect, useCallback } from "react";
import DOMPurify from "dompurify";

const DOMAIN = "rythamo.qzz.io";
const REFRESH_INTERVAL = 5000;

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "b", "i", "u", "em", "strong", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre", "img", "table", "tr", "td", "th", "thead", "tbody", "div", "span"],
    ALLOWED_ATTR: ["href", "src", "alt", "class", "style", "target", "rel"],
  });
}

function getTimeLeft(expiresAt: string): string {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diff = Math.max(0, expiry - now);
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

interface Address {
  id: string;
  localPart: string;
  domain: string;
  fullAddress: string;
  createdAt: string;
  isActive: boolean;
  emailCount: number;
  lastEmailAt: string | null;
}

interface Email {
  id: string;
  from: string;
  subject: string;
  body: string;
  html: string;
  createdAt: string;
  expiresAt: string;
  isRead: boolean;
}

export default function Dashboard() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [timeLeft, setTimeLeft] = useState("--:--");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await fetch("/api/addresses");
      const data = await res.json();
      setAddresses(data.addresses || []);
    } catch {
      // Silent fail
    }
  }, []);

  const fetchEmails = useCallback(async (addressId: string) => {
    try {
      const res = await fetch(`/api/addresses/${addressId}/emails`);
      const data = await res.json();
      setEmails(data.emails || []);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  useEffect(() => {
    if (!selectedAddress) return;
    fetchEmails(selectedAddress.id);
    const interval = setInterval(() => fetchEmails(selectedAddress.id), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [selectedAddress, fetchEmails]);

  useEffect(() => {
    if (!selectedEmail?.expiresAt) return;
    const timer = setInterval(() => {
      setTimeLeft(getTimeLeft(selectedEmail.expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [selectedEmail]);

  const handleCreate = async () => {
    if (!newAddress.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localPart: newAddress.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create address");
        return;
      }

      setNewAddress("");
      setShowCreate(false);
      await fetchAddresses();
    } catch {
      setError("Failed to create address");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (addressId: string) => {
    try {
      await fetch(`/api/addresses/${addressId}`, { method: "DELETE" });
      if (selectedAddress?.id === addressId) {
        setSelectedAddress(null);
        setEmails([]);
        setSelectedEmail(null);
      }
      setDeleteConfirm(null);
      await fetchAddresses();
    } catch {
      // Silent fail
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(""), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-500 hover:text-gray-300 transition-colors" aria-label="Back to main page">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
            </a>
            <div>
              <h1 className="text-2xl font-bold">
                <span className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                  Dashboard
                </span>
              </h1>
              <p className="text-xs text-gray-500">Manage your email addresses</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-green-500 hover:bg-green-400 active:bg-green-600 text-black font-semibold px-4 py-2 rounded-xl transition-all text-sm focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            + New Address
          </button>
        </header>

        {/* Create Address Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md" role="dialog" aria-modal="true" aria-label="Create new address">
              <h2 className="text-lg font-semibold mb-4">Create New Address</h2>
              <div className="flex items-center gap-0 mb-4">
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => {
                    setNewAddress(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""));
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="yourname"
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 bg-gray-800 text-green-400 font-mono px-4 py-3 rounded-l-xl border border-r-0 border-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                  aria-label="Address name"
                  autoFocus
                />
                <span className="bg-gray-800 text-gray-400 font-mono px-3 py-3 rounded-r-xl border border-gray-700 text-sm whitespace-nowrap">
                  @{DOMAIN}
                </span>
              </div>
              {error && (
                <p className="text-red-400 text-sm mb-3" role="alert">{error}</p>
              )}
              <p className="text-xs text-gray-600 mb-4">3-64 chars. Lowercase, numbers, dots, hyphens, underscores.</p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowCreate(false); setError(""); setNewAddress(""); }}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={loading || !newAddress.trim()}
                  className="bg-green-500 hover:bg-green-400 text-black font-semibold px-4 py-2 rounded-xl transition-all text-sm disabled:opacity-50"
                >
                  {loading ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar - Addresses */}
          <div className="lg:col-span-3">
            <div className="bg-gray-900/50 backdrop-blur rounded-2xl border border-gray-800/50 overflow-hidden">
              <div className="p-4 border-b border-gray-800/50">
                <h2 className="font-semibold text-gray-300 flex items-center justify-between">
                  <span>Addresses</span>
                  <span className="text-xs text-gray-500 bg-gray-800/80 px-2 py-0.5 rounded-full">{addresses.length}</span>
                </h2>
              </div>
              <div className="max-h-[600px] overflow-y-auto" role="listbox" aria-label="Email addresses">
                {addresses.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <div className="text-4xl mb-3 opacity-50" aria-hidden="true">📬</div>
                    <p className="text-sm">No addresses yet</p>
                    <p className="text-xs mt-1 text-gray-600">Create one to get started</p>
                  </div>
                ) : (
                  addresses.map((addr) => (
                    <div key={addr.id}>
                      <button
                        onClick={() => {
                          setSelectedAddress(addr);
                          setSelectedEmail(null);
                        }}
                        onKeyDown={(e) => handleKeyDown(e, () => {
                          setSelectedAddress(addr);
                          setSelectedEmail(null);
                        })}
                        role="option"
                        aria-selected={selectedAddress?.id === addr.id}
                        className={`w-full text-left p-3 border-b border-gray-800/30 hover:bg-gray-800/50 transition-colors ${
                          selectedAddress?.id === addr.id ? "bg-gray-800/60 border-l-2 border-l-green-500" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${addr.isActive ? "bg-green-500" : "bg-gray-600"}`} aria-hidden="true" />
                          <span className="font-mono text-sm text-green-400 truncate">{addr.localPart}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 ml-4">
                          <span className="text-[10px] text-gray-600">
                            {addr.emailCount} email{addr.emailCount !== 1 ? "s" : ""}
                          </span>
                          {addr.lastEmailAt && (
                            <span className="text-[10px] text-gray-600">
                              {new Date(addr.lastEmailAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Delete confirmation */}
                      {deleteConfirm === addr.id && (
                        <div className="p-3 bg-red-900/20 border-b border-gray-800/30">
                          <p className="text-xs text-red-400 mb-2">Delete this address & all emails?</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDelete(addr.id)}
                              className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-xs text-gray-400 hover:text-white px-3 py-1 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Middle - Email List */}
          <div className="lg:col-span-4">
            <div className="bg-gray-900/50 backdrop-blur rounded-2xl border border-gray-800/50 overflow-hidden">
              <div className="p-4 border-b border-gray-800/50">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-300">
                    {selectedAddress ? (
                      <span className="font-mono text-sm text-green-400">{selectedAddress.fullAddress}</span>
                    ) : (
                      "Inbox"
                    )}
                  </h2>
                  {selectedAddress && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(selectedAddress.fullAddress)}
                        className="text-gray-500 hover:text-gray-300 transition-colors p-1"
                        aria-label="Copy address"
                      >
                        {copied === selectedAddress.fullAddress ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        )}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(selectedAddress.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors p-1"
                        aria-label="Delete address"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="max-h-[600px] overflow-y-auto" role="listbox" aria-label="Email list">
                {!selectedAddress ? (
                  <div className="p-10 text-center text-gray-500">
                    <div className="text-5xl mb-3 opacity-30" aria-hidden="true">📧</div>
                    <p className="text-sm">Select an address</p>
                    <p className="text-xs mt-1 text-gray-600">Or create a new one</p>
                  </div>
                ) : emails.length === 0 ? (
                  <div className="p-10 text-center text-gray-500">
                    <div className="text-5xl mb-3 opacity-30" aria-hidden="true">📭</div>
                    <p className="text-sm">No emails yet</p>
                    <p className="text-xs mt-1 text-gray-600">Send an email to this address</p>
                  </div>
                ) : (
                  emails.map((email) => (
                    <button
                      key={email.id}
                      onClick={() => {
                        setSelectedEmail(email);
                        setTimeLeft(getTimeLeft(email.expiresAt));
                      }}
                      onKeyDown={(e) => handleKeyDown(e, () => {
                        setSelectedEmail(email);
                        setTimeLeft(getTimeLeft(email.expiresAt));
                      })}
                      role="option"
                      aria-selected={selectedEmail?.id === email.id}
                      className={`w-full text-left p-4 border-b border-gray-800/30 hover:bg-gray-800/50 transition-colors ${
                        selectedEmail?.id === email.id ? "bg-gray-800/60 border-l-2 border-l-green-500" : ""
                      } ${!email.isRead ? "border-l-2 border-l-blue-500" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-green-400 truncate font-medium">{email.from}</span>
                        <span className="text-[10px] text-gray-600 shrink-0">
                          {new Date(email.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="text-sm text-gray-300 truncate mt-1">{email.subject}</div>
                      <div className="text-xs text-gray-600 truncate mt-1">{email.body?.slice(0, 60) || "(HTML email)"}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right - Email Viewer */}
          <div className="lg:col-span-5">
            <div className="bg-gray-900/50 backdrop-blur rounded-2xl border border-gray-800/50 min-h-[500px]">
              {selectedEmail ? (
                <div>
                  <div className="p-4 sm:p-5 border-b border-gray-800/50">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h3 className="text-lg font-semibold leading-tight">{selectedEmail.subject}</h3>
                      <span className="text-xs text-gray-500 tabular-nums shrink-0" aria-live="polite">
                        Expires in {timeLeft}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-gray-400">
                      <span>From: <span className="text-green-400 font-medium">{selectedEmail.from}</span></span>
                      <span className="text-gray-700 hidden sm:inline">·</span>
                      <span>To: <span className="text-gray-300">{selectedAddress?.fullAddress}</span></span>
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      Received {new Date(selectedEmail.createdAt).toLocaleString([], {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                    </div>
                  </div>
                  <div className="p-4 sm:p-5">
                    {selectedEmail.html ? (
                      <div
                        className="prose prose-invert prose-sm max-w-none text-gray-300 break-words"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedEmail.html) }}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap text-gray-300 font-sans break-words text-sm leading-relaxed">
                        {selectedEmail.body}
                      </pre>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[500px] text-gray-500">
                  <div className="text-center">
                    <div className="text-6xl mb-4 opacity-30" aria-hidden="true">📨</div>
                    <p className="text-sm">Select an email to read</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
