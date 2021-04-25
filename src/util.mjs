export function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function wrap (fn) {
  return (...args) =>
    Promise.resolve(fn(...args)).catch(err => {
      console.error(err)
      process.exit(1)
    })
}

export function once (fn) {
  function f (...args) {
    if (f.called) return f.value
    f.value = fn(...args)
    f.called = true
    return f.value
  }

  if (fn.name) {
    Object.defineProperty(f, 'name', { value: fn.name, configurable: true })
  }

  return f
}
