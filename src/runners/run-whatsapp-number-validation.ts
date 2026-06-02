import "dotenv/config";
import {
  validateWhatsAppNumbers,
} from "../integrations/notifications/whatsapp";

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

const DEFAULT_NUMBERS_TO_VALIDATE = [
  "5554996341729",
  "5554991855661",
  "5596981211546",
];

function resolveNumbersToValidate(): string[] {
  const raw = (process.env.WHATSAPP_VALIDATE_NUMBERS || "").trim();
  if (!raw) {
    return DEFAULT_NUMBERS_TO_VALIDATE;
  }

  const numbers = raw
    .split(",")
    .map((item) => item.trim().replace(/\D/g, ""))
    .filter(Boolean);

  return numbers.length > 0 ? numbers : DEFAULT_NUMBERS_TO_VALIDATE;
}

async function main(): Promise<void> {
  const numbers = resolveNumbersToValidate();
  const result = await validateWhatsAppNumbers(numbers);
  if (!result) {
    throw new Error(
      "Missing WhatsApp env config. Set EVOLUTION_API_BASE_URL, EVOLUTION_API_KEY, and EVOLUTION_INSTANCE.",
    );
  }

  console.log("Numbers validated:", numbers.join(", "));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
