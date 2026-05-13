import { Suspense } from "react";
import { ResetForm } from "./reset-form";

export const metadata = {
  title: "Скидання пароля | L-TEX Manager",
};

export default function ManagerResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
