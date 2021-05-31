import { test } from 'uvu'
import * as assert from 'uvu/assert'

import currency from '../src/currency.mjs'

test('basic construction', () => {
  const x = currency(12.34)
  assert.equal({ ...x }, { num: 1234, prec: 2 })
})

test('construct with given precision', () => {
  const x = currency(12.3456, 3)
  assert.equal({ ...x }, { num: 12346, prec: 3 })
})

test('representation', () => {
  const x = currency(12.3456, 3)
  assert.equal({ ...x }, { num: 12346, prec: 3 })

  assert.is(x.toNumber(), 12.346)
  assert.is(x.toString(), '12.346')
  assert.is(x.valueOf(), x.toString())
})

test('change precision to greater', () => {
  const x = currency(12.34).toPrecision(3)
  assert.equal({ ...x }, { num: 12340, prec: 3 })
})

test('change precision to lesser', () => {
  const x = currency(12.345, 3).toPrecision(2)
  assert.equal({ ...x }, { num: 1235, prec: 2 })
})

test('construct from string', () => {
  const x = currency('12.34')
  assert.equal({ ...x }, { num: 1234, prec: 2 })
})

test('invalid construction', () => {
  assert.throws(() => currency('foobar'))
  assert.throws(() => currency(123, 'foobar'))
  assert.throws(() => currency(123, -7))
  assert.throws(() => currency(123, 17))
})

test('add', () => {
  const x = currency(12.34)
  const y = currency(33.555, 3)
  const z = x.add(y)
  assert.equal({ ...z }, { num: 45895, prec: 3 })
})

test('sub', () => {
  const x = currency(98.76)
  const y = currency(12.345, 3)
  const z = x.sub(y)
  assert.equal({ ...z }, { num: 86415, prec: 3 })
})

test('mul', () => {
  const x = currency(1)
  const y = x.mul(1.34)
  assert.equal({ ...y }, { num: 134, prec: 2 })
})

test('div', () => {
  const x = currency(3)
  const y = x.div(4)
  assert.equal({ ...y }, { num: 75, prec: 2 })

  assert.throws(() => x.div(currency(7).sub(7)))
})

test.run()
