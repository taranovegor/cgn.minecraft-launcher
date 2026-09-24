// Minimal DOM and animation helpers used by the renderer scripts.
// Replaces the previously used jQuery subset. Exposed on the window global
// from this script (loaded right after prelude.js).

function resolveTarget(target) {
    return typeof target === 'string' ? document.querySelector(target) : target
}

function parseOptions(arg1, arg2) {
    if (arg1 != null && typeof arg1 === 'object') {
        return {
            duration: arg1.duration ?? 400,
            start: arg1.start,
            complete: arg1.complete
        }
    }
    return {
        duration: typeof arg1 === 'number' ? arg1 : 400,
        start: null,
        complete: typeof arg2 === 'function' ? arg2 : null
    }
}

// Removes an inline `display: none` so the element falls back to its
// stylesheet display. If a stylesheet still hides it (e.g. a `#main`
// rule), fall back to `block`, mirroring jQuery's show/fadeIn.
function reveal(el) {
    el.style.display = ''
    if (getComputedStyle(el).display === 'none') {
        el.style.display = 'block'
    }
}

function show(target, arg1, arg2) {
    const el = resolveTarget(target)
    if (el == null) return
    const { start, complete } = parseOptions(arg1, arg2)
    if (start) start()
    reveal(el)
    if (complete) complete()
}

function hide(target, arg1, arg2) {
    const el = resolveTarget(target)
    if (el == null) return
    const { start, complete } = parseOptions(arg1, arg2)
    if (start) start()
    el.style.display = 'none'
    if (complete) complete()
}

function fadeIn(target, arg1, arg2) {
    const el = resolveTarget(target)
    if (el == null) return Promise.resolve()
    const { duration, start, complete } = parseOptions(arg1, arg2)
    if (start) start()
    reveal(el)
    const animation = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration })
    return animation.finished
        .then(() => {
            el.style.opacity = ''
            if (complete) complete()
        })
        .catch(() => {})
}

function fadeOut(target, arg1, arg2) {
    const el = resolveTarget(target)
    if (el == null) return Promise.resolve()
    const { duration, start, complete } = parseOptions(arg1, arg2)
    if (start) start()
    const animation = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'forwards' })
    return animation.finished
        .then(() => {
            animation.cancel()
            el.style.display = 'none'
            el.style.opacity = ''
            if (complete) complete()
        })
        .catch(() => {})
}

window.dom = { show, hide, fadeIn, fadeOut }
