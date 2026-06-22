"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import DOMPurify from "dompurify";

const DOMAIN = "rythamo.qzz.io";
const REFRESH_INTERVAL = 5000;

const EXPIRY_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 240, label: "4 hours" },
  { value: 1440, label: "24 hours" },
  { value: 10080, label: "7 days" },
  { value: 0, label: "Never" },
] as const;

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "b", "i", "u", "em", "strong", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre", "img", "table", "tr", "td", "th", "thead", "tbody", "div", "span"],
    ALLOWED_ATTR: ["href", "src", "alt", "class", "style", "target", "rel"],
  });
}

function getTimeLeft(expiresAt: string): { display: string; percent: number; isPermanent: boolean } {
  if (expiresAt === "2099-12-31T23:59:59.000Z") return { display: "∞", percent: 100, isPermanent: true };
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diff = Math.max(0, expiry - now);
  const total = 10 * 60 * 1000;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const percent = (diff / total) * 100;
  return { display: `${minutes}:${seconds.toString().padStart(2, "0")}`, percent, isPermanent: false };
}

function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute("data-theme") === "light";
  if (isLight) { html.removeAttribute("data-theme"); localStorage.setItem("theme", "dark"); }
  else { html.setAttribute("data-theme", "light"); localStorage.setItem("theme", "light"); }
}

interface Address {
  id: string; localPart: string; domain: string; fullAddress: string;
  createdAt: string; isActive: boolean; expiryMinutes: number;
  autoDelete: boolean; maxEmails: number; forwardTo: string;
  emailCount: number; lastEmailAt: string | null;
}

interface Email {
  id: string; from: string; subject: string; body: string; html: string;
  createdAt: string; expiresAt: string; isRead: boolean;
}

export default function Dashboard() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [newLocalPart, setNewLocalPart] = useState("");
  const [newExpiry, setNewExpiry] = useState(10);
  const [newAutoDelete, setNewAutoDelete] = useState(true);
  const [newMaxEmails, setNewMaxEmails] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLight, setIsLight] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [newEmailCount, setNewEmailCount] = useState(0);
  const prevEmailIds = useRef<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setIsLight(document.documentElement.getAttribute("data-theme") === "light");
    if (typeof Notification !== "undefined" && Notification.permission === "granted") setNotifEnabled(true);
  }, []);

  const canNotify = typeof Notification !== "undefined";

  const requestNotification = () => {
    if (!canNotify) return;
    if (Notification.permission === "granted") { setNotifEnabled(true); return; }
    Notification.requestPermission().then(p => { if (p === "granted") setNotifEnabled(true); });
  };

  const fetchAddresses = useCallback(async () => {
    try { const r = await fetch("/api/addresses"); setAddresses((await r.json()).addresses || []); } catch {}
  }, []);

  const fetchEmails = useCallback(async (addressId: string, query?: string) => {
    try {
      let url = `/api/addresses/${addressId}/emails`;
      if (query) url += `?q=${encodeURIComponent(query)}`;
      const r = await fetch(url);
      const data = await r.json();
      const newList: Email[] = data.emails || [];

      if (!query && prevEmailIds.current.size > 0) {
        const newIds = new Set(newList.map(e => e.id));
        const fresh = newList.filter(e => !prevEmailIds.current.has(e.id));
        if (fresh.length > 0 && notifEnabled && canNotify && Notification.permission === "granted") {
          for (const email of fresh.slice(0, 3)) {
            new Notification(`New email from ${email.from}`, { body: email.subject, tag: email.id });
          }
          setNewEmailCount(c => c + fresh.length);
        }
      }
      if (!query) prevEmailIds.current = new Set(newList.map(e => e.id));

      setEmails(newList);
    } catch {}
  }, [notifEnabled]);

  useEffect(() => { fetchAddresses(); }, [fetchAddresses]);

  useEffect(() => {
    if (!selectedAddress) return;
    fetchEmails(selectedAddress.id);
    const interval = setInterval(() => fetchEmails(selectedAddress.id), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [selectedAddress, fetchEmails]);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (selectedAddress) fetchEmails(selectedAddress.id, q || undefined);
    }, 300);
  };

  const handleCreate = async () => {
    if (!newLocalPart.trim()) return;
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localPart: newLocalPart.trim(), expiryMinutes: newExpiry, autoDelete: newAutoDelete, maxEmails: newMaxEmails }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Failed"); return; }
      setNewLocalPart(""); setShowCreate(false);
      await fetchAddresses();
    } catch { setError("Failed"); }
    finally { setLoading(false); }
  };

  const handleDelete = async (addressId: string) => {
    try {
      await fetch(`/api/addresses/${addressId}`, { method: "DELETE" });
      if (selectedAddress?.id === addressId) { setSelectedAddress(null); setEmails([]); setSelectedEmail(null); }
      setDeleteConfirm(null);
      await fetchAddresses();
    } catch {}
  };

  const handleSaveSettings = async () => {
    if (!selectedAddress) return;
    setSavingSettings(true);
    try {
      await fetch(`/api/addresses/${selectedAddress.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiryMinutes: selectedAddress.expiryMinutes,
          autoDelete: selectedAddress.autoDelete,
          maxEmails: selectedAddress.maxEmails,
          forwardTo: selectedAddress.forwardTo,
        }),
      });
      setShowSettings(false);
      await fetchAddresses();
    } catch {}
    finally { setSavingSettings(false); }
  };

  const handleCopy = (text: string) => {
    if (typeof navigator !== "undefined") navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(""), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); action(); }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">

        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-500 hover:text-gray-300 transition-colors" aria-label="Back">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
            </a>
            <div>
              <h1 className="text-2xl font-bold"><span className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Dashboard</span></h1>
              <p className="text-xs text-gray-500">Manage your email addresses</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!notifEnabled && canNotify && Notification.permission !== "denied" && (
              <button onClick={requestNotification} className="text-xs text-gray-500 hover:text-gray-300 bg-gray-800/50 px-2 py-1.5 rounded-lg transition-colors">
                🔔 Enable
              </button>
            )}
            <button onClick={() => { toggleTheme(); setIsLight(!isLight); }}
              className="text-gray-500 hover:text-green-400 transition-colors p-1.5 rounded-lg hover:bg-gray-800/50" aria-label="Toggle theme">
              {isLight ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              )}
            </button>
            <button onClick={() => setShowCreate(!showCreate)} className="bg-green-500 hover:bg-green-400 active:bg-green-600 text-black font-semibold px-4 py-2 rounded-xl transition-all text-sm">+ New Address</button>
          </div>
        </header>

        {showCreate && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md" role="dialog" aria-modal="true" aria-label="Create new address">
              <h2 className="text-lg font-semibold mb-4">Create New Address</h2>
              <label className="text-sm text-gray-400 mb-1.5 block">Address</label>
              <div className="flex items-center gap-0 mb-4">
                <input type="text" value={newLocalPart}
                  onChange={(e) => { setNewLocalPart(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "")); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="yourname" spellCheck={false} autoComplete="off" autoFocus
                  className="flex-1 bg-gray-800 text-green-400 font-mono px-4 py-3 rounded-l-xl border border-r-0 border-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/50"/>
                <span className="bg-gray-800 text-gray-400 font-mono px-3 py-3 rounded-r-xl border border-gray-700 text-sm whitespace-nowrap">@{DOMAIN}</span>
              </div>
              <label className="text-sm text-gray-400 mb-1.5 block">Expiry time</label>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => setNewExpiry(opt.value)}
                    className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                      newExpiry === opt.value ? "bg-green-500/20 text-green-400 border border-green-500/50" : "bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600"
                    }`}>{opt.label}</button>
                ))}
              </div>
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <div onClick={() => setNewAutoDelete(!newAutoDelete)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${newAutoDelete ? "bg-green-500" : "bg-gray-700"}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${newAutoDelete ? "left-5" : "left-0.5"}`}/>
                </div>
                <span className="text-sm text-gray-300">Auto-delete emails after expiry</span>
              </label>
              <div className="mb-4">
                <label className="text-sm text-gray-400 mb-1.5 block">Max emails (0 = unlimited)</label>
                <input type="number" value={newMaxEmails} onChange={(e) => setNewMaxEmails(Number(e.target.value))} min={0} max={10000}
                  className="w-full bg-gray-800 text-white px-4 py-2 rounded-xl border border-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/50 text-sm"/>
              </div>
              {error && <p className="text-red-400 text-sm mb-3" role="alert">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowCreate(false); setError(""); }} className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm">Cancel</button>
                <button onClick={handleCreate} disabled={loading || !newLocalPart.trim()} className="bg-green-500 hover:bg-green-400 text-black font-semibold px-4 py-2 rounded-xl transition-all text-sm disabled:opacity-50">{loading ? "Creating..." : "Create"}</button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Sidebar */}
          <div className="lg:col-span-3">
            <div className="bg-gray-900/50 backdrop-blur rounded-2xl border border-gray-800/50 overflow-hidden">
              <div className="p-4 border-b border-gray-800/50">
                <h2 className="font-semibold text-gray-300 flex items-center justify-between">
                  <span>Addresses</span>
                  <span className="text-xs text-gray-500 bg-gray-800/80 px-2 py-0.5 rounded-full">{addresses.length}</span>
                </h2>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {addresses.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <div className="text-4xl mb-3 opacity-50" aria-hidden="true">📬</div>
                    <p className="text-sm">No addresses yet</p>
                  </div>
                ) : (
                  addresses.map((addr) => (
                    <div key={addr.id}>
                      <button onClick={() => { prevEmailIds.current = new Set(); setSelectedAddress(addr); setSelectedEmail(null); setShowSettings(false); setNewEmailCount(0); }}
                        onKeyDown={(e) => handleKeyDown(e, () => { prevEmailIds.current = new Set(); setSelectedAddress(addr); setSelectedEmail(null); })}
                        role="option" aria-selected={selectedAddress?.id === addr.id}
                        className={`w-full text-left p-3 border-b border-gray-800/30 hover:bg-gray-800/50 transition-colors ${
                          selectedAddress?.id === addr.id ? "bg-gray-800/60 border-l-2 border-l-green-500" : ""
                        }`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${addr.isActive ? "bg-green-500" : "bg-gray-600"}`}/>
                          <span className="font-mono text-sm text-green-400 truncate">{addr.localPart}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 ml-4 text-[10px] text-gray-600">
                          <span>{addr.emailCount} email{addr.emailCount !== 1 ? "s" : ""}</span>
                          <span>·</span>
                          <span>{addr.expiryMinutes === 0 ? "∞" : `${addr.expiryMinutes}m`}</span>
                          {!addr.autoDelete && addr.expiryMinutes > 0 && <span>· kept</span>}
                        </div>
                      </button>
                      {deleteConfirm === addr.id && (
                        <div className="p-3 bg-red-900/20 border-b border-gray-800/30">
                          <p className="text-xs text-red-400 mb-2">Delete this address & all emails?</p>
                          <div className="flex gap-2">
                            <button onClick={() => handleDelete(addr.id)} className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg">Delete</button>
                            <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-400 hover:text-white px-3 py-1">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Email List */}
          <div className="lg:col-span-4">
            <div className="bg-gray-900/50 backdrop-blur rounded-2xl border border-gray-800/50 overflow-hidden">
              <div className="p-4 border-b border-gray-800/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-300">
                    {selectedAddress ? <span className="font-mono text-sm text-green-400">{selectedAddress.fullAddress}</span> : "Inbox"}
                  </h2>
                  <div className="flex items-center gap-1">
                    {newEmailCount > 0 && (
                      <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-medium">+{newEmailCount} new</span>
                    )}
                    {selectedAddress && (
                      <>
                        <button onClick={() => handleCopy(selectedAddress.fullAddress)} className="text-gray-500 hover:text-gray-300 transition-colors p-1.5 rounded-lg hover:bg-gray-800" aria-label="Copy">
                          {copied === selectedAddress.fullAddress
                            ? <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400"><polyline points="20 6 9 17 4 12"/></svg>
                            : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                        </button>
                        <button onClick={() => { setShowSettings(!showSettings); setDeleteConfirm(null); }} className={`text-gray-500 hover:text-gray-300 transition-colors p-1.5 rounded-lg hover:bg-gray-800 ${showSettings ? "bg-gray-800 text-green-400" : ""}`} aria-label="Settings">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                        </button>
                        <button onClick={() => setDeleteConfirm(selectedAddress.id)} className="text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-gray-800" aria-label="Delete">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {selectedAddress && (
                  <div className="relative">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input type="text" value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
                      placeholder="Search by sender or subject..." spellCheck={false}
                      className="w-full bg-gray-800 text-white text-xs pl-9 pr-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500/50"/>
                  </div>
                )}
              </div>

              {showSettings && selectedAddress && (
                <div className="p-4 border-b border-gray-800/50 bg-gray-900/80">
                  <h3 className="text-sm font-medium text-gray-300 mb-3">Address Settings</h3>
                  <label className="text-xs text-gray-500 mb-1.5 block">Expiry time</label>
                  <div className="grid grid-cols-4 gap-1.5 mb-3">
                    {EXPIRY_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => setSelectedAddress({ ...selectedAddress, expiryMinutes: opt.value })}
                        className={`px-1.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                          selectedAddress.expiryMinutes === opt.value ? "bg-green-500/20 text-green-400 border border-green-500/50" : "bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600"
                        }`}>{opt.label}</button>
                    ))}
                  </div>
                  <label className="flex items-center gap-3 mb-3 cursor-pointer">
                    <div onClick={() => setSelectedAddress({ ...selectedAddress, autoDelete: !selectedAddress.autoDelete })}
                      className={`w-9 h-4.5 rounded-full transition-colors relative ${selectedAddress.autoDelete ? "bg-green-500" : "bg-gray-700"}`}>
                      <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${selectedAddress.autoDelete ? "left-4.5" : "left-0.5"}`}/>
                    </div>
                    <span className="text-xs text-gray-300">Auto-delete</span>
                  </label>
                  <div className="mb-3">
                    <label className="text-xs text-gray-500 mb-1 block">Max emails</label>
                    <input type="number" value={selectedAddress.maxEmails} onChange={(e) => setSelectedAddress({ ...selectedAddress, maxEmails: Number(e.target.value) })} min={0} max={10000}
                      className="w-full bg-gray-800 text-white px-3 py-1.5 rounded-lg border border-gray-700 text-xs focus:outline-none focus:ring-1 focus:ring-green-500/50"/>
                  </div>
                  <div className="mb-3">
                    <label className="text-xs text-gray-500 mb-1 block">Forward to webhook (optional)</label>
                    <input type="url" value={selectedAddress.forwardTo} onChange={(e) => setSelectedAddress({ ...selectedAddress, forwardTo: e.target.value })}
                      placeholder="https://..." spellCheck={false}
                      className="w-full bg-gray-800 text-white px-3 py-1.5 rounded-lg border border-gray-700 text-xs focus:outline-none focus:ring-1 focus:ring-green-500/50"/>
                    <p className="text-[10px] text-gray-600 mt-1">New emails are POSTed as JSON to this URL</p>
                  </div>
                  <button onClick={handleSaveSettings} disabled={savingSettings}
                    className="w-full bg-green-500 hover:bg-green-400 text-black font-semibold py-1.5 rounded-lg transition-all text-xs disabled:opacity-50">
                    {savingSettings ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              )}

              <div className="max-h-[500px] overflow-y-auto" role="listbox" aria-label="Email list">
                {!selectedAddress ? (
                  <div className="p-10 text-center text-gray-500">
                    <div className="text-5xl mb-3 opacity-30" aria-hidden="true">📧</div>
                    <p className="text-sm">Select an address</p>
                  </div>
                ) : emails.length === 0 ? (
                  <div className="p-10 text-center text-gray-500">
                    <div className="text-5xl mb-3 opacity-30" aria-hidden="true">📭</div>
                    <p className="text-sm">{searchQuery ? "No matching emails" : "No emails yet"}</p>
                  </div>
                ) : (
                  emails.map((email) => {
                    const { display, percent, isPermanent } = getTimeLeft(email.expiresAt);
                    return (
                      <button key={email.id} onClick={() => setSelectedEmail(email)}
                        onKeyDown={(e) => handleKeyDown(e, () => setSelectedEmail(email))}
                        role="option" aria-selected={selectedEmail?.id === email.id}
                        className={`w-full text-left p-4 border-b border-gray-800/30 hover:bg-gray-800/50 transition-colors ${
                          selectedEmail?.id === email.id ? "bg-gray-800/60 border-l-2 border-l-green-500" : ""
                        }`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-green-400 truncate font-medium">{email.from}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {isPermanent ? <span className="text-[10px] text-blue-400">∞</span> : (
                              <span className={`text-[10px] tabular-nums ${percent < 20 ? "text-red-400" : percent < 50 ? "text-yellow-400" : "text-gray-500"}`}>{display}</span>
                            )}
                            <span className="text-[10px] text-gray-600">{new Date(email.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </div>
                        <div className="text-sm text-gray-300 truncate mt-1">{email.subject}</div>
                        <div className="text-xs text-gray-600 truncate mt-1">{email.body?.slice(0, 60) || "(HTML)"}</div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Email Viewer */}
          <div className="lg:col-span-5">
            <div className="bg-gray-900/50 backdrop-blur rounded-2xl border border-gray-800/50 min-h-[500px]">
              {selectedEmail ? (
                <div>
                  <div className="p-4 sm:p-5 border-b border-gray-800/50">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h3 className="text-lg font-semibold leading-tight">{selectedEmail.subject}</h3>
                      <div className="flex items-center gap-2 shrink-0">
                        {(() => {
                          const { display, isPermanent } = getTimeLeft(selectedEmail.expiresAt);
                          return isPermanent ? (
                            <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded font-medium">Permanent</span>
                          ) : (
                            <span className="text-xs text-gray-500 tabular-nums bg-gray-800/80 px-2 py-0.5 rounded" aria-live="polite">{display}</span>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-gray-400">
                      <span>From: <span className="text-green-400 font-medium">{selectedEmail.from}</span></span>
                      <span className="text-gray-700 hidden sm:inline">·</span>
                      <span>To: <span className="text-gray-300">{selectedAddress?.fullAddress}</span></span>
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      Received {new Date(selectedEmail.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="p-4 sm:p-5">
                    {selectedEmail.html ? (
                      <div className="prose prose-invert prose-sm max-w-none text-gray-300 break-words" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedEmail.html) }} />
                    ) : (
                      <pre className="whitespace-pre-wrap text-gray-300 font-sans break-words text-sm leading-relaxed">{selectedEmail.body}</pre>
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
