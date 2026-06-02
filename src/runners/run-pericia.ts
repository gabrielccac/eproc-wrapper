import { isPericiaEvent, parsePericia } from "../eproc/pericia";

const payload = {
  label: "Perícia designada",
  descricao:
    "Perícia designada - Periciado: JOAO DA SILVA Data: 20/05/2026 às 09:30. Local: Rua Exemplo, 100 - Sala 2. Perito: Dra. Fulana de Tal",
};

function main(): void {
  const isPericia = isPericiaEvent({
    label: payload.label,
    descricao: payload.descricao,
  });
  const parsed = parsePericia(payload.descricao);

  console.log(JSON.stringify({ isPericia, parsed }, null, 2));
}

main();
