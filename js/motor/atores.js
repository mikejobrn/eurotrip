// Atores da cena: cabeças, veículos, pins, cards, elenco parado e o baralho (carrossel).
const P = Object.fromEntries(PESSOAS.map((p, i) => [p.id, { ...p, i }]));

function cabeca(id, extra = "") {
  const p = P[id];
  const c = el("span", "cabeca " + extra, `<img src="${p.avatar}" alt="${p.nome}" title="${p.nome}">`);
  c.dataset.id = id; c.style.setProperty("--fase", `${-(p.i * 0.37) % 0.9}s`);
  return c;
}

/* ---------- veículos ---------- */
// frente: lado para onde o desenho aponta; nariz: ângulo do nariz do avião (graus, 0 = direita, negativo = para cima).
// As cabeças ficam numa fileira: centro (% da ilustração), eixo (direção por passo), esp (passo em %), larg (largura máxima em %).
const LARG_VEICULO = 170;
const VEICULOS = {
  carro:  { proporcao: 36 / 21, frente: "esq", centro: [57, 31], eixo: [1, 0], esp: 26, larg: 40, tam: 44 },
  aviao:  { proporcao: 1, nariz: -45, centro: [58, 42], eixo: [1, -.95], esp: 11, larg: 44, tam: 32 },
  trem:   { proporcao: 122 / 97, frente: "esq", centro: [58, 32], eixo: [1, 0], esp: 16, larg: 40, tam: 34 },
  onibus: { proporcao: 36 / 25, frente: "esq", centro: [52, 30], eixo: [1, 0], esp: 22, larg: 66, tam: 36 },
  barco:  { proporcao: 34 / 22.5, frente: "dir", centro: [52, 45], eixo: [1, 0], esp: 17, larg: 60, tam: 30 },
};
function montarVeiculo(box, tipo, ids) {
  const v = VEICULOS[tipo], n = ids.length;
  box.className = "veiculo"; box.dataset.tipo = tipo; box.style.width = LARG_VEICULO + "px";
  box.innerHTML = `<img class="corpo" src="assets/veiculos/${tipo}.svg" alt="">`;
  const esp = n > 1 ? Math.min(v.esp, v.larg / (n - 1)) : 0;
  const tam = v.tam * (n <= 3 ? 1 : Math.max(.65, Math.sqrt(3 / n)));
  ids.forEach((id, i) => {
    const d = (i - (n - 1) / 2) * esp, c = cabeca(id, "janela");
    c.style.setProperty("--tam", tam + "%");
    c.style.left = (v.centro[0] + d * v.eixo[0]) + "%"; c.style.top = (v.centro[1] + d * v.eixo[1]) + "%";
    box.appendChild(c);
  });
}

const pinHTML = nome => `<div class="pin"><div class="nome">${nome}</div><img class="marca" src="assets/icones/pin.svg" alt=""></div>`;

/* ---------- elenco parado, ao lado do pin ---------- */
function ElencoParado(box) {
  this.box = box; this.cabecas = new Map();
  // ids: quem deve estar na tela; animar: pop-in e pop-out de quem entra e sai
  this.definir = function (ids, animar) {
    for (const [id, c] of [...this.cabecas]) if (!ids.includes(id)) {
      this.cabecas.delete(id);
      if (animar) { c.classList.remove("entra"); c.classList.add("sai"); setTimeout(() => c.remove(), 420); } else c.remove();
    }
    ids.forEach((id, n) => {
      let c = this.cabecas.get(id);
      if (!c) { c = cabeca(id, animar ? "entra" : ""); this.cabecas.set(id, c); this.box.appendChild(c); }
      c.style.order = n;
    });
  };
}

/* ---------- card de atração ---------- */
function precoDoCard(p) {
  if (p.foraDaConta) return { tipo: "fora" };
  const cat = p.precoNoCard || "atracao";
  const itens = (p.custos || []).filter(c => c.categoria === cat);
  if (!itens.length) return { tipo: "gratis" };
  const soma = itens.reduce((s, c) => s + c.valor, 0), moeda = itens[0].moeda;
  return { tipo: "preco", texto: moeda === "EUR" ? fmtEuro(soma) : "R$ " + fmtNum(soma) };
}
const SIMBOLO = { EUR: "€", GBP: "£", BRL: "R$" };
function cardHTML(p) {
  const pr = precoDoCard(p);
  const pil = pr.tipo === "gratis" ? `<span class="pilula gratis">Grátis</span>` : pr.tipo === "fora" ? `<span class="pilula fora">Fora da conta</span>` : `<span class="pilula preco">${pr.texto}</span>`;
  const ch = p.precoCheio ? `<span class="cheio">preço cheio ${SIMBOLO[p.precoCheio.moeda]} ${fmtNum(p.precoCheio.valor, p.precoCheio.valor % 1 ? 2 : 0)}</span>` : "";
  return `<div class="foto"><img src="assets/fotos-promo/${p.foto}.jpg" alt="" loading="lazy"></div>
    <div class="texto"><div class="titulo">${p.titulo}</div>
    ${p.descricao ? `<div class="descricao">${p.descricao}</div>` : ""}
    <div class="rodape">${pil}${ch}</div>
    ${p.reservar ? `<div class="reservar">${p.reservar}</div>` : ""}</div>`;
}

/* ---------- baralho de cards do dia ---------- */
// passos: os passos do roteiro (tipo atividade) do dia; só se move por translação suave
function Baralho(container, passos, centro) {
  this.passos = passos; this.ativo = 0; this.nos = []; this.poleiros = new Map(); this.visivel = false;
  this.giros = [-4, 3, -2, 5, -3, 2];
  this.centro = centro;
  const passo = 440 * 0.4;
  container.classList.add("carrossel");
  passos.forEach((p, i) => {
    const n = el("div", "card", cardHTML(p));
    n.style.setProperty("--giro", this.giros[i % this.giros.length] + "deg");
    container.appendChild(n); this.nos.push(n);
  });
  this.elencoBox = el("div", "elenco-card"); container.appendChild(this.elencoBox);
  this.posicaoCabeca = (n, total) => {
    const largura = 96 + (total - 1) * 52;
    return { x: this.centro - 10 + (475 - largura) / 2 + n * 52, y: 56 };
  };
  const zDe = d => d === 0 ? 50 : d < 0 ? 10 + d : 40 - d;
  // antigo: índice do card que estava ativo, quando a troca é animada
  this.layout = (animar, antigo) => {
    const velho = antigo != null ? this.nos[antigo] : null;
    this.nos.forEach((n, i) => {
      const d = i - this.ativo;
      n.classList.toggle("passado", d < 0);
      // os cards que já passaram se empilham à esquerda (no máximo dois degraus, para não cobrir o pin da cidade)
      // os cards ainda não visitados ficam escondidos à direita e deslizam para o lugar quando chega a vez deles
      n.classList.toggle("futuro", d > 0);
      const dx = d < 0 ? -(passo * Math.min(-d, 2) + 18 * Math.max(0, -d - 2)) : d > 0 ? 470 : 0;
      n.style.setProperty("--x", (this.centro + dx) + "px");
      n.style.setProperty("--y", d === 0 ? "-24px" : "0px");
      n.style.setProperty("--esc", d === 0 ? "1.08" : "1");
      n.style.setProperty("--giro", d === 0 ? "0deg" : this.giros[i % this.giros.length] + "deg");
      if (velho && (i === this.ativo || n === velho)) setTimeout(() => n.style.zIndex = zDe(d), 350);   // troca de camada no meio do caminho
      else n.style.zIndex = zDe(d);
    });
    const novos = this.passos[this.ativo].pessoas;
    new Map(this.poleiros).forEach((pol, id) => {
      if (!novos.includes(id)) {
        this.poleiros.delete(id);
        if (animar) { pol.firstChild.classList.remove("entra"); pol.firstChild.classList.add("sai"); setTimeout(() => pol.remove(), 420); } else pol.remove();
      }
    });
    novos.forEach((id, n) => {
      const pos = this.posicaoCabeca(n, novos.length);
      let pol = this.poleiros.get(id);
      if (!pol) {
        pol = el("div", "poleiro"); pol.appendChild(cabeca(id, animar ? "entra" : ""));
        pol.style.transition = "none"; pol.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        this.elencoBox.appendChild(pol); this.poleiros.set(id, pol);
        requestAnimationFrame(() => requestAnimationFrame(() => pol.style.transition = ""));
      } else {
        pol.style.transitionDelay = animar ? n * 60 + "ms" : "0ms";
        pol.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      }
      pol.style.zIndex = n;
    });
  };
  // passa ao card novo (animado: translação suave, a mesma nos dois sentidos)
  this.ir = (novo) => {
    novo = clamp(novo, 0, this.passos.length - 1);
    if (novo === this.ativo) return false;
    const antigo = this.ativo; this.ativo = novo;
    this.layout(true, antigo);
    return true;
  };
  // estado direto, sem animação (e sem a transição de 700 ms dos cards)
  const semTransicao = fn => { container.classList.add("sem-t"); fn(); void container.offsetWidth; container.classList.remove("sem-t"); };
  this.definir = (ativo) => semTransicao(() => { this.ativo = ativo; this.layout(false); });
  // o baralho inteiro sobe de baixo, com 80 ms entre um card e outro
  this.entrar = (ativo, animar = true) => {
    container.getAnimations().forEach(a => a.cancel());
    container.style.display = ""; this.visivel = true;
    semTransicao(() => { this.ativo = ativo; this.layout(false); });
    if (animar) this.nos.forEach((n, i) => i <= ativo && n.animate([{ opacity: 0, translate: "0 600px" }, { opacity: 1, translate: "0 0" }],
      { duration: 700, delay: i * 80, easing: "cubic-bezier(.45,0,.2,1)", fill: "backwards" }));
  };
  // o baralho desce para fora da tela
  this.sair = (animar = true) => {
    if (!this.visivel) return;
    this.visivel = false;
    if (!animar) { container.style.display = "none"; return; }
    const a = container.animate([{ transform: "translateY(0)" }, { transform: "translateY(900px)" }], { duration: 600, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" });
    a.onfinish = () => { if (!this.visivel) container.style.display = "none"; a.cancel(); };
  };
  container.style.display = "none";
}
