import { useState, useEffect } from "react";

export function useHoverCapable() {
  const [canHover, setCanHover] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(hover: hover)");
      setCanHover(mediaQuery.matches);
    }
  }, []);

  return canHover;
}
