"use client";

import Image from "next/image";
import { Heart, Share2, MessageCircle } from "lucide-react";
import { useState } from "react";
import LottieAnimation from "./lottie-animation";
import type { Comic } from "@/lib/types";

interface ComicSlideProps {
  comic: Comic;
  isActive: boolean;
}

export default function ComicSlide({ comic, isActive }: ComicSlideProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [showHearts, setShowHearts] = useState(false);

  const handleLikeClick = () => {
    setIsLiked(!isLiked);
    setShowHearts(true);

    const timer = setTimeout(() => {
      setShowHearts(false);
    }, 2000);

    return () => clearTimeout(timer);
  };

  return (
    <div className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden pointer-events-none">
      {/* Comic Image */}
      <div className="relative w-full h-full flex items-center justify-center">
        <Image
          src={comic.image || "/placeholder.svg"}
          alt={comic.title}
          fill
          priority
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 100vw, 100vw"
        />
      </div>
    </div>
  );
}
