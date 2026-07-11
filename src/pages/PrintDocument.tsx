import { useEffect, useRef, useState } from "react";
import type { PrintHostWindow, StoredPrintDocument } from "../lib/standalonePrint";
import { waitForPrintImages, waitForPrintLayout } from "../lib/standalonePrint";

function readPayload(): { key: string; value?: StoredPrintDocument } {
  const key = new URLSearchParams(window.location.search).get("key") || "";
  if (!key.startsWith("blitzidee-print-")) return { key };
  try {
    const opener = window.opener as PrintHostWindow | null;
    const fromOpener = opener?.__blitzideePrintDocuments?.[key];
    if (fromOpener) return { key, value: fromOpener };
    const raw = localStorage.getItem(key);
    return { key, value: raw ? JSON.parse(raw) as StoredPrintDocument : undefined };
  } catch { return { key }; }
}

export function PrintDocument() {
  const [{ key, value }] = useState(readPayload);
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !value) return;
    started.current = true;
    localStorage.removeItem(key);
    let active = true;
    const run = async () => {
      try {
        document.title = value.title;
        await document.fonts?.ready;
        await waitForPrintImages(document);
        await waitForPrintLayout(window);
        const page = document.querySelector("[data-print-document]")?.firstElementChild as HTMLElement | null;
        const text = page?.textContent?.replace(/\s+/g, " ").trim() || "";
        if (!page || page.getBoundingClientRect().height < 1 || value.requiredText.some((required) => !text.includes(required))) throw new Error("Das Druckdokument ist unvollständig und wurde nicht gedruckt.");
        const finish = () => {
          if (window.opener && !window.opener.closed) window.close();
          else if (window.history.length > 1) window.history.back();
        };
        window.addEventListener("afterprint", finish, { once: true });
        window.focus();
        window.print();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Das Druckdokument konnte nicht erstellt werden.");
      }
    };
    void run();
    return () => { active = false; };
  }, [key, value]);

  if (!value) return <main className="print-document-error"><h1>Druckdokument nicht verfügbar</h1><p>Bitte zur App zurückkehren und den Druck erneut starten.</p><button onClick={() => window.history.back()}>Zurück</button></main>;
  return <><style>{value.css}</style>{error && <aside className="print-document-error"><strong>{error}</strong><button onClick={() => window.history.back()}>Zurück</button></aside>}<main data-print-document dangerouslySetInnerHTML={{ __html: value.markup }} /></>;
}
