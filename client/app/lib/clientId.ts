const CLIENT_ID_KEY = "aitutor_client_id";

export function getClientId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    const cryptoObj = window.crypto as Crypto | undefined;
    if (cryptoObj && "randomUUID" in cryptoObj) {
      clientId = cryptoObj.randomUUID();
    } else {
      clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }

  return clientId;
}
