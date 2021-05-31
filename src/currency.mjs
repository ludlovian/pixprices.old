const factors = Array(9)
  .fill()
  .map((_, n) => Math.pow(10, n))

const inspect = Symbol.for('nodejs.util.inspect.custom')

function toNumber (x) {
  if (typeof x === 'number') return x
  const v = parseFloat(x)
  if (v.toString() === x) return v
  console.log('Number=%o', x)
  throw new TypeError('Invalid number: ' + x)
}

export default function currency (x, prec = 2) {
  if (x instanceof Currency) return x
  if (!(prec in factors)) throw new TypeError('Invalid precision')
  return Currency.from(toNumber(x), prec)
}

currency.import = (x, prec = 2) => new Currency(toNumber(x), prec)

class Currency {
  static from (value, prec) {
    return new Currency(value * factors[prec], prec)
  }

  constructor (num, prec) {
    this.num = Math.round(num)
    this.prec = prec
    Object.freeze(this)
  }

  [inspect] () {
    return `Currency { ${this.toNumber().toFixed(this.prec)} }`
  }

  export () {
    return this.num
  }

  toNumber () {
    return this.num / factors[this.prec]
  }

  toPrecision (prec) {
    if (this.prec === prec) return this
    return Currency.from(this.toNumber(), prec)
  }

  toString () {
    return this.toNumber().toString()
  }

  valueOf () {
    return this.toString()
  }

  add (x) {
    x = currency(x)
    const prec = Math.max(x.prec, this.prec)
    x = x.toPrecision(prec)
    const me = this.toPrecision(prec)
    return new Currency(me.num + x.num, prec)
  }

  sub (x) {
    x = currency(x)
    const prec = Math.max(x.prec, this.prec)
    x = x.toPrecision(prec)
    const me = this.toPrecision(prec)
    return new Currency(me.num - x.num, prec)
  }

  mul (x) {
    x = currency(x)
    return new Currency(this.num * x.toNumber(), this.prec)
  }

  div (x) {
    x = currency(x)
    if (!x.num) throw new Error('Cannot divide by zero')
    return new Currency(this.num / x.toNumber(), this.prec)
  }

  abs () {
    return new Currency(Math.abs(this.num), this.prec)
  }

  neg () {
    return new Currency(-this.num, this.prec)
  }
}
