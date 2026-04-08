import dynamic from "next/dynamic";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartProvider } from "@/lib/cart";
import { WishlistProvider } from "@/lib/wishlist";
import { RecentlyViewedProvider } from "@/lib/recently-viewed";
import { ComparisonProvider } from "@/lib/comparison";
import { ServiceWorkerRegister } from "@/components/sw-register";

const ComparisonBar = dynamic(
  () =>
    import("@/components/store/comparison-bar").then((m) => m.ComparisonBar),
  { ssr: false },
);

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <WishlistProvider>
        <RecentlyViewedProvider>
          <ComparisonProvider>
            <ServiceWorkerRegister />
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
            >
              Перейти до основного вмісту
            </a>
            <div className="flex min-h-screen flex-col">
              <Header />
              <main id="main-content" className="flex-1" role="main">
                {children}
              </main>
              <Footer />
            </div>
            <ComparisonBar />
          </ComparisonProvider>
        </RecentlyViewedProvider>
      </WishlistProvider>
    </CartProvider>
  );
}
