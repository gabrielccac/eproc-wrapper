import "dotenv/config";
import { getWhatsAppConnectionState } from "../integrations/notifications/whatsapp";
async function main() {
    const result = await getWhatsAppConnectionState();
    if (!result) {
        throw new Error("Missing WhatsApp env config. Set EVOLUTION_API_BASE_URL, EVOLUTION_API_KEY, and EVOLUTION_INSTANCE.");
    }
    console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
});
