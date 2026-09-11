// Apply before the stylesheet paints; a manual choice overrides the system theme.
(() => {
  const system = matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  try {
    const saved = localStorage.getItem("rho-theme");
    if (["system", "light", "dark"].includes(saved)) preference = saved;
  } catch {}
  function applyTheme() {
    const theme =
      preference === "system"
        ? system.matches
          ? "dark"
          : "light"
        : preference;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content =
      theme === "dark" ? "#111214" : "#faf9f6";
  }
  applyTheme();
  system.addEventListener("change", applyTheme);
  document.addEventListener("DOMContentLoaded", () => {
    const select = document.getElementById("theme");
    select.value = preference;
    select.onchange = () => {
      preference = select.value;
      try {
        localStorage.setItem("rho-theme", preference);
      } catch {}
      applyTheme();
    };
  });
})();
