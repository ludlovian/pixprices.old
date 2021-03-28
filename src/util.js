'use strict'

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
