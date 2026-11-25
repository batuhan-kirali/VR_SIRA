import type { ReactNode } from 'react';

interface AtmosphericShellProps {
  children: ReactNode;
}

/**
 * Shared dark atmospheric vertical mobile shell (#444F6F -> #242F4E -> #1C2334)
 * with three ambient light glows, reusable across Landing, Form, Survey, and Live Queue screens.
 */
export function AtmosphericShell({ children }: AtmosphericShellProps) {
  return (
    <div className="flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_#25304D_0%,_#121725_72%)]">
      <div
        data-testid="mobile-frame"
        className="relative h-[100dvh] w-full max-w-md mx-auto overflow-hidden bg-gradient-to-b from-[#444F6F] via-[#242F4E] to-[#1C2334] text-white sm:border-x sm:border-white/10 sm:shadow-[0_32px_90px_-18px_rgba(6,10,22,0.78)]"
      >
        {/* Ambient atmospheric glow 1: top centered */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-[#96ABDF]/20 blur-3xl"
        />

        {/* Ambient atmospheric glow 2: centered behind VR headset visual */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-[32%] left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#B1C6FC]/15 blur-3xl"
        />

        {/* Ambient atmospheric glow 3: bottom centered */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 left-1/2 h-56 w-80 -translate-x-1/2 rounded-full bg-[#96ABDF]/15 blur-3xl"
        />

        <div className="relative z-10 h-full w-full">{children}</div>
      </div>
    </div>
  );
}
