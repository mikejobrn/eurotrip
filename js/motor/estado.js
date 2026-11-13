// Estado derivado: a partir do roteiro, calcula para cada passo tudo o que a animação consome.
// O roteiro só descreve o que acontece; câmera, luz, pins, rastros, elenco, carrossel e relógio saem daqui.
const R_TERRA = 6371;
const ANCORA_CARROSSEL = [330, 640];    // onde o pin da cidade fica quando o carrossel está na tela
const ANCORA_CENTRO = [960, 640];
const KM_CIDADE = 120, KM_BATE_VOLTA = 40;

const proj0 = d3.geoMercator().scale(1).translate([0, 0]).center([0, 0]).rotate([0, 0]);   // plano de Mercator em radianos
const plano = ll => proj0(ll);
const larguraPlano = (km, lat) => km / (R_TERRA * Math.cos(lat * Math.PI / 180));

// view = { x, y, w }: centro no plano e largura visível (em unidades do plano). A tela tem 1920 × 1080.
function enquadrar(lugar, ancora, km) {
  const [px, py] = plano(lugar.coord);
  const w = larguraPlano(km || (lugar.tipo === "bate-volta" ? KM_BATE_VOLTA : KM_CIDADE), lugar.coord[1]), k = 1920 / w;
  return { x: px - (ancora[0] - 960) / k, y: py - (ancora[1] - 540) / k, w };
}

// Enquadra o trecho inteiro (saída, chegada e a flecha do arco) sem mexer a câmera durante a viagem.
// Deixa espaço para o HUD em cima (e o nome do pin, que fica acima do ponto) e para a legenda embaixo.
function enquadrarTrecho(orig, dest, arco) {
  const a = plano(orig.coord), b = plano(dest.coord), dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const apice = .25 * a[1] + .5 * ((a[1] + b[1]) / 2 - dist * arco) + .25 * b[1];
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1], apice), y1 = Math.max(a[1], b[1]);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, lat = (orig.coord[1] + dest.coord[1]) / 2;
  const w = Math.max((x1 - x0) * 1920 / 1400, (y1 - y0) * 1920 / 560, larguraPlano(KM_CIDADE, lat)), k = 1920 / w;
  return { x: cx, y: cy - (620 - 540) / k, w };   // o centro do trecho fica um pouco abaixo do meio da tela
}

// Enquadra a rota inteira na metade direita da tela, deixando a esquerda para o cartão do encerramento.
function enquadrarRota(rastros, L, V) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const r of rastros) {
    const a = plano(L[r.de].coord), b = plano(L[r.para].coord), dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const apice = .25 * a[1] + .5 * ((a[1] + b[1]) / 2 - dist * V[r.veiculo].arco) + .25 * b[1];
    x0 = Math.min(x0, a[0], b[0]); x1 = Math.max(x1, a[0], b[0]); y0 = Math.min(y0, a[1], b[1], apice); y1 = Math.max(y1, a[1], b[1]);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = Math.max((x1 - x0) * 1920 / 1000, (y1 - y0) * 1920 / 720), k = 1920 / w;
  return { x: cx - (1330 - 960) / k, y: cy - (560 - 540) / k, w };
}

// noite do fim do crepúsculo civil até o nascer do sol; tarde de 90 min antes do pôr do sol até o fim do crepúsculo; dia no resto
function faseDoSol(coord, ms) {
  const t = SunCalc.getTimes(new Date(ms), coord[1], coord[0]);
  if (isNaN(t.sunrise) || isNaN(t.dusk)) return "dia";
  if (ms < t.sunrise || ms >= t.dusk) return "noite";
  if (ms >= t.sunset.getTime() - 90 * 60000) return "tarde";
  return "dia";
}

const pad2 = n => String(n).padStart(2, "0");
// ms é a hora local do lugar escrita como se fosse UTC, só para o relógio interpolar entre duas horas locais
const relogioDe = (texto, lugar) => ({ data: texto.slice(8, 10) + "/" + texto.slice(5, 7), hora: texto.slice(11, 16), cidade: lugar.nome,
  ms: Date.UTC(+texto.slice(0, 4), +texto.slice(5, 7) - 1, +texto.slice(8, 10), +texto.slice(11, 13), +texto.slice(14, 16)) });
const distKm = (a, b) => {   // haversine
  const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TERRA * Math.asin(Math.sqrt(h));
};

function construirEstados(roteiro, lugares, veiculos) {
  const L = Object.fromEntries(lugares.map(l => [l.id, l])), V = Object.fromEntries(veiculos.map(v => [v.id, v]));
  const S = [], pins = new Set(), rastros = [];
  let elenco = [], viewAnterior = null;
  const dia = p => p.quando.slice(0, 10);

  roteiro.forEach((p, i) => {
    const orig = L[p.lugar], dest = p.destino ? L[p.destino] : orig, desloc = p.tipo === "deslocamento";
    const ini = utcDe(p.quando, orig.tz), fim = desloc ? utcDe(p.chegada, dest.tz) : ini;
    const ant = roteiro[i - 1], prox = roteiro[i + 1];

    // carrossel: todos os cards do mesmo dia, na ordem do roteiro
    const doDia = roteiro.map((q, j) => (q.tipo === "atividade" && dia(q) === dia(p) ? j : -1)).filter(j => j >= 0);
    const carrVisivel = p.tipo === "atividade";
    const carrAntes = !!ant && ant.tipo === "atividade";
    const carr = {
      visivel: carrVisivel, dia: dia(p), cards: doDia, ativo: doDia.indexOf(i),
      antes: carrAntes ? { dia: dia(ant), ativo: S[i - 1].carrossel.ativo } : null,
      // o baralho entra de baixo quando não havia baralho na tela ou era de outro dia
      entra: carrVisivel && !(carrAntes && dia(ant) === dia(p)),
      saiAntes: carrAntes && !(carrVisivel && dia(ant) === dia(p)),
    };

    // pins: primeira visita. O pin da saída surge antes do veículo e o da chegada só depois que o veículo chega.
    const novosSaida = [], novosChegada = [];
    if (!pins.has(orig.id)) { pins.add(orig.id); novosSaida.push(orig.id); }
    if (!pins.has(dest.id)) { pins.add(dest.id); novosChegada.push(dest.id); }
    const pinsDepois = [...pins];

    // rastros: acumulam todos os deslocamentos
    const novoRastro = desloc ? { de: p.lugar, para: p.destino, veiculo: p.veiculo } : null;
    const rastrosAntes = rastros.slice();
    if (novoRastro) rastros.push(novoRastro);

    // câmera
    const ancora = carrVisivel ? ANCORA_CARROSSEL : ANCORA_CENTRO;
    const para = desloc ? enquadrarTrecho(orig, dest, V[p.veiculo].arco) : p.tipo === "encerramento" ? enquadrarRota(rastros, L, V) : enquadrar(dest, ancora);
    const de = viewAnterior || para;

    // luz
    let luz;
    if (!desloc) luz = [{ em: 0, fase: faseDoSol(orig.coord, ini) }];
    else {
      luz = []; const N = 48;
      for (let k = 0; k <= N; k++) {
        const f = k / N, ll = [lerp(orig.coord[0], dest.coord[0], f), lerp(orig.coord[1], dest.coord[1], f)];
        const fase = faseDoSol(ll, lerp(ini, fim, f));
        if (!luz.length || luz[luz.length - 1].fase !== fase) luz.push({ em: f, fase });
      }
    }

    // relógio
    const relogio = { de: relogioDe(p.quando, orig), para: desloc ? relogioDe(p.chegada, dest) : relogioDe(p.quando, orig) };

    const dist = desloc ? distKm(orig.coord, dest.coord) : 0;
    const volta = desloc && roteiro.slice(Math.max(0, i - 3), i).some(q => q.tipo === "deslocamento" && q.lugar === p.destino && q.destino === p.lugar);

    S.push({
      i, passo: p, orig, dest, desloc, ini, fim, dist, volta,
      relogio, luz, camera: { de, para }, ancora,
      pins: { depois: pinsDepois, novosSaida, novosChegada, novos: [...novosSaida, ...novosChegada] }, rastros: { antes: rastrosAntes, novo: novoRastro },
      elenco: { antes: elenco, depois: p.pessoas }, carrossel: carr,
      veiculo: desloc ? V[p.veiculo] : null,
    });
    elenco = p.pessoas; viewAnterior = para;
  });
  return S;
}

// soma dos custos até o passo i (inclusive), em centavos de real, com o câmbio atual
function totalAte(roteiro, i) {
  let t = 0;
  for (let j = 0; j <= i; j++) for (const c of roteiro[j].custos || []) t += Math.round(CAMBIO.reais(c.valor, c.moeda) * 100);
  return t;
}
