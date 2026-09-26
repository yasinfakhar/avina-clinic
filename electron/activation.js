const form = document.querySelector("#activation-form");
const status = document.querySelector("#status");
window.activation.fingerprint().then((value) => { document.querySelector("#fingerprint").textContent = `Device: ${value}`; });
form.addEventListener("submit", async (event) => {
  event.preventDefault(); status.textContent = "در حال فعال‌سازی…";
  const button = form.querySelector("button"); button.disabled = true;
  try { await window.activation.activate(document.querySelector("#license-key").value.trim()); status.textContent = "فعال‌سازی انجام شد. برنامه در حال اجرا است…"; }
  catch (error) { status.textContent = error.message || "فعال‌سازی ناموفق بود."; button.disabled = false; }
});
