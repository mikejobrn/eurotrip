// Ponto de entrada: monta os slides vazios do Reveal (um por passo), liga o motor e as teclas.
// O roteiro inteiro roda por padrão. ?ate=<id do passo> corta o roteiro nesse passo (útil para testar, por exemplo ?ate=de-wallen).
(async function () {
  const params = new URLSearchParams(location.search);
  const ate = params.get("ate") || "tudo";
  let roteiro = ROTEIRO;
  if (ate !== "tudo") { const k = ROTEIRO.findIndex(p => p.id === ate); if (k >= 0) roteiro = ROTEIRO.slice(0, k + 1); }

  await CAMBIO.carregar();     // cotação do euro turismo do dia (sem rede, vale R$ 5,95)

  $("#slides").innerHTML = roteiro.map(p => `<section id="${p.id}" data-id="${p.id}"></section>`).join("");
  const estados = construirEstados(roteiro, LUGARES, VEICULOS_CATALOGO);
  Motor.init(roteiro, estados, LUGARES);

  Reveal.initialize({
    hash: true, controls: false, progress: true, slideNumber: false, transition: "none", overview: false,
    width: 1920, height: 1080, keyboard: { 77: null, 65: null }, touch: true, help: false, center: false,
  });
  const ir = () => Motor.ir(Reveal.getState().indexh);
  Reveal.on("ready", ir);
  Reveal.on("slidechanged", ir);

  addEventListener("keydown", e => {
    if (e.key === "m" || e.key === "M") Som.alternarMudo();
    if (e.key === "a" || e.key === "A") Motor.alternarAuto();
  });
  // toque ou clique: o terço esquerdo da tela volta, o resto avança (o Reveal não recebe toques, porque o palco fica por baixo)
  addEventListener("click", e => { if (e.target.closest("a, button")) return; e.clientX < innerWidth * .25 ? Reveal.prev() : Reveal.next(); });
  addEventListener("load", () => focus());
  window.Motor = Motor;
})();
