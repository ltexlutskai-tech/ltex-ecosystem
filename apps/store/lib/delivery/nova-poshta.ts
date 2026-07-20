/**
 * Nova Poshta API v2.0 client.
 *
 * Усі виклики йдуть POST на https://api.novaposhta.ua/v2.0/json/ з тілом
 * `{ apiKey, modelName, calledMethod, methodProperties }` і повертають
 * `{ success, data, errors, warnings }`.
 *
 * Ключ читається з `process.env.NOVA_POSHTA_API_KEY`. Якщо ключа немає —
 * функції НЕ кидають, а повертають `success:false` з поясненням у `errors`
 * (щоб UI/бекенд не падали, коли інтеграцію ще не налаштовано).
 *
 * Дзеркалить стиль наявного `trackNovaPoshta` у
 * `app/api/mobile/shipments/route.ts` (той самий endpoint + модель Tracking).
 */

const NOVA_POSHTA_API = "https://api.novaposhta.ua/v2.0/json/";
const REQUEST_TIMEOUT_MS = 15_000;

// ─── Типи відповіді NP ───────────────────────────────────────────────────────

export interface NovaPoshtaResponse<T> {
  success: boolean;
  data: T[];
  errors: string[];
  warnings: string[];
}

// ─── Мапи доменних типів ─────────────────────────────────────────────────────

export interface NpCity {
  ref: string;
  name: string;
  area: string;
}

export interface NpWarehouse {
  ref: string;
  number: string;
  name: string;
  typeRef: string;
  maxWeight: number;
}

export interface NpCounterparty {
  ref: string;
  description: string;
}

export interface NpContact {
  ref: string;
  phone?: string;
}

export interface NpRecipient {
  counterpartyRef: string;
  contactRef: string;
}

export interface NpTracking {
  status: string;
  statusCode: string;
  scheduledDeliveryDate: string;
  recipientAddress: string;
  warehouseRecipient: string;
}

export interface NpCreatedTtn {
  ref: string;
  number: string;
  costUah: string;
  estimatedDeliveryDate: string;
}

// ─── Вхідні типи ─────────────────────────────────────────────────────────────

export interface NpSeatOption {
  volumetricVolume?: number;
  volumetricWidth: number;
  volumetricLength: number;
  volumetricHeight: number;
  weight: number;
}

export interface CreateTtnInput {
  payerType?: "Recipient" | "Sender";
  paymentMethod?: "Cash" | "NonCash";
  cargoType: "Parcel" | "Pallet";
  /** Вага, кг. */
  weight: number;
  serviceType: "WarehouseWarehouse" | "WarehouseDoors";
  seatsAmount: number;
  /** Загальна назва вантажу. */
  description: string;
  /** Оголошена вартість, ₴. */
  cost: number;

  senderCounterpartyRef: string;
  senderContactRef: string;
  citySenderRef: string;
  senderWarehouseRef: string;
  senderPhone: string;

  recipientCounterpartyRef: string;
  recipientContactRef: string;
  cityRecipientRef: string;
  /** Ref відділення отримувача (для WarehouseWarehouse). */
  recipientWarehouseRef?: string;
  /** Назва адреси отримувача (для WarehouseDoors). */
  recipientAddressName?: string;
  recipientPhone: string;
  recipientName: string;

  /** Дата відправлення у форматі ddMMyyyy. */
  dateTime?: string;

  /**
   * Класична післяплата (₴) — гроші повертають ГОТІВКОЮ на відділенні
   * відправника (`BackwardDeliveryData` CargoType Money). Потребує послуги
   * «Післяплата». L-TEX цим НЕ користується (див. afterpaymentOnGoodsCost).
   */
  backwardDeliveryCod?: number;

  /**
   * «Контроль оплати» (₴) — сума, яку отримувач платить при отриманні, а гроші
   * йдуть на РАХУНОК відправника через NovaPay (`AfterpaymentOnGoodsCost`).
   * Це механізм накладки L-TEX. Потребує послуги «Контроль оплати» на ключі/
   * договорі NovaPay (інакше NP поверне «AfterpaymentOnGoodsCost недоступний»).
   */
  afterpaymentOnGoodsCost?: number;

  /** Габарити місць (см) + вага (кг). Коли задано — додається OptionsSeat. */
  optionsSeat?: NpSeatOption[];
}

export interface CreateTtnResult {
  ref: string;
  number: string;
  costUah: string;
  estimatedDeliveryDate: string;
}

// ─── Низькорівневий виклик ───────────────────────────────────────────────────

/**
 * Низькорівневий виклик NP API. НЕ кидає — усі помилки повертаються у `errors`.
 */
export async function callNovaPoshta<T>(
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, unknown>,
): Promise<NovaPoshtaResponse<T>> {
  const apiKey = process.env.NOVA_POSHTA_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      data: [],
      errors: ["NOVA_POSHTA_API_KEY not set"],
      warnings: [],
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(NOVA_POSHTA_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        modelName,
        calledMethod,
        methodProperties,
      }),
      signal: controller.signal,
    });

    const json = (await res.json()) as {
      success?: boolean;
      data?: T[];
      errors?: unknown[];
      warnings?: unknown[];
    };

    return {
      success: json.success === true,
      data: Array.isArray(json.data) ? json.data : [],
      errors: normalizeMessages(json.errors),
      warnings: normalizeMessages(json.warnings),
    };
  } catch (err) {
    return {
      success: false,
      data: [],
      errors: [err instanceof Error ? err.message : String(err)],
      warnings: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** NP іноді віддає errors/warnings масивом рядків, іноді об'єктом. */
function normalizeMessages(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((m) => (typeof m === "string" ? m : String(m)));
  }
  if (raw && typeof raw === "object") {
    return Object.values(raw).map((m) =>
      typeof m === "string" ? m : String(m),
    );
  }
  return [];
}

// ─── Адреси: міста / відділення ──────────────────────────────────────────────

interface RawCity {
  Ref: string;
  Description: string;
  AreaDescription: string;
}

export async function searchCities(
  query: string,
  limit?: number,
): Promise<NpCity[]> {
  const res = await callNovaPoshta<RawCity>("Address", "getCities", {
    FindByString: query,
    Limit: String(limit ?? 20),
  });
  return res.data.map((c) => ({
    ref: c.Ref,
    name: c.Description,
    area: c.AreaDescription,
  }));
}

interface RawWarehouse {
  Ref: string;
  Number: string;
  Description: string;
  TypeOfWarehouseRef: string;
  TotalMaxWeightAllowed: string;
}

export async function getWarehouses(
  cityRef: string,
  query?: string,
  limit?: number,
): Promise<NpWarehouse[]> {
  const res = await callNovaPoshta<RawWarehouse>("Address", "getWarehouses", {
    CityRef: cityRef,
    FindByString: query ?? "",
    Limit: String(limit ?? 50),
  });
  return res.data.map((w) => ({
    ref: w.Ref,
    number: w.Number,
    name: w.Description,
    typeRef: w.TypeOfWarehouseRef,
    maxWeight: Number(w.TotalMaxWeightAllowed) || 0,
  }));
}

// ─── Відправник (кешується, бо змінюється рідко) ─────────────────────────────

interface RawCounterparty {
  Ref: string;
  Description: string;
}

let senderCounterpartyCache: Promise<NpCounterparty | null> | null = null;

export function getSenderCounterparty(): Promise<NpCounterparty | null> {
  if (!senderCounterpartyCache) {
    senderCounterpartyCache = callNovaPoshta<RawCounterparty>(
      "Counterparty",
      "getCounterparties",
      { CounterpartyProperty: "Sender", Page: "1" },
    ).then((res) => {
      const first = res.data[0];
      if (!first) {
        // Не кешуємо порожній результат — щоб повторний виклик спробував знову.
        senderCounterpartyCache = null;
        return null;
      }
      return { ref: first.Ref, description: first.Description };
    });
  }
  return senderCounterpartyCache;
}

interface RawContact {
  Ref: string;
  Phones?: string;
}

const senderContactCache = new Map<string, Promise<NpContact | null>>();

export function getSenderContact(
  counterpartyRef: string,
): Promise<NpContact | null> {
  const cached = senderContactCache.get(counterpartyRef);
  if (cached) return cached;

  const promise = callNovaPoshta<RawContact>(
    "Counterparty",
    "getCounterpartyContactPersons",
    { Ref: counterpartyRef, Page: "1" },
  ).then((res) => {
    const first = res.data[0];
    if (!first) {
      senderContactCache.delete(counterpartyRef);
      return null;
    }
    return { ref: first.Ref, phone: first.Phones };
  });

  senderContactCache.set(counterpartyRef, promise);
  return promise;
}

// ─── Отримувач (створення приватної особи) ───────────────────────────────────

interface RawSaveCounterparty {
  Ref: string;
  ContactPerson?: { data?: Array<{ Ref: string }> };
}

export async function ensureRecipientPrivatePerson(input: {
  firstName: string;
  lastName: string;
  middleName?: string;
  phone: string;
}): Promise<NpRecipient | { error: string }> {
  const res = await callNovaPoshta<RawSaveCounterparty>(
    "Counterparty",
    "save",
    {
      FirstName: input.firstName,
      MiddleName: input.middleName ?? "",
      LastName: input.lastName,
      Phone: input.phone,
      CounterpartyType: "PrivatePerson",
      CounterpartyProperty: "Recipient",
    },
  );

  const first = res.data[0];
  const contactRef = first?.ContactPerson?.data?.[0]?.Ref;
  if (!res.success || !first || !contactRef) {
    return { error: res.errors[0] ?? "Не вдалося створити отримувача" };
  }
  return { counterpartyRef: first.Ref, contactRef };
}

// ─── ТТН (експрес-накладна) ──────────────────────────────────────────────────

interface RawInternetDocument {
  Ref: string;
  IntDocNumber: string;
  CostOnSite: string;
  EstimatedDeliveryDate: string;
}

/**
 * Будує methodProperties для InternetDocument.save/update з CreateTtnInput,
 * мапуючи наші поля на назви NP.
 *
 * NB (WarehouseDoors): адресна доставка вимагає окремого street-address flow
 * (Address.save → RecipientAddress = ref адреси). Для Phase 0 повноцінно
 * підтримано лише WarehouseWarehouse; для WarehouseDoors без
 * recipientWarehouseRef поле RecipientAddress опускається.
 * TODO(NP): реалізувати створення адреси отримувача (вулиця/будинок/квартира).
 */
export function buildTtnMethodProperties(
  input: CreateTtnInput,
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    PayerType: input.payerType ?? "Recipient",
    PaymentMethod: input.paymentMethod ?? "Cash",
    CargoType: input.cargoType,
    Weight: String(input.weight),
    ServiceType: input.serviceType,
    SeatsAmount: String(input.seatsAmount),
    Description: input.description,
    Cost: String(input.cost),
    CitySender: input.citySenderRef,
    Sender: input.senderCounterpartyRef,
    SenderAddress: input.senderWarehouseRef,
    ContactSender: input.senderContactRef,
    SendersPhone: input.senderPhone,
    CityRecipient: input.cityRecipientRef,
    Recipient: input.recipientCounterpartyRef,
    ContactRecipient: input.recipientContactRef,
    RecipientsPhone: input.recipientPhone,
    NewAddress: "1",
  };

  if (input.recipientWarehouseRef) {
    props.RecipientAddress = input.recipientWarehouseRef;
  }
  // else: WarehouseDoors — потрібен окремий адресний flow (див. TODO вище).

  if (input.dateTime) {
    props.DateTime = input.dateTime;
  }

  if (typeof input.backwardDeliveryCod === "number") {
    props.BackwardDeliveryData = [
      {
        PayerType: "Recipient",
        CargoType: "Money",
        RedeliveryString: String(input.backwardDeliveryCod),
      },
    ];
  }

  // «Контроль оплати» (гроші на рахунок відправника через NovaPay).
  if (typeof input.afterpaymentOnGoodsCost === "number") {
    props.AfterpaymentOnGoodsCost = String(input.afterpaymentOnGoodsCost);
  }

  if (input.optionsSeat && input.optionsSeat.length > 0) {
    props.OptionsSeat = input.optionsSeat.map((seat) => {
      const mapped: Record<string, string> = {
        volumetricWidth: String(seat.volumetricWidth),
        volumetricLength: String(seat.volumetricLength),
        volumetricHeight: String(seat.volumetricHeight),
        weight: String(seat.weight),
      };
      if (typeof seat.volumetricVolume === "number") {
        mapped.volumetricVolume = String(seat.volumetricVolume);
      }
      return mapped;
    });
  }

  return props;
}

function mapCreatedTtn(raw: RawInternetDocument): CreateTtnResult {
  return {
    ref: raw.Ref,
    number: raw.IntDocNumber,
    costUah: raw.CostOnSite,
    estimatedDeliveryDate: raw.EstimatedDeliveryDate,
  };
}

export async function createInternetDocument(
  input: CreateTtnInput,
): Promise<CreateTtnResult | { error: string }> {
  const res = await callNovaPoshta<RawInternetDocument>(
    "InternetDocument",
    "save",
    buildTtnMethodProperties(input),
  );
  const first = res.data[0];
  if (!res.success || !first) {
    return { error: res.errors[0] ?? "Не вдалося створити ТТН" };
  }
  return mapCreatedTtn(first);
}

export async function updateInternetDocument(
  ref: string,
  input: CreateTtnInput,
): Promise<CreateTtnResult | { error: string }> {
  const res = await callNovaPoshta<RawInternetDocument>(
    "InternetDocument",
    "update",
    { Ref: ref, ...buildTtnMethodProperties(input) },
  );
  const first = res.data[0];
  if (!res.success || !first) {
    return { error: res.errors[0] ?? "Не вдалося оновити ТТН" };
  }
  return mapCreatedTtn(first);
}

export async function deleteInternetDocument(
  ref: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await callNovaPoshta<{ Ref: string }>(
    "InternetDocument",
    "delete",
    { DocumentRefs: ref },
  );
  if (!res.success) {
    return {
      success: false,
      error: res.errors[0] ?? "Не вдалося видалити ТТН",
    };
  }
  return { success: true };
}

// ─── Трекінг ─────────────────────────────────────────────────────────────────

interface RawTracking {
  Status: string;
  StatusCode: string;
  ScheduledDeliveryDate: string;
  RecipientAddress: string;
  WarehouseRecipient: string;
}

export async function trackTtn(number: string): Promise<NpTracking | null> {
  const res = await callNovaPoshta<RawTracking>(
    "TrackingDocument",
    "getStatusDocuments",
    { Documents: [{ DocumentNumber: number }] },
  );
  const first = res.data[0];
  if (!first) return null;
  return {
    status: first.Status,
    statusCode: first.StatusCode,
    scheduledDeliveryDate: first.ScheduledDeliveryDate,
    recipientAddress: first.RecipientAddress,
    warehouseRecipient: first.WarehouseRecipient,
  };
}

/** Тест-хук: скидає module-level кеші відправника (лише для юніт-тестів). */
export function __resetSenderCache(): void {
  senderCounterpartyCache = null;
  senderContactCache.clear();
}
