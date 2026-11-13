// Câmbio do euro em reais. O valor padrão (R$ 5,90) é o da aba Orçamento da planilha e serve de reserva: euro comercial de 16/10/2026 (R$ 5,706) com 3,5% do cartão Ultravioleta (IOF devolvido e spread de 3,5%, ou IOF de 3,5% na Conta Global).
// Ao abrir a apresentação, carregar() troca o padrão pela cotação atual do euro turismo (AwesomeAPI, par EUR-BRLT, ponta de venda).
const CAMBIO = {
  padrao: 5.90,
  eur: 5.90,
  origem: "padrão da planilha",
  async carregar(limiteMs = 4000) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), limiteMs);
      const r = await fetch("https://economia.awesomeapi.com.br/json/last/EUR-BRLT", { signal: ctl.signal });
      clearTimeout(t);
      const ask = parseFloat((await r.json()).EURBRLT.ask);
      if (ask > 2 && ask < 20) { this.eur = ask; this.origem = "euro turismo, AwesomeAPI"; }
    } catch (e) { /* sem rede: fica o valor padrão */ }
    return this.eur;
  },
  // valor por pessoa (BRL ou EUR) em reais
  reais(valor, moeda) { return moeda === "EUR" ? valor * this.eur : valor; },
};
