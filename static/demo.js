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

function videoData() {
  const connectedClientsDiv = document.getElementById('connected-clients');
  const scoreDiv = document.getElementById('score');
  const socket = new WebSocket('ws://localhost:8000/demo-listen')
  const STEP_TIME = 1/24
  let MULTIPLIER = 1
  // const FULL_BLOOM_TIMESTAMP=55
  // const FULL_DEATH_TIMESTAMP=86
  const FULL_BLOOM_TIMESTAMP=16
  const FULL_DEATH_TIMESTAMP=86
  let isForward = false

  document.querySelector('video').onloadedmetadata = function() {
    var fileName = this.currentSrc.replace(/^.*[\\\/]/, '');
    console.log("Video source:", fileName);
  };

  const videoPlayer = document.getElementById('mainVideo')
  videoPlayer.onclick = (el) => {
    videoPlayer.requestFullscreen()
    videoPlayer.controls = false
  }

  socket.onopen = () => {
    document.querySelector('#status').textContent = 'Connected'
    console.log({
      event: 'onopen'
    })
    socket.send(JSON.stringify({data: "test"}))
  }

  socket.onmessage = (message) => {
    const { score, connectedClients } = JSON.parse(message.data)
    isForward = score < 0;
    scoreDiv.textContent = `Score is ${score}`
    connectedClientsDiv.textContent = `Connected Clients: ${connectedClients}`;
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
        ? Math.min(frame + (STEP_TIME * MULTIPLIER), FULL_DEATH_TIMESTAMP)
        : Math.max(frame - (STEP_TIME * MULTIPLIER), FULL_BLOOM_TIMESTAMP);
      return frame;
    }
  }

  window.runny = () => {
    const nextFrame = window.getNextFrameFunction();
    const interval = window.setInterval(() => {
      videoPlayer.currentTime = nextFrame();
      socket.send(JSON.stringify({ eventName: "new-frame" }))
    }, 1000/24)
    window.mainInterval = interval
  }

  window.resetDemo = () => {
    socket.send(JSON.stringify({ eventName: "reset" }))
  }

  window.runny();

}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/static/service-worker.js', {
    scope: '/static/'
  })
    .then(waitUntilInstalled)
    .then(videoData)
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
