// Palco: mapa em canvas (Mercator), câmera, rastros, pins, veículo e elementos presos a um pin.
// A tela tem 1920 × 1080 e a câmera é uma view { x, y, w } no plano de Mercator (w = largura visível em unidades do plano).
const Palco = (() => {
  const W = 1920, H = 1080;
  let raiz, mapaCv, mapaCtx, rastroCv, rastroCtx, cena, luzEl, Q = 1;
  let view = { x: 0, y: 0, w: 1 }, sujo = true;
  const pins = new Map();              // id -> { id, plano, el, sx, sy }
  const presos = new Set();            // elementos presos a um pin: { el, pin, dx, dy, escala }
  let trilhas = [];                    // rastros: { pts, total, ate }
  let veic = null;                     // veículo em cena: { el, interno, x, y, giro, espelho, tipo, visivel }
  let geo = null;
  let mapaEl, camada2 = null, cv2 = null, ctx2 = null, caminho2 = null, faseAtual = "dia", ondaTween = null;
  // filtros de luz (mesma lista de funções nas três fases)
  const FILTROS = {
    dia: "sepia(0) saturate(1) hue-rotate(0deg) brightness(1) contrast(1)",
    tarde: "sepia(.45) saturate(1.55) hue-rotate(-26deg) brightness(1.03) contrast(1.05)",
    noite: "sepia(0) saturate(1.1) hue-rotate(8deg) brightness(.5) contrast(1.05)",
  };

  const proj = d3.geoMercator().center([0, 0]).rotate([0, 0]).clipExtent([[-30, -30], [W + 30, H + 30]]);
  let caminhoMapa;

  // geometria em três níveis de detalhe, cada peça com a sua caixa (lon/lat) para só desenhar o que aparece na tela
  const caixaDe = pts => { let w = 1e9, s = 1e9, e = -1e9, n = -1e9; for (const [x, y] of pts) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; } return [[w, s], [e, n]]; };
  function pedacos(mesh, n = 80) {   // MultiLineString -> trechos curtos
    const out = [];
    for (const linha of mesh.coordinates) for (let i = 0; i < linha.length - 1; i += n) {
      const parte = linha.slice(i, i + n + 1); out.push({ obj: { type: "LineString", coordinates: parte }, b: caixaDe(parte) });
    }
    return out;
  }
  function nivel(t) {
    const c = t.objects.countries;
    return {
      paises: topojson.feature(t, c).features.map(f => ({ obj: f, b: d3.geoBounds(f) })),
      fronteiras: pedacos(topojson.mesh(t, c, (a, b) => a !== b)), litoral: pedacos(topojson.mesh(t, c, (a, b) => a === b)),
    };
  }
  function prepararGeo() {
    geo = { niveis: [nivel(MAPA.paises), ...MAPA.paisesLod.map(nivel)], ufs: MAPA.ufs.features.map(f => ({ obj: f, b: d3.geoBounds(f) })) };
  }

  function init(el_) {
    raiz = el_; prepararGeo();
    raiz.innerHTML = `<div class="mapa"><canvas id="mapa-cv"></canvas></div><div class="luz" id="luz" data-fase="dia"></div>
      <canvas id="rastro-cv" class="camada"></canvas><div class="camada" id="cena"></div>
      <div class="hud-sup-esq"><div class="hud-bloco relogio" id="relogio"></div></div>
      <div class="hud-sup-dir"><div class="hud-bloco contador" id="contador"></div></div>
      <div class="chips-centro" id="chips-centro"></div><div class="hud-legenda" id="legenda"></div>`;
    mapaEl = $(".mapa", raiz); mapaEl.style.transition = "none"; mapaEl.style.filter = FILTROS.dia;
    mapaCv = $("#mapa-cv"); rastroCv = $("#rastro-cv"); cena = $("#cena"); luzEl = $("#luz");
    mapaCtx = mapaCv.getContext("2d"); rastroCtx = rastroCv.getContext("2d");
    caminhoMapa = d3.geoPath(proj, mapaCtx);
    redimensionar();
    gsap.ticker.add(() => { if (sujo) { sujo = false; desenhar(); } });
  }

  // o palco de 1920 × 1080 é escalado por CSS; o canvas ganha resolução extra em telas grandes
  function escalarPalco() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    raiz.style.transform = `translate(${(innerWidth - W * s) / 2}px, ${(innerHeight - H * s) / 2}px) scale(${s})`;
    return s;
  }
  function redimensionar() {
    const s = escalarPalco();
    Q = clamp(s * (devicePixelRatio || 1), 1, 2);
    for (const cv of [mapaCv, rastroCv, cv2].filter(Boolean)) { cv.width = Math.round(W * Q); cv.height = Math.round(H * Q); cv.style.width = W + "px"; cv.style.height = H + "px"; }
    sujo = true;
  }
  addEventListener("resize", () => { if (raiz) redimensionar(); });

  const k = () => W / view.w;
  const kmVisiveis = () => view.w * R_TERRA * Math.cos(Math.atan(Math.sinh(-view.y)));
  const paraTela = (x, y) => { const kk = k(); return [(x - view.x) * kk + W / 2, (y - view.y) * kk + H / 2]; };

  function setView(v) { view = { x: v.x, y: v.y, w: v.w }; sujo = true; }
  function getView() { return { ...view }; }

  /* ---------- desenho ---------- */
  // desenha o mapa num contexto (o canvas da camada de luz nova usa o mesmo desenho durante a transição)
  function pintar(c, caminhoMapa, km) {
    c.setTransform(Q, 0, 0, Q, 0, 0); c.clearRect(0, 0, W, H);
    c.lineJoin = "round";
    const [oeste, norte] = proj.invert([-40, -40]), [leste, sul] = proj.invert([W + 40, H + 40]);
    const dentro = o => !(o.b[1][0] < oeste || o.b[0][0] > leste || o.b[1][1] < sul || o.b[0][1] > norte);
    const nv = geo.niveis[km <= 500 ? 0 : km <= 2500 ? 1 : 2];
    c.beginPath(); for (const o of nv.paises) if (dentro(o)) caminhoMapa(o.obj); c.fillStyle = "#5DBB63"; c.fill();
    c.beginPath(); for (const o of nv.fronteiras) if (dentro(o)) caminhoMapa(o.obj); c.strokeStyle = "rgba(47,125,58,.55)"; c.lineWidth = 1.2; c.stroke();
    if (km < 4000) { c.beginPath(); for (const o of geo.ufs) if (dentro(o)) caminhoMapa(o.obj); c.stroke(); }
    c.beginPath(); for (const o of nv.litoral) if (dentro(o)) caminhoMapa(o.obj); c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 2; c.stroke();
  }

  function desenhar() {
    const kk = k(), km = kmVisiveis();   // largura visível em km, para escolher o nível de detalhe
    proj.scale(kk).translate([W / 2 - view.x * kk, H / 2 - view.y * kk]);
    pintar(mapaCtx, caminhoMapa, km);
    if (ctx2) pintar(ctx2, caminho2, km);

    // rastros
    const r = rastroCtx;
    r.setTransform(Q, 0, 0, Q, 0, 0); r.clearRect(0, 0, W, H);
    r.setLineDash([14, 12]); r.lineWidth = 5; r.lineCap = "round"; r.lineJoin = "round"; r.strokeStyle = "#692300";
    for (const t of trilhas) {
      const ate = t.ate == null ? t.total : t.ate;
      if (ate <= 0) continue;
      r.beginPath();
      let primeiro = true;
      for (let i = 0; i < t.pts.length; i++) {
        const p = t.pts[i];
        if (p.s > ate) { const a = t.pts[i - 1]; if (a) { const f = (ate - a.s) / (p.s - a.s || 1), [sx, sy] = paraTela(lerp(a.x, p.x, f), lerp(a.y, p.y, f)); r.lineTo(sx, sy); } break; }
        const [sx, sy] = paraTela(p.x, p.y);
        if (primeiro) { r.moveTo(sx, sy); primeiro = false; } else r.lineTo(sx, sy);
      }
      r.stroke();
    }

    // pins, elementos presos e veículo
    cena.classList.toggle("afastado", km > 1500);      // afastado: esconde os nomes
    cena.classList.toggle("sem-nome-bv", km > 60);     // nos bate-voltas, o nome só aparece quando a câmera está perto dele
    for (const p of pins.values()) { const [sx, sy] = paraTela(p.plano[0], p.plano[1]); p.el.style.transform = `translate(${sx}px, ${sy}px)`; p.sx = sx; p.sy = sy; }
    for (const e of presos) {
      const p = pins.get(e.pin); if (!p) continue;
      // se não couber à direita do pin (por exemplo, Berlim na borda da tela), vai para a esquerda dele
      const larg = e.el.offsetWidth * (e.escala || 1);
      let x = p.sx + e.dx; if (larg && x + larg > W - 30) x = p.sx - e.dx - larg;
      e.el.style.transform = `translate(${x}px, ${p.sy + e.dy}px) scale(${e.escala || 1})`;
    }
    if (veic) veic.el.style.visibility = veic.visivel ? "visible" : "hidden";
    if (veic && veic.visivel) {
      const [sx, sy] = paraTela(veic.x, veic.y), v = VEICULOS[veic.tipo], alt = LARG_VEICULO / v.proporcao;
      veic.el.style.transform = `translate(${sx - LARG_VEICULO / 2}px, ${sy - alt / 2}px) rotate(${veic.giro}deg) scale(${veic.espelho}, 1)`;
      for (const h of veic.el.querySelectorAll(".cabeca")) { h.style.rotate = `${-veic.giro * veic.espelho}deg`; h.style.scale = `${veic.espelho} 1`; }
    }
  }

  /* ---------- pins ---------- */
  function criarPin(l, comPop) {
    if (pins.has(l.id)) return pins.get(l.id);
    const wrap = el("div", "pino" + (l.tipo === "bate-volta" ? " bv" : ""), pinHTML(l.nome));
    cena.appendChild(wrap);
    const p = { id: l.id, plano: plano(l.coord), el: wrap, sx: -999, sy: -999 };
    pins.set(l.id, p);
    if (comPop) $(".pin", wrap).classList.add("pop-bounce");
    sujo = true;
    return p;
  }
  const temPin = id => pins.has(id);

  // prende um elemento a um pin, com deslocamento em pixels do palco
  function prender(el_, pin, dx, dy, escala) {
    cena.appendChild(el_); el_.classList.add("preso");
    const e = { el: el_, pin, dx, dy, escala }; presos.add(e); sujo = true; return e;
  }
  function soltar(e) { presos.delete(e); e.el.remove(); }
  function marcar() { sujo = true; }

  /* ---------- rastros ---------- */
  // curva quadrática no plano, com a flecha para o norte (a volta passa pelo mesmo caminho)
  function curva(de, para, arco) {
    const a = plano(de), b = plano(para);
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]), ctrl = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - dist * arco];
    const N = 160, pts = [];
    for (let i = 0; i <= N; i++) { const t = i / N, u = 1 - t; pts.push({ x: u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0], y: u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1], s: 0 }); }
    let acc = 0; for (let i = 1; i <= N; i++) { acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].s = acc; }
    return { pts, total: acc };
  }
  function emS(c, s) {
    let i = 1; while (i < c.pts.length - 1 && c.pts[i].s < s) i++;
    const a = c.pts[i - 1], b = c.pts[i], f = clamp((s - a.s) / ((b.s - a.s) || 1), 0, 1);
    return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), dx: b.x - a.x, dy: b.y - a.y };
  }
  function definirTrilhas(lista) { trilhas = lista; sujo = true; }

  /* ---------- veículo ---------- */
  function criarVeiculo(tipo, ids) {
    removerVeiculo();
    const box = el("div", "veic-pos"), v = el("div"); montarVeiculo(v, tipo, ids); box.appendChild(v);
    cena.appendChild(box);
    veic = { el: box, interno: v, tipo, x: 0, y: 0, giro: 0, espelho: 1, visivel: false };
    return veic;
  }
  function removerVeiculo() { if (veic) { veic.el.remove(); veic = null; } }
  // orienta o veículo para o rumo (dx, dy no plano): o avião gira o nariz, os demais espelham e inclinam até 15°
  function orientar(dx, dy) {
    const v = VEICULOS[veic.tipo], rumo = Math.atan2(dy, dx) * 180 / Math.PI, oeste = dx < 0;
    if (v.nariz != null) { veic.giro = rumo - v.nariz; veic.espelho = 1; return; }
    const inclina = oeste ? rumo + (rumo > 0 ? -180 : 180) : rumo;
    veic.giro = clamp(inclina, -15, 15);
    veic.espelho = (v.frente === "esq") === oeste ? 1 : -1;
  }

  // Troca a luz. modo "onda" (virada de dia): a fase nova entra deslizando da direita para a esquerda sobre a anterior, como um
  // slide-in. modo "fade" (troca dentro do mesmo dia): o filtro muda em fade. Sem animação (estado direto), vale na hora.
  function finalizarOnda() {
    if (ondaTween) { ondaTween.kill(); ondaTween = null; }
    if (camada2) { mapaEl.style.filter = camada2.dataset.filtro; camada2.remove(); camada2 = null; cv2 = null; ctx2 = null; caminho2 = null; }
  }
  function luz(fase, animar = true, modo = "fade") {
    if (fase === faseAtual && !camada2) return;
    finalizarOnda();
    faseAtual = fase; luzEl.dataset.fase = fase;
    if (!animar) { mapaEl.style.transition = "none"; mapaEl.style.filter = FILTROS[fase]; return; }
    if (modo === "fade") { mapaEl.style.transition = "filter 1.2s cubic-bezier(.65, 0, .35, 1)"; mapaEl.style.filter = FILTROS[fase]; return; }
    mapaEl.style.transition = "none";
    camada2 = el("div", "mapa mapa-novo", "<canvas></canvas>");
    camada2.dataset.filtro = FILTROS[fase]; camada2.style.transition = "none"; camada2.style.filter = FILTROS[fase];
    camada2.style.clipPath = "inset(0 0 0 100%)";
    mapaEl.after(camada2);
    cv2 = $("canvas", camada2); cv2.width = Math.round(W * Q); cv2.height = Math.round(H * Q); cv2.style.width = W + "px"; cv2.style.height = H + "px";
    ctx2 = cv2.getContext("2d"); caminho2 = d3.geoPath(proj, ctx2); sujo = true;
    const o = { v: 100 };
    ondaTween = gsap.to(o, { v: 0, duration: 1.1, ease: "power2.inOut", onUpdate() { if (camada2) camada2.style.clipPath = `inset(0 0 0 ${o.v}%)`; }, onComplete: finalizarOnda });
  }
  const luzAtual = () => faseAtual;

  return { desenhar, init, setView, getView, paraTela, marcar, criarPin, temPin, prender, soltar, curva, emS, definirTrilhas, criarVeiculo, removerVeiculo, orientar,
    luz, luzAtual, get cena() { return cena; }, get veic() { return veic; }, get pins() { return pins; }, get k() { return k(); } };
})();
