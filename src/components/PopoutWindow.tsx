import { useEffect, useRef, useState, ReactNode } from "react";
import { createPortal } from "react-dom";

interface PopoutWindowProps {
  title: string;
  width: number;
  height: number;
  onClose: () => void;
  children: ReactNode;
}

export function PopoutWindow({ title, width, height, onClose, children }: PopoutWindowProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const windowRef = useRef<Window | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    const left = window.screenX + Math.round((window.outerWidth - width) / 2);
    const top = window.screenY + Math.round((window.outerHeight - height) / 2);

    const features = [
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      `resizable=yes`,
      `scrollbars=no`,
      `location=no`,
      `toolbar=no`,
      `menubar=no`,
      `status=no`,
    ].join(",");

    const newWindow = window.open("", "", features);

    if (!newWindow) {
      onClose();
      return;
    }

    windowRef.current = newWindow;
    newWindow.document.title = title;

    const theme = document.documentElement.getAttribute("data-theme");
    if (theme) {
      newWindow.document.documentElement.setAttribute("data-theme", theme);
    }

    Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).forEach((node) => {
      newWindow.document.head.appendChild(node.cloneNode(true));
    });

    newWindow.document.body.style.margin = "0";
    newWindow.document.body.style.overflow = "hidden";
    newWindow.document.body.style.height = "100vh";
    newWindow.document.body.style.background = "var(--bg-primary)";
    newWindow.document.body.style.color = "var(--text-primary)";
    newWindow.document.body.style.colorScheme = theme === "dark" ? "dark" : "light";

    const div = newWindow.document.createElement("div");
    div.id = "popout-root";
    div.style.height = "100vh";
    div.style.display = "flex";
    div.style.flexDirection = "column";
    div.style.overflow = "hidden";
    newWindow.document.body.appendChild(div);
    setContainer(div);

    const interval = setInterval(() => {
      if (newWindow.closed && !closedRef.current) {
        closedRef.current = true;
        clearInterval(interval);
        onClose();
      }
    }, 300);

    return () => {
      clearInterval(interval);
      closedRef.current = true;
      if (windowRef.current && !windowRef.current.closed) {
        windowRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (!windowRef.current || windowRef.current.closed) return;
      const theme = document.documentElement.getAttribute("data-theme");
      if (theme) {
        windowRef.current.document.documentElement.setAttribute("data-theme", theme);
        windowRef.current.document.body.style.colorScheme = theme === "dark" ? "dark" : "light";
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      if (!windowRef.current || windowRef.current.closed) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (
            node instanceof HTMLStyleElement ||
            (node instanceof HTMLLinkElement && node.rel === "stylesheet")
          ) {
            windowRef.current.document.head.appendChild(node.cloneNode(true));
          }
        }
      }
    });
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, []);

  if (!container) return null;
  return createPortal(children, container);
}
