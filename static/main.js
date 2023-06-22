// Helper function which returns a promise which resolves once the service worker registration
// is past the "installing" state.
function waitUntilInstalled(registration) {
  return new Promise(function(resolve, reject) {
    if (registration.installing) {
      // If the current registration represents the "installing" service worker, then wait
      // until the installation step (during which the resources are pre-fetched) completes
      // to display the file list.
      registration.installing.addEventListener('statechange', function(e) {
        if (e.target.state === 'installed') {
          resolve();
        } else if (e.target.state === 'redundant') {
          reject();
        }
      });
    } else {
      // Otherwise, if this isn't the "installing" service worker, then installation must have been
      // completed during a previous visit to this page, and the resources are already pre-fetched.
      // So we can show the list of files right away.
      resolve();
    }
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/static/service-worker.js', {
    scope: '/static/'
  })
    .then(waitUntilInstalled)
    // .then(showFilesList)
    .catch(function(error) {
      // Something went wrong during registration. The service-worker.js file
      // might be unavailable or contain a syntax error.
      console.error(error);
    });
} else {
  // The current browser doesn't support service workers.
  console.error(`Service workers are not supported in the current browser.
http://www.chromium.org/blink/serviceworker/service-worker-faq`)
}

document.querySelector('video').onloadedmetadata = function() {
  var fileName = this.currentSrc.replace(/^.*[\\\/]/, '');
  console.log("Video source:", fileName);
};

navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
  const NEG_MULTIPLIER = 2.5
  const STEP_TIME = 0.03
  // const FULL_BLOOM_TIMESTAMP=55
  // const FULL_DEATH_TIMESTAMP=86
  const FULL_BLOOM_TIMESTAMP=16
  const FULL_DEATH_TIMESTAMP=86
  let isForward = false
  let currentFakeTime = 0

  const socket = new WebSocket('ws://localhost:8000/listen')
  const mediaRecorder = new MediaRecorder(stream)
  const videoPlayer = document.getElementById('mainVideo')
  videoPlayer.onclick = (el) => {
    videoPlayer.requestFullscreen()
    videoPlayer.controls = false
  }
  // videoEl.playbackRate = 0.1
  // videoEl.load()
  // const videoPlayer = videojs('mainVideo')
  // videoPlayer.src({type: 'video/webm', src: '/video'})

  let last;
  let sentimentData = {
    'positive': 0,
    'negative': 0,
    'score': 0
  }

  window.getNextFrameFunction = () => {
    let frame = 0;
    return () => {
      // Play normally until FULL_BLOOM_TIMESTAMP
      if (frame < FULL_BLOOM_TIMESTAMP) {
        frame = frame + STEP_TIME
        return frame
      }
      frame = isForward
        ? Math.min(frame + STEP_TIME, FULL_DEATH_TIMESTAMP)
        : Math.max(frame - STEP_TIME, FULL_BLOOM_TIMESTAMP);
      return frame;
    }
  }

  window.runny = () => {
    const nextFrame = window.getNextFrameFunction();
    const interval = window.setInterval(() => {
      // currentFakeTime = videoPlayer.currentTime
      // currentFakeTime = isForward
      // // ? Math.min(currentFakeTime + STEP_TIME, videoEl.duration)
      //   ? Math.min(currentFakeTime + STEP_TIME, videoPlayer.duration)
      //   : Math.max(currentFakeTime - STEP_TIME, 0);

      // videoPlayer.currentTime = currentFakeTime
      videoPlayer.currentTime = nextFrame();
      // console.log({currentFakeTime, 'current': videoPlayer.currentTime})
    }, 1000/24)
    window.mainInterval = interval
  }

  window.runny();

  socket.onopen = () => {
    document.querySelector('#status').textContent = 'Connected'
    console.log({
      event: 'onopen'
    })
    mediaRecorder.addEventListener('dataavailable', async (event) => {
      last = new Date()
      if (event.data.size > 0 && socket.readyState == 1) {
        socket.send(event.data)
      }
    })
    mediaRecorder.start(250)
  }

  socket.onmessage = (message) => {
    const current = new Date()
    console.log(`time elapsed is ${current - last}ms`)
    last = current
    const received = message.data
    if (received) {
      console.log(received)
      const { label, score } = JSON.parse(received)['analysis'][0]
      sentimentData['score'] += (label === 'POSITIVE' ? 1 : -1 * NEG_MULTIPLIER) * score
      console.log(sentimentData)
      isForward = sentimentData.score < 0
      // document.querySelector('#transcript').textContent += ' ' + received
    }
  }

  socket.onclose = () => {
    console.log({
      event: 'onclose'
    })
  }

  socket.onerror = (error) => {
    console.log({
      event: 'onerror',
      error
    })
  }
})
