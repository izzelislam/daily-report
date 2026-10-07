import { FormEvent, useEffect, useState } from 'react';
import { FiFileText, FiImage, FiSend } from 'react-icons/fi';
import { api, type SessionInfo } from '../api';
import { Alert, PageHeader, Segmented, Tip } from '../ui';

export default function SendMessage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [kind, setKind] = useState<'text' | 'media'>('text');
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [mimetype, setMimetype] = useState('image/jpeg');
  const [result, setResult] = useState<{ kind: 'error' | 'success'; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<SessionInfo[]>('GET', '/api/sessions').then((list) => {
      const ok = list.filter((s) => s.status === 'connected');
      setSessions(ok);
      const wanted = new URLSearchParams(window.location.search).get('session');
      const pick = ok.find((s) => s.sessionId === wanted) || ok[0];
      if (pick) setSessionId(pick.sessionId);
    });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    setLoading(true);
    try {
      const r =
        kind === 'text'
          ? await api('POST', '/api/send/text', { sessionId, to, text })
          : await api('POST', '/api/send/media', { sessionId, to, url, mimetype, caption: text || undefined });
      setResult({ kind: 'success', msg: `Sent (id: ${r.id})` });
      setText('');
    } catch (err: any) {
      setResult({ kind: 'error', msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader icon={FiSend} title="Send Message" subtitle="Send text or media through a connected session" />
      <form onSubmit={submit} className="card max-w-2xl space-y-4 p-6">
        {sessions.length === 0 && <Alert kind="error">No connected session. Link one in Sessions first.</Alert>}
        {result && <Alert kind={result.kind}>{result.msg}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Session
            <select className="input mt-1" value={sessionId} onChange={(e) => setSessionId(e.target.value)} required>
              {sessions.map((s) => <option key={s.sessionId} value={s.sessionId}>{s.sessionId} ({s.phoneNumber})</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Recipient
            <input className="input mt-1" placeholder="08123456789 or group id" value={to} onChange={(e) => setTo(e.target.value)} required />
            <span className="hint">Phone number (08… or 628…) or a group id ending in @g.us</span>
          </label>
        </div>

        <Segmented
          value={kind}
          onChange={setKind}
          options={[{ value: 'text', label: 'Text', icon: FiFileText }, { value: 'media', label: 'Media', icon: FiImage }]}
        />

        {kind === 'media' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium sm:col-span-2">
              Media URL
              <input className="input mt-1" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} required />
            </label>
            <label className="block text-sm font-medium">
              Mimetype
              <input className="input mt-1" value={mimetype} onChange={(e) => setMimetype(e.target.value)} />
            </label>
          </div>
        )}

        <label className="block text-sm font-medium">
          {kind === 'text' ? 'Message' : 'Caption (optional)'}
          <textarea className="input mt-1 min-h-28" value={text} onChange={(e) => setText(e.target.value)} required={kind === 'text'} />
        </label>

        <Tip>Tip: gunakan menu <b>Contacts</b> untuk mengecek apakah nomor terdaftar di WhatsApp sebelum mengirim.</Tip>

        <button className="btn btn-primary" disabled={loading || !sessionId}><FiSend /> {loading ? 'Sending…' : 'Send'}</button>
      </form>
    </>
  );
}
