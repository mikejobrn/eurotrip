// HUD: odômetro, relógio, contador e legenda.
function Odometro(box, texto, tam) {
  this.box = box; this.texto = null;
  this.set = function (novo, animar = true) {
    if (this.texto === null || novo.length !== this.texto.length) {
      box.innerHTML = ""; this.fitas = [];
      const o = el("span", "odometro"); if (tam) o.style.fontSize = tam;
      [...novo].forEach(ch => {
        if (/\d/.test(ch)) {
          const d = el("span", "digito"), f = el("span", "fita");
          f.innerHTML = "0123456789".split("").map(n => `<span>${n}</span>`).join("");
          f.style.transition = "none"; d.appendChild(f); o.appendChild(d); this.fitas.push(f);
          f.style.transform = `translateY(-${ch}em)`;
        } else { o.appendChild(el("span", "fixo" + (/[.,:\/]/.test(ch) ? " estreito" : ""), ch === " " ? "&nbsp;" : ch)); this.fitas.push(null); }
      });
      box.appendChild(o); this.texto = novo;
      requestAnimationFrame(() => this.fitas.forEach(f => f && (f.style.transition = "")));
      return;
    }
    [...novo].forEach((ch, i) => {
      const f = this.fitas[i];
      if (f) { if (!animar) f.style.transition = "none"; f.style.transform = `translateY(-${ch}em)`; if (!animar) requestAnimationFrame(() => f.style.transition = ""); }
    });
    this.texto = novo;
  };
  this.set(texto);
}

function Relogio(box) {
  box.innerHTML = `<div class="linha"><div class="data"></div><div class="hora"></div></div><div class="cidade"></div>`;
  this.odoData = new Odometro($(".data", box), "00/00");
  this.odoHora = new Odometro($(".hora", box), "00:00");
  this.cidade = $(".cidade", box);
  this.wrap = box.parentElement; this.ms = 0; this.dataTxt = "";
  const dois = n => String(n).padStart(2, "0");
  // mostra uma hora local (ms) sem animar os dígitos, para o relógio poder correr junto com a viagem;
  // quando o dia vira, a data dá um pulinho
  this.mostrar = function (ms) {
    box.classList.add("rapido"); this.ms = ms; const d = new Date(ms), data = dois(d.getUTCDate()) + "/" + dois(d.getUTCMonth() + 1);
    if (data !== this.dataTxt) { if (this.dataTxt) this.virou(); this.dataTxt = data; }
    this.odoData.set(data, false); this.odoHora.set(dois(d.getUTCHours()) + ":" + dois(d.getUTCMinutes()), false);
  };
  this.virou = function () { const n = $(".data", box); n.classList.remove("virou"); void n.offsetWidth; n.classList.add("virou"); };
  // o relógio cresce e vai para o centro do topo enquanto o tempo passa (deslocamento e virada de dia)
  // Com custo no passo (larguraChip > 0), o relógio e o card verde ficam centralizados juntos, o chip à direita do relógio;
  // sem custo, o relógio fica sozinho no centro.
  this.grande = function (ligado, larguraChip = 0) {
    const w = this.wrap, esc = 1.7, lr = box.offsetWidth * esc, folga = 36;
    if (!ligado) { w.style.transform = ""; return; }
    const esquerda = (1920 - (lr + (larguraChip ? folga + larguraChip : 0))) / 2;
    w.style.transform = `translate(${esquerda - 48}px, 0) scale(${esc})`;
    const cc = $("#chips-centro"); if (cc) cc.style.left = (esquerda + lr + folga) + "px";
  };
  this.definir = function (r, animar = true) {
    box.classList.remove("rapido");
    if (r.ms != null) { this.ms = r.ms; this.dataTxt = r.data; }
    this.odoData.set(r.data, animar); this.odoHora.set(r.hora, animar);
    if (this.cidade.textContent !== r.cidade) {
      if (animar) { this.cidade.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 400, easing: "ease-out" }); }
      this.cidade.textContent = r.cidade;
    }
  };
}

const fmtReais = c => Math.round(c / 100).toLocaleString("pt-BR");
const fmtEuro = v => "€ " + v.toLocaleString("pt-BR", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });

// Texto do chip de soma: moeda estrangeira primeiro e o valor em reais entre parênteses; só reais, sem parênteses.
function descreverSoma(itens) {
  let delta = 0, eur = 0, soEuro = true; const obs = [];
  for (const it of itens) { delta += Math.round(CAMBIO.reais(it.valor, it.moeda) * 100); if (it.moeda === "EUR") eur += it.valor; else soEuro = false; obs.push(it.obs); }
  const reais = Math.round(delta / 100).toLocaleString("pt-BR");
  const html = soEuro ? `+ ${fmtEuro(eur)} <span class="orig">(R$ ${reais})</span>` : `+ R$ ${reais}`;
  return { delta, html: `<div class="linha">${html}</div><small>${obs.join(" · ")}</small>` };
}

function Contador(box) {
  box.innerHTML = `<div class="rotulo">por pessoa</div><div class="valor"><span class="moeda">R$</span><span class="num"></span></div><div class="chips"></div>`;
  this.centavos = 0; this.chips = $(".chips", box);
  this.odo = new Odometro($(".num", box), "0");
  this.definir = function (c, animar = false) { this.centavos = c; this.odo.set(fmtReais(c), animar); this.chips.innerHTML = ""; const cc = $("#chips-centro"); if (cc) cc.innerHTML = ""; };
  // item: { valor, moeda } por pessoa; em euros, o original aparece entre parênteses (a conversão usa o CAMBIO atual)
  // Chip único (soma de todos os custos do passo) ao lado do relógio grande. Fica na tela enquanto o relógio está no centro e,
  // quando ele volta ao canto, encolhe e voa até o total, que então soma.
  this.preparar = function (itens, gen) {
    const { delta, html } = descreverSoma(itens);
    const chip = el("div", "chip-valor", html);
    const cc = $("#chips-centro"); cc.style.left = "0px"; chip.style.visibility = "hidden"; cc.appendChild(chip);   // medido sem a borda direita da tela limitando a largura
    const total = this;
    return {
      largura: chip.offsetWidth,
      mostrar() { chip.style.visibility = ""; chip.classList.add("entra"); },
      async sair() {
        const palco = $("#palco"), esc = palco.getBoundingClientRect().width / 1920, a = chip.getBoundingClientRect(), b = $(".contador .valor").getBoundingClientRect();
        const dx = (b.left + b.width / 2 - a.left - a.width / 2) / esc, dy = (b.top + b.height / 2 - a.top - a.height / 2) / esc;
        chip.classList.remove("entra");
        chip.animate([{ transform: "translate(0, 0) scale(1)", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0 }], { duration: 550, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" });
        await wait(550); chip.remove(); if (gen && gen.cancelado) return;
        total.centavos += delta; total.odo.set(fmtReais(total.centavos));
      },
    };
  };
  // Soma de um card de atração: o valor sai da pílula de preço do card, vai até a posição à direita, abaixo do total, e depois entra no total.
  this.somarDeCard = async function (itens, gen, origem) {
    const { delta, html } = descreverSoma(itens);
    const chip = el("div", "chip-valor", html);
    chip.style.visibility = "hidden"; this.chips.appendChild(chip);
    const b = chip.getBoundingClientRect(), a = origem.getBoundingClientRect(), esc = $("#palco").getBoundingClientRect().width / 1920;
    const dx = (a.left + a.width / 2 - b.left - b.width / 2) / esc, dy = (a.top + a.height / 2 - b.top - b.height / 2) / esc;
    chip.style.visibility = "";
    chip.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${a.width / b.width}, ${a.height / b.height})`, opacity: .85 }, { transform: "none", opacity: 1 }],
      { duration: 650, easing: "cubic-bezier(.45,0,.2,1)" });
    await wait(1350); if (gen && gen.cancelado) { chip.remove(); return; }
    chip.classList.add("sai"); await wait(400);
    chip.remove(); if (gen && gen.cancelado) return;
    this.centavos += delta; this.odo.set(fmtReais(this.centavos));
  };
  // centro: o chip aparece embaixo do relógio grande, no meio da tela, e voo para o total no canto ao sair
  this.somar = async function (item, texto, gen, centro = false) {
    const delta = Math.round(CAMBIO.reais(item.valor, item.moeda) * 100);
    const original = item.moeda === "EUR" ? ` <span class="orig">(${fmtEuro(item.valor)})</span>` : "";
    const chip = el("div", "chip-valor entra", `+ R$ ${Math.round(delta / 100).toLocaleString("pt-BR")}${original}<small>${texto}</small>`);
    const cc = $("#chips-centro");
    (centro && cc ? cc : this.chips).appendChild(chip);
    await wait(1100); if (gen && gen.cancelado) { chip.remove(); return; }
    if (centro && cc) {
      // o chip encolhe e vai até o valor total, no canto
      const palco = $("#palco"), esc = palco.getBoundingClientRect().width / 1920, a = chip.getBoundingClientRect(), b = $(".contador .valor").getBoundingClientRect();
      const dx = (b.left + b.width / 2 - a.left - a.width / 2) / esc, dy = (b.top + b.height / 2 - a.top - a.height / 2) / esc;
      chip.classList.remove("entra");
      chip.animate([{ transform: "translate(0, 0) scale(1)", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0 }], { duration: 550, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" });
      await wait(550);
    } else {
      chip.classList.remove("entra"); chip.classList.add("sai");
      await wait(400);
    }
    chip.remove(); if (gen && gen.cancelado) return;
    this.centavos += delta; this.odo.set(fmtReais(this.centavos));
  };
}

function Legenda(box) {
  this.box = box; this.txt = el("span", "legenda"); box.appendChild(this.txt); this.txt.style.visibility = "hidden";
  this.definir = function (t, animar = true) {
    if (!t) { this.txt.style.visibility = "hidden"; return; }
    this.txt.textContent = t; this.txt.style.visibility = "visible";
    if (animar) this.txt.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "cubic-bezier(.45,0,.2,1)" });
  };
}
