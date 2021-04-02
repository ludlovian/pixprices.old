'use strict'

import ms from 'ms'
import Debug from 'debug'

import Database from 'jsdbd'

const debug = Debug('pixprices:db')

export async function writePrices (items, opts) {
  const db = await getDB(opts)
  await Promise.all(
    items.map(async item => {
      const prev = await db.findOne('code', item.code)
      if (prev) {
        await db.update({ ...prev, ...item })
      } else {
        await db.insert(item)
      }
    })
  )

  debug('wrote %d records', items.length)
}

export async function purgeOldPrices (timeSpec, opts) {
  const db = await getDB(opts)
  const cutoff = Date.now() - ms(timeSpec + '')
  const recs = await db.getAll()
  const old = recs.filter(({ time }) => time < cutoff)
  if (old.length) {
    await db.delete(old)
    await db.compact()
    debug('%d records were older than %s', old.length, timeSpec)
  }
}

export async function getAll (opts) {
  const db = await getDB(opts)
  return db.getAll()
}

async function getDB ({ database: dbFile }) {
  const db = new Database(dbFile)
  await db.ensureIndex({ fieldName: 'code', unique: true })
  return db
}
