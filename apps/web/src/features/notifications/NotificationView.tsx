import { Bell, CheckCheck, Loader2, Mail, MessageSquareText, RefreshCw, Settings2, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KlerionSession } from "../../lib/session";
import {
  notificationApi,
  type ApiNotification,
  type ApiNotificationChannel,
  type ApiNotificationDelivery,
  type ApiNotificationPreferences,
  type ApiNotificationTemplate,
} from "./notificationApi";

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
}

export function NotificationView({ session }: { readonly session: KlerionSession }) {
  const canManage = session.roles.some((role) => role === "owner" || role === "staff");
  const [tab, setTab] = useState<"inbox" | "preferences" | "templates" | "deliveries">("inbox");
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [preferences, setPreferences] = useState<ApiNotificationPreferences | null>(null);
  const [templates, setTemplates] = useState<ApiNotificationTemplate[]>([]);
  const [deliveries, setDeliveries] = useState<ApiNotificationDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [templateChannel, setTemplateChannel] = useState<ApiNotificationChannel>("IN_APP");
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateBody, setTemplateBody] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      if (session.mode === "demo") {
        setItems([]); setUnread(0); setTemplates([]); setDeliveries([]); setPreferences(null);
      } else {
        const [inbox, count, prefs] = await Promise.all([
          notificationApi.list(session),
          notificationApi.unreadCount(session),
          notificationApi.preferences(session),
        ]);
        setItems(inbox); setUnread(count.unread); setPreferences(prefs);
        if (canManage) {
          const [templateList, deliveryList] = await Promise.all([
            notificationApi.listTemplates(session),
            notificationApi.listDeliveries(session),
          ]);
          setTemplates(templateList); setDeliveries(deliveryList);
        }
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load notifications"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [session.token, canManage]);

  useEffect(() => {
    if (session.mode !== "live" || !session.token) return;
    const controller = new AbortController();
    const cursor = items.reduce((value, item) => Math.max(value, item.sequence), 0);
    void notificationApi.stream(session, cursor, (notification) => {
      setItems((current) => current.some((item) => item.id === notification.id) ? current : [...current, notification].sort((a, b) => a.sequence - b.sequence));
      if (!notification.readAt) setUnread((value) => value + 1);
    }, controller.signal).catch((caught) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Realtime notification stream disconnected");
    });
    return () => controller.abort();
  }, [session.token]);

  const newest = useMemo(() => [...items].sort((a, b) => b.sequence - a.sequence), [items]);

  async function markRead(item: ApiNotification) {
    if (item.readAt) return;
    setWorking(item.id);
    try {
      const updated = await notificationApi.markRead(session, item.id);
      setItems((current) => current.map((value) => value.id === updated.id ? updated : value));
      setUnread((value) => Math.max(0, value - 1));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not mark notification read"); }
    finally { setWorking(""); }
  }

  async function markAllRead() {
    setWorking("read-all");
    try {
      await notificationApi.markAllRead(session);
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt: now }));
      setUnread(0);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not mark notifications read"); }
    finally { setWorking(""); }
  }

  async function savePreferences() {
    if (!preferences) return;
    setWorking("preferences");
    try { setPreferences(await notificationApi.updatePreferences(session, preferences)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save notification preferences"); }
    finally { setWorking(""); }
  }

  async function createTemplate() {
    setWorking("template"); setError("");
    try {
      const created = await notificationApi.createTemplate(session, { key: templateKey, channel: templateChannel, titleTemplate: templateTitle, bodyTemplate: templateBody });
      setTemplates((current) => [...current, created]);
      setTemplateKey(""); setTemplateTitle(""); setTemplateBody("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create template"); }
    finally { setWorking(""); }
  }

  async function processDeliveries() {
    setWorking("deliveries");
    try {
      await notificationApi.processDeliveries(session);
      setDeliveries(await notificationApi.listDeliveries(session));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not process pending deliveries"); }
    finally { setWorking(""); }
  }

  const externalEnabled = preferences ? [preferences.emailEnabled, preferences.smsEnabled, preferences.pushEnabled].filter(Boolean).length : 0;
  const pendingDeliveries = deliveries.filter((item) => item.status === "PENDING" || item.status === "FAILED").length;

  return <div className="view">
    <div className="view-heading">
      <div><span className="eyebrow live"><i />Realtime communications</span><h1>Notifications</h1><p>Manage the live in-app inbox, channel preferences, reusable templates, delivery retries, and provider status.</p></div>
      <div className="view-heading-actions"><button className="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>{tab === "inbox" && <button className="primary" disabled={!unread || working === "read-all"} onClick={() => void markAllRead()}><CheckCheck size={16} /> Mark all read</button>}</div>
    </div>

    <div className="lifecycle-metrics">
      <article><span><Bell size={18} /></span><div><small>Unread</small><strong>{unread}</strong><em>live inbox</em></div></article>
      <article><span><MessageSquareText size={18} /></span><div><small>Messages</small><strong>{items.length}</strong><em>loaded history</em></div></article>
      <article><span><Smartphone size={18} /></span><div><small>External channels</small><strong>{externalEnabled}</strong><em>enabled by you</em></div></article>
      <article><span><Mail size={18} /></span><div><small>Delivery queue</small><strong>{pendingDeliveries}</strong><em>pending / retry</em></div></article>
    </div>

    {error && <div className="form-error">{error}</div>}
    <div className="toolbar lifecycle-toolbar"><div className="segmented-control"><button className={tab === "inbox" ? "active" : ""} onClick={() => setTab("inbox")}>Inbox</button><button className={tab === "preferences" ? "active" : ""} onClick={() => setTab("preferences")}>Preferences</button>{canManage && <button className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>Templates</button>}{canManage && <button className={tab === "deliveries" ? "active" : ""} onClick={() => setTab("deliveries")}>Delivery log</button>}</div></div>

    {loading ? <section className="panel"><div className="empty-state"><Loader2 className="spin" /> Loading notifications…</div></section> : tab === "inbox" ?
      <section className="panel"><header><h2>Inbox</h2><p>Updates are streamed using reconnect-safe server-sent events.</p></header>{newest.map((item) => <button key={item.id} className={`notification-row ${item.readAt ? "" : "unread"}`} onClick={() => void markRead(item)} disabled={working === item.id}><span className={`status-pill ${item.severity === "SUCCESS" ? "approved" : item.severity === "ERROR" ? "rejected" : "pending"}`}>{item.severity}</span><div className="stack"><strong>{item.title}</strong><small>{item.message}</small></div><time>{date(item.createdAt)}</time></button>)}{newest.length === 0 && <div className="empty-state"><Bell size={22} /> No notifications yet.</div>}</section>
    : tab === "preferences" ? <section className="panel"><header><h2>Channel preferences</h2><p>External channels are only queued when a destination is configured.</p></header>{preferences ? <div className="approval-request-fields"><label><span><input type="checkbox" checked={preferences.emailEnabled} onChange={(event) => setPreferences({ ...preferences, emailEnabled: event.target.checked })} /> Email</span><input placeholder="you@example.com" value={preferences.emailAddress ?? ""} onChange={(event) => setPreferences({ ...preferences, emailAddress: event.target.value })} /></label><label><span><input type="checkbox" checked={preferences.smsEnabled} onChange={(event) => setPreferences({ ...preferences, smsEnabled: event.target.checked })} /> SMS</span><input placeholder="+234..." value={preferences.smsNumber ?? ""} onChange={(event) => setPreferences({ ...preferences, smsNumber: event.target.value })} /></label><label><span><input type="checkbox" checked={preferences.pushEnabled} onChange={(event) => setPreferences({ ...preferences, pushEnabled: event.target.checked })} /> Push</span><input placeholder="Push endpoint" value={preferences.pushEndpoint ?? ""} onChange={(event) => setPreferences({ ...preferences, pushEndpoint: event.target.value })} /></label><div><button className="primary" disabled={working === "preferences"} onClick={() => void savePreferences()}><Settings2 size={16} /> Save preferences</button></div></div> : <div className="empty-state">Live preferences require an API session.</div>}</section>
    : tab === "templates" ? <><section className="panel"><header><h2>Create template</h2><p>Use variables such as <code>{"{{ticket}}"}</code> and <code>{"{{station}}"}</code>.</p></header><div className="approval-request-fields"><label>Key<input value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} placeholder="queue.called" /></label><label>Channel<select value={templateChannel} onChange={(event) => setTemplateChannel(event.target.value as ApiNotificationChannel)}><option>IN_APP</option><option>EMAIL</option><option>SMS</option><option>PUSH</option></select></label><label>Title<input value={templateTitle} onChange={(event) => setTemplateTitle(event.target.value)} /></label><label>Body<textarea value={templateBody} onChange={(event) => setTemplateBody(event.target.value)} /></label><div><button className="primary" disabled={working === "template" || !templateKey || !templateTitle || !templateBody} onClick={() => void createTemplate()}>Create template</button></div></div></section><section className="forms-card-grid">{templates.map((template) => <article className="panel forms-card" key={template.id}><header><div className="stack"><strong>{template.key}</strong><small>{template.channel}</small></div><span className={`status-pill ${template.status === "ACTIVE" ? "approved" : "rejected"}`}>{template.status}</span></header><p>{template.titleTemplate}</p><small>{template.bodyTemplate}</small></article>)}</section></>
    : <section className="panel table-panel"><header><div><h2>Delivery log</h2><p>Provider delivery attempts and retry state.</p></div><button className="secondary" disabled={working === "deliveries"} onClick={() => void processDeliveries()}><RefreshCw size={16} /> Process pending</button></header><table><thead><tr><th>Channel</th><th>Destination</th><th>Status</th><th>Attempts</th><th>Next attempt</th><th>Provider</th></tr></thead><tbody>{deliveries.map((item) => <tr key={item.id}><td>{item.channel}</td><td>{item.destination ?? "—"}</td><td><span className={`status-pill ${item.status === "SENT" ? "approved" : item.status === "EXHAUSTED" ? "rejected" : "pending"}`}>{item.status}</span></td><td>{item.attempts}</td><td>{date(item.nextAttemptAt)}</td><td>{item.providerReference ?? item.lastError ?? "—"}</td></tr>)}{deliveries.length === 0 && <tr><td colSpan={6}><div className="empty-state">No delivery attempts yet.</div></td></tr>}</tbody></table></section>}
  </div>;
}
