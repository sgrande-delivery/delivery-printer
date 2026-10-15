// The seven values of PrinterStationEnum in the delivery-api
// (core/Printer/Domain/Enums/PrinterStationEnum.php). Keyed by the raw value so a reader
// can fall back to it, and an eighth station added there shows up as itself instead of
// blank — which is also why this is not a literal union.
export const stations: Record<string, string> = {
  kitchen: 'Cozinha',
  bar: 'Bar',
  pizza: 'Pizza',
  counter: 'Balcão',
  cashier: 'Caixa',
  dessert: 'Sobremesa',
  sushi: 'Sushi',
};
