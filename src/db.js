'use strict'

import ms from 'ms'
import Debug from 'debug'

import Database from 'jsdbd'

const debug = Debug('pixprices:db')

export async function writePrices (items, opts) {
  const db = await getDB(opts)

  // load the existing records
  const recs = await db.getAll()

  // now dedupe and assemble inserts & updates
  const seenCodes = new Set()
  const inserts = []
  const updates = []

  for (const item of items) {
    if (seenCodes.has(item.code)) continue
    seenCodes.add(item.code)

    const prev = recs.find(rec => rec.code === item.code)
    if (prev) {
      updates.push({ ...prev, ...item })
    } else {
      inserts.push(item)
    }
  }

  if (inserts.length) {
    await db.insert(inserts)
  }

  if (updates.length) {
    await db.update(updates)
  }

  debug('Updated %d and inserted %d records', updates.length, inserts.length)
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
