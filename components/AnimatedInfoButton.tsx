"use client";

import { useEffect, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import Lottie from "lottie-react";

import circleAnim from "@/public/animation_02_920x920.json";
import plusAnim from "@/public/animation_03_920x920.json";
import { BsFillPlusCircleFill } from "react-icons/bs";

/** Defer `controls.start()` until after the target `motion` node has mounted (Framer requirement). */
function startWhenMounted(start: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(start);
  });
}

export default function AnimatedInfoButton() {
  const [phase, setPhase] = useState<"circle" | "plus" | "pill">("circle");

  const container = useAnimation();

  useEffect(() => {
    startWhenMounted(() => {
      void container.start({
        width: 44,
        height: 44,
        borderRadius: "100%",
        transition: { duration: 0.4, ease: "easeOut" },
      });
    });
  }, [container]);

  return (
    <div className="flex items-center justify-center">
      <motion.div
        animate={container}
        initial={{ width: 0, height: 0, opacity: 1 }}
        className="relative bg-white flex items-center justify-end rounded-full shadow-xl origin-right overflow-hidden"
        style={{ paddingRight: 8 }}
      >
        {/* ✅ Static plus container (never moves) */}
        <div className="absolute right-0 flex items-center justify-center w-11 h-11 z-10">
          {phase === "circle" && (
            <Lottie
              animationData={circleAnim}
              loop={false}
              className="absolute w-11 h-11"
              onComplete={() => setPhase("plus")}
            />
          )}

          {phase === "plus" && (
            <Lottie
              animationData={plusAnim}
              loop={false}
              className="absolute w-14 h-14"
              onComplete={() => {
                setTimeout(() => {
                  setPhase("pill");
                  void container.start({
                    width: 85,
                    height: 44,
                    borderRadius: "9999px",
                    transition: { duration: 0.45, ease: "easeOut" },
                  });
                }, 0);
              }}
            />
          )}

          {phase === "pill" && (
            // <PlusCircleIcon />
            <BsFillPlusCircleFill color="#000" size={20} />
          )}
        </div>

        {/* ✅ Info text slides in when pill expands */}
        {phase === "pill" && (
          <motion.span
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.2 }}
            className="text-sm font-medium text-black pr-8 whitespace-nowrap"
          >
            Info
          </motion.span>
        )}
      </motion.div>
    </div>
  );
}
