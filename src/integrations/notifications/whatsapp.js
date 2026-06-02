export function getWhatsAppConfigFromEnv() {
    const baseUrl = process.env.EVOLUTION_API_BASE_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE;
    if (!baseUrl || !apiKey || !instance) {
        return null;
    }
    return {
        baseUrl,
        apiKey,
        instance,
    };
}
export async function sendWhatsAppMessage(number, text, config = getWhatsAppConfigFromEnv()) {
    const to = number.trim();
    if (!to) {
        return;
    }
    if (!config) {
        return;
    }
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/message/sendText/${config.instance}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: config.apiKey,
        },
        body: JSON.stringify({
            number: to,
            text,
        }),
    });
    if (!response.ok) {
        throw new Error(`WhatsApp delivery failed: HTTP ${response.status} ${response.statusText}`);
    }
}
export async function validateWhatsAppNumbers(numbers, config = getWhatsAppConfigFromEnv()) {
    if (!config) {
        return null;
    }
    const sanitizedNumbers = numbers
        .map((number) => (number || "").replace(/\D/g, ""))
        .filter(Boolean);
    if (sanitizedNumbers.length === 0) {
        return [];
    }
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/whatsappNumbers/${config.instance}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: config.apiKey,
        },
        body: JSON.stringify({ numbers: sanitizedNumbers }),
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
    if (!response.ok) {
        throw new Error(`WhatsApp number validation failed: HTTP ${response.status} ${response.statusText} | Response: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    }
    if (!Array.isArray(body)) {
        return [];
    }
    return body
        .filter((item) => Boolean(item && typeof item === "object"))
        .map((item) => ({
        jid: typeof item.jid === "string" ? item.jid : undefined,
        exists: item.exists === true,
        number: typeof item.number === "string" ? item.number : "",
        name: typeof item.name === "string" ? item.name : undefined,
    }))
        .filter((item) => item.number);
}
export async function validateWhatsAppNumber(number, config = getWhatsAppConfigFromEnv()) {
    const results = await validateWhatsAppNumbers([number], config);
    if (!results || results.length === 0) {
        return null;
    }
    return results[0];
}
export async function getWhatsAppConnectionState(config = getWhatsAppConfigFromEnv()) {
    if (!config) {
        return null;
    }
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/instance/connectionState/${config.instance}`, {
        method: "GET",
        headers: {
            apikey: config.apiKey,
        },
    });
    if (!response.ok) {
        throw new Error(`WhatsApp connection state failed: HTTP ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
    return {
        instance: config.instance,
        response: body,
    };
}
