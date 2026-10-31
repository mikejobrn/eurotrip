// Motor: leva a apresentação de um passo ao outro. Avançar um passo toca a animação (receita do tipo do passo);
// voltar ou pular desenha direto o estado do passo de destino, sem som. O estado de qualquer passo vem de estado.js.
const Motor = (() => {
  let roteiro, S, L, relogio, contador, legenda, capaEl, elenco, elencoPreso, finalEl = null, finalElenco = null;
  let atual = -1, assentado = true, tl = null, gen = { cancelado: false }, laco = null, auto = false, autoTimer = null;
  const baralhos = new Map();       // dia -> Baralho
  const efemeros = new Set();       // elementos do passo (hospedagem, balão) que saem no passo seguinte
  const cacheTrilhas = new Map();
  let luzDia = null;                // dia (do relógio) em que a luz foi trocada pela última vez

  function init(rot, estados, lugares) {
    roteiro = rot; S = estados; L = Object.fromEntries(lugares.map(l => [l.id, l]));
    Palco.init($("#palco"));
    relogio = new Relogio($("#relogio")); contador = new Contador($("#contador")); legenda = new Legenda($("#legenda"));
    capaEl = montarCapa(); $("#palco").appendChild(capaEl);
    const box = el("div", "elenco"); elenco = new ElencoParado(box);
    elencoPreso = Palco.prender(box, null, 95, -70, .8); box.style.display = "none";
  }

  function montarCapa() {
    const c = el("div", "capa-tela capa", `<div class="faixa"></div><div class="subtitulo">23/12/2026 a 18/01/2027</div><div class="titulo-capa">Eurotrip</div>
      <div class="subtitulo">Mike, Alan e os amigos pela Europa</div><div class="dica">Aperte → para começar</div><div class="elenco-capa elenco"></div>`);
    new ElencoParado($(".elenco-capa", c)).definir(PESSOAS.map(p => p.id), false);
    return c;
  }

  /* ---------- peças ---------- */
  const pinDe = s => (Palco.temPin(s.dest.id) ? s.dest.id : null);
  function cast(pin, ids, animar) {
    // só o casal: o elenco ao lado do pin é desnecessário (já se subentende), então só aparece quando há mais gente do grupo
    if (ids.length === 2 && ids.includes("mike") && ids.includes("alan")) ids = [];
    elencoPreso.pin = pin; elenco.box.style.display = pin && ids.length ? "" : "none";
    elenco.definir(pin ? ids : [], animar); Palco.marcar();
  }
  function trilhaDe(r) {
    const chave = r.de + ">" + r.para + ">" + r.veiculo;
    if (!cacheTrilhas.has(chave)) { const v = S.find(s => s.veiculo && s.veiculo.id === r.veiculo).veiculo; cacheTrilhas.set(chave, Palco.curva(L[r.de].coord, L[r.para].coord, v.arco)); }
    return { ...cacheTrilhas.get(chave), ate: null };
  }
  function sincronizarPins(ids, animar) {
    for (const [id, p] of [...Palco.pins]) if (!ids.includes(id)) { p.el.remove(); Palco.pins.delete(id); }
    for (const id of ids) Palco.criarPin(L[id], false);
    Palco.marcar();
  }
  function baralhoDoDia(dia) {
    if (!baralhos.has(dia)) {
      const cont = el("div", "deck"); Palco.cena.appendChild(cont);
      const s = S.find(x => x.carrossel.dia === dia && x.carrossel.visivel);
      baralhos.set(dia, new Baralho(cont, s.carrossel.cards.map(j => roteiro[j]), 300));
    }
    return baralhos.get(dia);
  }
  // efêmero: elemento preso a um pin que dura só o passo (hospedagem, balão "Oi!")
  function efemero(html, cls, pin, dx, dy, animar) {
    const w = el("div", ""), inner = el("div", cls, html); w.appendChild(inner);
    const e = Palco.prender(w, pin, dx, dy, 1); efemeros.add(e);
    if (animar) inner.classList.add("pop-bounce");
    return e;
  }
  function limparEfemeros(animar) {
    for (const e of [...efemeros]) {
      efemeros.delete(e);
      if (animar) { const a = e.el.firstChild.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0)", opacity: 0 }], { duration: 350, easing: "ease-in", fill: "forwards" }); a.onfinish = () => Palco.soltar(e); }
      else Palco.soltar(e);
    }
  }
  function hospedagemHTML(p) {
    const m = p.titulo.match(/^(.*) \((\d+) noites?\)$/), nome = m ? m[1] : p.titulo, n = m ? +m[2] : 1;
    const itens = (p.custos || []).filter(c => c.categoria === "hospedagem"), eur = itens.reduce((s, c) => s + c.valor, 0);
    const reais = Math.round(CAMBIO.reais(eur, "EUR"));
    return `<img src="assets/icones/cama.svg" alt=""><div><div class="nome">${nome}</div><div class="noites">${n} ${n > 1 ? "noites" : "noite"} ${eur > 0 ? ` · + ${fmtEuro(eur)} (R$ ${reais.toLocaleString("pt-BR")})` : " · preço a definir"}</div></div>`;
  }

  /* ---------- encerramento: cartão com os sete avatares e o total por pessoa ---------- */
  const fmtTotal = c => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function montarFinal() {
    esconderFinal();
    finalEl = el("div", "final", `<div class="titulo">Fim da Eurotrip</div><div class="elenco"></div><div class="rotulo">Total por pessoa</div>
      <div class="total"><small>R$</small><span class="v">0,00</span></div>
      <div class="nota">Só custos fixos: transporte, hospedagem, voos e atrações. Ficam de fora alimentação, seguro, chip e imprevistos. Euro a R$ ${fmtNum(CAMBIO.eur, 2)} (${CAMBIO.origem}).</div>`);
    $("#palco").appendChild(finalEl);
    finalElenco = new ElencoParado($(".elenco", finalEl));
    return finalEl;
  }
  function esconderFinal() { if (finalEl) { finalEl.remove(); finalEl = null; finalElenco = null; } }
  const totalFinal = () => totalAte(roteiro, roteiro.length - 1);

  /* ---------- estado direto ---------- */
  function snap(i) {
    cancelar();
    const s = S[i], p = s.passo;
    Palco.removerVeiculo(); limparEfemeros(false); Fogos.parar(); esconderFinal(); for (const w of $$(".hud-sup-esq, .hud-sup-dir")) w.style.transition = "none"; relogio.grande(false); void relogio.wrap.offsetWidth; for (const w of $$(".hud-sup-esq, .hud-sup-dir")) w.style.transition = "";
    capaEl.getAnimations().forEach(a => a.cancel()); capaEl.style.display = p.tipo === "capa" ? "" : "none";
    Palco.setView(s.camera.para);
    Palco.luz(s.luz[s.luz.length - 1].fase, false); luzDia = diaDe(s.relogio.para.ms);
    relogio.definir(s.relogio.para, false);
    contador.definir(totalAte(roteiro, i), false);
    legenda.definir(p.tipo === "capa" ? null : p.titulo, false);
    sincronizarPins(s.pins.depois);
    Palco.definirTrilhas([...s.rastros.antes, s.rastros.novo].filter(Boolean).map(trilhaDe));
    const c = s.carrossel;
    for (const [dia, b] of baralhos) if (!(c.visivel && dia === c.dia)) b.sair(false);
    if (c.visivel) { const b = baralhoDoDia(c.dia); b.entrar(c.ativo, false); b.nos.forEach(n => n.getAnimations().forEach(a => a.cancel())); cast(null, [], false); }
    else cast(pinDe(s), p.pessoas, false);
    if (p.tipo === "hospedagem") efemero(hospedagemHTML(p), "hospedagem", pinDe(s), 110, -200, false);
    if (p.tipo === "encerramento") { montarFinal(); finalElenco.definir(p.pessoas, false); $(".v", finalEl).textContent = fmtTotal(totalFinal()); cast(null, [], false); }
    atual = i; assentado = true;
  }

  function cancelar() {
    gen.cancelado = true; gen = { cancelado: false };
    if (tl) { tl.kill(); tl = null; }
    if (laco) { laco.parar(); laco = null; }
    Fogos.parar();
    clearTimeout(autoTimer);
  }

  /* ---------- animações ---------- */
  // Zoom suave entre dois enquadramentos, sem pan separado: ao abrir, a largura cresce primeiro e o centro acompanha;
  // ao fechar, o centro chega primeiro e depois a largura diminui. Assim os dois pontos ficam sempre na tela.
  function tweenCamera(T, de, para, quando, dur) {
    if (Math.abs(de.x - para.x) * Palco.k < 1 && Math.abs(de.y - para.y) * Palco.k < 1 && Math.abs(de.w / para.w - 1) < .001) return;
    const abre = para.w > de.w, o = { u: 0 }, l0 = Math.log(de.w), l1 = Math.log(para.w);
    T.to(o, { u: 1, duration: dur, ease: "none", onUpdate() {
      const u = o.u, uw = abre ? 1 - (1 - u) * (1 - u) : u * u, uc = abre ? smoothstep(u) : 1 - (1 - u) * (1 - u);
      Palco.setView({ x: lerp(de.x, para.x, uc), y: lerp(de.y, para.y, uc), w: Math.exp(lerp(l0, l1, uw)) });
    } }, quando);
  }
  async function somarItens(custos, g, centro) { for (const c of custos) { if (g.cancelado) return; await contador.somar(c, c.obs, g, centro); } }
  // Soma fora dos deslocamentos (atração, hospedagem): o card verde aparece no centro do topo da tela, fica um instante e voa para o total.
  function agendarSomaCentro(T, custos, t, g) {
    if (!custos || !custos.length) return t;
    let h = null;
    T.call(() => { h = contador.preparar(custos, g); $("#chips-centro").style.left = ((1920 - h.largura) / 2) + "px"; h.mostrar(); }, null, t);
    T.call(() => { if (h) h.sair(); }, null, t + 1.3);
    T.to({}, { duration: .001 }, t + 1.9); return t + 1.9;
  }
  // Soma de um card de atração: o valor é clonado da pílula de preço do card e vai para a direita, abaixo do total.
  function agendarSomaCard(T, custos, t, c, g) {
    if (!custos || !custos.length) return t;
    T.call(() => {
      const nos = baralhoDoDia(c.dia).nos[c.ativo];
      const origem = $(".pilula.preco", nos) || $(".rodape", nos) || nos;
      contador.somarDeCard(custos, g, origem);
    }, null, t);
    T.to({}, { duration: .001 }, t + 1.9); return t + 1.9;
  }
  // agenda os chips "+" a partir do instante t e devolve quando terminam
  function agendarChips(T, custos, t, g, centro = false) {
    if (!custos || !custos.length) return t;
    T.call(() => somarItens(custos, g, centro), null, t);
    const fim = t + custos.length * 1.55; T.to({}, { duration: .001 }, fim); return fim;
  }
  const duracaoViagem = s => clamp((1 + .6 * Math.log10(1 + s.dist / 20)) * (s.volta ? .65 : 1), .8, 3);
  // o relógio corre da hora local de saída até a hora local de chegada
  function tweenRelogio(T, de, para, quando, dur) {
    if (de === para) return;
    const o = { u: 0 };
    T.to(o, { u: 1, duration: dur, ease: "power1.inOut", onUpdate() { relogio.mostrar(lerp(de, para, o.u)); } }, quando);
  }
  const diaDe = ms => new Date(ms).toISOString().slice(0, 10);
  // virou o dia desde a última troca de luz: a fase nova entra deslizando; no mesmo dia, é um fade
  function trocarLuz(fase, ms) {
    const d = diaDe(ms), modo = d !== luzDia ? "onda" : "fade";
    if (fase !== Palco.luzAtual()) Palco.luz(fase, true, modo);
    luzDia = d;
  }

  function tocar(i) {
    const s = S[i], p = s.passo, g = gen, raiz = tl = gsap.timeline({ onComplete: () => concluir(i, g) });
    let T = raiz;
    atual = i; assentado = false;
    const ant = S[i - 1];

    // virou o dia: o relógio cresce, corre da hora anterior até a nova e só depois o passo começa
    const antMs = relogio.ms, deMs = s.relogio.de.ms;
    const atraso = diaDe(antMs) !== diaDe(deMs) && p.tipo !== "deslocamento" && p.tipo !== "abertura" ? 1.9 : 0;
    // Com o relógio grande no centro durante um deslocamento, o custo do trecho vira um único card verde ao lado dele,
    // centralizados juntos. O card dura o mesmo tempo que o relógio fica no centro e então voa para o total.
    const usaCentro = !!(p.custos && p.custos.length) && p.tipo === "deslocamento";   // o custo de uma atração só entra quando o card dela entra em cena
    let chipC = null;
    const abrir = () => { if (usaCentro) chipC = contador.preparar(p.custos, g); relogio.grande(true, chipC ? chipC.largura : 0); };
    const mostrar = () => { if (chipC) chipC.mostrar(); };
    const fechar = () => { relogio.grande(false); if (chipC) { const c = chipC; chipC = null; c.sair(); } };
    if (p.tipo === "abertura") raiz.call(() => relogio.definir(s.relogio.para, false), null, 0);
    else if (p.tipo !== "deslocamento") {
      if (atraso) { raiz.call(abrir, null, 0); raiz.call(mostrar, null, .75); tweenRelogio(raiz, antMs, deMs, .3, 1.3); raiz.call(fechar, null, 1.7); }
      else tweenRelogio(raiz, antMs, deMs, 0, .7);
    }
    if (atraso) { T = gsap.timeline(); raiz.add(T, atraso); }

    // início comum a todos os tipos (o deslocamento cuida da própria câmera)
    if (p.tipo !== "deslocamento") tweenCamera(T, s.camera.de, s.camera.para, 0, .9);
    raiz.call(() => {
      limparEfemeros(true);
      if (s.carrossel.saiAntes) baralhoDoDia(ant.carrossel.dia).sair(true);
      legenda.definir(p.titulo, true);
      trocarLuz(s.luz[0].fase, deMs);
    }, null, 0);

    if (p.tipo === "abertura") {
      T.call(() => { const a = capaEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: "forwards" }); a.onfinish = () => { capaEl.style.display = "none"; a.cancel(); }; }, null, 0);
      T.call(() => { for (const id of s.pins.novos) Palco.criarPin(L[id], true); }, null, .7);
      T.call(() => { cast(pinDe(s), p.pessoas, true); }, null, 1.2);
      T.to({}, { duration: .8 }, 1.4);
    }

    else if (p.tipo === "deslocamento") receitaDeslocamento(T, s, g, antMs, { abrir, mostrar, fechar });

    else if (p.tipo === "encontro") {
      T.call(() => { for (const id of s.pins.novos) Palco.criarPin(L[id], true); }, null, 0);
      T.call(() => { cast(pinDe(s), p.pessoas, true); Som.plim(); efemero("Oi!", "balao", pinDe(s), 110, -170, true); }, null, .5);
      T.to({}, { duration: 2 }, .6);
    }

    else if (p.tipo === "hospedagem") {
      T.call(() => { cast(pinDe(s), p.pessoas, true); efemero(hospedagemHTML(p), "hospedagem", pinDe(s), 110, -200, true); }, null, .4);
      if (!usaCentro) agendarSomaCentro(T, p.custos, 1.1, g);
      T.to({}, { duration: .6 }, ">");
    }

    else if (p.tipo === "atividade") {
      const c = s.carrossel;
      T.call(() => cast(null, [], true), null, 0);
      if (c.entra) T.call(() => { baralhoDoDia(c.dia).entrar(c.ativo, true); }, null, c.saiAntes ? .7 : .35);
      else T.call(() => { baralhoDoDia(c.dia).ir(c.ativo); }, null, .1);
      if (p.efeito === "fogos") T.call(() => Fogos.iniciar(7000), null, 1.2);
      const fim = usaCentro ? 0 : agendarSomaCard(T, p.custos, c.entra ? 1.1 : .7, c, g);
      T.to({}, { duration: .5 }, Math.max(fim, c.entra ? 1.1 : .7));
    }

    else if (p.tipo === "encerramento") {
      T.call(() => cast(null, [], true), null, 0);
      T.call(() => { const f = montarFinal(); f.classList.add("pop-bounce"); f.style.transformOrigin = "0 50%"; }, null, 1.4);
      p.pessoas.forEach((id, n) => T.call(() => { finalElenco.definir(p.pessoas.slice(0, n + 1), true); }, null, 2.0 + n * .22));
      const alvo = { c: 0 };
      T.to(alvo, { c: totalFinal(), duration: 2.6, ease: "power2.out", onUpdate() { if (finalEl) $(".v", finalEl).textContent = fmtTotal(alvo.c); } }, 3.6);
      T.to({}, { duration: 1.5 }, ">");
    }

    else { T.to({}, { duration: 1 }, 0); }
  }

  // Deslocamento: o pin da saída (se for novo), o veículo com pop-bounce na base do pin, o zoom out até enquadrar
  // saída e chegada, a viagem com o rastro atrás do veículo e, só na chegada, o veículo some e o pin do destino surge.
  function receitaDeslocamento(T, s, g, antMs, centro) {
    const p = s.passo, V = s.veiculo, D = duracaoViagem(s);
    const curva = Palco.curva(s.orig.coord, s.dest.coord, V.arco);
    const ativa = { pts: curva.pts, total: curva.total, ate: 0 };
    const prog = { u: 0 };
    let veic = null, iluz = 1;
    const tPin = .1, tVeic = tPin + (s.pins.novosSaida.length ? .35 : 0), tCam = tVeic + .25, tMove = tCam + .7;

    T.call(() => {
      for (const id of s.pins.novosSaida) Palco.criarPin(L[id], true);
    }, null, tPin);
    T.call(() => {
      cast(null, [], false);
      Palco.definirTrilhas([...s.rastros.antes.map(trilhaDe), ativa]);
      veic = Palco.criarVeiculo(p.veiculo, p.pessoas);
      const ini = Palco.emS(curva, curva.total * .01); veic.x = curva.pts[0].x; veic.y = curva.pts[0].y; Palco.orientar(ini.dx, ini.dy); veic.visivel = true;
      veic.interno.classList.add("pop-bounce"); Palco.marcar();
      laco = Som.laco(V.som); laco.entrar(300);
    }, null, tVeic);
    tweenCamera(T, s.camera.de, s.camera.para, tCam, .7);
    T.call(centro.abrir, null, 0);
    tweenRelogio(T, antMs, s.relogio.de.ms, 0, .5);
    T.call(centro.mostrar, null, .75);   // o card do custo aparece assim que o relógio chega ao centro (a transição dele leva 0,7 s)
    T.to(prog, {
      u: 1, duration: D, ease: "power2.inOut",
      onUpdate() {
        if (!veic) return;
        const u = prog.u, sPos = u * curva.total, pt = Palco.emS(curva, sPos);
        veic.x = pt.x; veic.y = pt.y; Palco.orientar(pt.dx, pt.dy);
        ativa.ate = Math.max(0, sPos - (LARG_VEICULO / 2) / Palco.k * .9);
        relogio.mostrar(lerp(s.relogio.de.ms, s.relogio.para.ms, u));
        while (iluz < s.luz.length && u >= s.luz[iluz].em) trocarLuz(s.luz[iluz++].fase, lerp(s.relogio.de.ms, s.relogio.para.ms, u));
        Palco.marcar();
      },
    }, tMove);
    const tCheg = tMove + D;
    T.call(() => {
      if (laco) laco.sair(600);
      ativa.ate = curva.total; Palco.marcar();
      const v = Palco.veic;
      if (v) { const a = v.interno.animate([{ transform: "scale(1)" }, { transform: "scale(0)" }], { duration: 380, easing: "ease-in", fill: "forwards" }); a.onfinish = () => Palco.removerVeiculo(); }
    }, null, tCheg);
    T.call(() => {
      for (const id of s.pins.novosChegada) Palco.criarPin(L[id], true);
      relogio.definir(s.relogio.para, true);
    }, null, tCheg + .25);
    T.call(centro.fechar, null, tCheg + .8);
    T.call(() => cast(pinDe(s), p.pessoas, true), null, tCheg + .45);
    T.to({}, { duration: .6 }, ">");
  }

  function concluir(i, g) {
    if (g.cancelado || i !== atual) return;
    assentado = true; laco = null;
    if (auto) autoTimer = setTimeout(() => Reveal.next(), 1500);
  }

  /* ---------- navegação ---------- */
  function ir(i) {
    if (i === atual && assentado) return;
    const ant = atual, rodando = !assentado;
    if (rodando && ant >= 0) snap(ant);            // termina na hora o que estava rodando
    else cancelar();
    if (ant >= 0 && i === ant + 1) tocar(i); else snap(i);
  }
  function alternarAuto() { auto = !auto; if (auto && assentado) autoTimer = setTimeout(() => Reveal.next(), 1500); else clearTimeout(autoTimer); return auto; }

  return { init, ir, snap, alternarAuto, get atual() { return atual; }, get estados() { return S; } };
})();
