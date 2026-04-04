import type { Config } from "tailwindcss";
import baseConfig from "@ltex/ui/tailwind.config";

const config: Config = {
  ...baseConfig,
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/components/**/*.{ts,tsx}",
    "../../packages/ui/lib/**/*.{ts,tsx}",
  ],
};

export default config;
