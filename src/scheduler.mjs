import tinydate from 'tinydate'
import { parse } from '@lukeed/ms'

import config from './config.mjs'

const fmtDate = tinydate('{HH}:{mm}')

export default class Scheduler {
  constructor () {
    this.log = []
    this.maxLogSize = 100

    this.tasks = new Map()

    this.jobs = new Map(
      Object.entries(config.jobs).map(([name, details]) => [
        name,
        new Job({ name, ...details })
      ])
    )
    this.writeLog(`Started with ${this.jobs.size} jobs`)
    this._iterTasks = this.getTasks()
  }

  writeLog (message, id) {
    this.log.push({ date: new Date(), id, message })
    while (this.log.count > this.maxLogSize) {
      this.log.shift()
    }
  }

  scheduleTask (task) {
    this.tasks.set(task.id, task)
    this.writeLog(
      `${task.job.name} scheduled for ${fmtDate(task.date)}`,
      task.id
    )
  }

  completeTask (id) {
    if (this.tasks.delete(id)) {
      this.writeLog('Completed', id)
      this._currentTask = null
      return this.currentTask
    }
  }

  get currentTask () {
    if (this._currentTask) return this._currentTask
    const task = this._iterTasks.next().value
    this.scheduleTask(task)
    return (this._currentTask = task)
  }

  get clientContext () {
    const task = this.currentTask
    const { job } = task
    return {
      url: job.url,
      server: `${config.server.url}/prices/${task.job.name}?task=${task.id}`,
      controller: `${config.server.url}/worker?task=${task.id}`
    }
  }

  get statusContext () {
    return {
      task: this.currentTask,
      log: [...this.log]
    }
  }

  * getTasks ({ lookBack = '30m' } = {}) {
    let lastId = 0
    const lookBackMs = lookBack && parse(lookBack)
    const iters = [...this.jobs.values()].map(j => j.getTimes())
    const heads = iters.map(i => i.next().value)
    while (true) {
      const { ix } = findEarliest(heads)
      const id = ++lastId
      const done = () => this.completeTask(id)
      const task = { id, ...heads[ix], done }
      heads[ix] = iters[ix].next().value
      this.tasks.set(id, task)
      if (lookBack && +task.date + lookBackMs < Date.now()) continue
      yield task
    }

    function findEarliest (times) {
      return times.reduce((earliest, curr, ix) => {
        if (earliest.date && earliest.date <= curr.date) return earliest
        return { date: curr.date, ix }
      }, {})
    }
  }
}

class Job {
  constructor ({ name, url, times }) {
    Object.assign(this, { name, url, times })
  }

  * getTimes () {
    for (const date of getTimeStream(this.times)) {
      yield { date, job: this }
    }
  }
}

function * getTimeStream (times) {
  const now = new Date()
  let day = getDateFromTimeAndDay(times[0], now)
  while (true) {
    for (const hhmm of times) {
      const d = getDateFromTimeAndDay(hhmm, day)
      if (d < now) continue
      yield d
    }
    day = getDayAfter(day)
  }
}

function getDateFromTimeAndDay (hhmm, d) {
  const [hh, mm] = hhmm.split(':').map(t => Number(t))
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm)
}

function getDayAfter (d) {
  return new Date(d.getTime() + 86400000)
}
