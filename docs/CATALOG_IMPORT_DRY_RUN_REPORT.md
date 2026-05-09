# Catalog Import Report (DRY-RUN)

Generated: 2026-05-07T11:38:08.689Z

Source: `Повний каталог товарів.xlsx`

DB connected: **no — offline mode** (DB-dependent sections empty; re-run on the server with DATABASE_URL set for accurate counts)


## Summary

- Total Excel rows: **709**
- Skipped: **1**
- To CREATE: **708**
- To UPDATE: **0**
- To DELETE (not in Excel): **0**
- DB products that block deletion (have orders): **0**
- Categories to ADD: **59**
- Categories DEPRECATED (migrate + drop): **8**

## Categories to ADD

- `odyag` ("Одяг") under `(top-level)`
- `futbolky` ("Футболки") under `odyag`
- `sorochky` ("Сорочки") under `odyag`
- `svitshoty` ("Світшоти") under `odyag`
- `svetry` ("Светри") under `odyag`
- `kurtky` ("Куртки") under `odyag`
- `zhylety` ("Жилети") under `odyag`
- `dzhinsy` ("Джинси") under `odyag`
- `shtany` ("Штани") under `odyag`
- `shorty` ("Шорти") under `odyag`
- `sportyvni-shtany` ("Спортивні штани") under `odyag`
- `bluzy` ("Блузи") under `odyag`
- `pizhamy` ("Піжами") under `odyag`
- `bilyzna` ("Білизна") under `odyag`
- `kupalniky` ("Купальники") under `odyag`
- `miks-odyag` ("Мікс") under `odyag`
- `sportyvnyy-odyag` ("Спортивний одяг") under `odyag`
- `kofty-flisovi` ("Кофти флісові") under `odyag`
- `robochyy-odyag` ("Робочий одяг") under `odyag`
- `shkarpetky` ("Шкарпетки") under `odyag`
- `losyny` ("Лосини") under `odyag`
- `kolhotky` ("Колготки") under `odyag`
- `lyzhnyy-odyag` ("Лижний одяг") under `odyag`
- `spets-odyah` ("Спец-одяг") under `odyag`
- `vitrovky-shtormovky` ("Вітровки та штормовки") under `odyag`
- `sukni-spidnytsi` ("Сукні та спідниці") under `odyag`
- `inshe-odyag` ("Інше") under `odyag`
- `vzuttia` ("Взуття") under `(top-level)`
- `krosivky` ("Кросівки") under `vzuttia`
- `cherevyky` ("Черевики") under `vzuttia`
- `choboty` ("Чоботи") under `vzuttia`
- `tufli` ("Туфлі") under `vzuttia`
- `sandali` ("Сандалі") under `vzuttia`
- `shlopantsi` ("Шльопанці") under `vzuttia`
- `humove-vzuttia` ("Гумове взуття") under `vzuttia`
- `roboche-vzuttia` ("Робоче взуття") under `vzuttia`
- `sportyvne-vzuttia` ("Спортивне взуття") under `vzuttia`
- `inshe-vzuttia` ("Інше") under `vzuttia`
- `aksesuary` ("Аксесуари") under `(top-level)`
- `sumky` ("Сумки") under `aksesuary`
- `remeni` ("Ремені") under `aksesuary`
- `holovni-ubory` ("Головні убори") under `aksesuary`
- `rukavytsi` ("Рукавиці") under `aksesuary`
- `inshe-aksesuary` ("Інше") under `aksesuary`
- `dim-ta-pobut` ("Дім та побут") under `(top-level)`
- `postil` ("Постіль") under `dim-ta-pobut`
- `shtory` ("Штори") under `dim-ta-pobut`
- `rushnyky` ("Рушники") under `dim-ta-pobut`
- `kovdry` ("Ковдри") under `dim-ta-pobut`
- `pryazha` ("Пряжа") under `dim-ta-pobut`
- `agd` ("AGD") under `dim-ta-pobut`
- `inshe-dim` ("Інше") under `dim-ta-pobut`
- `igrashky` ("Іграшки") under `(top-level)`
- `miaki` ("М'які") under `igrashky`
- `plastykovi` ("Пластикові") under `igrashky`
- `bric-a-brac` ("Bric-a-Brac") under `(top-level)`
- `miks-bric` ("Мікс") under `bric-a-brac`
- `kosmetyka` ("Косметика") under `(top-level)`
- `miks-kosmetyka` ("Мікс") under `kosmetyka`

## DEPRECATED categories migration

- `tolstovky` → `svitshoty`: -1 product(s) to migrate
- `palto` → `kurtky`: -1 product(s) to migrate
- `verhniiy-odyag` → `kurtky`: -1 product(s) to migrate
- `dytiachyi-odyag` → `inshe-odyag`: -1 product(s) to migrate
- `kostyumy` → `inshe-odyag`: -1 product(s) to migrate
- `kombinezony` → `inshe-odyag`: -1 product(s) to migrate
- `sukni` → `sukni-spidnytsi`: -1 product(s) to migrate
- `spidnytsi` → `sukni-spidnytsi`: -1 product(s) to migrate

## Issues found

### Without `Цена продажи` (2 SKU — imported with inStock=false)

- `L.MIX Sleepwear M` — Піжами чоловічі  демісезон Livergy Сток (1447)
- `Livarno 50*36` — Подушки ортопедичні Livarno Сток(1894), , 5

### Without `Количество (шт)` (263 SKU)

`(G) C&A SHOES`, `(G) Street One`, `(G) Street One Premium M`, `(Y) WORK MIX`, `105`, `209`, `229`, `101710899 Working Clothes`, `10213`, `10537`, `10613`, `10843`, `10983`, `11293`, `11313`, `11391`, `11392`, `11393`, `11582`, `12077`, `12263`, `13118`, `13205`, `19020`, `19078`, `19099`, `19951`, `19953`, `20141`, `20582`, `20652`, `20782`, `21001`, `21101`, `21102`, `21122`, `21201`, `22016`, `22312`, `22821`, `23151`, `24211`, `24972`, `26132`, `29403`, `29663`, `29803`, `29953`, `31012`, `37068`, `37099`, `41079`, `49038`, `49048`, `52062`, `55012`, `55013`, `55182`, `55186`, `58048`, `58059`, `58065`, `58067`, `58250`, `64035`, `64093`, `64094`, `800510010 TRA`, `800512550 JOGLS`, `80681`, `80702`, `81132`, `81611`, `82252`, `82302`, `82303`, `82372`, `82702`, `83051`, `83102`, `83141`, `84441`, `84761`, `85341`, `85342`, `85441`, `86343`, `86450`, `86503`, `86822`, `87103`, `87113`, `87533`, `87882`, `89213`, `89403`, `89421`, `89743`, `89773`, `90121`, `90573`, `91002`, `91127`, `91152`, `91341`, `92081`, `92082`, `93161`, `93722`, `95921`, `96207`, `96921`, `98617`, `99113`, `99167`, `99273`, `99403`, `99437`, `99503`, `99603`, `99703`, `ADULT FLEECE TOP WITH ZIP`, `ADULT JOGGING SUITS`, `ALDI BRIC AGD A`, `ALDI MIX CH`, `ASP TERREX`, `BAGS TT UK`, `BGS`, `BGS Rieker`, `BOMBER I`, `BOTTOM PANTS`, `Brand Mix New Tex`, `Bric a Brac  C2R+ (Y)`, `Bric a Brac  UN`, `Bric a Brac  UN A+`, `Bric a Brac MIX BAB`, `Bric a Brac SemiSort`, `Bric a Brac Size`, `C&A ACCESSORIES`, `C&A Belts`, `C&A CAPS`, `C&A ECO BAGS`, `CHILD LUX`, `Clogs Joybees CH`, `Clogs Mix`, `CMP`, `Crivit Rucksack`, `Crocs`, `Crocs W`, `ECCO`, `ECCO W`, `ERIMA BAGS`, `FBL - 3`, `FLANEL L+F`, `FLANEL SHIRT FUR`, `FLANEL SHIRT LEGEND`, `FLEE PANTS`, `FLEECE CH R`, `Hanes 0-24m`, `HARD TOYS 10kg`, `HARD TOYS C2R`, `HARD TOYS SC +`, `HHR CREAM V`, `HLPO - F`, `HOKA A`, `HOKA B`, `HOKA B +`, `HOKA C-`, `HOKA D`, `HOMBRE SM`, `Hooded (HEAVY)`, `Hummel Shoes AD A`, `Hummel Shoes CH B`, `Jewellery TT UK`, `Joggers (M)`, `Joging Pants LEGEND I`, `L.MIX`, `L.MIX ADULT`, `L.MIX ANORAKS M`, `L.MIX ANORAKS W`, `L.MIX BRIC A BRAC`, `L.MIX BRIC AGD  A`, `L.MIX BRIC AGD  A+B`, `L.MIX CH SOCKS W`, `L.MIX CHILDREN W`, `L.MIX Esmara Men Cargo`, `L.MIX Glove`, `L.MIX HHR +`, `L.MIX JEANS`, `L.MIX LINGERIE`, `L.MIX M SHORTS`, `L.MIX SKI`, `L.MIX Sleepwear`, `L.MIX Sleepwear M`, `L.MIX Sleepwear M2`, `L.MIX Socks CRIVIT`, `L.MIX SOCKS M`, `L.MIX SPORT WINTER`, `L.MIX WINTER OR`, `L.MIX WORK W`, `Lingerie NL`, `Livarno 50*36`, `McDonalds Palace`, `MEN NYLON JOGGING`, `MEN NYLON JOGGING EXTRA`, `MEN T-SHIRT R/N`, `MEN T-Shirts S\S XXL`, `Men's Underwear New Tex`, `MENS T-SHIRT  R\N`, `MENS T-SHIRT MIX`, `Merrell_Insulation_Ecco`, `MIGROS CH T-Shirts`, `MTSH`, `New Balance B`, `New Balance С`, `NIKE A`, `NIKE B`, `NIKE C`, `NIKE MIX`, `OSH - X Shorts Extra`, `OSHS - X Sexy Shorts EX`, `OVERSIZE POLAR`, `PARKSIDE FLEECE POLAR`, `PARKSIDE LINGERIE`, `PARKSIDE SOCKS`, `PARKSIDE VESTS`, `PUMA С-`, `Raincoats`, `Salamander/Tamaris`, `SHO - F`, `Sinsay HOME`, `SINSAY Lingerie`, `SINSAY SOCKS SUM`, `SINSEY Socks`, `SJOG - 1`, `SKI Pants I`, `SP-Mix`, `SPANDEX PANTS`, `SPH-Mix Lux`, `Sport Mix Hummel`, `Sport Mix Hummel S`, `Sport Mix Hummel W`, `SPORTS & SWIMM`, `SPT-1 F`, `SPTS Adidas`, `SPTS Sample`, `SPV mix Sport`, `SW - F`, `T-Shirt + Long 1+ BLUE 84`, `T-SHIRT ALTITUDINE`, `T-SHIRT ALTITUDINE I`, `T-SHIRT Extra R/N`, `T-SHIRT FL`, `T-Shirt Parkside`, `Tamaris`, `TAS - F`, `Teva C`, `Towels I`, `TOYS SC`, `TRAINING SPORT SUITS`, `UGG A`, `Vest E.BW`, `WORK MIX`

### Stub descriptions / parsed fields = null (6 SKU)

`(G) Anoraks I`, `11313`, `19021`, `19099`, `87113`, `SKI Pants I`

### Slug collisions (last-wins applied — original retained for first SKU, suffixes for the rest)

- `pizhamy-cholovichi-demisezon-livergy-stok-1447` ← `L.MIX Sleepwear M2`

## Skipped SKUs

- `L.MIX Crivit Football #5` — SKU_CATEGORY_OVERRIDE.slug=null (not in stock)

## Sample CREATE preview (first 3)

```json
[
  {
    "action": "CREATE",
    "articleCode": "(A) Sweaters I",
    "name": "Светри тонкі жіночі демісезон 1й сорт (1358)",
    "slug": "svetry-tonki-zhinochi-demisezon-1y-sort-1358",
    "categorySlug": "svetry",
    "quality": "first",
    "country": "germany",
    "season": "demiseason",
    "priceEur": 4.2,
    "salePriceEur": 2,
    "inStock": true
  },
  {
    "action": "CREATE",
    "articleCode": "(B) Sweatshirt I",
    "name": "Світшоти, кофти з капюшоном мікс демісезон 1й сорт (1081)",
    "slug": "svitshoty-kofty-z-kapyushonom-miks-demisezon-1y-sort-1081",
    "categorySlug": "svitshoty",
    "quality": "first",
    "country": "germany",
    "season": "demiseason",
    "priceEur": 3.2,
    "salePriceEur": 1.8,
    "inStock": true
  },
  {
    "action": "CREATE",
    "articleCode": "(G) Anoraks I",
    "name": "Куртки мікс зима 1й сорт (1235)",
    "slug": "kurtky-miks-zyma-1y-sort-1235",
    "categorySlug": "kurtky",
    "quality": "first",
    "country": "germany",
    "season": "winter",
    "priceEur": 5.5,
    "salePriceEur": null,
    "inStock": true
  }
]
```
