import { gsap } from 'gsap'
import type { TextShaderOverlay } from './mantraShader'

export type MantraAnimationContext = {
  text: HTMLElement
  nextText: string
  shader?: TextShaderOverlay | null
}

export type MantraAnimation = (
  context: MantraAnimationContext,
) => gsap.core.Timeline

export type MantraAnimationSet = {
  fadeOut: MantraAnimation
  fadeIn: MantraAnimation
  pauseMs?: number
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

const play = (timeline: gsap.core.Timeline) =>
  new Promise<void>((resolve) => {
    timeline.eventCallback('onComplete', () => resolve())
  })

export const fadeUpOut: MantraAnimation = ({ text }) =>
  gsap.timeline().to(text, {
    y: -18,
    autoAlpha: 0,
    duration: 0.24,
    ease: 'power2.in',
  })

export const fadeInFromBottom: MantraAnimation = ({ text }) =>
  gsap.timeline().fromTo(
    text,
    {
      y: 24,
      autoAlpha: 0,
    },
    {
      y: 0,
      autoAlpha: 1,
      duration: 0.34,
      ease: 'power3.out',
    },
  )

export const defaultMantraAnimation: MantraAnimationSet = {
  fadeOut: fadeUpOut,
  fadeIn: fadeInFromBottom,
  pauseMs: 90,
}

export const animateMantraChange = async (
  context: MantraAnimationContext,
  animationSet: MantraAnimationSet,
) => {
  context.shader?.syncText()
  await Promise.all([
    play(animationSet.fadeOut(context)),
    context.shader?.animateOut() ?? Promise.resolve(),
  ])

  if (animationSet.pauseMs) {
    await wait(animationSet.pauseMs)
  }

  context.text.textContent = context.nextText
  context.shader?.syncText()
  gsap.set(context.text, { clearProps: 'all' })

  await Promise.all([
    play(animationSet.fadeIn(context)),
    context.shader?.animateIn() ?? Promise.resolve(),
  ])

  gsap.set(context.text, { clearProps: 'all' })
}
