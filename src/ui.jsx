import { useEffect, useState, useRef } from 'preact/hooks';
import { X } from 'lucide-preact';

// ---------- tiny global toast + confirm ----------
let toastSetter = null;
export function toast(msg, kind = 'ok') {
  toastSetter && toastSetter({ msg, kind, at: Date.now() });
}
let confirmSetter = null;
export function confirmBox(opts) {
  return new Promise((resolve) => confirmSetter && confirmSetter({ ...opts, resolve }));
}

export function Overlays() {
  const [t, setT] = useState(null);
  const [c, setC] = useState(null);
  toastSetter = setT;
  confirmSetter = setC;
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => setT(null), 2600);
    return () => clearTimeout(id);
  }, [t]);
  const done = (v) => { c.resolve(v); setC(null); };
  return (
    <>
      {t && <div class={`toast ${t.kind}`} key={t.at}>{t.msg}</div>}
      {c && (
        <div class="modal-backdrop" onClick={() => done(false)}>
          <div class="confirm" onClick={(e) => e.stopPropagation()}>
            {c.title && <h3>{c.title}</h3>}
            {c.message && <p>{c.message}</p>}
            <div class="confirm-actions">
              {c.options ? (
                <>
                  {c.options.map((o) => (
                    <button class={`btn ${o.danger ? 'danger' : o.primary ? 'primary' : ''}`} onClick={() => done(o.value)}>{o.label}</button>
                  ))}
                  <button class="btn ghost" onClick={() => done(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button class="btn ghost" onClick={() => done(false)}>{c.cancel || 'Cancel'}</button>
                  <button class={`btn ${c.danger ? 'danger' : 'primary'}`} onClick={() => done(true)}>{c.ok || 'OK'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- bottom sheet ----------
export function Sheet({ title, onClose, children, actions, tall }) {
  const ref = useRef();
  useEffect(() => {
    document.body.classList.add('sheet-open');
    return () => document.body.classList.remove('sheet-open');
  }, []);
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class={`sheet ${tall ? 'tall' : ''}`} ref={ref} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div class="sheet-head">
          <button class="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
          <h2>{title}</h2>
          <div class="sheet-actions">{actions}</div>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- members ----------
export function initials(name) {
  return (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
export function Avatar({ m, size = 32 }) {
  if (!m) return null;
  return (
    <span class="avatar" style={{ background: m.color, width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px` }} title={m.name}>
      {initials(m.name)}
    </span>
  );
}
export function Dots({ ids, members, max = 4 }) {
  const ms = (ids || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
  return (
    <span class="dots">
      {ms.slice(0, max).map((m) => <span class="dot" style={{ background: m.color }} title={m.name} />)}
    </span>
  );
}
export function MemberChips({ members, value, onChange, multi = true, allowNone, noneLabel = 'Nobody' }) {
  const sel = multi ? value || [] : value;
  const toggle = (id) => {
    if (!multi) return onChange(sel === id ? null : id);
    onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  };
  return (
    <div class="chips">
      {allowNone && !multi && (
        <button type="button" class={`chip ${!sel ? 'on' : ''}`} onClick={() => onChange(null)}>{noneLabel}</button>
      )}
      {members.map((m) => {
        const on = multi ? sel.includes(m.id) : sel === m.id;
        return (
          <button type="button" class={`chip member ${on ? 'on' : ''}`} style={on ? { background: m.color, borderColor: m.color } : { borderColor: m.color + '66' }} onClick={() => toggle(m.id)}>
            <span class="dot" style={{ background: on ? '#fff' : m.color }} />
            {m.name}
          </button>
        );
      })}
    </div>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div class="seg">
      {options.map((o) => (
        <button type="button" class={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label class="toggle-row">
      <span>{label}</span>
      <input type="checkbox" class="switch" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      {children}
      {hint && <span class="field-hint">{hint}</span>}
    </label>
  );
}

export function Empty({ emoji, title, text, action }) {
  return (
    <div class="empty">
      <div class="empty-emoji">{emoji}</div>
      <div class="empty-title">{title}</div>
      {text && <div class="empty-text">{text}</div>}
      {action}
    </div>
  );
}

export function Check({ done, color, onClick, disabled }) {
  return (
    <button type="button" class={`check ${done ? 'done' : ''}`} style={done ? { background: color, borderColor: color } : { borderColor: color }}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }} aria-label={done ? 'Mark not done' : 'Mark done'} disabled={disabled}>
      {done && <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>}
    </button>
  );
}

export function mapsUrl(q) {
  return 'https://maps.apple.com/?q=' + encodeURIComponent(q);
}
