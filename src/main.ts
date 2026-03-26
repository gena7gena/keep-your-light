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
const actionsElement = document.querySelector<HTMLElement>('.actions')
const actionButtons = document.querySelectorAll<HTMLButtonElement>('[data-category]')
const mantraShader =
  mantraElement && mantraTextElement
    ? await createTextShaderOverlay({
        host: mantraElement,
        text: mantraTextElement,
      })
    : null

type MantraCategory = 'help' | 'perspective' | 'momentum' | 'done'

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
let hideActionsTimeout: number | null = null

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
  if (!actionsElement) {
    return
  }

  if (hideActionsTimeout !== null) {
    window.clearTimeout(hideActionsTimeout)
  }

  hideActionsTimeout = window.setTimeout(() => {
    hideActions()
    hideSubtitle()
  }, 3000)
}

const handleUserActivity = () => {
  showActions()
  showSubtitle()
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

  window.addEventListener('pointermove', handleUserActivity, { passive: true })
  window.addEventListener('pointerdown', handleUserActivity, { passive: true })
  window.addEventListener('keydown', handleUserActivity)
  window.addEventListener('focus', handleUserActivity)
}

if (subtitleElement) {
  gsap.set(subtitleElement, {
    autoAlpha: 1,
  })
}

if (mantraTextElement && actionButtons.length > 0) {
  actionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      handleUserActivity()

      const category = button.dataset.category as MantraCategory | undefined

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
