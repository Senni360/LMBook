// Development-only style switcher for comparing the explorations in
// docs/ui/style-explorations.md. Loaded from main.tsx only in dev builds.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../themes/glass.css";
import "../themes/cocoa.css";
import "../themes/ink.css";
import "../themes/brutal.css";
import "../themes/studio.css";
import "./theme-lab.css";

const themes = [
  { id: "original", label: "Original" },
  { id: "glass", label: "Glass" },
  { id: "cocoa", label: "Cocoa" },
  { id: "ink", label: "Ink" },
  { id: "brutal", label: "Brutal" },
  { id: "studio", label: "Studio" },
];
const wallpapers = ["mist", "silhouette", "forest", "lake"];
const themeKey = "lmbook-theme-lab";
const wallpaperKey = "lmbook-theme-lab-wallpaper";
const root = document.documentElement;

function readTheme() {
  const saved = localStorage.getItem(themeKey) || "ink";
  return themes.some((item) => item.id === saved) ? saved : "original";
}
function apply(theme: string, wallpaper: string) {
  if (theme === "original") delete root.dataset.theme;
  else root.dataset.theme = theme;
  root.dataset.wallpaper = wallpaper;
}
const initialTheme = readTheme();
const initialWallpaper = localStorage.getItem(wallpaperKey) || "mist";
apply(initialTheme, initialWallpaper);

function ThemeLab() {
  const [theme, setTheme] = useState(initialTheme);
  const [wallpaper, setWallpaper] = useState(initialWallpaper);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    apply(theme, wallpaper);
    localStorage.setItem(themeKey, theme);
    localStorage.setItem(wallpaperKey, wallpaper);
  }, [theme, wallpaper]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey) return;
      const index = Number(event.code.replace("Digit", "")) - 1;
      if (themes[index]) {
        event.preventDefault();
        setTheme(themes[index].id);
      }
      if (event.code === "KeyT") setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Brutal: let the construction grid follow the pointer.
  useEffect(() => {
    if (theme !== "brutal") return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--mx", `${event.clientX}px`);
        root.style.setProperty("--my", `${event.clientY}px`);
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
      root.style.removeProperty("--mx");
      root.style.removeProperty("--my");
    };
  }, [theme]);
  if (!open)
    return (
      <button className="theme-lab-reopen" onClick={() => setOpen(true)}>
        Style
      </button>
    );
  return (
    <div className="theme-lab" role="toolbar" aria-label="Style explorations">
      <span className="theme-lab-label">Style</span>
      {themes.map((item, index) => (
        <button
          key={item.id}
          aria-pressed={theme === item.id}
          title={`Ctrl+Alt+${index + 1}`}
          onClick={() => setTheme(item.id)}
        >
          {item.label}
        </button>
      ))}
      {theme === "glass" && (
        <>
          <span className="theme-lab-label">Photo</span>
          {wallpapers.map((name) => (
            <button
              key={name}
              aria-pressed={wallpaper === name}
              onClick={() => setWallpaper(name)}
            >
              {name[0].toUpperCase() + name.slice(1)}
            </button>
          ))}
        </>
      )}
      <button
        className="theme-lab-hide"
        aria-label="Hide style switcher"
        title="Ctrl+Alt+T"
        onClick={() => setOpen(false)}
      >
        ×
      </button>
    </div>
  );
}

const host = document.createElement("div");
host.id = "theme-lab-root";
document.body.append(host);
createRoot(host).render(<ThemeLab />);
