const radios = [...document.querySelectorAll('input[name="server"]')];
const msg = document.getElementById("msg");

// Ask the worker: it knows the default for this install type (unpacked →
// local dev), so the radio shows what the panel will actually use.
chrome.runtime.sendMessage({ type: "currentServer" }, (res) => {
  const server = (res && res.ok && res.data.server) || "prod";
  for (const r of radios) r.checked = r.value === server;
});

for (const r of radios) {
  r.addEventListener("change", async () => {
    await chrome.storage.local.set({ server: r.value });
    msg.textContent = `sending to ${r.value === "prod" ? "production" : "local dev"}.`;
  });
}

document.getElementById("signout").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "signOut" }, (res) => {
    msg.textContent = res && res.ok ? "signed out." : "couldn't sign out.";
  });
});
