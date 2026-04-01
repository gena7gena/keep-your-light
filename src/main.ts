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
const doneButton = document.querySelector<HTMLButtonElement>('#done-trigger')
const actionsElement = document.querySelector<HTMLElement>('.actions')
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
let hideActionsTimeout: number | null = null
let isCompletionScreenOpen = false

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
  if (!actionsElement || isCompletionScreenOpen) {
    return
  }

  if (hideActionsTimeout !== null) {
    window.clearTimeout(hideActionsTimeout)
  }

  hideActionsTimeout = window.setTimeout(() => {
    hideActions()
    hideSubtitle()
  }, 6000)
}

const handleUserActivity = () => {
  if (isCompletionScreenOpen) {
    return
  }

  showActions()
  showSubtitle()
  scheduleActionsHide()
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
      handleUserActivity()

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
