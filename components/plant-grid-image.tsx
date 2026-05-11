"use client";

import { LoaderCircleIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

const DEFAULT_SIZES =
  "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw";

export type PlantGridImageProps = {
  src: string;
  alt: string;
  /** Next/Image `sizes`; defaults to a responsive grid layout */
  sizes?: string;
  /** Merged onto the fill image (`object-cover` is always applied) */
  imageClassName?: string;
  unoptimized?: boolean;
  priority?: boolean;
};

export function PlantGridImage({
  src,
  alt,
  sizes = DEFAULT_SIZES,
  imageClassName,
  unoptimized = true,
  priority = false,
}: PlantGridImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {!loaded ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-muted"
          aria-busy="true"
          aria-live="polite"
        >
          <LoaderCircleIcon
            className="size-8 animate-spin text-muted-foreground"
            aria-label="Loading image"
          />
        </div>
      ) : null}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        unoptimized={unoptimized}
        priority={priority}
        className={cn(
          "object-cover transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
          imageClassName,
        )}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </>
  );
}
