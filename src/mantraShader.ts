import { gsap } from 'gsap'

export type TextShaderOverlay = {
  syncText: () => void
  animateOut: () => Promise<void>
  animateIn: () => Promise<void>
  destroy: () => void
}

type CreateTextShaderOverlayOptions = {
  host: HTMLElement
  text: HTMLElement
}

type ShaderState = {
  progress: number
  direction: number
  opacity: number
  time: number
}

const UNIFORM_FLOAT_COUNT = 8
const DEFAULT_COLOR = '#f2f2ed'

const vertexShader = `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0),
  );

  let position = positions[vertexIndex];
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = position * 0.5 + vec2f(0.5, 0.5);
  return output;
}
`

const fragmentShader = `
struct Uniforms {
  resolution: vec2f,
  progress: f32,
  direction: f32,
  opacity: f32,
  time: f32,
  padding: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var textSampler: sampler;
@group(0) @binding(2) var textTexture: texture_2d<f32>;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let centered = uv - vec2f(0.5, 0.5);
  let band = smoothstep(0.0, 1.0, uv.y);
  let wave = sin((uv.y * 22.0) + uniforms.time * 0.02) * 0.018 * uniforms.progress;
  let drift = uniforms.direction * uniforms.progress * (0.02 + band * 0.06);
  let wobble = sin((uv.x * 9.0) - uniforms.time * 0.015) * 0.008 * uniforms.progress;

  let sampleUv = clamp(
    uv + vec2f(wave + drift, wobble),
    vec2f(0.0, 0.0),
    vec2f(1.0, 1.0),
  );

  let fringe = vec2f(0.01 * uniforms.progress, 0.0);
  let base = textureSample(textTexture, textSampler, sampleUv);
  let warm = textureSample(textTexture, textSampler, clamp(sampleUv + fringe, vec2f(0.0), vec2f(1.0)));
  let cool = textureSample(textTexture, textSampler, clamp(sampleUv - fringe, vec2f(0.0), vec2f(1.0)));

  let edgeGlow = (1.0 - length(centered) * 1.45) * uniforms.progress;
  let pulse = (0.55 + 0.45 * sin(uniforms.time * 0.018 + uv.y * 10.0)) * uniforms.progress;
  let alpha = max(base.a, max(warm.a, cool.a)) * uniforms.opacity;
  let baseColor = vec3f(base.a);
  let fringeColor = vec3f(warm.a, base.a * 0.92, cool.a);
  let ember = vec3f(1.0, 0.65, 0.3) * max(edgeGlow, 0.0) * pulse * 0.35;
  let color = mix(baseColor, fringeColor, uniforms.progress * 0.55) + ember;

  return vec4f(color, alpha);
}
`

const toNumber = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const wrapText = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) => {
  const words = text.trim().split(/\s+/).filter(Boolean)

  if (words.length === 0) {
    return ['']
  }

  const lines: string[] = []
  let currentLine = words[0]

  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${currentLine} ${words[index]}`

    if (context.measureText(candidate).width <= maxWidth) {
      currentLine = candidate
      continue
    }

    lines.push(currentLine)
    currentLine = words[index]
  }

  lines.push(currentLine)
  return lines
}

export const createTextShaderOverlay = async ({
  host,
  text,
}: CreateTextShaderOverlayOptions): Promise<TextShaderOverlay | null> => {
  if (!('gpu' in navigator)) {
    return null
  }

  const adapter = await navigator.gpu.requestAdapter()

  if (!adapter) {
    return null
  }

  const device = await adapter.requestDevice()
  const contextCanvas = document.createElement('canvas')
  const context = contextCanvas.getContext('webgpu')

  if (!context) {
    return null
  }

  contextCanvas.className = 'mantra__shader'
  contextCanvas.setAttribute('aria-hidden', 'true')
  host.append(contextCanvas)

  const sourceCanvas = document.createElement('canvas')
  const sourceContext = sourceCanvas.getContext('2d')

  if (!sourceContext) {
    contextCanvas.remove()
    return null
  }

  const format = navigator.gpu.getPreferredCanvasFormat()
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  })
  const uniformBuffer = device.createBuffer({
    size: UNIFORM_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({ code: vertexShader }),
      entryPoint: 'main',
    },
    fragment: {
      module: device.createShaderModule({ code: fragmentShader }),
      entryPoint: 'main',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  })

  let sourceTexture: GPUTexture | null = null
  let bindGroup: GPUBindGroup | null = null
  let rafId = 0
  let isDestroyed = false
  const state: ShaderState = {
    progress: 0,
    direction: 1,
    opacity: 0,
    time: performance.now(),
  }

  const updateUniforms = () => {
    const width = contextCanvas.width || 1
    const height = contextCanvas.height || 1

    device.queue.writeBuffer(
      uniformBuffer,
      0,
      new Float32Array([
        width,
        height,
        state.progress,
        state.direction,
        state.opacity,
        state.time,
        0,
        0,
      ]),
    )
  }

  const drawFrame = () => {
    if (isDestroyed || !bindGroup) {
      return
    }

    state.time = performance.now()
    updateUniforms()

    const encoder = device.createCommandEncoder()
    const view = context.getCurrentTexture().createView()
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    })

    renderPass.setPipeline(pipeline)
    renderPass.setBindGroup(0, bindGroup)
    renderPass.draw(6)
    renderPass.end()

    device.queue.submit([encoder.finish()])
  }

  const stopLoop = () => {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  const startLoop = () => {
    if (rafId !== 0 || isDestroyed) {
      return
    }

    const tick = () => {
      drawFrame()

      if (state.opacity > 0.001 || state.progress > 0.001) {
        rafId = requestAnimationFrame(tick)
        return
      }

      rafId = 0
      drawFrame()
    }

    rafId = requestAnimationFrame(tick)
  }

  const configureCanvas = () => {
    const bounds = host.getBoundingClientRect()
    const width = Math.max(1, Math.round(bounds.width))
    const height = Math.max(1, Math.round(bounds.height))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pixelWidth = Math.max(1, Math.round(width * dpr))
    const pixelHeight = Math.max(1, Math.round(height * dpr))

    if (contextCanvas.width === pixelWidth && contextCanvas.height === pixelHeight) {
      return
    }

    contextCanvas.width = pixelWidth
    contextCanvas.height = pixelHeight
    sourceCanvas.width = pixelWidth
    sourceCanvas.height = pixelHeight

    context.configure({
      device,
      format,
      alphaMode: 'premultiplied',
    })
  }

  const syncText = () => {
    if (isDestroyed) {
      return
    }

    configureCanvas()

    const dpr = contextCanvas.width / Math.max(host.getBoundingClientRect().width, 1)
    const styles = window.getComputedStyle(text)
    const fontSize = toNumber(styles.fontSize, 20)
    const lineHeight =
      styles.lineHeight === 'normal'
        ? fontSize * 1.45
        : toNumber(styles.lineHeight, fontSize * 1.45)
    const fontStyle = styles.fontStyle === 'normal' ? '' : `${styles.fontStyle} `
    const fontWeight = styles.fontWeight
    const fontFamily = styles.fontFamily
    const textColor = styles.color || DEFAULT_COLOR
    const content = text.textContent?.trim() ?? ''
    const pixelWidth = sourceCanvas.width
    const pixelHeight = sourceCanvas.height
    const paddingX = pixelWidth * 0.06
    const maxTextWidth = Math.max(pixelWidth - paddingX * 2, pixelWidth * 0.5)

    sourceContext.setTransform(1, 0, 0, 1, 0, 0)
    sourceContext.clearRect(0, 0, pixelWidth, pixelHeight)
    sourceContext.scale(dpr, dpr)
    sourceContext.textAlign = 'center'
    sourceContext.textBaseline = 'middle'
    sourceContext.fillStyle = textColor
    sourceContext.font = `${fontStyle}${fontWeight} ${fontSize}px ${fontFamily}`

    const lines = wrapText(sourceContext, content, maxTextWidth / dpr)
    const totalHeight = lines.length * lineHeight
    const centerX = host.getBoundingClientRect().width / 2
    const firstLineY =
      host.getBoundingClientRect().height / 2 - totalHeight / 2 + lineHeight / 2

    lines.forEach((line, index) => {
      sourceContext.fillText(line, centerX, firstLineY + index * lineHeight)
    })

    sourceTexture?.destroy()
    sourceTexture = device.createTexture({
      size: [pixelWidth, pixelHeight],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    })

    device.queue.copyExternalImageToTexture(
      { source: sourceCanvas },
      { texture: sourceTexture },
      [pixelWidth, pixelHeight],
    )

    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: sourceTexture.createView() },
      ],
    })

    drawFrame()
  }

  const runTransition = (config: {
    from: Partial<ShaderState>
    to: Partial<ShaderState>
    duration: number
    ease: string
  }) =>
    new Promise<void>((resolve) => {
      gsap.killTweensOf(state)
      Object.assign(state, config.from)
      startLoop()
      drawFrame()

      gsap.to(state, {
        ...config.to,
        duration: config.duration,
        ease: config.ease,
        onUpdate: drawFrame,
        onComplete: () => {
          drawFrame()
          resolve()
        },
      })
    })

  const resizeObserver = new ResizeObserver(() => {
    syncText()
  })

  resizeObserver.observe(host)
  void document.fonts.ready.then(() => {
    syncText()
  })
  syncText()

  return {
    syncText,
    animateOut: () =>
      runTransition({
        from: {
          direction: 1,
          progress: 0,
          opacity: 0.18,
        },
        to: {
          progress: 1,
          opacity: 1,
        },
        duration: 0.26,
        ease: 'power2.in',
      }),
    animateIn: () =>
      runTransition({
        from: {
          direction: -1,
          progress: 1,
          opacity: 1,
        },
        to: {
          progress: 0,
          opacity: 0,
        },
        duration: 0.34,
        ease: 'power3.out',
      }),
    destroy: () => {
      isDestroyed = true
      stopLoop()
      resizeObserver.disconnect()
      gsap.killTweensOf(state)
      sourceTexture?.destroy()
      contextCanvas.remove()
    },
  }
}
