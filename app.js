// ====== CONFIG (match your ESP32 UUIDs) ======
// Use YOUR custom UUIDs. These are placeholders.
// Tip: keep one service and two characteristics:
//   - sensor notify char (NOTIFY)
//   - command write char (WRITE)
const SERVICE_UUID       = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const SENSOR_CHAR_UUID   = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // NOTIFY
const COMMAND_CHAR_UUID  = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // WRITE

// If you know your device name, you can filter by it.
// If not, comment namePrefix and rely on service filter.
const DEVICE_NAME_PREFIX = "ESP32"; // e.g. "ESP32-Sensors"

// ====== UI ======
const el = (id) => document.getElementById(id);

const btnConnect = el("btnConnect");
const btnDisconnect = el("btnDisconnect");
const btnLedOn = el("btnLedOn");
const btnLedOff = el("btnLedOff");

const statusPill = el("status");
const logEl = el("log");

const airTempEl = el("airTemp");
const humidityEl = el("humidity");
const waterTempEl = el("waterTemp");
const rawEl = el("raw");

function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  logEl.textContent = line + logEl.textContent;
}

function setStatus(text, connected) {
  statusPill.textContent = text;
  btnDisconnect.disabled = !connected;
  btnLedOn.disabled = !connected;
  btnLedOff.disabled = !connected;
}

// ====== BLE STATE ======
let device = null;
let server = null;
let sensorChar = null;
let commandChar = null;

// Decode notify payloads (UTF-8 text) like:
// "airTemp=23.41;hum=45.2;waterTemp=18.06"
function parseKeyValuePayload(text) {
  const out = {};
  text.split(";").forEach(pair => {
    const [k, v] = pair.split("=");
    if (!k || v === undefined) return;
    out[k.trim()] = v.trim();
  });
  return out;
}

function onDisconnected() {
  log("Device disconnected.");
  setStatus("Disconnected", false);
  device = null; server = null; sensorChar = null; commandChar = null;
}

async function connect() {
  if (!navigator.bluetooth) {
    alert("Web Bluetooth not available. Use Chrome on Android and HTTPS/localhost.");
    return;
  }

  log("Requesting device...");

  // IMPORTANT:
  // - Web Bluetooth requires HTTPS or localhost
  // - You must include the service UUID in filters/optionalServices to access it later.
  // (See Chrome docs / MDN for the overall API behavior.)
  // https://developer.chrome.com/docs/capabilities/bluetooth
  device = await navigator.bluetooth.requestDevice({
    filters: [
      { namePrefix: DEVICE_NAME_PREFIX },
      { services: [SERVICE_UUID] }
    ],
    optionalServices: [SERVICE_UUID]
  });

  device.addEventListener("gattserverdisconnected", onDisconnected);

  log(`Connecting to ${device.name || "(no name)"}...`);
  server = await device.gatt.connect();

  log("Getting service...");
  const service = await server.getPrimaryService(SERVICE_UUID);

  log("Getting characteristics...");
  sensorChar = await service.getCharacteristic(SENSOR_CHAR_UUID);
  commandChar = await service.getCharacteristic(COMMAND_CHAR_UUID);

  // Subscribe to notifications
  log("Starting notifications...");
  await sensorChar.startNotifications();
  sensorChar.addEventListener("characteristicvaluechanged", (event) => {
    const value = event.target.value; // DataView
    const text = new TextDecoder().decode(value);
    rawEl.textContent = text;

    // Parse key=value; pairs
    const data = parseKeyValuePayload(text);

    // Update UI with common keys (adjust to your actual keys)
    if (data.airTemp !== undefined) airTempEl.textContent = Number(data.airTemp).toFixed(2);
    if (data.hum !== undefined) humidityEl.textContent = Number(data.hum).toFixed(1);
    if (data.waterTemp !== undefined) waterTempEl.textContent = Number(data.waterTemp).toFixed(2);

    // For debugging
    log(`Notify: ${text}`);
  });

  setStatus("Connected", true);
  log("Connected and receiving data.");
}

async function disconnect() {
  try {
    if (device?.gatt?.connected) device.gatt.disconnect();
  } finally {
    onDisconnected();
  }
}

async function writeCommand(str) {
  if (!commandChar) return;
  const bytes = new TextEncoder().encode(str);
  // writeValueWithoutResponse is faster if supported; fall back to writeValue.
  if (commandChar.writeValueWithoutResponse) {
    await commandChar.writeValueWithoutResponse(bytes);
  } else {
    await commandChar.writeValue(bytes);
  }
  log(`Sent command: ${str}`);
}

// ====== BUTTONS ======
btnConnect.addEventListener("click", async () => {
  try {
    setStatus("Connecting...", false);
    await connect();
  } catch (err) {
    console.error(err);
    log(`ERROR: ${err.message || err}`);
    setStatus("Disconnected", false);
  }
});

btnDisconnect.addEventListener("click", disconnect);

btnLedOn.addEventListener("click", () => writeCommand("1"));
btnLedOff.addEventListener("click", () => writeCommand("0"));

// Initial UI state
setStatus("Disconnected", false);
log("Ready. Tap Connect.");
