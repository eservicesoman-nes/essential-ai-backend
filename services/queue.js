let active = 0, waiting = 0;
const MAX_CONCURRENT = 3;
const queue = [];

function addToQueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    waiting++;
    process();
  });
}

function process() {
  if (active >= MAX_CONCURRENT || queue.length === 0) return;
  const { fn, resolve, reject } = queue.shift();
  waiting--; active++;
  fn().then(resolve).catch(reject).finally(() => { active--; process(); });
}

function getQueueStats() { return { active, waiting }; }

module.exports = { addToQueue, getQueueStats };
