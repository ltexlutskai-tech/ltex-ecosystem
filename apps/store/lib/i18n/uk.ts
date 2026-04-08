export const uk = {
  // Header / Navigation
  nav: {
    catalog: "Каталог",
    lots: "Лоти",
    about: "Про нас",
    contacts: "Контакти",
    cart: "Кошик",
    wishlist: "Обране",
    menu: "Меню",
  },

  // Footer
  footer: {
    categories: "Категорії",
    navigation: "Навігація",
    contactsTitle: "Контакти",
    description:
      "Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від 10 кг.",
    allRights: "Усі права захищені.",
  },

  // Catalog / Product
  catalog: {
    title: "Каталог товарів",
    products: "товарів",
    noResults: "Товарів не знайдено. Спробуйте змінити фільтри.",
    search: "Пошук товарів...",
    allQualities: "Всі якості",
    allSeasons: "Всі сезони",
    allCountries: "Всі країни",
    sortBy: "Сортування",
    priceRange: "Ціна (EUR)",
    clearFilters: "Скинути фільтри",
    lots: "лотів",
    noPhoto: "Немає фото",
  },

  // Product detail
  product: {
    article: "Артикул",
    quality: "Якість",
    season: "Сезон",
    country: "Країна",
    priceUnit: "Од. ціни",
    avgWeight: "Сер. вага",
    description: "Опис",
    watchVideo: "Дивитись відео-огляд",
    availableLots: "Доступні лоти",
    barcode: "Штрихкод",
    weight: "Вага (кг)",
    quantity: "К-сть",
    priceEur: "Ціна EUR",
    status: "Статус",
    similar: "Схожі товари",
    boughtTogether: "Часто купують разом",
    quickView: "Швидкий перегляд",
    details: "Детальніше",
  },

  // Cart / Checkout
  cart: {
    title: "Кошик",
    empty: "Кошик порожній",
    addFromCatalog: "Додайте лоти з каталогу",
    toCatalog: "До каталогу",
    product: "Товар",
    barcode: "Штрихкод",
    weight: "Вага",
    priceEur: "Ціна EUR",
    clearCart: "Очистити кошик",
    summary: "Підсумок",
    lotsCount: "Лотів",
    totalWeight: "Загальна вага",
    total: "Сума",
    minWeight: "Мінімальне замовлення — від {min} кг. Зараз: {current} кг",
    name: "Ім'я / Назва",
    phone: "Телефон",
    telegram: "Telegram",
    comment: "Коментар",
    submit: "Оформити замовлення",
    submitting: "Оформлення...",
    networkError: "Помилка мережі",
  },

  // Order
  order: {
    confirmed: "Замовлення оформлено!",
    confirmMessage:
      "Дякуємо за замовлення! Ми зв'яжемося з вами найближчим часом для підтвердження.",
    details: "Деталі замовлення",
    orderId: "Замовлення",
    date: "Дата",
    client: "Клієнт",
    phoneLabel: "Телефон",
    items: "позицій",
    continueShopping: "Продовжити покупки",
    trackStatus: "Стан замовлення",
    statusTitle: "Стан замовлення",
    currentStatus: "Поточний статус",
    cancelled: "Це замовлення було скасовано",
    delivery: "Доставка",
    tracking: "Трекінг",
    estimatedDate: "Очікувана дата",
    backToCatalog: "Повернутися до каталогу",
  },

  // Wishlist
  wishlist: {
    title: "Обране",
    empty: "Список обраного порожній",
    addHint:
      "Натисніть на серце на картці товару, щоб додати його сюди",
    addToWishlist: "Додати до обраного",
    removeFromWishlist: "Видалити з обраного",
  },

  // Comparison
  compare: {
    title: "Порівняння товарів",
    minItems: "Додайте мінімум 2 товари для порівняння",
    clearAll: "Очистити все",
    compare: "Порівняти",
    addToCompare: "Порівняти",
    removeFromCompare: "Прибрати з порівняння",
  },

  // Recently Viewed
  recentlyViewed: {
    title: "Нещодавно переглянуті",
  },

  // Homepage
  home: {
    heroDescription:
      "Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від {min} кг. Одяг, взуття, аксесуари з Англії, Німеччини, Канади та Польщі.",
    categoriesTitle: "Категорії товарів",
    productsCount: "товарів",
    features: [
      {
        title: "Від 10 кг",
        desc: "Мінімальне замовлення для гуртових покупців",
      },
      {
        title: "4 країни",
        desc: "Англія, Німеччина, Канада, Польща — якісний товар",
      },
      {
        title: "Відеоогляди",
        desc: "YouTube відео для кожного товару — бачите що купуєте",
      },
      {
        title: "Швидка доставка",
        desc: "Відправка по Україні Новою Поштою та Делівері",
      },
    ],
    ctaTitle: "Є питання?",
    ctaDescription: "Зв'яжіться з нами через Telegram або по телефону",
  },

  // Common
  common: {
    loading: "Завантаження...",
    error: "Помилка",
    back: "Назад",
    next: "Далі",
    save: "Зберегти",
    cancel: "Скасувати",
    delete: "Видалити",
    search: "Шукати",
    reset: "Скинути",
    noData: "Немає даних",
    page: "Сторінка",
    of: "з",
    records: "записів",
    skipToContent: "Перейти до основного вмісту",
  },
} as const;

export type Dictionary = typeof uk;
