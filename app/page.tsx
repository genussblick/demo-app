"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import ComicSlide from "@/components/comic-slide";
import VerticalSpringFeed from "@/components/VerticalSpringFeed";
import { mockComics } from "@/lib/mock-data";

const REPEATS = 11;
const ORIGIN = Math.floor(REPEATS / 2);

const infiniteComics = Array.from({ length: REPEATS }, () => mockComics).flat();
const TOTAL = infiniteComics.length;
const SOURCE = mockComics.length;
const START_INDEX = ORIGIN * SOURCE;

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(START_INDEX);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const feedRef = useRef<{ jumpTo: (index: number) => void } | null>(null);

  const handleActiveIndexChange = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  useEffect(() => {
    const buffer = 2;
    if (activeIndex < buffer) {
      const equivalent = activeIndex + SOURCE * Math.floor(REPEATS / 2);
      setActiveIndex(equivalent);
    } else if (activeIndex >= TOTAL - buffer) {
      const equivalent = activeIndex - SOURCE * Math.floor(REPEATS / 2);
      setActiveIndex(equivalent);
    }
  }, [activeIndex]);

  return (
    <main className="w-full h-dvh overflow-hidden">
      <VerticalSpringFeed
        className="h-full w-full"
        activeIndex={activeIndex}
        onActiveIndexChange={handleActiveIndexChange}
      >
        {infiniteComics.map((comic, index) => (
          <div
            key={`${comic.id}-${index}`}
            ref={(el) => {
              slideRefs.current[index] = el;
            }}
            data-index={index}
            className="h-dvh w-full shrink-0"
          >
            <ComicSlide comic={comic} isActive={index === activeIndex} />
          </div>
        ))}
      </VerticalSpringFeed>
    </main>
  );
}
