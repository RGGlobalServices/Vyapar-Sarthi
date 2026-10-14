import { defineConfig } from "eslint/config";
import next from "eslint-config-next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
  {
    extends: [...next],
  },
  // ── Package boundary rules ──────────────────────────────────────────────
  // Each features/ package is isolated — no cross-package imports allowed.
  // Violation = ESLint error during `next lint` / CI.
  {
    files: ["features/mill/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["*/features/dukan/*", "@/features/dukan/*"], message: "Mill code cannot import from Dukan package. Use @/components/core/ for shared components." },
          { group: ["*/features/vyapar/*", "@/features/vyapar/*"], message: "Mill code cannot import from Vyapar package. Use @/components/core/ for shared components." },
          { group: ["*/features/wholesale/*", "@/features/wholesale/*"], message: "Mill code cannot import from Wholesale/Udyog package. Use @/components/core/ for shared components." },
        ],
      }],
    },
  },
  {
    files: ["features/dukan/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["*/features/mill/*", "@/features/mill/*"], message: "Dukan code cannot import from Mill (Bada Udyog) package." },
          { group: ["*/features/vyapar/*", "@/features/vyapar/*"], message: "Dukan code cannot import from Vyapar package." },
          { group: ["*/features/wholesale/*", "@/features/wholesale/*"], message: "Dukan code cannot import from Wholesale/Udyog package." },
        ],
      }],
    },
  },
  {
    files: ["features/vyapar/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["*/features/mill/*", "@/features/mill/*"], message: "Vyapar code cannot import from Mill (Bada Udyog) package." },
          { group: ["*/features/dukan/*", "@/features/dukan/*"], message: "Vyapar code cannot import from Dukan package." },
          { group: ["*/features/wholesale/*", "@/features/wholesale/*"], message: "Vyapar code cannot import from Wholesale/Udyog package." },
        ],
      }],
    },
  },
  {
    files: ["features/wholesale/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["*/features/mill/*", "@/features/mill/*"], message: "Wholesale/Udyog code cannot import from Mill (Bada Udyog) package." },
          { group: ["*/features/dukan/*", "@/features/dukan/*"], message: "Wholesale/Udyog code cannot import from Dukan package." },
          { group: ["*/features/vyapar/*", "@/features/vyapar/*"], message: "Wholesale/Udyog code cannot import from Vyapar package." },
        ],
      }],
    },
  },
]);
