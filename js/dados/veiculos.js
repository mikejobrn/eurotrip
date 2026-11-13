// Catálogo de veículos. arco é a flecha do trajeto em relação à distância (0,18 = 18%).
// assentos é a lotação máxima do veículo: acima do número de janelas do desenho, as cabeças
// se espalham pela carroceria e transbordam (o motor decide o espaçamento na Fase 4).
const VEICULOS_CATALOGO = [
  { id: "carro",  som: "carro",  arco: 0.05, assentos: 4, sprite: "assets/veiculos/carro.svg" },
  { id: "aviao",  som: "aviao",  arco: 0.18, assentos: 8, sprite: "assets/veiculos/aviao.svg" },
  { id: "trem",   som: "trem",   arco: 0.05, assentos: 8, sprite: "assets/veiculos/trem.svg" },
  { id: "onibus", som: "onibus", arco: 0.05, assentos: 8, sprite: "assets/veiculos/onibus.svg" },
  { id: "barco",  som: "barco",  arco: 0.05, assentos: 8, sprite: "assets/veiculos/barco.svg" },
];
