import { useEffect, useRef, useSyncExternalStore } from 'react'
import LightTunnel from './LightTunnel'
import { palette, themeColors } from '../theme'
import './LoginTransition.css'

const motionQuery = '(prefers-reduced-motion: reduce)'

function subscribeToMotion(onChange: () => void) {
  const media = window.matchMedia(motionQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

interface LoginTransitionProps {
  onComplete: () => void
  mode?: 'login' | 'logout'
}

export default function LoginTransition({ onComplete, mode = 'login' }: LoginTransitionProps) {
  const isLoggingOut = mode === 'logout'
  const reduceMotion = useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(motionQuery).matches,
    () => true,
  )
  const containerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    containerRef.current?.focus()
    const timeout = window.setTimeout(onComplete, reduceMotion ? 900 : 4800)
    return () => window.clearTimeout(timeout)
  }, [onComplete, reduceMotion])

  return (
    <section
      ref={containerRef}
      className={`login-transition${isLoggingOut ? ' login-transition--logout' : ''}${reduceMotion ? ' login-transition--still' : ''}`}
      aria-label={isLoggingOut ? 'Leaving G-Stock workspace' : 'Opening G-Stock workspace'}
      tabIndex={-1}
    >
      <div className="login-transition__tunnel" aria-hidden="true">
        {!reduceMotion && (
          <LightTunnel
            cableColor={isLoggingOut ? palette.mistBlue : palette.nordicBlue}
            pulseColor={isLoggingOut ? palette.offWhite : themeColors.strongBlue}
            tunnelColor={palette.mistBlue}
            tunnelOpacity={0.24}
            cableCount={56}
            pulseDensity={0.55}
            speed={0.18}
            pulseSpeed={1.4}
            flowDirection={isLoggingOut ? 'outward' : 'inward'}
            lightMode={!isLoggingOut}
            sway={0.25}
            bend={0.2}
            glow={0.9}
            mouseInteraction={false}
            clickSurge={false}
            dpr={1.25}
          />
        )}
      </div>
      <div className="login-transition__brand">
        <span className="login-transition__eyebrow" aria-hidden="true">YOUR OPERATIONS, CONNECTED</span>
        <h1 className="login-transition__wordmark">G-Stock<span aria-hidden="true">.</span></h1>
        <p className="login-transition__caption" role="status">{isLoggingOut ? 'Signing you out' : 'Opening your workspace'}</p>
      </div>
      <button type="button" className="login-transition__skip" onClick={onComplete}>
        Skip animation <span aria-hidden="true">→</span>
      </button>
    </section>
  )
}
