window.LAMP_RUNTIME_CONFIG = (() => {
const sitePort = "8000";
const botPort = "8001";
const localHosts = new Set(["", "localhost", "127.0.0.1", "0.0.0.0"]);
const currentHost = window.location.hostname || "127.0.0.1";
const serviceHost = localHosts.has(currentHost) ? "127.0.0.1" : currentHost;

return {
siteHost: serviceHost,
sitePort,
siteApiOrigin: `http://${serviceHost}:${sitePort}`,
botHost: serviceHost,
botPort,
botApiBaseUrl: `http://${serviceHost}:${botPort}/api/v1`
};
})();

window.LAMP_SITE_API_ORIGIN = window.LAMP_RUNTIME_CONFIG.siteApiOrigin;
window.LAMP_BOT_API_BASE = window.LAMP_RUNTIME_CONFIG.botApiBaseUrl;
