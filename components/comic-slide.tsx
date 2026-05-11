"use client"

import Image from "next/image"
import { Heart, Share2, MessageCircle } from "lucide-react"
import { useState } from "react"
import LottieAnimation from "./lottie-animation"
import type { Comic } from "@/lib/types"

interface ComicSlideProps {
  comic: Comic
  isActive: boolean
}

export default function ComicSlide({ comic, isActive }: ComicSlideProps) {
  const [isLiked, setIsLiked] = useState(false)
  const [showHearts, setShowHearts] = useState(false)

  const handleLikeClick = () => {
    setIsLiked(!isLiked)
    setShowHearts(true)

    const timer = setTimeout(() => {
      setShowHearts(false)
    }, 2000)

    return () => clearTimeout(timer)
  }

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

        {/* {showHearts && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <LottieAnimation type="hearts" />
          </div>
        )} */}
      </div>

      {/* <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-6 text-white">
        <h2 className="text-2xl font-bold text-balance mb-2">{comic.title}</h2>
        <p className="text-sm text-gray-300 mb-4 text-balance">{comic.author}</p>

        <div className="flex items-center gap-6">
          <button onClick={handleLikeClick} className="flex flex-col items-center gap-1 group">
            <div
              className={`bg-white/20 rounded-full p-3 group-hover:bg-white/30 transition-colors ${
                isLiked ? "bg-red-500/30" : ""
              }`}
            >
              <Heart className={`w-5 h-5 transition-all ${isLiked ? "fill-red-500 text-red-500" : "text-white"}`} />
            </div>
            <span className="text-xs text-gray-300">{comic.likes}</span>
          </button>

          <button className="flex flex-col items-center gap-1 group">
            <div className="bg-white/20 rounded-full p-3 group-hover:bg-white/30 transition-colors">
              <MessageCircle className="w-5 h-5" />
            </div>
            <span className="text-xs text-gray-300">{comic.comments}</span>
          </button>

          <button className="flex flex-col items-center gap-1 group">
            <div className="bg-white/20 rounded-full p-3 group-hover:bg-white/30 transition-colors">
              <Share2 className="w-5 h-5" />
            </div>
            <span className="text-xs text-gray-300">Share</span>
          </button>
        </div>
      </div> */}
    </div>
  )
}
