"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LoomixPlayer } from "loomix";
import { SlidingTabs } from "./sliding-tabs";

const TABS = [
  { id: "default", label: "Default" },
  { id: "minimal", label: "Minimal" },
  { id: "loading", label: "Loading" },
  { id: "modal", label: "Modal" },
] as const;

const MODAL_VIDEO_TITLE = "TANZANIA | Travel Video | Stock Footage";

type TabId = (typeof TABS)[number]["id"];

function PlayerStage({ active }: { active: TabId }) {
  switch (active) {
    case "default":
      return (
        <LoomixPlayer
          src="/media/kyrgyzstan.webm"
          title="ROADS OF KYRGYZSTAN | Cinematic Travel Video (4K)"
          ariaLabel="ROADS OF KYRGYZSTAN | Cinematic Travel Video (4K)"
          youtubeUrl="https://www.youtube.com/watch?v=D-l3dSWbEtg"
          captions={[
            { src: "/kyrgyzstan.vtt", srcLang: "en", label: "English" },
          ]}
          className="rounded-none! border-x-0!"
        />
      );
    case "minimal":
      return (
        <LoomixPlayer
          src="/media/turks-and-caicos.webm"
          ariaLabel="Turks & Caicos cinematic travel video"
          disableSkip
          disableVolume
          disableSpeed
          disablePictureInPicture
          disableFullscreen
          className="rounded-none! border-x-0!"
        />
      );
    case "loading":
      return <LoomixPlayer loading className="rounded-none! border-x-0!" />;
    case "modal":
      return <ModalStage />;
    default: {
      const _exhaustive: never = active;
      return _exhaustive;
    }
  }
}

function ModalStage() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div className="relative flex aspect-video w-full items-center justify-center border-y bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-full border border-white/50 bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink)] shadow-[0_2px_14px_rgba(0,0,0,0.18)] transition-transform duration-150 select-none hover:bg-white/95 active:scale-[0.97]"
      >
        Open modal
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={MODAL_VIDEO_TITLE}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
              // Rounded to the player's own radius so the shadow follows its
              // corners instead of squaring them off from behind.
              className="w-full rounded-xl"
              style={{
                maxWidth: "min(1280px, 92vw)",
                boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
              }}
            >
              <LoomixPlayer
                src="/media/tanzania.webm"
                title={MODAL_VIDEO_TITLE}
                ariaLabel={MODAL_VIDEO_TITLE}
                youtubeUrl="https://www.youtube.com/watch?v=3zUuxEiMcVo"
                autoPlay
                autoFocus
                onClose={() => setOpen(false)}
                // The page's hairline is for a light ground; over the dark
                // backdrop it reads as a white ring.
                className="max-h-[86vh] border-white/10"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PlayerDemo() {
  const [active, setActive] = useState<TabId>("default");

  return (
    <section aria-label="Player demo" className="mt-12">
      <div className="mx-2.5 mb-3 px-1.5">
        <SlidingTabs
          ariaLabel="Player examples"
          tabs={TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
          value={active}
          onChange={setActive}
          className="p-1 text-sm"
          pillClassName="bg-[var(--color-ink)]"
          tabClassName="h-8 px-3"
        />
      </div>

      <PlayerStage active={active} />
    </section>
  );
}
