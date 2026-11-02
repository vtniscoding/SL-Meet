import React from 'react';
import {
  MediaPipeLogoIcon,
  TensorFlowLogoIcon,
  ReactLogoIcon,
  GoogleLogoIcon,
} from '../../icons';

/**
 * Infinity Logo Carousel Component
 * Continuous seamless marquee showcasing core technologies:
 * MediaPipe, TensorFlow, React, Google.
 * All logos rendered with standardized official vector SVG icons and matching typography.
 */
export default function InfinityLogoCarousel() {
  const logos = [
    {
      id: 'mediapipe',
      name: 'MediaPipe',
      icon: <MediaPipeLogoIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />,
    },
    {
      id: 'tensorflow',
      name: 'TensorFlow',
      icon: <TensorFlowLogoIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />,
    },
    {
      id: 'react',
      name: 'React',
      icon: <ReactLogoIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-[#61DAFB]" />,
    },
    {
      id: 'google',
      name: 'Google',
      icon: <GoogleLogoIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />,
    },
  ];

  // Repeat logos to create an expansive, uncluttered continuous track
  const sequence = [...logos, ...logos, ...logos];

  return (
    <div className="w-full relative py-2 select-none">
      {/* Edge Feather Mask: smoothly fades logos in/out at the boundaries */}
      <div
        className="w-full overflow-hidden"
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0%, rgba(0,0,0,1) 12%, rgba(0,0,0,1) 88%, transparent 100%)',
          maskImage:
            'linear-gradient(to right, transparent 0%, rgba(0,0,0,1) 12%, rgba(0,0,0,1) 88%, transparent 100%)',
        }}
      >
        <div className="animate-marquee-infinite flex items-center gap-12 sm:gap-16 md:gap-20">
          {/* Track 1 */}
          <div className="flex items-center gap-12 sm:gap-16 md:gap-20 shrink-0">
            {sequence.map((logo, idx) => (
              <div
                key={`track-1-${logo.id}-${idx}`}
                className="flex items-center space-x-2.5 transition-all duration-300 opacity-75 hover:opacity-100 hover:scale-105 shrink-0 cursor-default px-1"
              >
                {logo.icon}
                <span className="text-sm sm:text-base font-semibold tracking-tight text-slate-700">
                  {logo.name}
                </span>
              </div>
            ))}
          </div>

          {/* Track 2 (Seamless loop duplicate) */}
          <div className="flex items-center gap-12 sm:gap-16 md:gap-20 shrink-0" aria-hidden="true">
            {sequence.map((logo, idx) => (
              <div
                key={`track-2-${logo.id}-${idx}`}
                className="flex items-center space-x-2.5 transition-all duration-300 opacity-75 hover:opacity-100 hover:scale-105 shrink-0 cursor-default px-1"
              >
                {logo.icon}
                <span className="text-sm sm:text-base font-semibold tracking-tight text-slate-700">
                  {logo.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
