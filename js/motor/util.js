// Utilidades compartilhadas pelo motor.
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const wait = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = t => t * t * (3 - 2 * t);
const suave = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // ease in-out quadrático
const fmtNum = (v, casas) => v.toLocaleString("pt-BR", casas == null ? {} : { minimumFractionDigits: casas, maximumFractionDigits: casas });

// "2026-12-23 23:25" na hora local do fuso -> instante em ms (UTC)
function utcDe(texto, tz) {
  const [d, h] = texto.split(" "), [a, m, dia] = d.split("-").map(Number), [hh, mm] = h.split(":").map(Number);
  const alvo = Date.UTC(a, m - 1, dia, hh, mm);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  const local = t => { const o = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, +x.value])); return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute); };
  let t = alvo; for (let i = 0; i < 3; i++) t += alvo - local(t);
  return t;
}
