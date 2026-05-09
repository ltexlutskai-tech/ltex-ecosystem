import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartProvider } from "@/lib/cart";
import { WishlistProvider } from "@/lib/wishlist";
import { RecentlyViewedProvider } from "@/lib/recently-viewed";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { PromoStripe } from "@/components/store/promo-stripe";
import { UmamiTracker } from "@/components/analytics/umami";
import { AnalyticsClickTracker } from "@/components/analytics/click-tracker";
import { CustomerProvider } from "@/lib/customer-context";
import { getCurrentCustomer } from "@/lib/customer-auth";

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const customer = await getCurrentCustomer();
  const headerCustomer = customer
    ? { id: customer.id, name: customer.name }
    : null;
  return (
    <CustomerProvider customer={headerCustomer}>
      <CartProvider>
        <WishlistProvider>
          <RecentlyViewedProvider>
            <ServiceWorkerRegister />
            <UmamiTracker />
            <AnalyticsClickTracker />
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
            >
              Перейти до основного вмісту
            </a>
            <div className="flex min-h-screen flex-col">
              <PromoStripe />
              <Header customer={headerCustomer} />
              <main id="main-content" className="flex-1" role="main">
                {children}
              </main>
              <Footer />
            </div>
          </RecentlyViewedProvider>
        </WishlistProvider>
      </CartProvider>
    </CustomerProvider>
  );
}
