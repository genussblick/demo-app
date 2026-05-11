"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import ComicSlide from "@/components/comic-slide";
import VerticalSpringFeed from "@/components/VerticalSpringFeed";
import { mockComics } from "@/lib/mock-data";
import AnimatedInfoButton from "@/components/AnimatedInfoButton";
import { AnimatePresence, motion } from "framer-motion";

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInfoButtonVisible, setIsInfoButtonVisible] = useState(false);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Observe slide visibility
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number(entry.target.getAttribute("data-index"));
          // Check if the entry corresponds to the currently active slide
          if (index === activeIndex) {
            // If slide is more than half out of view
            if (entry.intersectionRatio <= 0.5) {
              setIsInfoButtonVisible(true);
            } else {
              setIsInfoButtonVisible(false);
            }
          }
        });
      },
      {
        threshold: Array.from({ length: 21 }, (_, i) => i * 0.05), // 0 → 1 in 0.05 increments
      }
    );

    // Observe all slides
    slideRefs.current.forEach((slide) => {
      if (slide) observer.observe(slide);
    });

    return () => observer.disconnect();
  }, [activeIndex]);

  const handleSlideChangeTransitionStart = useCallback(() => {
    setIsInfoButtonVisible(false);
  }, []);

  const handleSlideChangeTransitionEnd = useCallback(() => {
    // if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    // debounceTimerRef.current = setTimeout(
    //   () => setIsInfoButtonVisible(true),
    //   200
    // );
    setTimeout(() => setIsInfoButtonVisible(true), 250);
  }, []);

  return (
    <main className="w-full h-dvh overflow-hidden">
      <VerticalSpringFeed
        className="h-full w-full"
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        onSlideChangeTransitionStart={handleSlideChangeTransitionStart}
        onSlideChangeTransitionEnd={handleSlideChangeTransitionEnd}
      >
        {mockComics.map((comic, index) => (
          <div
            key={comic.id}
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

      {/* <AnimatePresence>
        {isInfoButtonVisible && (
          <motion.div
            key="animated-info-button"
            className="fixed bottom-16 right-6 z-20"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <AnimatedInfoButton />
          </motion.div>
        )}
      </AnimatePresence> */}
    </main>
  );
}
