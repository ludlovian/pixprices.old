import tinydate from 'tinydate'

const fmtDate = tinydate('{DDD} {DD} {MMM} {HH}:{mm}', {
  DDD: d => d.toLocaleString('default', { weekday: 'short' }),
  MMM: d => d.toLocaleString('default', { month: 'short' })
})

export default ({ task, log, isWorker }) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65" crossorigin="anonymous">
    <title>Pix Prices status</title>
  </head>
  <body>
    <div class="container">
      <h3>Pix Prices status</h3>
      ${renderWorker(isWorker)}
      ${renderNextTask(task)}
      ${renderLog(log)}
    </div>
    <script>
;(async () => {
const isWorker=${isWorker.toString()}
if (!isWorker) return
const due = new Date('${task.date.toISOString()}')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function fmtPeriod (ms) {
  const f2 = n => n < 10 ? '0' + n : n
  const divmod = (a, b) => [ Math.floor(a / b), a % b ]
  const secs = divmod(ms, 1000)[0]
  const [mins, ss] = divmod(secs, 60)
  const [hrs, mm] = divmod(mins, 60)
  return (hrs ? hrs + ':' : '') + f2(mm) + ':' + f2(ss)
}

function updateTime () {
  const el = document.getElementById('remaining')
  const now = new Date()
  const ms = +due - +now
  if (ms < 0) return false
  el.textContent = fmtPeriod(ms)
  return true
}

async function go () {
  while (updateTime()) {
    await delay(1000)
  }
  location.assign('${task.job.url}')
}

go()
})()
    </script>
  </body>
</html>
`

const renderWorker = isWorker => {
  if (!isWorker) return ''
  return `
  <div class="row">
  <span class="text">
    <span class="fs-3 text-primary">Worker</span>
    <span class="text-secondary">(Due in</span>
    <span class="text" id="remaining"></span>
    <span class="text-secondary">)</span>
  </span>
  </div>
  `
}

const renderNextTask = ({ date, job, id }) => {
  return `
  <h4>Next Task</h4>
  <div class="row">
    <span class="text">
      <span class="badge bg-success">${id}</span>
      ${job.name} due at ${fmtDate(date)}
    </span>
  </div>
  <hr>
  `
}

const renderLog = log => `
  <h4>Log</h4>
  ${log.map(renderLogLine).join('')}
`

const renderLogLine = ({ id, message, date }) => `
  <div class="row my-2">
    <span class="text">
      <span class="text-secondary">
        ${fmtDate(date)}
      </span>
      <span class="badge bg-success">
        ${id || 0}
      </span>
      ${message}
    </span>
  </div>
`
