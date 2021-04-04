'use strict'

import ms from 'ms'
import Debug from 'debug'

import Database from 'jsdbd'

const debug = Debug('pixprices:db')

export async function writePrices (items, opts) {
  const db = await getDB(opts)

  // first filter out duplicate updates, so that only the last one applies
  const updates = items.reduce((updates, item) => {
    updates[item.code] = item
    return updates
  }, {})

  // fetch existing records
  const recs = await db.getAll()

  // merge in updates
  for (const code of Object.keys(updates)) {
    const prev = recs.find(rec => rec.code === code)
    if (prev) {
      updates[code] = { ...prev, ...updates[code] }
    }
  }

  // now upsert these
  await db.upsert(Object.values(updates))

  debug('wrote %d records', Object.keys(updates).length)
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
