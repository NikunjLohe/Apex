import React from 'react';

export default function Logo({ size = 38, showText = true, tagline = false, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 200 200" fill="none" className="flex-shrink-0">
        {/* Hollow outer triangle */}
        <path 
          fillRule="evenodd" 
          clipRule="evenodd" 
          d="M100 20 L180 160 L20 160 Z M100 55 L45 145 L155 145 Z" 
          fill="url(#globalGoldGradient)" 
        />
        {/* Solid inner triangle */}
        <path 
          d="M100 85 L125 130 L75 130 Z" 
          fill="url(#globalGoldGradient)" 
        />
        <defs>
          <linearGradient id="globalGoldGradient" x1="20" y1="20" x2="180" y2="160" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E6C97A" />
            <stop offset="0.5" stopColor="#BFA256" />
            <stop offset="1" stopColor="#8C7335" />
          </linearGradient>
        </defs>
      </svg>
      
      {showText && (
        <div className="leading-tight flex flex-col justify-center mt-0.5">
          <p className="text-[19px] font-extrabold tracking-tight text-ink-1 m-0 leading-none">
            Apex Multisolutions
          </p>
          {tagline && (
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#BFA256] mt-1.5 leading-none">
              Performance Portal
            </p>
          )}
        </div>
      )}
    </div>
  )
}
