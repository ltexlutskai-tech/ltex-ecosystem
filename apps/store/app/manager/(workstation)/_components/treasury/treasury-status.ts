/** Валюта → символ для відображення сум у формах. */
export function currencySymbol(currency: string): string {
  switch (currency) {
    case "EUR":
      return "€";
    case "USD":
      return "$";
    case "UAH":
    default:
      return "₴";
  }
}
