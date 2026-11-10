"use client";

import { useState } from "react";
import type { PublicLocale } from "@zaafran/i18n/locales";

const photos = [
  {
    id: "port",
    width: 1600,
    photographer: "Magharebia",
    title: "Vue sur Alger et le port",
    source: "Vue_sur_Alger_et_le_port.jpg",
    license: "CC BY 2.0",
    licensePath: "by/2.0",
  },
  {
    id: "casbah",
    width: 1068,
    photographer: "Anita Hammadache",
    title: "The Streets of the Casbah Algiers",
    source: "The_Streets_of_the_Casbah_Algiers.jpg",
    license: "CC BY-SA 3.0",
    licensePath: "by-sa/3.0",
  },
  {
    id: "coast",
    width: 1280,
    photographer: "Damien Boilley",
    title: "Algiers coast",
    source: "Algiers_coast.jpg",
    license: "CC BY 2.0",
    licensePath: "by/2.0",
  },
] as const;

const labels = {
  ar: {
    pause: "أوقف الحركة",
    play: "استأنف الحركة",
    credits: "حقوق الصور",
    edits: "تغيير الحجم والقص أثناء العرض.",
  },
  fr: {
    pause: "Mettre en pause",
    play: "Reprendre",
    credits: "Crédits photos",
    edits: "Images redimensionnées et recadrées à l’affichage.",
  },
  en: {
    pause: "Pause animation",
    play: "Resume animation",
    credits: "Photo credits",
    edits: "Images resized and cropped on display.",
  },
};

export function DemoPhotos({ locale }: { locale: PublicLocale }) {
  const [paused, setPaused] = useState(false);
  const copy = labels[locale];
  return (
    <>
      <div className="demo-photo-backdrop" data-paused={paused} aria-hidden="true">
        {photos.map(({ id, width }, index) => (
          <img
            key={id}
            data-slide={index}
            src={`/demo-algiers/${id}-800.webp`}
            srcSet={`/demo-algiers/${id}-800.webp 800w, /demo-algiers/${id}-${String(width)}.webp ${String(width)}w`}
            sizes="100vw"
            alt=""
            fetchPriority={index === 0 ? "high" : "low"}
          />
        ))}
      </div>
      <button
        type="button"
        className="demo-photo-pause"
        aria-pressed={paused}
        onClick={() => {
          setPaused((value) => !value);
        }}
      >
        {paused ? copy.play : copy.pause}
      </button>
    </>
  );
}

const creditSeparator = " · ";

export function DemoPhotoCredits({ locale }: { locale: PublicLocale }) {
  const copy = labels[locale];
  return (
    <footer className="demo-photo-credits">
      <p>{copy.credits}</p>
      <ul role="list">
        {photos.map((photo) => (
          <li key={photo.id}>
            <a href={`https://commons.wikimedia.org/wiki/File:${photo.source}`}>
              <bdi>{photo.title}</bdi>
            </a>
            {creditSeparator}
            <bdi>{photo.photographer}</bdi>
            {creditSeparator}
            <a href={`https://creativecommons.org/licenses/${photo.licensePath}/`}>
              <bdi>{photo.license}</bdi>
            </a>
          </li>
        ))}
      </ul>
      <p>{copy.edits}</p>
    </footer>
  );
}
