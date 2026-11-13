// Sons (Howler). html5: true evita a leitura por XHR, que o Chrome bloqueia quando a página abre por duplo clique.
// O áudio só começa depois do primeiro toque do usuário (a capa pede para apertar →).
const Som = (() => {
  let mudo = false;
  const unicos = {};
  // "plim" de notificação de celular, agudo e suave, sintetizado na hora: duas notas curtas e senoidais com decaimento rápido.
  // Toca só no "Oi!" do encontro. O AudioContext nasce no primeiro uso, que já vem de um toque do usuário.
  let ctx = null;
  const plim = () => {
    if (mudo) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime;
      [[1760, 0], [2349.3, .11]].forEach(([f, atraso]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0 + atraso); g.gain.linearRampToValueAtTime(.16, t0 + atraso + .012); g.gain.exponentialRampToValueAtTime(.0008, t0 + atraso + .55);
        o.connect(g).connect(ctx.destination); o.start(t0 + atraso); o.stop(t0 + atraso + .6);
      });
    } catch (e) { /* sem áudio */ }
  };
  // Laço de um veículo. Vários arquivos começam em fade-in de vários segundos (o avião leva 4 s para soar), e as viagens duram
  // de 1 a 3 s, então cada um começa num ponto em que já está no volume normal. volume compensa a diferença de nível entre os arquivos.
  // trecho: [início, duração] em segundos do ponto do arquivo em que o som está estável e no volume normal
  const LACOS = { carro: { trecho: [12, 14], volume: .22 }, aviao: { trecho: [7, 12], volume: .5 }, trem: { trecho: [42, 20], volume: .95 }, onibus: { trecho: [0, 12], volume: .35 }, barco: { trecho: [4, 30], volume: .5 } };
  function laco(id) {
    const cfg = LACOS[id] || { trecho: [0, 10], volume: .35 };
    // o trecho vira um sprite em laço (o seek do Howler com html5 não é confiável antes de tocar), e o fade é feito à mão
    const h = new Howl({ src: [`assets/sons/${id}.mp3`], html5: true, volume: 1, sprite: { trecho: [cfg.trecho[0] * 1000, cfg.trecho[1] * 1000, true] } });
    let parado = false, som = null, vol = { v: 0 }, quer = 300, tween = null;
    const ir = (para, ms, fim) => { if (tween) tween.kill(); tween = gsap.to(vol, { v: para, duration: ms / 1000, ease: "none", onUpdate() { if (som != null) h.volume(vol.v, som); }, onComplete: fim }); };
    const comecar = () => { if (parado) return; som = h.play("trecho"); h.volume(0, som); ir(mudo ? 0 : cfg.volume, quer); };
    return {
      entrar(ms = 300) { quer = ms; if (h.state() === "loaded") comecar(); else h.once("load", comecar); },
      sair(ms = 600) { if (parado) return; parado = true; ir(0, ms, () => h.unload()); },
      parar() { if (parado) return; parado = true; if (tween) tween.kill(); h.unload(); },
    };
  }
  function alternarMudo() { mudo = !mudo; Howler.mute(mudo); return mudo; }
  return { plim, laco, alternarMudo, get mudo() { return mudo; } };
})();
