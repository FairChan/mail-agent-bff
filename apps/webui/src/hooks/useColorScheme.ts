import { useEffect, useState } from "react";

export type ColorScheme = "light" | "dark";

export function useColorScheme(): ColorScheme {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setColorScheme(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return colorScheme;
}
