// Fogos do Réveillon de Milão: explosões de partículas num canvas por cima do mapa, só durante o passo.
const Fogos = (() => {
  const W = 1920, H = 1080, CORES = ["#FFD166", "#EF476F", "#06D6A0", "#4CC9F0", "#F78C6B", "#FFFFFF", "#C77DFF"];
  let cv = null, ctx = null, raf = 0, parts = [], fim = 0, proximo = 0;

  function explosao() {
    const x = 380 + Math.random() * (W - 760), y = 220 + Math.random() * 360, cor = CORES[(Math.random() * CORES.length) | 0], cor2 = CORES[(Math.random() * CORES.length) | 0];
    const n = 70 + ((Math.random() * 40) | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * .1, v = 3 + Math.random() * 4.5;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0, dur: 70 + Math.random() * 40, cor: i % 3 ? cor : cor2, r: 3 + Math.random() * 2.5 });
    }
  }
  function quadro(t) {
    if (t < fim && t > proximo) { explosao(); proximo = t + 450 + Math.random() * 700; }
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (const p of parts) {
      p.vida++; p.x += p.vx; p.y += p.vy; p.vx *= .985; p.vy = p.vy * .985 + .06;
      const a = Math.max(0, 1 - p.vida / p.dur);
      ctx.globalAlpha = a; ctx.fillStyle = p.cor; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (.4 + a * .6), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    parts = parts.filter(p => p.vida < p.dur);
    if (t < fim || parts.length) raf = requestAnimationFrame(quadro); else parar();
  }
  function iniciar(ms) {
    parar();
    cv = el("canvas"); cv.id = "fogos-cv"; cv.width = W; cv.height = H; $("#palco").appendChild(cv); ctx = cv.getContext("2d");
    fim = performance.now() + ms; proximo = 0; raf = requestAnimationFrame(quadro);
  }
  function parar() { cancelAnimationFrame(raf); if (cv) { cv.remove(); cv = null; } parts = []; }
  return { iniciar, parar };
})();
