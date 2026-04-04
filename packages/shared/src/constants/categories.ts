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
      { slug: "tolstovky", name: "Толстовки" },
      { slug: "svetry", name: "Светри" },
      { slug: "kurtky", name: "Куртки" },
      { slug: "palto", name: "Пальто" },
      { slug: "zhylety", name: "Жилети" },
      { slug: "dzhinsy", name: "Джинси" },
      { slug: "shtany", name: "Штани" },
      { slug: "shorty", name: "Шорти" },
      { slug: "sportyvni-shtany", name: "Спортивні штани" },
      { slug: "sukni", name: "Сукні" },
      { slug: "spidnytsi", name: "Спідниці" },
      { slug: "bluzy", name: "Блузи" },
      { slug: "pizhamy", name: "Піжами" },
      { slug: "bilyzna", name: "Білизна" },
      { slug: "kupalniky", name: "Купальники" },
      { slug: "kostyumy", name: "Костюми" },
      { slug: "kombinezony", name: "Комбінезони" },
      { slug: "verhniiy-odyag", name: "Верхній одяг" },
      { slug: "dytiachyi-odyag", name: "Дитячий одяг" },
      { slug: "inshe-odyag", name: "Інше" },
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
      { slug: "inshe-vzuttia", name: "Інше" },
    ],
  },
  {
    slug: "aksesuary",
    name: "Аксесуари",
    subcategories: [
      { slug: "sumky", name: "Сумки" },
      { slug: "remeni", name: "Ремені" },
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
