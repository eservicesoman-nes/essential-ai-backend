// queue.js
const MAX_CONCURRENT = 5;
let activeCount = 0;
const waitingQueue = [];

function addToQueue(fn) {
  return new Promise((resolve, reject) => {
    const task = async () => {
      activeCount++;
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        activeCount--;
        runNext();
      }
    };
    if (activeCount < MAX_CONCURRENT) {
      task();
    } else {
      waitingQueue.push(task);
    }
  });
}

function runNext() {
  if (waitingQueue.length > 0 && activeCount < MAX_CONCURRENT) {
    const next = waitingQueue.shift();
    next();
  }
}

function getQueueStats() {
  return { active: activeCount, waiting: waitingQueue.length };
}

module.exports = { addToQueue, getQueueStats };
