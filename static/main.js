navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
  const socket = new WebSocket('ws://localhost:8000/listen')
  const mediaRecorder = new MediaRecorder(stream)
  let last

  socket.onopen = () => {
    document.querySelector('#status').textContent = ''
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
    const received = JSON.parse(message.data)
    if (received) {
      document.querySelector('#status').append(received.transcript)
      console.log(received)
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
