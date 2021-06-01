const factors = Array(13)
  .fill()
  .map((_, n) => Math.pow(10, n))

const inspect = Symbol.for('nodejs.util.inspect.custom')
const DIGS = Symbol('digits')
const PREC = Symbol('precision')

export default function decimal (number, opts = {}) {
  if (number instanceof Decimal) return number
  const { minPrecision = 0, maxPrecision = 12 } = opts
  const [d, p] = parseNumber(number, minPrecision, maxPrecision)
  return new Decimal(d, p)
}

class Decimal {
  constructor (digits, precision) {
    Object.freeze(
      Object.defineProperties(this, {
        [DIGS]: { value: Math.round(digits) },
        [PREC]: { value: precision }
      })
    )
  }

  [inspect] (depth, opts) {
    /* c8 ignore next */
    if (depth < 0) return opts.stylize('[Decimal]', 'number')
    return `Decimal { ${opts.stylize(this.toString(), 'number')} }`
  }

  get tuple () {
    return [this[DIGS], this[PREC]]
  }

  get number () {
    return this[DIGS] / factors[this[PREC]]
  }

  precision (p) {
    if (this[PREC] === p) return this
    if (!(p in factors)) throw new TypeError('Unsupported precision')
    if (p > this[PREC]) {
      const factor = factors[p - this[PREC]]
      return new Decimal(this[DIGS] * factor, p)
    } else {
      const factor = factors[this[PREC] - p]
      return new Decimal(this[DIGS] / factor, p)
    }
  }

  toString () {
    return this.number.toFixed(this[PREC])
  }

  valueOf () {
    return this.toString()
  }

  add (other) {
    const x = this
    const y = decimal(other)
    const p = Math.max(x[PREC], y[PREC])
    return new Decimal(x.precision(p)[DIGS] + y.precision(p)[DIGS], p)
  }

  sub (other) {
    other = decimal(other)
    return this.add(decimal(other).neg())
  }

  mul (x) {
    x = decimal(x).number
    return new Decimal(this[DIGS] * x, this[PREC])
  }

  div (x) {
    x = decimal(x).number
    if (!x) throw new Error('Cannot divide by zero')
    return new Decimal(this[DIGS] / x, this[PREC])
  }

  abs () {
    return new Decimal(Math.abs(this[DIGS]), this[PREC])
  }

  neg () {
    return new Decimal(-this[DIGS], this[PREC])
  }
}

function parseNumber (n, minp, maxp) {
  let s
  if (typeof n === 'string') {
    s = n
    n = parseFloat(s)
    if (isNaN(n) || n.toString() !== s) {
      throw new TypeError('Invalid number: ' + s)
    }
  } else if (typeof n === 'number') {
    s = n.toString()
  } else {
    throw new TypeError('Invalid number: ' + n)
  }
  const p = minmax((s.split('.')[1] || '').length, minp, maxp)
  if (!(p in factors)) throw new TypeError('Unsupported precision')
  const d = Math.round(n * factors[p])
  return [d, p]
}

function minmax (x, min, max) {
  /* c8 ignore next */
  return x < min ? min : x > max ? max : x
}
