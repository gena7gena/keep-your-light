import './style.css'
import { gsap } from 'gsap'
import mantrasByCategory from './mantras.json'
import {
  animateMantraChange,
  defaultMantraAnimation,
} from './mantraAnimations'
import { createTextShaderOverlay } from './mantraShader'

const mantraElement = document.querySelector<HTMLElement>('#mantra')
const mantraTextElement =
  mantraElement?.querySelector<HTMLElement>('.mantra__text') ?? null
const subtitleElement = document.querySelector<HTMLElement>('.intro p')
const mantraContainer = document.querySelector<HTMLElement>('#mantra')
const doneButton = document.querySelector<HTMLButtonElement>('#done-trigger')
const actionsElement = document.querySelector<HTMLElement>('.actions')
const sceneControlsElement =
  document.querySelector<HTMLElement>('#scene-controls')
const videoElement = document.querySelector<HTMLVideoElement>('#scene-video')
const fullscreenToggleButton =
  document.querySelector<HTMLButtonElement>('#fullscreen-toggle')
const volumeToggleButton =
  document.querySelector<HTMLButtonElement>('#volume-toggle')
const volumeSlider = document.querySelector<HTMLInputElement>('#volume-slider')
const actionButtons = document.querySelectorAll<HTMLButtonElement>(
  '.actions [data-category]:not([data-category="done"])',
)
const completionScreen =
  document.querySelector<HTMLElement>('#completion-screen')
const completionQuoteElement =
  completionScreen?.querySelector<HTMLElement>('#completion-quote') ?? null
const mantraShader =
  mantraElement && mantraTextElement
    ? await createTextShaderOverlay({
        host: mantraElement,
        text: mantraTextElement,
      })
    : null

type MantraCategory = 'help' | 'perspective' | 'momentum' | 'done'
type SupportCategory = Exclude<MantraCategory, 'done'>

type MantrasByCategory = Record<MantraCategory, string[]>

const pickRandomMantra = (mantras: string[], currentText: string) => {
  const candidates = mantras.filter((mantra) => mantra !== currentText)

  if (candidates.length === 0) {
    return mantras[0] ?? currentText
  }

  return candidates[Math.floor(Math.random() * candidates.length)]
}

let isAnimating = false
let queuedText: string | null = null
let actionsAreHidden = false
let subtitleIsHidden = false
let controlsAreHidden = false
let hideActionsTimeout: number | null = null
let isCompletionScreenOpen = false
let audioUnlocked = false
let lastVolume = 0.55
let wakeLockHandle: WakeLockSentinel | null = null

const showActions = () => {
  if (!actionsElement || !actionsAreHidden) {
    return
  }

  actionsAreHidden = false
  gsap.killTweensOf(actionsElement)
  gsap.to(actionsElement, {
    y: 0,
    autoAlpha: 1,
    duration: 0.28,
    ease: 'power2.out',
    pointerEvents: 'auto',
  })
}

const hideActions = () => {
  if (!actionsElement || actionsAreHidden) {
    return
  }

  actionsAreHidden = true
  gsap.killTweensOf(actionsElement)
  gsap.to(actionsElement, {
    y: 20,
    autoAlpha: 0,
    duration: 3,
    ease: 'power2.out',
    pointerEvents: 'none',
  })
}

const showControls = () => {
  if (!sceneControlsElement || !controlsAreHidden) {
    return
  }

  controlsAreHidden = false
  gsap.killTweensOf(sceneControlsElement)
  gsap.to(sceneControlsElement, {
    autoAlpha: 1,
    y: 0,
    duration: 0.24,
    ease: 'power2.out',
    pointerEvents: 'auto',
  })
}

const hideControls = () => {
  if (!sceneControlsElement || controlsAreHidden) {
    return
  }

  controlsAreHidden = true
  gsap.killTweensOf(sceneControlsElement)
  gsap.to(sceneControlsElement, {
    autoAlpha: 0,
    y: -8,
    duration: 3,
    ease: 'power2.out',
    pointerEvents: 'none',
  })
}

const showSubtitle = () => {
  if (!subtitleElement || !subtitleIsHidden) {
    return
  }

  subtitleIsHidden = false
  gsap.killTweensOf(subtitleElement)
  gsap.to(subtitleElement, {
    autoAlpha: 1,
    duration: 0.24,
    ease: 'power2.out',
  })
}

const hideSubtitle = () => {
  if (!subtitleElement || subtitleIsHidden) {
    return
  }

  subtitleIsHidden = true
  gsap.killTweensOf(subtitleElement)
  gsap.to(subtitleElement, {
    autoAlpha: 0,
    duration: 3,
    ease: 'power2.out',
  })
}

const scheduleActionsHide = () => {
  if (!actionsElement || isCompletionScreenOpen) {
    return
  }

  if (hideActionsTimeout !== null) {
    window.clearTimeout(hideActionsTimeout)
  }

  hideActionsTimeout = window.setTimeout(() => {
    hideActions()
    hideSubtitle()
    hideControls()
  }, 6000)
}

const handleUserClick = () => {
  if (isCompletionScreenOpen) {
    return
  }

  showActions()
  showSubtitle()
  showControls()
  scheduleActionsHide()
}

const updateVolumeUi = () => {
  if (!volumeToggleButton || !videoElement) {
    return
  }

  const isMuted = videoElement.muted || videoElement.volume === 0
  volumeToggleButton.classList.toggle('is-muted', isMuted)
  volumeToggleButton.setAttribute('aria-pressed', String(isMuted))
  volumeToggleButton.setAttribute('aria-label', isMuted ? 'Unmute sound' : 'Mute sound')

  if (volumeSlider) {
    volumeSlider.value = String(videoElement.volume)
  }
}

const syncFullscreenUi = () => {
  if (!fullscreenToggleButton) {
    return
  }

  const isFullscreen = Boolean(document.fullscreenElement)
  fullscreenToggleButton.classList.toggle('is-fullscreen', isFullscreen)
  fullscreenToggleButton.setAttribute('aria-pressed', String(isFullscreen))
  fullscreenToggleButton.setAttribute(
    'aria-label',
    isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen',
  )
}

const ensureAmbientVideoPlayback = async () => {
  if (!videoElement) {
    return
  }

  try {
    await videoElement.play()
  } catch {
    // Silent by design: autoplay can still be blocked on some browsers.
  }
}

const startAmbientAudio = async () => {
  if (!videoElement || audioUnlocked) {
    return
  }

  videoElement.muted = false
  videoElement.volume = Math.max(0, Math.min(1, lastVolume))

  try {
    await videoElement.play()
    audioUnlocked = true
  } catch {
    videoElement.muted = true
  } finally {
    updateVolumeUi()
  }
}

const requestScreenWakeLock = async () => {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') {
    return
  }

  try {
    wakeLockHandle = await navigator.wakeLock.request('screen')
    wakeLockHandle.addEventListener('release', () => {
      wakeLockHandle = null
    })
  } catch {
    // Wake Lock can fail on unsupported browsers or low-power mode.
  }
}

const showCompletionScreen = () => {
  if (!completionScreen || !completionQuoteElement) {
    return
  }

  const completionQuotes = (mantrasByCategory as MantrasByCategory).done
  const currentText = completionQuoteElement.textContent?.trim() ?? ''
  const nextText = pickRandomMantra(completionQuotes, currentText)

  completionQuoteElement.textContent = nextText
  isCompletionScreenOpen = true
  actionsAreHidden = false
  subtitleIsHidden = false

  if (hideActionsTimeout !== null) {
    window.clearTimeout(hideActionsTimeout)
    hideActionsTimeout = null
  }

  gsap.killTweensOf([actionsElement, subtitleElement, completionScreen, completionQuoteElement])
  gsap.set(completionScreen, {
    display: 'grid',
    pointerEvents: 'auto',
  })
  gsap.to(completionScreen, {
    autoAlpha: 1,
    duration: 1.1,
    ease: 'power2.out',
  })
  gsap.fromTo(
    completionQuoteElement,
    {
      autoAlpha: 0,
      y: 18,
    },
    {
      autoAlpha: 1,
      y: 0,
      duration: 1.2,
      ease: 'power2.out',
    },
  )
}

const hideCompletionScreen = () => {
  if (!completionScreen || !isCompletionScreenOpen) {
    return
  }

  isCompletionScreenOpen = false

  gsap.killTweensOf([completionScreen, completionQuoteElement])
  gsap.to(completionScreen, {
    autoAlpha: 0,
    duration: 0.35,
    ease: 'power2.out',
    pointerEvents: 'none',
    onComplete: () => {
      gsap.set(completionScreen, { display: 'none' })
    },
  })

  showSubtitle()
  showActions()
  showControls()
  scheduleActionsHide()
}

const swapMantra = async (nextText: string) => {
  if (!mantraTextElement) {
    return
  }

  const currentText = mantraTextElement.textContent?.trim() ?? ''

  if (!nextText || nextText === currentText) {
    return
  }

  if (isAnimating) {
    queuedText = nextText
    return
  }

  isAnimating = true

  try {
    await animateMantraChange(
      {
        text: mantraTextElement,
        nextText,
        shader: mantraShader,
      },
      defaultMantraAnimation,
    )
  } finally {
    isAnimating = false

    if (queuedText) {
      const pendingText = queuedText
      queuedText = null
      await swapMantra(pendingText)
    }
  }
}

if (actionsElement) {
  gsap.set(actionsElement, {
    y: 0,
    autoAlpha: 1,
    pointerEvents: 'auto',
  })

  scheduleActionsHide()

  window.addEventListener('pointerdown', handleUserClick, { passive: true })
}

if (subtitleElement) {
  gsap.set(subtitleElement, {
    autoAlpha: 1,
  })
}

if (mantraContainer) {
  gsap.set(mantraContainer, {
    autoAlpha: 1,
    pointerEvents: 'auto',
  })
}

if (sceneControlsElement) {
  gsap.set(sceneControlsElement, {
    autoAlpha: 1,
    y: 0,
    pointerEvents: 'auto',
  })
}

if (completionScreen) {
  gsap.set(completionScreen, {
    autoAlpha: 0,
    display: 'none',
    pointerEvents: 'none',
  })

  completionScreen.addEventListener('click', hideCompletionScreen)
}

if (doneButton) {
  doneButton.addEventListener('click', () => {
    if (isCompletionScreenOpen) {
      hideCompletionScreen()
      return
    }

    showCompletionScreen()
  })
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideCompletionScreen()
  }
})

if (mantraTextElement && actionButtons.length > 0) {
  actionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      handleUserClick()

      const category = button.dataset.category as SupportCategory | undefined

      if (!category) {
        return
      }

      const nextMantras = (mantrasByCategory as MantrasByCategory)[category]

      if (!nextMantras || nextMantras.length === 0) {
        return
      }

      const currentText = mantraTextElement.textContent?.trim() ?? ''
      const nextText = pickRandomMantra(nextMantras, currentText)

      void swapMantra(nextText)
    })
  })
}

if (fullscreenToggleButton) {
  fullscreenToggleButton.addEventListener('click', async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  })

  document.addEventListener('fullscreenchange', syncFullscreenUi)
  syncFullscreenUi()
}

if (videoElement && volumeSlider && volumeToggleButton) {
  videoElement.volume = lastVolume
  videoElement.muted = true
  updateVolumeUi()
  void ensureAmbientVideoPlayback()
  void requestScreenWakeLock()

  volumeSlider.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement
    const nextVolume = Number(target.value)
    const clampedVolume = Math.max(0, Math.min(1, nextVolume))
    lastVolume = clampedVolume
    videoElement.volume = clampedVolume
    videoElement.muted = clampedVolume === 0
    updateVolumeUi()
  })

  volumeToggleButton.addEventListener('click', () => {
    if (videoElement.muted || videoElement.volume === 0) {
      videoElement.muted = false
      videoElement.volume = lastVolume > 0 ? lastVolume : 0.55
    } else {
      lastVolume = videoElement.volume > 0 ? videoElement.volume : lastVolume
      videoElement.muted = true
    }

    void startAmbientAudio()
    updateVolumeUi()
  })

  window.addEventListener(
    'pointerdown',
    () => {
      void ensureAmbientVideoPlayback()
      void startAmbientAudio()
      void requestScreenWakeLock()
    },
    { once: true, passive: true },
  )

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void ensureAmbientVideoPlayback()
      void requestScreenWakeLock()
    } else if (wakeLockHandle) {
      void wakeLockHandle.release()
      wakeLockHandle = null
    }
  })
}
