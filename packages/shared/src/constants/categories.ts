export interface Category {
  slug: string;
  name: string;
  subcategories: Subcategory[];
}

export interface Subcategory {
  slug: string;
  name: string;
}

export const CATEGORIES: Category[] = [
  {
    slug: "odyag",
    name: "Одяг",
    subcategories: [
      { slug: "futbolky", name: "Футболки" },
      { slug: "sorochky", name: "Сорочки" },
      { slug: "svitshoty", name: "Світшоти" },
      { slug: "svetry", name: "Светри" },
      { slug: "kurtky", name: "Куртки" },
      { slug: "zhylety", name: "Жилети" },
      { slug: "dzhinsy", name: "Джинси" },
      { slug: "shtany", name: "Штани" },
      { slug: "shorty", name: "Шорти" },
      { slug: "sportyvni-shtany", name: "Спортивні штани" },
      { slug: "bluzy", name: "Блузи" },
      { slug: "pizhamy", name: "Піжами" },
      { slug: "bilyzna", name: "Білизна" },
      { slug: "kupalniky", name: "Купальники" },
      { slug: "miks-odyag", name: "Мікс" },
      { slug: "sportyvnyy-odyag", name: "Спортивний одяг" },
      { slug: "kofty-flisovi", name: "Кофти флісові" },
      { slug: "robochyy-odyag", name: "Робочий одяг" },
      { slug: "shkarpetky", name: "Шкарпетки" },
      { slug: "losyny", name: "Лосини" },
      { slug: "kolhotky", name: "Колготки" },
      { slug: "lyzhnyy-odyag", name: "Лижний одяг" },
      { slug: "spets-odyah", name: "Спец-одяг" },
      { slug: "vitrovky-shtormovky", name: "Вітровки та штормовки" },
      { slug: "sukni-spidnytsi", name: "Сукні та спідниці" },
      { slug: "inshe-odyag", name: "Інше" },
      { slug: "xxl-veliki-rozmiry", name: "Великі розміри (XXL+)" },
    ],
  },
  {
    slug: "vzuttia",
    name: "Взуття",
    subcategories: [
      { slug: "krosivky", name: "Кросівки" },
      { slug: "cherevyky", name: "Черевики" },
      { slug: "choboty", name: "Чоботи" },
      { slug: "tufli", name: "Туфлі" },
      { slug: "sandali", name: "Сандалі" },
      { slug: "shlopantsi", name: "Шльопанці" },
      { slug: "humove-vzuttia", name: "Гумове взуття" },
      { slug: "roboche-vzuttia", name: "Робоче взуття" },
      { slug: "sportyvne-vzuttia", name: "Спортивне взуття" },
      { slug: "inshe-vzuttia", name: "Інше" },
    ],
  },
  {
    slug: "aksesuary",
    name: "Аксесуари",
    subcategories: [
      { slug: "sumky", name: "Сумки" },
      { slug: "remeni", name: "Ремені" },
      { slug: "holovni-ubory", name: "Головні убори" },
      { slug: "rukavytsi", name: "Рукавиці" },
      { slug: "inshe-aksesuary", name: "Інше" },
    ],
  },
  {
    slug: "dim-ta-pobut",
    name: "Дім та побут",
    subcategories: [
      { slug: "postil", name: "Постіль" },
      { slug: "shtory", name: "Штори" },
      { slug: "rushnyky", name: "Рушники" },
      { slug: "kovdry", name: "Ковдри" },
      { slug: "pryazha", name: "Пряжа" },
      { slug: "agd", name: "AGD" },
      { slug: "inshe-dim", name: "Інше" },
    ],
  },
  {
    slug: "igrashky",
    name: "Іграшки",
    subcategories: [
      { slug: "miaki", name: "М'які" },
      { slug: "plastykovi", name: "Пластикові" },
    ],
  },
  {
    slug: "bric-a-brac",
    name: "Bric-a-Brac",
    subcategories: [{ slug: "miks-bric", name: "Мікс" }],
  },
  {
    slug: "kosmetyka",
    name: "Косметика",
    subcategories: [{ slug: "miks-kosmetyka", name: "Мікс" }],
  },
];

export const OVERSIZE_SLUG = "xxl-veliki-rozmiry";
