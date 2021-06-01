import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { inspect } from 'util'

import decimal from '../src/decimal.mjs'

function asJSON (x) {
  const [digits, precision] = x.tuple
  return { digits, precision }
}

test('construction', () => {
  assert.equal(
    asJSON(decimal(12.34)),
    { digits: 1234, precision: 2 },
    'implied precision from number'
  )

  assert.equal(
    asJSON(decimal(12.34, { minPrecision: 3 })),
    { digits: 12340, precision: 3 },
    'min precision from number'
  )

  assert.equal(
    asJSON(decimal('12.34')),
    { digits: 1234, precision: 2 },
    'implied precision from string'
  )

  assert.equal(
    asJSON(decimal('12.34', { minPrecision: 3 })),
    { digits: 12340, precision: 3 },
    'min precision from string'
  )

  const x = decimal(12.34)
  assert.is(decimal(x), x, 'pre-converted passed thru')
})

test('errors in construction', () => {
  assert.throws(() => decimal({}))
  assert.throws(() => decimal(null))
  assert.throws(() => decimal(undefined))
  assert.throws(() => decimal(new Date()))
  assert.throws(() => decimal([1,2]))
  assert.throws(() => decimal('foo'))
  assert.throws(() => decimal('789foo'))

  assert.throws(() => decimal('0.123456789123456', { maxPrecision: 15 }))
  assert.throws(() => decimal(12.34).precision(15))
})

test('representation', () => {
  const x = decimal(12.34).precision(3)

  assert.is(x.number, 12.34)
  assert.is(x.toString(), '12.340')
  assert.is(x.valueOf(), x.toString())

  assert.is(inspect(x), 'Decimal { 12.340 }')

  assert.is(x.tuple[1], 3)
})

test('change precision', () => {
  assert.equal(
    asJSON(decimal(12.34).precision(3)),
    { digits: 12340, precision: 3 },
    'increase precision'
  )

  assert.equal(
    asJSON(decimal(12.345).precision(2)),
    { digits: 1235, precision: 2 },
    'decrease precision'
  )
})

test('add', () => {
  assert.equal(
    asJSON(decimal(12.34).add('34.567')),
    { digits: 46907, precision: 3 },
    'add with larger precision'
  )

  assert.equal(
    asJSON(decimal(12.345).add('34.5')),
    { digits: 46845, precision: 3 },
    'add with smaller precision'
  )
})


test('sub', () => {
  assert.equal(
    asJSON(decimal(67.89).sub('12.345')),
    { digits: 55545, precision: 3 },
    'sub with larger precision'
  )

  assert.equal(
    asJSON(decimal(56.789).sub('23.4')),
    { digits: 33389, precision: 3 },
    'sub with smaller precision'
  )
})

test('mul', () => {
  assert.equal(
    asJSON(decimal(12.34).mul(3.7)),
    { digits: 4566, precision: 2 }
  )
})

test('div', () => {
  assert.equal(
    asJSON(decimal(87.65).div(2.7)),
    { digits: 3246, precision: 2 }
  )

  assert.throws(() => decimal(2).div('0'))
})

test('abs  & neg', () => {
  assert.is(decimal(-12.34).abs().number, 12.34)
  assert.is(decimal(12.34).abs().number, 12.34)

  assert.is(decimal(12.34).neg().number, -12.34)
  assert.is(decimal(-12.34).neg().number, 12.34)
})

test.run()
